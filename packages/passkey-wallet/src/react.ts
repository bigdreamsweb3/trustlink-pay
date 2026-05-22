/**
 * Passkey Wallet - React Hooks
 * 
 * React hooks for integrating passkey wallet into TrustLink Pay.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  PasskeyAccount,
  PasskeyWalletConfig,
  PlatformCapabilities,
  BackupWalletConfig,
} from "./types";
import { PasskeyError } from "./types";
import { generateRegistrationChallenge, generateAuthenticationChallenge } from "./keys";
import { PasskeyWallet } from "./wallet";

/**
 * Storage keys for wallet persistence
 */
const WALLET_STATE_KEY = "trustlink.passkey-wallet";
const BACKUP_WALLETS_KEY = "trustlink.backup-wallets";

/**
 * Configuration for the passkey wallet
 */
const DEFAULT_CONFIG: PasskeyWalletConfig = {
  rpcUrl: (typeof window !== "undefined" && process.env.NEXT_PUBLIC_SOLANA_RPC_URL) 
    ? process.env.NEXT_PUBLIC_SOLANA_RPC_URL 
    : "https://api.mainnet-beta.solana.com",
  rpId: (typeof window !== "undefined" && process.env.NEXT_PUBLIC_RP_ID) 
    ? process.env.NEXT_PUBLIC_RP_ID 
    : "trustlink.pay",
  rpName: "TrustLink Pay",
};

/**
 * Hook state
 */
interface UsePasskeyWalletState {
  isSupported: boolean;
  capabilities: PlatformCapabilities | null;
  isAuthenticated: boolean;
  account: PasskeyAccount | null;
  address: string | null;
  backupWallets: BackupWalletConfig[];
  error: string | null;
  isLoading: boolean;
}

/**
 * Hook return type
 */
interface UsePasskeyWalletReturn extends UsePasskeyWalletState {
  register: (displayName: string, handle: string) => Promise<void>;
  authenticate: () => Promise<void>;
  addBackupWallet: (wallet: BackupWalletConfig) => Promise<void>;
  removeBackupWallet: (address: string) => Promise<void>;
  signOut: () => void;
  refreshCapabilities: () => void;
}

/**
 * React hook for passkey wallet management
 */
export function usePasskeyWallet(
  config: Partial<PasskeyWalletConfig> = {}
): UsePasskeyWalletReturn {
  const [wallet] = useState(() => new PasskeyWallet({ ...DEFAULT_CONFIG, ...config }));
  const [state, setState] = useState<UsePasskeyWalletState>({
    isSupported: false,
    capabilities: null,
    isAuthenticated: false,
    account: null,
    address: null,
    backupWallets: [],
    error: null,
    isLoading: true,
  });

  // Check support and restore state on mount
  useEffect(() => {
    const isSupported = PasskeyWallet.isSupported();
    const capabilities = PasskeyWallet.detectCapabilities();

    // Try to restore saved state
    if (typeof window !== "undefined" && isSupported) {
      try {
        const savedState = localStorage.getItem(WALLET_STATE_KEY);
        const savedBackups = localStorage.getItem(BACKUP_WALLETS_KEY);

        if (savedState) {
          wallet.restore(savedState);
          setState((prev: UsePasskeyWalletState) => ({
            ...prev,
            isAuthenticated: wallet.isWalletAuthenticated(),
            account: wallet.getAccount(),
            address: wallet.getAddress(),
            backupWallets: savedBackups ? JSON.parse(savedBackups) : [],
          }));
        }
      } catch (error) {
        console.warn("Failed to restore wallet state:", error);
      }
    }

    setState((prev: UsePasskeyWalletState) => ({
      ...prev,
      isSupported,
      capabilities,
      isLoading: false,
    }));
  }, [wallet]);

  // Save state when it changes
  useEffect(() => {
    if (typeof window !== "undefined" && wallet.getAddress()) {
      try {
        localStorage.setItem(WALLET_STATE_KEY, wallet.serialize());
        localStorage.setItem(BACKUP_WALLETS_KEY, JSON.stringify(state.backupWallets));
      } catch (error) {
        console.warn("Failed to save wallet state:", error);
      }
    }
  }, [wallet, state.backupWallets]);

  const register = useCallback(
    async (displayName: string, handle: string) => {
      setState((prev: UsePasskeyWalletState) => ({ ...prev, error: null, isLoading: true }));

      try {
        const challenge = generateRegistrationChallenge();

        await wallet.register({
          displayName,
          handle,
          challenge,
        });

        setState((prev: UsePasskeyWalletState) => ({
          ...prev,
          isAuthenticated: true,
          account: wallet.getAccount(),
          address: wallet.getAddress(),
          error: null,
          isLoading: false,
        }));
      } catch (error: unknown) {
        const message =
          error instanceof PasskeyError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Registration failed";
        setState((prev: UsePasskeyWalletState) => ({ ...prev, error: message, isLoading: false }));
        throw error;
      }
    },
    [wallet]
  );

  const authenticate = useCallback(async () => {
    setState((prev: UsePasskeyWalletState) => ({ ...prev, error: null, isLoading: true }));

    try {
      const challenge = generateAuthenticationChallenge();

      await wallet.authenticate({ challenge });

      setState((prev: UsePasskeyWalletState) => ({
        ...prev,
        isAuthenticated: true,
        account: wallet.getAccount(),
        address: wallet.getAddress(),
        error: null,
        isLoading: false,
      }));
    } catch (error: unknown) {
      const message =
        error instanceof PasskeyError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Authentication failed";
      setState((prev: UsePasskeyWalletState) => ({ ...prev, error: message, isLoading: false }));
      throw error;
    }
  }, [wallet]);

  const addBackupWallet = useCallback(
    async (walletConfig: BackupWalletConfig) => {
      if (!state.isAuthenticated) {
        const errorMsg = "Wallet must be authenticated to add backup wallet";
        setState((prev: UsePasskeyWalletState) => ({ ...prev, error: errorMsg }));
        throw new Error(errorMsg);
      }

      wallet.addBackupWallet(walletConfig);
      setState((prev: UsePasskeyWalletState) => ({
        ...prev,
        backupWallets: wallet.getBackupWallets(),
      }));
    },
    [wallet, state.isAuthenticated]
  );

  const removeBackupWallet = useCallback(
    async (address: string) => {
      wallet.removeBackupWallet(address);
      setState((prev: UsePasskeyWalletState) => ({
        ...prev,
        backupWallets: wallet.getBackupWallets(),
      }));
    },
    [wallet]
  );

  const signOut = useCallback(() => {
    wallet.signOut();
    setState((prev: UsePasskeyWalletState) => ({
      ...prev,
      isAuthenticated: false,
    }));
  }, [wallet]);

  const refreshCapabilities = useCallback(() => {
    setState((prev: UsePasskeyWalletState) => ({
      ...prev,
      capabilities: PasskeyWallet.detectCapabilities(),
    }));
  }, []);

  return {
    ...state,
    register,
    authenticate,
    addBackupWallet,
    removeBackupWallet,
    signOut,
    refreshCapabilities,
  };
}

/**
 * Hook for checking if passkeys are available
 */
export function usePasskeySupport(): PlatformCapabilities | null {
  const [capabilities, setCapabilities] = useState<PlatformCapabilities | null>(null);

  useEffect(() => {
    if (PasskeyWallet.isSupported()) {
      setCapabilities(PasskeyWallet.detectCapabilities());
    }
  }, []);

  return capabilities;
}