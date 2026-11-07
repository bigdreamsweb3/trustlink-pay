import { createHash } from "node:crypto";
import { PublicKey, type AccountInfo } from "@solana/web3.js";

const TCAP = new PublicKey("tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF");
const FIELD_MODULUS = Buffer.from("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001", "hex");

function canonicalField(value: Buffer, nonzero = false): boolean {
  return value.length === 32 && value.compare(FIELD_MODULUS) < 0
    && (!nonzero || value.some(byte => byte !== 0));
}

/** Validate immutable pool authority; slot release is rechecked by Node and programs. */
export function assertSealedFundingPool(account: AccountInfo<Buffer> | null, address: PublicKey, asset: PublicKey, token: number, expectedRoot: string): void {
  if (!/^[a-f0-9]{64}$/.test(expectedRoot)) throw new Error("TCAP_PRIVATE_POOL_INVALID");
  const root = Buffer.from(expectedRoot, "hex");
  const [key,bump] = PublicKey.findProgramAddressSync([Buffer.from("tcap:sealed-funding:v1"),asset.toBuffer(),root],TCAP);
  const d = account?.data;
  if (!account?.owner.equals(TCAP) || !address.equals(key) || !d || d.length !== 113
      || !d.subarray(0,8).equals(createHash("sha256").update("account:TcapSealedFundingPoolV1").digest().subarray(0,8))
      || d.readUInt16LE(8) !== 1 || d[10] !== bump || !d.subarray(11,43).equals(asset.toBuffer())
      || d.readUInt32LE(43) !== token || !d.subarray(47,79).equals(root) || !canonicalField(root,true)
      || d.readBigUInt64LE(79) > 1n<<32n || d.readBigUInt64LE(87) < 2n || d.readBigUInt64LE(87) > d.readBigUInt64LE(79)
      || d.readUInt16LE(95) < 2 || BigInt(d.readUInt16LE(95)) > d.readBigUInt64LE(87)
      || d.readBigUInt64LE(105) < d.readBigUInt64LE(97)) throw new Error("TCAP_PRIVATE_POOL_INVALID");
}
