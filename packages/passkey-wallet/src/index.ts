/**
 * Passkey Wallet SDK
 * 
 * A passkey-based Solana wallet for TrustLink Pay.
 * Provides secure, biometric-authenticated wallet management using WebAuthn/FIDO2.
 * 
 * @example
 * ```typescript
 * import { PasskeyWallet } from "@trustlink/passkey-wallet";
 * 
 * const wallet = new PasskeyWallet({
 *   rpcUrl: "https://api.mainnet-beta.solana.com",
 *   rpId: "trustlink.pay",
 *   rpName: "TrustLink Pay",
 * });
 * 
 * // Check if passkeys are supported
 * if (!PasskeyWallet.isSupported()) {
 *   console.error("Passkeys not supported");
 *   return;
 * }
 * 
 * // Register a new passkey wallet
 * const credential = await wallet.register({
 *   displayName: "Daniel Trust",
 *   handle: "daniel_trust",
 * });
 * 
 * // Authenticate
 * const account = await wallet.authenticate({
 *   challenge: generateChallenge(),
 * });
 * 
 * console.log("Address:", wallet.getAddress());
 * ```
 */

// Types
export * from "./types";

// Key derivation
export * from "./keys";

// Main wallet class
export { PasskeyWallet } from "./wallet";

// React hooks
export { usePasskeyWallet, usePasskeySupport } from "./react";