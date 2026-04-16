"use client";

import {
  connectSolanaWallet,
  disconnectSolanaWallet,
  listAvailableSolanaWallets,
  type ConnectedWalletSession,
  type DetectedWallet,
} from "@/src/lib/wallet";

const NO_WALLET_ERROR =
  "Install or open a Solana wallet on this device to connect a sender wallet.";

export function getWalletsForConnection(): DetectedWallet[] {
  const wallets = listAvailableSolanaWallets();

  if (wallets.length === 0) {
    throw new Error(NO_WALLET_ERROR);
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

