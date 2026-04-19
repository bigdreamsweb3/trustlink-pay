"use client";

import {
  connectSolanaWallet,
  disconnectSolanaWallet,
  getWalletEnvironment,
  listAvailableSolanaWallets,
  type ConnectedWalletSession,
  type DetectedWallet,
} from "@/src/lib/wallet";

export function getWalletsForConnection(): DetectedWallet[] {
  const wallets = listAvailableSolanaWallets();

  if (wallets.length === 0) {
    throw new Error(getWalletEnvironment().helpMessage);
  }

  return wallets;
}

export async function connectTrustLinkWallet(walletId: string): Promise<ConnectedWalletSession> {
  return connectSolanaWallet(walletId);
}

export async function disconnectTrustLinkWallet() {
  await disconnectSolanaWallet();
}

export function getWalletConnectionErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not connect wallet";
}

export function getWalletDisconnectionErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not disconnect wallet";
}
