import { Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

const DEFAULT_TINS_PROGRAM_ID = new PublicKey(
  "TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT"
);

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: node tins-lookup.mjs <TIN>");
    process.exit(1);
  }

  const targetTinStr = args[0];
  let targetTin;
  try {
    targetTin = BigInt(targetTinStr);
  } catch (err) {
    console.error("Invalid TIN. Must be a number.");
    process.exit(1);
  }

  const connection = new Connection("http://127.0.0.1:8899", "confirmed");
  console.log(`Searching for TIN: ${targetTin.toString()}...`);

  // Convert the TIN (u64) to an 8-byte little-endian buffer for memcmp
  const tinBuffer = Buffer.alloc(8);
  tinBuffer.writeBigUInt64LE(targetTin, 0);

  // Search the TINS program for accounts where the first 8 bytes match the TIN
  const accounts = await connection.getProgramAccounts(DEFAULT_TINS_PROGRAM_ID, {
    filters: [
      {
        memcmp: {
          offset: 0, // TIN is the first field in the TinAccount struct
          bytes: bs58.encode(tinBuffer),
        },
      },
    ],
  });

  if (accounts.length === 0) {
    console.log(`No TINS account found for TIN ${targetTin.toString()}`);
    return;
  }

  console.log(`Found ${accounts.length} account(s) for TIN ${targetTin.toString()}`);
  
  for (const account of accounts) {
    console.log(`\nAccount Pubkey (PDA): ${account.pubkey.toBase58()}`);
    
    const data = account.account.data;
    
    // Parse the TinAccount Borsh struct manually
    // Struct Layout:
    // 0-7: tin (u64)
    // 8-11: display_name length (u32)
    // 12 to 12+len: display_name (String)
    // 12+len to 12+len+32: identity_pubkey (Pubkey)
    // ...
    
    const tinRead = data.readBigUInt64LE(0);
    const displayNameLen = data.readUInt32LE(8);
    const displayNameBytes = data.subarray(12, 12 + displayNameLen);
    const displayName = displayNameBytes.toString("utf8");
    
    let offset = 12 + displayNameLen;
    const identityPubkeyBytes = data.subarray(offset, offset + 32);
    const identityPubkey = new PublicKey(identityPubkeyBytes);
    offset += 32;
    
    const encryptedPhoneLen = data.readUInt32LE(offset);
    offset += 4;
    // We skip the encrypted phone bytes since they are private
    offset += encryptedPhoneLen;
    
    const createdAtStr = data.readBigInt64LE(offset).toString();

    console.log("=== Public TIN Details ===");
    console.log(`TIN Number:       ${tinRead.toString()}`);
    console.log(`Display Name:     ${displayName}`);
    console.log(`Owner Pubkey:     ${identityPubkey.toBase58()}`);
    console.log(`Created At:       ${createdAtStr} (unix timestamp)`);
    console.log("==========================");
  }
}

main().catch((err) => {
  console.error("Error:", err);
});
