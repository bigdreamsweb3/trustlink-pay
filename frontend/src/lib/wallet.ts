"use client";

import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionSignature,
} from "@solana/web3.js";

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

export async function connectSolanaWallet(walletId?: string) {
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

export async function disconnectSolanaWallet() {
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

export async function sendSolanaPayment(params: {
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

export async function signAndSendSerializedSolanaTransaction(params: {
  walletId: string;
  rpcUrl: string;
  serializedTransaction: string;
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
  let signature: TransactionSignature;

  if (wallet.provider.signAndSendTransaction) {
    const response = await wallet.provider.signAndSendTransaction(transaction, {
      preflightCommitment: "confirmed",
    });
    signature = response.signature;
  } else if (wallet.provider.signTransaction) {
    const signedTransaction = await wallet.provider.signTransaction(transaction);
    signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
      preflightCommitment: "confirmed",
    });
  } else {
    throw new Error("This wallet cannot sign Solana transactions from the browser");
  }

  await connection.confirmTransaction(signature, "confirmed");
  return signature;
}
