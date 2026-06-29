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
import { traceFunction } from "../../../utils/observability/tracer";

const CONNECTED_WALLET_KEY = "trustlink.connectedWallet";

type WalletPublicKey = {
  toString(): string;
};

type SolanaProvider = {
  isPhantom?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
  isGlow?: boolean;
  isExodus?: boolean;
  isTrust?: boolean;
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

type BrowserWindow = Window & {
  solana?: SolanaProvider;
  phantom?: {
    solana?: SolanaProvider;
  };
  solflare?: SolanaProvider;
  backpack?: SolanaProvider | { solana?: SolanaProvider };
  glowSolana?: SolanaProvider;
  exodus?: {
    solana?: SolanaProvider;
  };
  trustwallet?: {
    solana?: SolanaProvider;
  };
};

async function enrichSolanaTransactionError(error: unknown, connection: Connection) {
  const baseMessage = error instanceof Error ? error.message : "Solana transaction failed";
  const details = error as {
    getLogs?: (connection: Connection) => Promise<string[]>;
    logs?: string[];
    transactionLogs?: string[];
  };

  let logs = Array.isArray(details.logs) ? details.logs : Array.isArray(details.transactionLogs) ? details.transactionLogs : null;
  if (!logs?.length && typeof details.getLogs === "function") {
    try {
      logs = await details.getLogs(connection);
    } catch {
      logs = null;
    }
  }

  if (!logs?.length) {
    return error instanceof Error ? error : new Error(baseMessage);
  }

  const insufficientLamports = logs.find((entry) => /insufficient lamports/i.test(entry));
  const message = insufficientLamports
    ? `Solana transaction failed because the TrustLink verifier wallet does not have enough SOL to fund protocol account creation. ${insufficientLamports}`
    : baseMessage;

  return new Error(`${message}\n\nSolana logs:\n${logs.join("\n")}`, { cause: error });
}

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

export type WalletEnvironment = {
  isMobile: boolean;
  hasDetectedWallets: boolean;
  helpMessage: string;
};

type WalletDefinition = {
  id: string;
  name: string;
  resolver: (walletWindow: BrowserWindow) => SolanaProvider | null;
};

function getBackpackProvider(backpackValue: BrowserWindow["backpack"]) {
  if (!backpackValue) {
    return null;
  }

  if ("solana" in backpackValue) {
    return (backpackValue as { solana?: SolanaProvider }).solana ?? null;
  }

  return backpackValue as SolanaProvider;
}

declare global {
  interface Window {
    solana?: SolanaProvider;
    phantom?: {
      solana?: SolanaProvider;
    };
    solflare?: SolanaProvider;
    backpack?: SolanaProvider | { solana?: SolanaProvider };
    glowSolana?: SolanaProvider;
    exodus?: {
      solana?: SolanaProvider;
    };
    trustwallet?: {
      solana?: SolanaProvider;
    };
  }
}

const WALLET_DEFINITIONS: WalletDefinition[] = [
  {
    id: "phantom",
    name: "Phantom",
    resolver: (walletWindow) =>
      walletWindow.phantom?.solana ??
      (walletWindow.solana?.isPhantom ? walletWindow.solana : null),
  },
  {
    id: "solflare",
    name: "Solflare",
    resolver: (walletWindow) =>
      walletWindow.solflare ??
      (walletWindow.solana?.isSolflare ? walletWindow.solana : null),
  },
  {
    id: "backpack",
    name: "Backpack",
    resolver: (walletWindow) =>
      getBackpackProvider(walletWindow.backpack) ??
      (walletWindow.solana?.isBackpack ? walletWindow.solana : null),
  },
  {
    id: "glow",
    name: "Glow",
    resolver: (walletWindow) =>
      walletWindow.glowSolana ??
      (walletWindow.solana?.isGlow ? walletWindow.solana : null),
  },
  {
    id: "exodus",
    name: "Exodus",
    resolver: (walletWindow) =>
      walletWindow.exodus?.solana ??
      (walletWindow.solana?.isExodus ? walletWindow.solana : null),
  },
  {
    id: "trustwallet",
    name: "Trust Wallet",
    resolver: (walletWindow) =>
      walletWindow.trustwallet?.solana ??
      (walletWindow.solana?.isTrust ? walletWindow.solana : null),
  },
];

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
  if (typeof window === "undefined") {
    return null;
  }

  const walletWindow = window as BrowserWindow;
  const definition = WALLET_DEFINITIONS.find((entry) => entry.id === walletId);
  if (!definition) {
    return null;
  }

  const provider = definition.resolver(walletWindow);
  if (!provider) {
    return null;
  }

  return {
    id: definition.id,
    name: definition.name,
    provider,
  } satisfies DetectedWallet;
}

export function listAvailableSolanaWallets() {
  if (typeof window === "undefined") {
    return [] as DetectedWallet[];
  }

  const walletWindow = window as BrowserWindow;
  const seenProviders = new Set<SolanaProvider>();

  return WALLET_DEFINITIONS.flatMap((definition) => {
    const provider = definition.resolver(walletWindow);
    if (!provider || seenProviders.has(provider)) {
      return [];
    }

    seenProviders.add(provider);
    return [
      {
        id: definition.id,
        name: definition.name,
        provider,
      } satisfies DetectedWallet,
    ];
  });
}

export function getWalletEnvironment(): WalletEnvironment {
  const wallets = listAvailableSolanaWallets();
  const isMobile =
    typeof window !== "undefined" &&
    /Android|webOS|iPhone|iPad|iPod|Opera Mini|IEMobile|Mobile/i.test(
      window.navigator.userAgent,
    );

  return {
    isMobile,
    hasDetectedWallets: wallets.length > 0,
    helpMessage: isMobile
      ? "No wallet is exposed in this browser yet. On mobile, open TrustLink inside your wallet app browser like Phantom, Solflare, Backpack, or Trust Wallet, then try again."
      : "No Solana wallet was detected in this browser. Install or enable a wallet extension like Phantom, Solflare, Backpack, or Trust Wallet and try again.",
  };
}

export function getInjectedSolanaProvider() {
  const storedSession = readStoredSession();
  if (storedSession?.walletId) {
    return getWalletById(storedSession.walletId)?.provider ?? null;
  }

  return listAvailableSolanaWallets()[0]?.provider ?? null;
}

export function getConnectedWalletSession() {
  return readStoredSession();
}

export function getConnectedWalletAddress() {
  return readStoredSession()?.address ?? null;
}

async function connectSolanaWalletImpl(walletId?: string) {
  const selectedWallet =
    (walletId ? getWalletById(walletId) : null) ??
    listAvailableSolanaWallets()[0] ??
    null;

  if (!selectedWallet) {
    throw new Error("No Solana wallet detected on this browser");
  }

  const response = await selectedWallet.provider.connect();
  const address = response.publicKey.toString();
  const session = {
    walletId: selectedWallet.id,
    walletName: selectedWallet.name,
    address,
  } satisfies ConnectedWalletSession;

  writeStoredSession(session);
  return session;
}

async function disconnectSolanaWalletImpl() {
  const storedSession = readStoredSession();
  const provider = storedSession?.walletId
    ? (getWalletById(storedSession.walletId)?.provider ?? null)
    : getInjectedSolanaProvider();

  if (provider?.disconnect) {
    await provider.disconnect();
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
  const signed = await wallet.provider.signMessage(new Uint8Array(params.message), "hex");
  const signature = signed instanceof Uint8Array ? signed : Uint8Array.from(signed.signature);
  return bytesToBase64(signature);
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

export const connectSolanaWallet = traceFunction(connectSolanaWalletImpl, {
  namespace: "Wallet",
  name: "connectSolanaWallet",
  module: "frontend/src/lib/wallet.ts",
  level: "info",
});

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
