"use client";

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionSignature,
} from "@solana/web3.js";
import { traceFunction } from "@trustlink/observability/tracer";

import { enrichSolanaTransactionError } from "@/src/lib/wallet-connection/solana-transaction-error";

const CONNECTED_WALLET_KEY = "trustlink.connectedWallet";

type WalletPublicKey = {
  toString(): string;
};

type SolanaProvider = {
  publicKey?: WalletPublicKey;
  connect: (options?: {
    onlyIfTrusted?: boolean;
  }) => Promise<{ publicKey: WalletPublicKey }>;
  disconnect?: () => Promise<void>;
  signTransaction?: (transaction: Transaction) => Promise<Transaction>;
  signMessage?: (
    message: Uint8Array,
    display?: "utf8" | "hex",
  ) => Promise<Uint8Array | { signature: Uint8Array | number[] }>;
  signAndSendTransaction?: (
    transaction: Transaction,
    options?: {
      skipPreflight?: boolean;
      preflightCommitment?: "processed" | "confirmed" | "finalized";
    },
  ) => Promise<{ signature: TransactionSignature }>;
};

export type DetectedWallet = {
  id: string;
  name: string;
  provider: SolanaProvider;
};

export type ConnectedWalletSession = {
  walletId: string;
  walletName: string;
  address: string;
};

let externalSolanaWallet: DetectedWallet | null = null;

function readStoredSession() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(CONNECTED_WALLET_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as ConnectedWalletSession;
    if (!parsed?.walletId || !parsed?.walletName || !parsed?.address) {
      window.localStorage.removeItem(CONNECTED_WALLET_KEY);
      return null;
    }

    return parsed;
  } catch {
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(rawValue)) {
      const legacySession = {
        walletId: "unknown",
        walletName: "Connected wallet",
        address: rawValue,
      } satisfies ConnectedWalletSession;

      window.localStorage.setItem(
        CONNECTED_WALLET_KEY,
        JSON.stringify(legacySession),
      );
      return legacySession;
    }

    window.localStorage.removeItem(CONNECTED_WALLET_KEY);
    return null;
  }
}

function writeStoredSession(session: ConnectedWalletSession) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(CONNECTED_WALLET_KEY, JSON.stringify(session));
}

async function ensureWalletAuthorization(wallet: DetectedWallet, expectedAddress?: string) {
  const currentAddress = wallet.provider.publicKey?.toString() ?? null;
  if (currentAddress && (!expectedAddress || currentAddress === expectedAddress)) {
    return currentAddress;
  }

  const response = await wallet.provider.connect();
  const authorizedAddress = response.publicKey.toString();

  if (expectedAddress && authorizedAddress !== expectedAddress) {
    throw new Error(
      `Connected wallet account changed. Expected ${expectedAddress}, but wallet authorized ${authorizedAddress}. Reconnect the intended wallet account and try again.`,
    );
  }

  return authorizedAddress;
}

function getWalletById(walletId: string) {
  return walletId === externalSolanaWallet?.id ? externalSolanaWallet : null;
}

export function registerExternalSolanaWallet(params: {
  id: string;
  name: string;
  address: string;
  provider: Partial<SolanaProvider>;
}) {
  const provider = {
    ...params.provider,
    publicKey: {
      toString: () => params.address,
    },
    connect: async () => ({
      publicKey: {
        toString: () => params.address,
      },
    }),
  } satisfies SolanaProvider;

  externalSolanaWallet = {
    id: params.id,
    name: params.name,
    provider,
  };

  const session = {
    walletId: params.id,
    walletName: params.name,
    address: params.address,
  } satisfies ConnectedWalletSession;

  writeStoredSession(session);
  return session;
}

export function clearExternalSolanaWallet() {
  externalSolanaWallet = null;
}

export function getConnectedWalletSession() {
  return readStoredSession();
}

export function getConnectedWalletAddress() {
  return readStoredSession()?.address ?? null;
}

async function disconnectSolanaWalletImpl() {
  if (externalSolanaWallet?.provider.disconnect) {
    await externalSolanaWallet.provider.disconnect();
  }

  if (typeof window !== "undefined") {
    window.localStorage.removeItem(CONNECTED_WALLET_KEY);
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function assertNonEmptyString(value: string, label: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} is required before wallet signing`);
  }
}

function assertCanonicalTsnMessage(value: string) {
  if (!value.startsWith("TSN ") || !value.includes("\n---\n")) {
    console.error("Blocked non-canonical TSN signing payload", {
      startsWithTsn: value.startsWith("TSN "),
      preview: value.slice(0, 80),
    });
    throw new Error("Wallet signing requires a canonical TSN message string.");
  }
}

function assertSignableBytes(value: Uint8Array, label: string) {
  if (!(value instanceof Uint8Array) || value.length === 0) {
    throw new Error(`${label} must be a non-empty byte array before wallet signing`);
  }
}

async function signSolanaMessageImpl(params: {
  walletId: string;
  address: string;
  message: string;
}) {
  const wallet = getWalletById(params.walletId);
  if (!wallet) {
    throw new Error("Selected wallet is no longer available in this browser");
  }

  await ensureWalletAuthorization(wallet, params.address);
  if (!wallet.provider.signMessage) {
    throw new Error("This wallet cannot sign authorization messages from the browser");
  }

  assertNonEmptyString(params.message, "message");
  assertCanonicalTsnMessage(params.message);
  const signed = await wallet.provider.signMessage(
    new TextEncoder().encode(params.message),
    "utf8",
  );
  const signature =
    signed instanceof Uint8Array ? signed : Uint8Array.from(signed.signature);
  return bytesToBase64(signature);
}

async function signSolanaBytesImpl(params: {
  walletId: string;
  address: string;
  message: Uint8Array;
}) {
  const wallet = getWalletById(params.walletId);
  if (!wallet) {
    throw new Error("Selected wallet is no longer available in this browser");
  }

  await ensureWalletAuthorization(wallet, params.address);
  if (!wallet.provider.signMessage) {
    throw new Error("This wallet cannot sign authorization messages from the browser");
  }

  assertSignableBytes(params.message, "message");
  const decoded = new TextDecoder().decode(params.message);
  assertCanonicalTsnMessage(decoded);
  const signed = await wallet.provider.signMessage(new TextEncoder().encode(decoded), "utf8");
  const signature = signed instanceof Uint8Array ? signed : Uint8Array.from(signed.signature);
  return bytesToBase64(signature);
}

async function signTsnDeviceAuthorizationBytesImpl(params: {
  walletId: string;
  address: string;
  message: Uint8Array;
}) {
  const wallet = getWalletById(params.walletId);
  if (!wallet) throw new Error("Selected wallet is no longer available in this browser");
  await ensureWalletAuthorization(wallet, params.address);
  if (!wallet.provider.signMessage) {
    throw new Error("This wallet cannot sign device authorization messages");
  }
  assertSignableBytes(params.message, "device authorization message");
  const decoded = new TextDecoder().decode(params.message);
  if (
    !decoded.includes("TSN_OWNER_DEVICE_AUTHORIZATION") ||
    !decoded.includes("tsn-device-authorization-v1")
  ) {
    throw new Error("Blocked a non-TSN device authorization signing payload");
  }
  const signed = await wallet.provider.signMessage(params.message, "utf8");
  return signed instanceof Uint8Array
    ? signed
    : Uint8Array.from(signed.signature);
}

async function signTinOwnerIntentHashImpl(params: {
  walletId: string;
  address: string;
  intentHash: Uint8Array;
}) {
  const wallet = getWalletById(params.walletId);
  if (!wallet) throw new Error("Selected wallet is no longer available in this browser");
  await ensureWalletAuthorization(wallet, params.address);
  if (!wallet.provider.signMessage) {
    throw new Error("This wallet cannot sign a TIN owner authorization");
  }
  if (!(params.intentHash instanceof Uint8Array) || params.intentHash.length !== 32) {
    throw new Error("TIN owner intent hash must be exactly 32 bytes");
  }
  const signed = await wallet.provider.signMessage(params.intentHash);
  return signed instanceof Uint8Array
    ? signed
    : Uint8Array.from(signed.signature);
}

async function signTinMasterSeedAuthorizationBytesImpl(params: {
  walletId: string;
  address: string;
  message: Uint8Array;
}) {
  const wallet = getWalletById(params.walletId);
  if (!wallet) throw new Error("Selected wallet is no longer available in this browser");
  await ensureWalletAuthorization(wallet, params.address);
  if (!wallet.provider.signMessage) {
    throw new Error("This wallet cannot authorize TIN private access");
  }
  assertSignableBytes(params.message, "TIN master-seed authorization message");
  const decoded = new TextDecoder().decode(params.message);
  if (!decoded.includes("TSN_TIN_MASTER_SEED_ACCESS")) {
    throw new Error("Blocked a non-TSN master-seed authorization payload");
  }
  const signed = await wallet.provider.signMessage(params.message, "utf8");
  return signed instanceof Uint8Array
    ? signed
    : Uint8Array.from(signed.signature);
}

async function signSolanaTransactionImpl(params: {
  walletId: string;
  address: string;
  transactionBase64: string;
}) {
  const wallet = getWalletById(params.walletId);
  if (!wallet) {
    throw new Error("Selected wallet is no longer available in this browser");
  }

  await ensureWalletAuthorization(wallet, params.address);
  if (!wallet.provider.signTransaction) {
    throw new Error("This wallet cannot co-sign sponsored Solana transactions from the browser");
  }

  assertNonEmptyString(params.transactionBase64, "transactionBase64");
  const raw = Uint8Array.from(atob(params.transactionBase64), (value) => value.charCodeAt(0));
  const transaction = Transaction.from(raw);
  const signedTransaction = await wallet.provider.signTransaction(transaction);

  return bytesToBase64(
    signedTransaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    }),
  );
}

async function sendSolanaPaymentImpl(params: {
  walletId: string;
  fromAddress: string;
  toAddress: string;
  amountSol: number;
  rpcUrl: string;
}) {
  const wallet = getWalletById(params.walletId);
  if (!wallet) {
    throw new Error("Selected wallet is no longer available in this browser");
  }

  await ensureWalletAuthorization(wallet, params.fromAddress);

  const connection = new Connection(params.rpcUrl, "confirmed");
  const fromPublicKey = new PublicKey(params.fromAddress);
  const toPublicKey = new PublicKey(params.toAddress);
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: fromPublicKey,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  }).add(
    SystemProgram.transfer({
      fromPubkey: fromPublicKey,
      toPubkey: toPublicKey,
      lamports: Math.round(params.amountSol * LAMPORTS_PER_SOL),
    }),
  );

  let signature: TransactionSignature;

  try {
    if (wallet.provider.signAndSendTransaction) {
      const response = await wallet.provider.signAndSendTransaction(transaction, {
        preflightCommitment: "confirmed",
      });
      signature = response.signature;
    } else if (wallet.provider.signTransaction) {
      const signedTransaction =
        await wallet.provider.signTransaction(transaction);
      signature = await connection.sendRawTransaction(
        signedTransaction.serialize(),
        {
          preflightCommitment: "confirmed",
        },
      );
    } else {
      throw new Error(
        "This wallet cannot sign Solana transactions from the browser",
      );
    }
  } catch (error) {
    throw await enrichSolanaTransactionError(error, connection);
  }

  await connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    "confirmed",
  );

  return signature;
}

async function signAndSendSolanaTransactionImpl(params: {
  walletId: string;
  address: string;
  rpcUrl: string;
  transaction: Transaction;
}) {
  const wallet = getWalletById(params.walletId);
  if (!wallet) {
    throw new Error("Selected wallet is no longer available in this browser");
  }

  const authorizedAddress = await ensureWalletAuthorization(wallet, params.address);
  if (authorizedAddress !== params.address) {
    throw new Error(
      `Connected wallet account changed. Expected ${params.address}, but wallet authorized ${authorizedAddress}.`,
    );
  }

  const connection = new Connection(params.rpcUrl, "confirmed");
  const payer = new PublicKey(params.address);
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  const transaction = params.transaction;
  transaction.feePayer = transaction.feePayer ?? payer;
  transaction.recentBlockhash = transaction.recentBlockhash ?? latestBlockhash.blockhash;

  let signature: TransactionSignature;

  try {
    if (wallet.provider.signTransaction) {
      const signedTransaction = await wallet.provider.signTransaction(transaction);
      signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
        preflightCommitment: "confirmed",
      });
    } else if (wallet.provider.signAndSendTransaction) {
      const response = await wallet.provider.signAndSendTransaction(transaction, {
        preflightCommitment: "confirmed",
      });
      signature = response.signature;
    } else {
      throw new Error("This wallet cannot sign Solana transactions from the browser");
    }
  } catch (error) {
    throw await enrichSolanaTransactionError(error, connection);
  }

  await connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    "confirmed",
  );

  return signature;
}

async function signAndSendSerializedSolanaTransactionImpl(params: {
  walletId: string;
  rpcUrl: string;
  serializedTransaction: string;
  partialSignerSecretKeys?: string[];
  inspectTransaction?: (transaction: Transaction) => void | Promise<void>;
}) {
  const wallet = getWalletById(params.walletId);
  if (!wallet) {
    throw new Error("Selected wallet is no longer available in this browser");
  }

  const storedSession = readStoredSession();
  const authorizedAddress = await ensureWalletAuthorization(
    wallet,
    storedSession?.walletId === params.walletId ? storedSession.address : undefined,
  );

  if (storedSession?.walletId === params.walletId && storedSession.address !== authorizedAddress) {
    writeStoredSession({
      walletId: storedSession.walletId,
      walletName: storedSession.walletName,
      address: authorizedAddress,
    });
  }

  const connection = new Connection(params.rpcUrl, "confirmed");
  const raw = Uint8Array.from(atob(params.serializedTransaction), (value) => value.charCodeAt(0));
  const transaction = Transaction.from(raw);
  if (params.partialSignerSecretKeys?.length) {
    const signers = params.partialSignerSecretKeys.map((secretKeyHex) =>
      Keypair.fromSeed(Uint8Array.from(secretKeyHex.match(/.{1,2}/g)?.map((value) => Number.parseInt(value, 16)) ?? []))
    );
    transaction.partialSign(...signers);
  }
  await params.inspectTransaction?.(transaction);
  let signature: TransactionSignature;

  try {
    if (wallet.provider.signTransaction) {
      const signedTransaction = await wallet.provider.signTransaction(transaction);
      signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
        preflightCommitment: "confirmed",
      });
    } else if (wallet.provider.signAndSendTransaction) {
      const response = await wallet.provider.signAndSendTransaction(transaction, {
        preflightCommitment: "confirmed",
      });
      signature = response.signature;
    } else {
      throw new Error("This wallet cannot sign Solana transactions from the browser");
    }
  } catch (error) {
    throw await enrichSolanaTransactionError(error, connection);
  }

  try {
    await connection.confirmTransaction(signature, "confirmed");
  } catch (error) {
    if (
      error instanceof Error &&
      /already been processed|already processed/i.test(error.message)
    ) {
      return signature;
    }

    throw error;
  }

  return signature;
}

export const disconnectSolanaWallet = traceFunction(disconnectSolanaWalletImpl, {
  namespace: "Wallet",
  name: "disconnectSolanaWallet",
  module: "frontend/src/lib/wallet.ts",
  level: "info",
  includeReturn: false,
});

export const signSolanaMessage = traceFunction(signSolanaMessageImpl, {
  namespace: "Wallet",
  name: "signSolanaMessage",
  module: "frontend/src/lib/wallet.ts",
  level: "info",
  includeReturn: false,
});

export const signSolanaBytes = traceFunction(signSolanaBytesImpl, {
  namespace: "Wallet",
  name: "signSolanaBytes",
  module: "frontend/src/lib/wallet.ts",
  level: "info",
  includeReturn: false,
});

export const signTsnDeviceAuthorizationBytes = traceFunction(
  signTsnDeviceAuthorizationBytesImpl,
  {
    namespace: "Wallet",
    name: "signTsnDeviceAuthorizationBytes",
    module: "frontend/src/lib/wallet.ts",
    level: "info",
    includeReturn: false,
  },
);

export const signTinOwnerIntentHash = traceFunction(signTinOwnerIntentHashImpl, {
  namespace: "Wallet",
  name: "signTinOwnerIntentHash",
  module: "frontend/src/lib/wallet.ts",
  level: "info",
  includeReturn: false,
});

export const signTinMasterSeedAuthorizationBytes = traceFunction(
  signTinMasterSeedAuthorizationBytesImpl,
  {
    namespace: "Wallet",
    name: "signTinMasterSeedAuthorizationBytes",
    module: "frontend/src/lib/wallet.ts",
    level: "info",
    includeReturn: false,
  },
);

export const signSolanaTransaction = traceFunction(signSolanaTransactionImpl, {
  namespace: "Wallet",
  name: "signSolanaTransaction",
  module: "frontend/src/lib/wallet.ts",
  level: "info",
  includeReturn: false,
});

export const sendSolanaPayment = traceFunction(sendSolanaPaymentImpl, {
  namespace: "Wallet",
  name: "sendSolanaPayment",
  module: "frontend/src/lib/wallet.ts",
  level: "info",
  includeReturn: false,
});

export const signAndSendSolanaTransaction = traceFunction(
  signAndSendSolanaTransactionImpl,
  {
    namespace: "Wallet",
    name: "signAndSendSolanaTransaction",
    module: "frontend/src/lib/wallet.ts",
    level: "info",
    includeReturn: false,
  },
);

export const signAndSendSerializedSolanaTransaction = traceFunction(
  signAndSendSerializedSolanaTransactionImpl,
  {
    namespace: "Wallet",
    name: "signAndSendSerializedSolanaTransaction",
    module: "frontend/src/lib/wallet.ts",
    level: "info",
    includeReturn: false,
  },
);
