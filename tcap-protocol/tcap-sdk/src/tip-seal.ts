export const TIP_SEALED_BYTES = 48;
export const TIP_PLAINTEXT_BYTES = 32;

const concat = (...parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; };
const sha256 = async (...parts: Uint8Array[]): Promise<Uint8Array> => new Uint8Array(await crypto.subtle.digest("SHA-256", concat(...parts) as BufferSource));

const text = (value: string) => new TextEncoder().encode(value);

export async function deriveTipViewKey(masterSeed: Uint8Array): Promise<Uint8Array> {
  return sha256(text("TCAP_VIEW_V1"), masterSeed);
}

export async function deriveTipSealNonce(tipPda: Uint8Array, previousCommitment: Uint8Array): Promise<Uint8Array> {
  if (tipPda.length !== 32 || previousCommitment.length !== 32) throw new Error("tip PDA and commitment must be 32 bytes");
  return (await sha256(text("TCAP_SEAL_V1"), tipPda, previousCommitment)).slice(0, 12);
}

export function encodeTipPlaintext(available: bigint, tokenId: number): Uint8Array {
  if (available < 0n || available > 0xffffffffffffffffn) throw new Error("available out of range");
  if (!Number.isInteger(tokenId) || tokenId < 0 || tokenId > 0xffffffff) throw new Error("token id out of range");
  const out = new Uint8Array(TIP_PLAINTEXT_BYTES);
  new DataView(out.buffer).setBigUint64(0, available, true);
  new DataView(out.buffer).setUint32(8, tokenId, true);
  return out;
}

export function decodeTipPlaintext(plain: Uint8Array): { available: bigint; tokenId: number } {
  if (plain.length !== TIP_PLAINTEXT_BYTES) throw new Error("invalid TIP plaintext length");
  const view = new DataView(plain.buffer, plain.byteOffset, plain.byteLength);
  return { available: view.getBigUint64(0, true), tokenId: view.getUint32(8, true) };
}

export async function sealTipBalance(args: {
  masterSeed: Uint8Array;
  tipPda: Uint8Array;
  previousCommitment: Uint8Array;
  available: bigint;
  tokenId: number;
}): Promise<{ sealed: Uint8Array; nonce: Uint8Array; plaintext: Uint8Array }> {
  const key = await crypto.subtle.importKey("raw", await deriveTipViewKey(args.masterSeed) as BufferSource, "AES-GCM", false, ["encrypt"]);
  const plaintext = encodeTipPlaintext(args.available, args.tokenId);
  const nonce = await deriveTipSealNonce(args.tipPda, args.previousCommitment);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource }, key, plaintext as BufferSource));
  if (encrypted.length !== TIP_SEALED_BYTES) throw new Error("unexpected AES-GCM output length");
  return { sealed: encrypted, nonce, plaintext };
}

export async function openTipBalance(args: {
  masterSeed: Uint8Array;
  tipPda: Uint8Array;
  previousCommitment: Uint8Array;
  sealed: Uint8Array;
}): Promise<{ available: bigint; tokenId: number }> {
  if (args.sealed.length !== TIP_SEALED_BYTES) throw new Error("invalid TIP sealed length");
  const key = await crypto.subtle.importKey("raw", await deriveTipViewKey(args.masterSeed) as BufferSource, "AES-GCM", false, ["decrypt"]);
  const nonce = await deriveTipSealNonce(args.tipPda, args.previousCommitment);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce as BufferSource }, key, args.sealed as BufferSource));
  return decodeTipPlaintext(plain);
}

export async function computeTipSealCommitment(args: {
  sealed: Uint8Array;
  sequence: bigint;
  previousCommitment: Uint8Array;
  policy: Uint8Array;
}): Promise<Uint8Array<ArrayBufferLike>> {
  if (args.sealed.length !== TIP_SEALED_BYTES || args.previousCommitment.length !== 32 || args.policy.length !== 32) throw new Error("invalid TIP seal input length");
  const seq = new Uint8Array(8);
  new DataView(seq.buffer).setBigUint64(0, args.sequence, true);
  return (await sha256(text("TCAP_COMMIT_V1"), args.sealed, seq, args.previousCommitment, args.policy)) as Uint8Array;
}

export function randomTipMasterSeed(): Uint8Array { const out = new Uint8Array(32); crypto.getRandomValues(out); return out; }
