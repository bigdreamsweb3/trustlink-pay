# Passkey Wallet SDK

A passkey-based Solana wallet for TrustLink Pay.

## Overview

This SDK provides a secure, biometric-authenticated wallet using WebAuthn/FIDO2. Instead of requiring users to manage seed phrases, passkeys leverage device-based authentication (Face ID, Touch ID, fingerprint, Windows Hello) to secure their Solana wallet.

## Features

- **No Seed Phrase** - Users authenticate with biometrics they already use
- **Biometric Security** - Face ID, Touch ID, fingerprint, Windows Hello
- **Solana Native** - Works with standard Solana programs and wallets
- **Backup Recovery** - Optional backup wallet for account recovery
- **Cross-Platform** - Works on iOS, Android, macOS, Windows

## Installation

```bash
npm install @trustlink/passkey-wallet
# or
yarn add @trustlink/passkey-wallet
# or
pnpm add @trustlink/passkey-wallet
```

## Quick Start

```typescript
import { PasskeyWallet } from "@trustlink/passkey-wallet";

// Initialize wallet
const wallet = new PasskeyWallet({
  rpcUrl: "https://api.mainnet-beta.solana.com",
  rpId: "trustlink.pay",
  rpName: "TrustLink Pay",
});

// Check support
if (!PasskeyWallet.isSupported()) {
  throw new Error("Passkeys not supported on this device");
}

// Register new wallet
const credential = await wallet.register({
  displayName: "Daniel Trust",
  handle: "daniel_trust",
});

// Authenticate with biometrics
const account = await wallet.authenticate({
  challenge: generateChallenge(),
});

// Get wallet address
console.log("Address:", wallet.getAddress());
```

## Platform Capabilities

```typescript
import { PasskeyWallet } from "@trustlink/passkey-wallet";

const capabilities = PasskeyWallet.detectCapabilities();

console.log({
  platform: capabilities.platform,      // 'ios' | 'android' | 'macos' | 'windows'
  biometric: capabilities.biometricType, // 'face' | 'fingerprint' | 'security_key'
  canCreateCredentials: capabilities.canCreateCredentials,
});
```

## Backup Wallets

Add backup wallets for account recovery:

```typescript
// Add backup wallet
wallet.addBackupWallet({
  address: "SolanaAddress...",
  name: "Ledger Backup",
  isHardware: true,
});

// Remove backup wallet
wallet.removeBackupWallet("SolanaAddress...");

// List backup wallets
const backups = wallet.getBackupWallets();
```

## Persistence

Save and restore wallet state:

```typescript
// Save state (e.g., to localStorage)
localStorage.setItem("wallet", wallet.serialize());

// Restore state
const saved = localStorage.getItem("wallet");
if (saved) {
  const restored = new PasskeyWallet(config);
  restored.restore(saved);
}
```

## API Reference

### PasskeyWallet

```typescript
// Constructor
new PasskeyWallet(config: PasskeyWalletConfig)

// Static methods
PasskeyWallet.isSupported(): boolean
PasskeyWallet.detectCapabilities(): PlatformCapabilities

// Instance methods
await wallet.register(options: RegisterPasskeyOptions): Promise<PasskeyCredential>
await wallet.authenticate(options: AuthenticatePasskeyOptions): Promise<PasskeyAccount>
await wallet.signTransaction(request: SignTransactionRequest): Promise<SignTransactionResult>

wallet.getPublicKey(): PublicKey | null
wallet.getAddress(): string | null
wallet.isWalletAuthenticated(): boolean
wallet.getAccount(): PasskeyAccount | null
wallet.getBackupWallets(): BackupWalletConfig[]
wallet.addBackupWallet(wallet: BackupWalletConfig): void
wallet.removeBackupWallet(address: string): void
wallet.serialize(): string
wallet.restore(serialized: string): void
wallet.signOut(): void
```

## Security Model

1. **Private Key Never Exposed** - The Solana private key is derived inside the passkey authenticator and never leaves the device
2. **Biometric Authentication** - Every transaction requires biometric verification
3. **Deterministic Derivation** - Same passkey = same Solana address (recoverable)
4. **Backup Protection** - Optional hardware wallet backup for account recovery

## Requirements

- Modern browser with WebAuthn support
- Platform authenticator (Touch ID, Face ID, Windows Hello, etc.)
- HTTPS or localhost (WebAuthn requires secure context)

## Browser Support

| Browser | Platform Authenticator |
|---------|----------------------|
| Safari | ✅ Touch ID / Face ID |
| Chrome | ✅ Windows Hello / fingerprint |
| Edge | ✅ Windows Hello |
| Firefox | Limited |

## License

MIT