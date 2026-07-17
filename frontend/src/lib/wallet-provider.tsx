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
  const [appKitReady, setAppKitReady] = useState(false);

  if (!appKitReady) {
    return (
      <DeferredReownWalletProvider onReady={() => setAppKitReady(true)}>
        {children}
      </DeferredReownWalletProvider>
    );
  }

  return <ConfiguredReownWalletProvider>{children}</ConfiguredReownWalletProvider>;
}

function DeferredReownWalletProvider({
  children,
  onReady,
}: {
  children: ReactNode;
  onReady: () => void;
}) {
  const { showToast } = useToast();
  const value = useMemo<WalletContextValue>(
    () => ({
      session: null,
      walletAddress: null,
      requestWalletConnection: () => {
        try {
          const appKit = configureTrustLinkAppKit();

          if (!appKit) {
            showToast(
              "Reown is not configured. Add a valid Reown project ID, restart the frontend, and try again.",
            );
            return;
          }

          onReady();
          appKit.open();
        } catch (error) {
          showToast(
            error instanceof Error
              ? error.message
              : "Could not initialize Reown wallet connection.",
          );
        }
      },
      disconnectWallet: async () => {
        clearExternalSolanaWallet();
      },
    }),
    [onReady, showToast],
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
