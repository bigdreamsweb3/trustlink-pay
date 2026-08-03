import {
  base64UrlToBytes,
  bytesToBase64Url,
  canonicalFields,
  sha256Hex,
  toArrayBuffer,
} from "./receipts/internal/encoding.js";

export type TinLocalMasterSeedContext = {
  tin: string;
  ownerPublicKey: string;
  routeVersion: number;
  pruConfigurationHash: string;
};

function aad(context: TinLocalMasterSeedContext) {
  return canonicalFields([
    "TSN_TIN_LOCAL_MASTER_SEED",
    context.tin,
    context.ownerPublicKey,
    String(context.routeVersion),
    context.pruConfigurationHash.toLowerCase(),
  ]);
}

function ciphertextCommitment(params: {
  context: TinLocalMasterSeedContext;
  seedNonce: string;
  seedCiphertext: string;
}) {
  return sha256Hex(canonicalFields([
    "TSN_TIN_LOCAL_MASTER_SEED_CIPHERTEXT",
    params.context.tin,
    params.context.ownerPublicKey,
    String(params.context.routeVersion),
    params.context.pruConfigurationHash.toLowerCase(),
    params.seedNonce,
    params.seedCiphertext,
  ]));
}

async function importDataKey(keyMaterial: Uint8Array, usages: KeyUsage[]) {
  if (keyMaterial.length !== 32) {
    throw new Error("TIN master-seed data key must be exactly 32 bytes");
  }
  return crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keyMaterial),
    { name: "AES-GCM" },
    false,
    usages,
  );
}

export async function encryptTinMasterSeedLocally(params: {
  masterSeed: Uint8Array;
  dataKey: Uint8Array;
  context: TinLocalMasterSeedContext;
}) {
  if (params.masterSeed.length !== 32) {
    throw new Error("TIN master seed must be exactly 32 bytes");
  }
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(nonce),
      additionalData: toArrayBuffer(aad(params.context)),
      tagLength: 128,
    },
    await importDataKey(params.dataKey, ["encrypt"]),
    toArrayBuffer(params.masterSeed),
  ));
  const seedCiphertext = bytesToBase64Url(ciphertext);
  const seedNonce = bytesToBase64Url(nonce);
  return {
    seedCiphertext,
    seedNonce,
    seedCiphertextCommitment: await ciphertextCommitment({
      context: params.context,
      seedNonce,
      seedCiphertext,
    }),
  };
}

export async function decryptTinMasterSeedLocally(params: {
  seedCiphertext: string;
  seedNonce: string;
  expectedSeedCiphertextCommitment: string;
  dataKey: Uint8Array;
  context: TinLocalMasterSeedContext;
}) {
  const expected = await ciphertextCommitment(params);
  if (expected !== params.expectedSeedCiphertextCommitment.toLowerCase()) {
    throw new Error("TIN local master-seed ciphertext commitment is invalid");
  }
  const plaintext = new Uint8Array(await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(base64UrlToBytes(params.seedNonce)),
      additionalData: toArrayBuffer(aad(params.context)),
      tagLength: 128,
    },
    await importDataKey(params.dataKey, ["decrypt"]),
    toArrayBuffer(base64UrlToBytes(params.seedCiphertext)),
  ));
  if (plaintext.length !== 32) {
    plaintext.fill(0);
    throw new Error("Decrypted TIN master seed has an invalid length");
  }
  return plaintext;
}
