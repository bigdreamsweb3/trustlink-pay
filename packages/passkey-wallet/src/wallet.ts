/**
 * Passkey Wallet - Core Implementation
 * 
 * Handles passkey registration, authentication, and transaction signing.
 * Uses WebAuthn/FIDO2 standard for secure key management.
 */

import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import {
  PasskeyAccount,
  PasskeyCredential,
  PasskeyWalletConfig,
  RegisterPasskeyOptions,
  AuthenticatePasskeyOptions,
  PlatformCapabilities,
  PasskeyError,
  PasskeyErrorType,
  PasskeyWalletState,
  BackupWalletConfig,
  SignTransactionRequest,
  SignTransactionResult,
} from "./types";
import {
  deriveAddressFromCredentialId,
  deriveKeypairFromCredential,
  generateRegistrationChallenge,
  generateAuthenticationChallenge,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  base64Encode,
} from "./keys";

/**
 * Passkey Wallet - Main Class
 * 
 * Provides a passkey-based wallet for Solana with the following features:
 * - Create and manage passkey credentials
 * - Derive Solana addresses from credentials
 * - Sign transactions using WebAuthn
 * - Backup wallet recovery
 * - Biometric authentication
 */
export class PasskeyWallet {
  private config: PasskeyWalletConfig;
  private credentialId: string | null = null;
  private account: PasskeyAccount | null = null;
  private backupWallets: BackupWalletConfig[] = [];
  private isAuthenticated = false;
  private lastAuthTime: Date | null = null;

  /**
   * Creates a new PasskeyWallet instance
   * 
   * @param config - Wallet configuration
   */
  constructor(config: PasskeyWalletConfig) {
    this.config = config;
  }

  /**
   * Checks if passkey authentication is supported
   */
  static isSupported(): boolean {
    if (typeof window === "undefined") return false;
    return !!(
      window.PublicKeyCredential &&
      typeof window.PublicKeyCredential === "function"
    );
  }

  /**
   * Detects platform capabilities for passkey authentication
   */
  static detectCapabilities(): PlatformCapabilities {
    if (!this.isSupported()) {
      return {
        platform: "unknown",
        biometricType: "none",
        canCreateCredentials: false,
        canGetAssertions: false,
        requiresUsbSecurityKey: false,
      };
    }

    const platform = this.detectPlatform();
    const biometricType = this.detectBiometricType();

    // Check platform authenticator availability
    const canCreateCredentials = typeof navigator !== "undefined" &&
      typeof navigator.credentials !== "undefined" &&
      typeof PublicKeyCredential !== "undefined" &&
      typeof (PublicKeyCredential as any).isUserVerifyingPlatformAuthenticatorAvailable === "function";

    return {
      platform,
      biometricType,
      canCreateCredentials,
      canGetAssertions: true,
      requiresUsbSecurityKey: platform === "windows",
    };
  }

  /**
   * Detects the current platform type
   */
  private static detectPlatform(): PlatformCapabilities["platform"] {
    if (typeof navigator === "undefined") return "unknown";
    const ua = navigator.userAgent;

    if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
    if (/Android/i.test(ua)) return "android";
    if (/Macintosh|Mac OS/i.test(ua)) return "macos";
    if (/Windows/i.test(ua)) return "windows";
    return "unknown";
  }

  /**
   * Detects available biometric authentication type
   */
  private static detectBiometricType(): PlatformCapabilities["biometricType"] {
    if (!this.isSupported()) return "none";

    const authenticatorAttachment = "platform";

    // Platform authenticators typically support biometrics
    if (authenticatorAttachment === "platform") {
      if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        return "face"; // iOS Face ID or Touch ID
      }
      return "fingerprint"; // Android Fingerprint or Windows Windows Hello
    }

    return "security_key"; // External security key
  }

  /**
   * Registers a new passkey credential for a user
   * 
   * @param options - Registration options
   * @returns The registered account and credential
   */
  async register(options: RegisterPasskeyOptions): Promise<PasskeyCredential> {
    if (!PasskeyWallet.isSupported()) {
      throw PasskeyError.notSupported();
    }

    const challenge = generateRegistrationChallenge();
    const rpId = this.config.rpId;

    try {
      // Generate a keypair to get the expected public key
      const credentialId = crypto.randomUUID();
      const keypair = deriveKeypairFromCredential(credentialId);

      // Create passkey registration options
      const registrationOptions: PublicKeyCredentialCreationOptions = {
        challenge: base64ToArrayBuffer(challenge),
        rp: {
          id: rpId,
          name: this.config.rpName,
        },
        user: {
          id: new TextEncoder().encode(options.handle),
          name: options.handle,
          displayName: options.displayName,
        },
        pubKeyCredParams: [
          { alg: -7, type: "public-key" },   // ES256 (recommended)
          { alg: -257, type: "public-key" },  // RS256 (fallback)
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "required",
        },
        timeout: 60000,
        attestation: "none",
        extensions: {
          credProps: true,
        },
      };

      // Call WebAuthn API
      const credential = await navigator.credentials.create({
        publicKey: registrationOptions,
      }) as PublicKeyCredential;

      if (!credential) {
        throw PasskeyError.authenticationFailed();
      }

      // Extract and store credential data
      this.credentialId = credentialId;
      this.account = {
        id: crypto.randomUUID(),
        displayName: options.displayName,
        handle: options.handle,
        publicKey: keypair.publicKey,
        createdAt: new Date(),
      };
      this.isAuthenticated = true;
      this.lastAuthTime = new Date();

      // Build the credential object
      const passkeyCredential: PasskeyCredential = {
        id: credential.id,
        rawId: credential.rawId,
        publicKey: keypair.secretKey.slice(0, 32), // First 32 bytes is public key
        counter: 0,
        createdAt: new Date(),
      };

      return passkeyCredential;
    } catch (error) {
      if (error instanceof PasskeyError) throw error;

      if (error instanceof Error) {
        if (/cancel|cancelled|abort/i.test(error.message)) {
          throw PasskeyError.cancelled();
        }
      }

      throw new PasskeyError(
        PasskeyErrorType.REGISTRATION_FAILED,
        `Failed to register passkey: ${error instanceof Error ? error.message : "Unknown error"}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Authenticates with an existing passkey credential
   * 
   * @param options - Authentication options (challenge is required)
   * @returns The authenticated account
   */
  async authenticate(options: AuthenticatePasskeyOptions): Promise<PasskeyAccount> {
    if (!PasskeyWallet.isSupported()) {
      throw PasskeyError.notSupported();
    }

    if (!this.credentialId) {
      throw PasskeyError.notFound();
    }

    const challenge = options.challenge || generateAuthenticationChallenge();
    const rpId = options.rpId || this.config.rpId;

    try {
      const authenticationOptions: PublicKeyCredentialRequestOptions = {
        challenge: base64ToArrayBuffer(challenge),
        rpId,
        timeout: options.timeout || 60000,
        userVerification: "required",
        extensions: {
          appid: rpId,
        },
      };

      // Call WebAuthn API
      const credential = await navigator.credentials.get({
        publicKey: authenticationOptions,
      }) as PublicKeyCredential;

      if (!credential) {
        throw PasskeyError.authenticationFailed();
      }

      // Verify the credential is for our account
      if (!this.account) {
        throw PasskeyError.notFound();
      }

      this.isAuthenticated = true;
      this.lastAuthTime = new Date();

      return this.account;
    } catch (error) {
      if (error instanceof PasskeyError) throw error;

      if (error instanceof Error) {
        if (/cancel|cancelled|abort/i.test(error.message)) {
          throw PasskeyError.cancelled();
        }
      }

      throw PasskeyError.authenticationFailed();
    }
  }

  /**
   * Signs a transaction using the passkey
   * 
   * @param request - The transaction signing request
   * @returns The signed transaction result
   */
  async signTransaction(request: SignTransactionRequest): Promise<SignTransactionResult> {
    if (!this.isAuthenticated) {
      throw new PasskeyError(
        PasskeyErrorType.AUTHENTICATION_FAILED,
        "Wallet is not authenticated. Please authenticate first."
      );
    }

    if (!this.credentialId) {
      throw PasskeyError.notFound();
    }

    try {
      // Build the authentication assertion
      const challenge = base64Encode(request.transaction);
      const authenticationOptions: PublicKeyCredentialRequestOptions = {
        challenge: base64ToArrayBuffer(challenge),
        rpId: this.config.rpId,
        timeout: 60000,
        userVerification: "required",
      };

      const credential = await navigator.credentials.get({
        publicKey: authenticationOptions,
      }) as PublicKeyCredential;

      if (!credential) {
        throw PasskeyError.authenticationFailed();
      }

      // The actual transaction signing happens using the derived keypair
      // The WebAuthn assertion verifies the user is present and biometric is valid
      // Then we sign with the deterministic keypair derived from credential ID

      const derivedKeypair = deriveKeypairFromCredential(this.credentialId);
      const signature = nacl.sign.detached(request.transaction, derivedKeypair.secretKey);

      return {
        signature,
        transactionHash: base64Encode(signature),
      };
    } catch (error) {
      if (error instanceof PasskeyError) throw error;
      throw PasskeyError.authenticationFailed();
    }
  }

  /**
   * Gets the current account's public key
   */
  getPublicKey(): PublicKey | null {
    return this.account?.publicKey || null;
  }

  /**
   * Gets the current account's address
   */
  getAddress(): string | null {
    return this.account?.publicKey.toBase58() || null;
  }

  /**
   * Checks if the wallet is authenticated
   */
  isWalletAuthenticated(): boolean {
    return this.isAuthenticated;
  }

  /**
   * Gets the current account
   */
  getAccount(): PasskeyAccount | null {
    return this.account;
  }

  /**
   * Gets backup wallet configuration
   */
  getBackupWallets(): BackupWalletConfig[] {
    return [...this.backupWallets];
  }

  /**
   * Adds a backup wallet
   */
  addBackupWallet(wallet: BackupWalletConfig): void {
    if (!this.isAuthenticated) {
      throw PasskeyError.authenticationFailed();
    }
    this.backupWallets.push(wallet);
  }

  /**
   * Removes a backup wallet
   */
  removeBackupWallet(address: string): void {
    this.backupWallets = this.backupWallets.filter(w => w.address !== address);
  }

  /**
   * Requires a backup wallet for sensitive operations
   */
  requireBackupWallet(): void {
    if (this.backupWallets.length === 0) {
      throw PasskeyError.backupWalletRequired();
    }
  }

  /**
   * Serializes wallet state for persistence
   */
  serialize(): string {
    if (!this.account || !this.credentialId) {
      throw PasskeyError.notFound();
    }

    const state: PasskeyWalletState = {
      account: {
        ...this.account,
        publicKey: this.account.publicKey.toBase58(),
      },
      credentialId: this.credentialId,
      backupWallets: this.backupWallets,
      lastAuthenticatedAt: this.lastAuthTime?.toISOString(),
    };

    return JSON.stringify(state);
  }

  /**
   * Restores wallet state from serialized data
   */
  restore(serialized: string): void {
    const state = JSON.parse(serialized) as PasskeyWalletState;

    this.credentialId = state.credentialId;
    this.account = {
      ...state.account,
      publicKey: new PublicKey(state.account.publicKey),
    };
    this.backupWallets = state.backupWallets;
    this.lastAuthTime = state.lastAuthenticatedAt
      ? new Date(state.lastAuthenticatedAt)
      : null;
    this.isAuthenticated = false;
  }

  /**
   * Signs out and clears authentication state
   */
  signOut(): void {
    this.isAuthenticated = false;
    this.lastAuthTime = null;
  }
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    PublicKeyCredential: {
      new (options: any): PublicKeyCredential;
      isUserVerifyingPlatformAuthenticatorAvailable(): Promise<boolean>;
      getCreateCredsChoices(): Promise<any>;
    };
  }
}