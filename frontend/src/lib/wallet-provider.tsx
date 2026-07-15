"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAppKitAccount, useAppKitProvider } from "@reown/appkit/react";

import {
  clearExternalSolanaWallet,
  disconnectSolanaWallet,
  registerExternalSolanaWallet,
  type ConnectedWalletSession,
} from "@/src/lib/wallet";
import { useToast } from "@/src/components/toast-provider";
import {
  configureTrustLinkAppKit,
  openTrustLinkWalletModal,
} from "@/src/lib/wallet-connection/reown-appkit";
import { bindReownSolanaProvider } from "@/src/lib/wallet-connection/reown-solana-provider";

type WalletContextValue = {
  session: ConnectedWalletSession | null;
  walletAddress: string | null;
  requestWalletConnection: () => void;
  disconnectWallet: () => Promise<void>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const appKit = configureTrustLinkAppKit();

  if (!appKit) {
    return <UnavailableReownWalletProvider>{children}</UnavailableReownWalletProvider>;
  }

  return <ConfiguredReownWalletProvider>{children}</ConfiguredReownWalletProvider>;
}

function UnavailableReownWalletProvider({ children }: { children: ReactNode }) {
  const { showToast } = useToast();
  const value = useMemo<WalletContextValue>(
    () => ({
      session: null,
      walletAddress: null,
      requestWalletConnection: () => {
        showToast(
          "Reown is not configured. Add a valid Reown project ID, restart the frontend, and try again.",
        );
      },
      disconnectWallet: async () => {
        clearExternalSolanaWallet();
      },
    }),
    [showToast],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

function ConfiguredReownWalletProvider({ children }: { children: ReactNode }) {
  const { showToast } = useToast();
  const reownAccount = useAppKitAccount({ namespace: "solana" });
  const { walletProvider: reownWalletProvider } = useAppKitProvider("solana");
  const [session, setSession] = useState<ConnectedWalletSession | null>(null);

  useEffect(() => {
    if (!reownAccount.isConnected || !reownAccount.address || !reownWalletProvider) {
      return;
    }

    const nextSession = registerExternalSolanaWallet({
      id: "reown-solana",
      name: "Reown",
      address: reownAccount.address,
      provider: bindReownSolanaProvider(reownWalletProvider),
    });

    setSession(nextSession);
  }, [reownAccount.address, reownAccount.isConnected, reownWalletProvider]);

  function requestWalletConnection() {
    try {
      openTrustLinkWalletModal();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not open Reown wallet connection.");
    }
  }

  async function disconnectWallet() {
    try {
      await disconnectSolanaWallet();
      clearExternalSolanaWallet();
      setSession(null);
      showToast("Wallet disconnected.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not disconnect wallet.");
    }
  }

  const value = useMemo<WalletContextValue>(
    () => ({
      session,
      walletAddress: session?.address ?? null,
      requestWalletConnection,
      disconnectWallet,
    }),
    [session],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);

  if (!context) {
    throw new Error("useWallet must be used within WalletProvider");
  }

  return context;
}
