import { Connection, PublicKey } from "@solana/web3.js";

const [sourceText, vaultText, reserveText] = process.argv.slice(2);
if (!sourceText || !vaultText || !reserveText) {
  throw new Error("Usage: node scripts/devnet-reserve-status.mjs <source> <vault> <reserve-state>");
}

const connection = new Connection(process.env.TCAP_RPC_URL ?? "https://api.devnet.solana.com", "confirmed");
const source = new PublicKey(sourceText);
const vault = new PublicKey(vaultText);
const reserve = new PublicKey(reserveText);
const [sourceBalance, vaultBalance, reserveInfo] = await Promise.all([
  connection.getTokenAccountBalance(source),
  connection.getTokenAccountBalance(vault),
  connection.getAccountInfo(reserve),
]);
if (!reserveInfo) throw new Error(`Reserve state does not exist: ${reserve.toBase58()}`);

// Anchor discriminator (8), version (2), protocol version (2), and three pubkeys (96).
const actualAssetsOffset = 8 + 2 + 2 + 32 + 32 + 32;
const actualAssets = reserveInfo.data.readBigUInt64LE(actualAssetsOffset);
const vaultBaseUnits = BigInt(vaultBalance.value.amount);

console.log(`Source UI balance: ${sourceBalance.value.uiAmountString}`);
console.log(`Source base units: ${sourceBalance.value.amount}`);
console.log(`Vault UI balance: ${vaultBalance.value.uiAmountString}`);
console.log(`Vault base units: ${vaultBalance.value.amount}`);
console.log(`Reserve actual_assets: ${actualAssets}`);
console.log(`Invariant actual_assets == vault: ${actualAssets === vaultBaseUnits}`);
