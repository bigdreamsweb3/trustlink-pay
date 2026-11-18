

/** decodeSignature component. Inputs and results retain the original cranker-auth contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function decodeSignature(signature: string) {
  if (!/^[A-Za-z0-9+/_-]{86,88}={0,2}$/.test(signature)) throw new Error("CRANKER_SIGNATURE_INVALID");
  let bytes: Buffer;
  try { bytes = Buffer.from(signature.replace(/-/g, "+").replace(/_/g, "/"), "base64"); }
  catch { throw new Error("CRANKER_SIGNATURE_INVALID"); }
  if (bytes.length !== 64) throw new Error("CRANKER_SIGNATURE_INVALID");
  return bytes;
}
