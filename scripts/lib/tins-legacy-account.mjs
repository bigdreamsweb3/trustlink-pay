import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

export function decodeLegacyTinAccount(data) {
  const buffer = Buffer.from(data);
  let offset = 0;

  const tin = buffer.readBigUInt64LE(offset);
  offset += 8;

  const displayNameLength = buffer.readUInt32LE(offset);
  offset += 4;
  const displayName = buffer.subarray(offset, offset + displayNameLength).toString("utf8");
  offset += displayNameLength;

  const identityPubkey = new PublicKey(buffer.subarray(offset, offset + 32));
  offset += 32;

  let ownerPubkey = null;
  if (offset + 32 <= buffer.length) {
    ownerPubkey = new PublicKey(buffer.subarray(offset, offset + 32));
    offset += 32;
  }

  let encryptedPhone = Buffer.alloc(0);
  if (offset + 4 <= buffer.length) {
    const encryptedPhoneLength = buffer.readUInt32LE(offset);
    offset += 4;
    encryptedPhone = buffer.subarray(offset, Math.min(offset + encryptedPhoneLength, buffer.length));
    offset += encryptedPhone.length;
  }

  let createdAt = null;
  if (offset + 8 <= buffer.length) {
    createdAt = buffer.readBigInt64LE(offset);
    offset += 8;
  }

  let privacyLevel = null;
  if (offset + 1 <= buffer.length) {
    privacyLevel = buffer.readUInt8(offset);
    offset += 1;
  }

  let encryptedMetadataHash = null;
  if (offset + 32 <= buffer.length) {
    encryptedMetadataHash = buffer.subarray(offset, offset + 32);
    offset += 32;
  }

  let pruConfigurationHash = null;
  if (offset + 32 <= buffer.length) {
    pruConfigurationHash = buffer.subarray(offset, offset + 32);
  }

  return {
    kind: "legacy",
    tin,
    displayName,
    identityPubkey,
    ownerPubkey,
    encryptedPhone,
    createdAt,
    privacyLevel,
    encryptedMetadataHash,
    pruConfigurationHash,
  };
}

export async function findLegacyTinAccount({ connection, programId, tin }) {
  const tinBuffer = Buffer.alloc(8);
  tinBuffer.writeBigUInt64LE(BigInt(tin), 0);

  const accounts = await connection.getProgramAccounts(programId, {
    filters: [
      {
        memcmp: {
          offset: 0,
          bytes: bs58.encode(tinBuffer),
        },
      },
    ],
  });

  for (const account of accounts) {
    try {
      const decoded = decodeLegacyTinAccount(account.account.data);
      if (decoded.tin === BigInt(tin)) {
        return {
          pubkey: account.pubkey,
          account,
          decoded,
        };
      }
    } catch {
      // Ignore other account layouts sharing the same prefix.
    }
  }

  return null;
}
