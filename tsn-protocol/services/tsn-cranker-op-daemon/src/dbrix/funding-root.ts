import { createHash } from "node:crypto";
import { PublicKey, type AccountInfo } from "@solana/web3.js";

const TCAP = new PublicKey("tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF");
const FIELD_MODULUS = Buffer.from("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001", "hex");

function canonicalField(value: Buffer, nonzero = false): boolean {
  return value.length === 32 && value.compare(FIELD_MODULUS) < 0
    && (!nonzero || value.some(byte => byte !== 0));
}

/** Validate the global funded root and its authenticated, bounded history. */
export function assertFundingRoot(account: AccountInfo<Buffer> | null, address: PublicKey, expectedRoot: string): void {
  const invalid = () => { throw new Error("TCAP_FUNDING_ROOT_INVALID"); };
  if (!/^[a-f0-9]{64}$/.test(expectedRoot)) invalid();
  const selected = Buffer.from(expectedRoot, "hex");
  if (!canonicalField(selected, true)) invalid();
  const [key,bump] = PublicKey.findProgramAddressSync([Buffer.from("tcap:funding-root:v1")],TCAP);
  const d = account?.data;
  if (!account?.owner.equals(TCAP) || !address.equals(key) || !d || d.length !== 6209
      || !d.subarray(0,8).equals(createHash("sha256").update("account:TcapFundingMerkleRootV1").digest().subarray(0,8))
      || d.readUInt16LE(8) !== 2 || d.readUInt16LE(10) !== 1 || d[12] !== bump
      || !canonicalField(d.subarray(13,45),true) || d.readBigUInt64LE(45) > 1n<<32n
      || d.readUInt32LE(53) !== 32 || d.readUInt32LE(1081) !== 128) invalid();
  const data = d!;
  for (let i = 0; i < 32; i++) if (!canonicalField(data.subarray(57+i*32,89+i*32))) invalid();
  const count = data.readBigUInt64LE(45), cursor = data.readUInt16LE(6205), size = data.readUInt16LE(6207);
  if (size > 128 || BigInt(size) > count || cursor >= 128 || (size < 128 && cursor !== size)
      || (count === 0n ? size !== 0 || cursor !== 0 : size === 0)) invalid();
  const roots: Buffer[] = [];
  let previousCount = 0n;
  for (let i = 0; i < 128; i++) {
    const active = i < size;
    const index = size === 128 ? (cursor+i)%128 : i;
    const offset = 1085+index*40, root = data.subarray(offset,offset+32), noteCount = data.readBigUInt64LE(offset+32);
    if (!active) {
      if (noteCount !== 0n || root.some(byte => byte !== 0)) invalid();
      continue;
    }
    if (!canonicalField(root,true) || noteCount !== count-BigInt(size)+BigInt(i)+1n) invalid();
    previousCount = noteCount;
    roots.push(root);
  }
  if (size && (previousCount !== count || !roots.at(-1)!.equals(data.subarray(13,45)))) invalid();
  if (count === 0n || !roots.some(root => root.equals(selected))) {
    throw new Error("TCAP_FUNDING_ROOT_CHANGED_BEFORE_SETTLEMENT");
  }
}
