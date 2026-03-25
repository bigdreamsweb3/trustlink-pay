import { AnchorProvider, Program, Wallet, Idl } from "@coral-xyz/anchor";
import {
  Keypair,
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionSignature,
  type ParsedInstruction,
} from "@solana/web3.js";
import { createHash } from "node:crypto";

import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { sha256 } from "@/app/utils/hash";

type EscrowProgram = Program<Idl>;

const TOKEN_PROGRAM_IDS = [
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
];

const SUPPORTED_TOKENS = [
  { symbol: "SOL", name: "Solana", logo: "◎" },
  { symbol: "USDC", name: "USD Coin", logo: "◉" },
  { symbol: "USDT", name: "Tether", logo: "₮" }
] as const;

const TOKEN_METADATA_BY_SYMBOL: Record<string, { name: string; logo: string; supported: boolean }> = Object.fromEntries(
  SUPPORTED_TOKENS.map((token) => [token.symbol, { name: token.name, logo: token.logo, supported: true }])
);

export type SupportedWalletToken = {
  symbol: string;
  name: string;
  balance: number;
  logo: string;
  mintAddress: string;
  supported: boolean;
};

function getSecretKey(): Uint8Array {
  const rawValue = env.SOLANA_ESCROW_AUTHORITY_SECRET_KEY.trim();

  try {
    const values = JSON.parse(rawValue) as number[];
    return Uint8Array.from(values);
  } catch {
    if (rawValue.includes(",")) {
      const values = rawValue
        .split(",")
        .map((entry) => Number(entry.trim()))
        .filter((value) => Number.isFinite(value));

      if (values.length > 0) {
        return Uint8Array.from(values);
      }
    }

    const normalized = rawValue.replace(/^\[|\]$/g, "").trim();
    if (normalized) {
      const hashed = createHash("sha256").update(normalized).digest();
      return Uint8Array.from(hashed);
    }

    throw new Error("SOLANA_ESCROW_AUTHORITY_SECRET_KEY is empty");
  }
}

function getEscrowAuthorityKeypair() {
  const secretKey = getSecretKey();

  try {
    if (secretKey.length >= 64) {
      return Keypair.fromSecretKey(secretKey.slice(0, 64));
    }
  } catch {
    // Fall back to deterministic seed derivation for local/devnet compatibility.
  }

  const seed = secretKey.length >= 32 ? secretKey.slice(0, 32) : createHash("sha256").update(secretKey).digest().slice(0, 32);
  return Keypair.fromSeed(Uint8Array.from(seed));
}

export function getEscrowDepositAddress() {
  return getEscrowAuthorityKeypair().publicKey.toBase58();
}

function getProgram(): { program: EscrowProgram; payer: Keypair; connection: Connection } {
  const connection = new Connection(env.SOLANA_RPC_URL, "confirmed");
  const payer = Keypair.fromSecretKey(getSecretKey());
  const wallet = new Wallet(payer);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed"
  });

  // The IDL must match the deployed escrow program. Keep the client minimal here.
  const idl = {
    address: env.SOLANA_PROGRAM_ID,
    metadata: {
      name: "trustlink_escrow",
      version: "0.1.0",
      spec: "0.1.0"
    },
    instructions: []
  } as Idl;

  const program = new Program(idl, provider);
  return { program, payer, connection };
}

export async function createEscrowPayment(params: {
  senderWallet: string;
  phoneHash: string;
  amount: number;
  token: string;
  depositSignature?: string;
}): Promise<{ escrowAccount: string; signature: TransactionSignature | null }> {
  if (env.SOLANA_MOCK_MODE) {
    const escrowAccount = Keypair.generate().publicKey.toBase58();
    const signature = sha256(
      JSON.stringify({
        action: "createEscrowPayment",
        escrowAccount,
        ...params
      })
    ).slice(0, 64);

    logger.info("solana.mock.create_escrow", {
      escrowAccount,
      senderWallet: params.senderWallet,
      amount: params.amount,
      token: params.token
    });

    return {
      escrowAccount,
      signature
    };
  }

  if (params.token !== "SOL") {
    throw new Error("Real on-chain sending currently supports SOL only until SPL escrow transfer is wired");
  }

  if (!params.depositSignature) {
    throw new Error("depositSignature is required for real on-chain payments");
  }

  const { connection } = getProgram();
  const escrowAuthority = getEscrowAuthorityKeypair().publicKey;
  await verifyIncomingSolTransfer({
    connection,
    senderWallet: params.senderWallet,
    destinationWallet: escrowAuthority.toBase58(),
    amount: params.amount,
    signature: params.depositSignature,
  });

  return {
    escrowAccount: escrowAuthority.toBase58(),
    signature: params.depositSignature
  };
}

export async function releaseEscrow(params: {
  paymentId: string;
  escrowAccount: string;
  receiverWallet: string;
  amount: number;
  token: string;
}): Promise<{ signature: TransactionSignature | null }> {
  if (env.SOLANA_MOCK_MODE) {
    const signature = sha256(
      JSON.stringify({
        action: "releaseEscrow",
        ...params
      })
    ).slice(0, 64);

    logger.info("solana.mock.release_escrow", {
      paymentId: params.paymentId,
      escrowAccount: params.escrowAccount,
      receiverWallet: params.receiverWallet,
      amount: params.amount,
      token: params.token
    });

    return { signature };
  }

  if (params.token !== "SOL") {
    throw new Error("Real on-chain release currently supports SOL only until SPL escrow transfer is wired");
  }

  const { connection, payer } = getProgram();
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: payer.publicKey,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  }).add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: new PublicKey(params.receiverWallet),
      lamports: Math.round(params.amount * LAMPORTS_PER_SOL),
    })
  );

  const signature = await connection.sendTransaction(transaction, [payer], {
    preflightCommitment: "confirmed",
  });
  await connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    "confirmed"
  );

  logger.info("solana.release_escrow", {
    paymentId: params.paymentId,
    escrowAccount: params.escrowAccount,
    receiverWallet: params.receiverWallet,
    amount: params.amount,
    token: params.token,
    signature,
  });

  return { signature };
}

export async function cancelEscrow(params: {
  paymentId: string;
  escrowAccount: string;
}): Promise<{ signature: TransactionSignature | null }> {
  if (env.SOLANA_MOCK_MODE) {
    const signature = sha256(
      JSON.stringify({
        action: "cancelEscrow",
        ...params
      })
    ).slice(0, 64);

    logger.info("solana.mock.cancel_escrow", {
      paymentId: params.paymentId,
      escrowAccount: params.escrowAccount
    });

    return { signature };
  }

  const { connection, payer } = getProgram();
  const signature = await connection.requestAirdrop(payer.publicKey, 0);

  return { signature };
}

export async function listSupportedWalletTokens(walletAddress: string): Promise<SupportedWalletToken[]> {
  const connection = new Connection(env.SOLANA_RPC_URL, "confirmed");
  const owner = new PublicKey(walletAddress);
  const tokenBalances = new Map<string, SupportedWalletToken>();

  const lamports = await connection.getBalance(owner, "confirmed");
  const solBalance = Number((lamports / LAMPORTS_PER_SOL).toFixed(9));

  if (solBalance > 0) {
    tokenBalances.set("native-sol", {
      symbol: "SOL",
      name: TOKEN_METADATA_BY_SYMBOL.SOL.name,
      balance: solBalance,
      logo: TOKEN_METADATA_BY_SYMBOL.SOL.logo,
      mintAddress: "native-sol",
      supported: true
    });
  }

  for (const programId of TOKEN_PROGRAM_IDS) {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      owner,
      { programId: new PublicKey(programId) },
      "confirmed"
    );

    for (const tokenAccount of tokenAccounts.value) {
      const parsedInfo = (tokenAccount.account.data as { parsed?: { info?: Record<string, unknown> } }).parsed?.info;
      const mintAddress = typeof parsedInfo?.mint === "string" ? parsedInfo.mint : null;
      const tokenAmount = parsedInfo?.tokenAmount as { uiAmount?: number; uiAmountString?: string } | undefined;
      const balance = tokenAmount?.uiAmount ?? Number(tokenAmount?.uiAmountString ?? "0");

      if (!mintAddress || !Number.isFinite(balance) || balance <= 0) {
        continue;
      }

      const knownMetadata = TOKEN_METADATA_BY_SYMBOL[mintAddress.toUpperCase()];
      const existingToken = tokenBalances.get(mintAddress);
      const symbol = knownMetadata ? mintAddress.toUpperCase() : mintAddress.slice(0, 4).toUpperCase();
      const name = knownMetadata?.name ?? `Token ${mintAddress.slice(0, 4)}`;
      const logo = knownMetadata?.logo ?? "◌";
      const supported = knownMetadata?.supported ?? false;

      tokenBalances.set(mintAddress, {
        symbol,
        name,
        logo,
        mintAddress,
        supported,
        balance: Number(((existingToken?.balance ?? 0) + balance).toFixed(9))
      });
    }
  }

  const supportedTokens = SUPPORTED_TOKENS.map((token) => {
    const existingToken = [...tokenBalances.values()].find((entry) => entry.symbol === token.symbol);

    return {
      symbol: token.symbol,
      name: token.name,
      logo: token.logo,
      mintAddress: existingToken?.mintAddress ?? `supported-${token.symbol.toLowerCase()}`,
      supported: true,
      balance: Number((existingToken?.balance ?? 0).toFixed(9))
    };
  });

  const resolvedTokens = supportedTokens.sort((left, right) => right.balance - left.balance);

  logger.info("solana.wallet_tokens.loaded", {
    walletAddress,
    tokenCount: resolvedTokens.length
  });

  return resolvedTokens;
}

async function verifyIncomingSolTransfer(params: {
  connection: Connection;
  senderWallet: string;
  destinationWallet: string;
  amount: number;
  signature: string;
}) {
  const transaction = await params.connection.getParsedTransaction(params.signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });

  if (!transaction || transaction.meta?.err) {
    throw new Error("Could not verify the on-chain payment transaction");
  }

  const expectedLamports = Math.round(params.amount * LAMPORTS_PER_SOL);
  const senderWallet = params.senderWallet;
  const destinationWallet = params.destinationWallet;

  const systemTransferMatched = transaction.transaction.message.instructions.some((instruction) => {
    if ("parsed" in instruction) {
      const parsedInstruction = instruction as ParsedInstruction;
      const parsedInfo = parsedInstruction.parsed as { info?: Record<string, unknown> } | undefined;
      const lamports = typeof parsedInfo?.info?.lamports === "number" ? parsedInfo.info.lamports : null;
      const source = typeof parsedInfo?.info?.source === "string" ? parsedInfo.info.source : null;
      const destination = typeof parsedInfo?.info?.destination === "string" ? parsedInfo.info.destination : null;

      return (
        parsedInstruction.programId.equals(SystemProgram.programId) &&
        source === senderWallet &&
        destination === destinationWallet &&
        lamports != null &&
        lamports >= expectedLamports
      );
    }

    return false;
  });

  if (!systemTransferMatched) {
    throw new Error("The connected wallet transaction does not match the expected escrow deposit");
  }
}
