/**
 * Passkey Wallet - Core Types
 * 
 * Defines the interfaces and types for passkey-based Solana wallet authentication.
 */

import type { PublicKey } from "@solana/web3.js";

/**
 * Represents a passkey credential stored on the authenticator
 */
export interface PasskeyCredential {
  id: string;
  rawId: ArrayBuffer;
  publicKey: Uint8Array;
  counter: number;
  deviceType?: string;
  createdAt: Date;
}

/**
 * User account information
 */
export interface PasskeyAccount {
  id: string;
  displayName: string;
  handle: string;
  publicKey: PublicKey;
  createdAt: Date;
}

/**
 * Backup wallet configuration
 */
export interface BackupWalletConfig {
  address: string;
  name: string;
  isHardware: boolean;
  approvedAt?: Date;
}

/**
 * Result of creating a passkey registration
 */
export interface PasskeyRegistrationResult {
  account: PasskeyAccount;
  credential: PasskeyCredential;
}

/**
 * Result of authenticating with a passkey
 */
export interface PasskeyAuthenticationResult {
  account: PasskeyAccount;
  credential: PasskeyCredential;
  authenticatedAt: Date;
}

/**
 * Wallet state for persistence
 */
export interface PasskeyWalletState {
  account: Omit<PasskeyAccount, "publicKey"> & { publicKey: string };
  credentialId: string;
  backupWallets: BackupWalletConfig[];
  lastAuthenticatedAt?: string;
}

/**
 * Options for passkey registration
 */
export interface RegisterPasskeyOptions {
  displayName: string;
  handle: string;
  rpId?: string;
  rpName?: string;
  challenge?: string;
}

/**
 * Options for passkey authentication
 */
export interface AuthenticatePasskeyOptions {
  challenge: string;
  rpId?: string;
  timeout?: number;
}

/**
 * Transaction signing request
 */
export interface SignTransactionRequest {
  transaction: Uint8Array;
  message?: string;
  displayData?: {
    title: string;
    description?: string;
    amount?: string;
    recipient?: string;
  };
}

/**
 * Transaction signing result
 */
export interface SignTransactionResult {
  signature: Uint8Array;
  transactionHash: string;
}

/**
 * Passkey wallet configuration
 */
export interface PasskeyWalletConfig {
  rpcUrl: string;
  rpId: string;
  rpName: string;
}

/**
 * Supported platforms for passkey authentication
 */
export type PlatformType = "windows" | "macos" | "ios" | "android" | "unknown";

/**
 * Biometric authentication types
 */
export type BiometricType = "fingerprint" | "face" | "iris" | "security_key" | "hybrid" | "none";

/**
 * Detection result for platform capabilities
 */
export interface PlatformCapabilities {
  platform: PlatformType;
  biometricType: BiometricType;
  canCreateCredentials: boolean;
  canGetAssertions: boolean;
  requiresUsbSecurityKey: boolean;
}

/**
 * Error types for passkey operations
 */
export enum PasskeyErrorType {
  NOT_SUPPORTED = "NOT_SUPPORTED",
  ALREADY_EXISTS = "ALREADY_EXISTS",
  NOT_FOUND = "NOT_FOUND",
  AUTHENTICATION_FAILED = "AUTHENTICATION_FAILED",
  REGISTRATION_FAILED = "REGISTRATION_FAILED",
  INVALID_CHALLENGE = "INVALID_CHALLENGE",
  USER_VERIFICATION_FAILED = "USER_VERIFICATION_FAILED",
  BACKUP_WALLET_REQUIRED = "BACKUP_WALLET_REQUIRED",
  CANCELLED = "CANCELLED",
  TIMEOUT = "TIMEOUT",
  NETWORK_ERROR = "NETWORK_ERROR",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

/**
 * Custom error class for passkey operations
 */
export class PasskeyError extends Error {
  constructor(
    public type: PasskeyErrorType,
    message: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = "PasskeyError";
  }

  static notSupported(): PasskeyError {
    return new PasskeyError(
      PasskeyErrorType.NOT_SUPPORTED,
      "Passkey authentication is not supported in this browser"
    );
  }

  static alreadyExists(): PasskeyError {
    return new PasskeyError(
      PasskeyErrorType.ALREADY_EXISTS,
      "A passkey credential already exists for this account"
    );
  }

  static notFound(): PasskeyError {
    return new PasskeyError(
      PasskeyErrorType.NOT_FOUND,
      "No passkey credential found for this account"
    );
  }

  static authenticationFailed(): PasskeyError {
    return new PasskeyError(
      PasskeyErrorType.AUTHENTICATION_FAILED,
      "Passkey authentication failed"
    );
  }

  static cancelled(): PasskeyError {
    return new PasskeyError(
      PasskeyErrorType.CANCELLED,
      "Authentication was cancelled by the user"
    );
  }

  static backupWalletRequired(): PasskeyError {
    return new PasskeyError(
      PasskeyErrorType.BACKUP_WALLET_REQUIRED,
      "A backup wallet is required to perform this action"
    );
  }
}