"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { WalletPickerModal } from "@/src/components/modals/wallet-picker-modal";
import {
  getConnectedWalletSession,
  type ConnectedWalletSession,
  type DetectedWallet,
} from "@/src/lib/wallet";
import {
  connectTrustLinkWallet,
  disconnectTrustLinkWallet,
  getWalletConnectionErrorMessage,
  getWalletDisconnectionErrorMessage,
  getWalletsForConnection,
} from "@/src/lib/wallet-actions";
import { useToast } from "@/src/components/toast-provider";

type WalletContextValue = {
  session: ConnectedWalletSession | null;
  walletAddress: string | null;
  wallets: DetectedWallet[];
  connectingWalletId: string | null;
  walletPickerOpen: boolean;
  requestWalletConnection: () => void;
  disconnectWallet: () => Promise<void>;
  closeWalletPicker: () => void;
};

const WalletContext = createContext<WalletContextValue | null>(null);

function readInitialSession() {
  if (typeof window === "undefined") {
    return null;
  }

  return getConnectedWalletSession();
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const { showToast } = useToast();
  const [session, setSession] = useState<ConnectedWalletSession | null>(readInitialSession);
  const [wallets, setWallets] = useState<DetectedWallet[]>([]);
  const [walletPickerOpen, setWalletPickerOpen] = useState(false);
  const [connectingWalletId, setConnectingWalletId] = useState<string | null>(null);

  useEffect(() => {
    setSession(readInitialSession());
  }, []);

  function requestWalletConnection() {
    try {
      const detectedWallets = getWalletsForConnection();
      setWallets(detectedWallets);
      setWalletPickerOpen(true);
    } catch (error) {
      showToast(getWalletConnectionErrorMessage(error));
    }
  }

  async function handleWalletSelect(walletId: string) {
    setConnectingWalletId(walletId);

    try {
      const nextSession = await connectTrustLinkWallet(walletId);
      setSession(nextSession);
      setWalletPickerOpen(false);
      showToast(`${nextSession.walletName} connected successfully.`);
    } catch (error) {
      showToast(getWalletConnectionErrorMessage(error));
    } finally {
      setConnectingWalletId(null);
    }
  }

  async function disconnectWallet() {
    try {
      await disconnectTrustLinkWallet();
      setSession(null);
      showToast("Wallet disconnected.");
    } catch (error) {
      showToast(getWalletDisconnectionErrorMessage(error));
    }
  }

  const value = useMemo<WalletContextValue>(
    () => ({
      session,
      walletAddress: session?.address ?? null,
      wallets,
      connectingWalletId,
      walletPickerOpen,
      requestWalletConnection,
      disconnectWallet,
      closeWalletPicker: () => {
        if (!connectingWalletId) {
          setWalletPickerOpen(false);
        }
      },
    }),
    [connectingWalletId, session, walletPickerOpen, wallets],
  );

  return (
    <WalletContext.Provider value={value}>
      {children}
      <WalletPickerModal
        open={walletPickerOpen}
        wallets={wallets}
        connectingWalletId={connectingWalletId}
        onClose={value.closeWalletPicker}
        onSelect={(walletId) => {
          void handleWalletSelect(walletId);
        }}
      />
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);

  if (!context) {
    throw new Error("useWallet must be used within WalletProvider");
  }

  return context;
}
