const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function decodeBlockhash(value) {
  if (typeof value !== "string" || value.length < 32 || value.length > 44) return null;
  let integer = 0n;
  for (const character of value) {
    const digit = BASE58.indexOf(character);
    if (digit < 0) return null;
    integer = integer * 58n + BigInt(digit);
  }
  const bytes = [];
  while (integer) {
    bytes.unshift(Number(integer & 255n));
    integer >>= 8n;
  }
  const zeros = value.length - value.replace(/^1+/, "").length;
  if (zeros + bytes.length !== 32) return null;
  return Uint8Array.from([...new Array(zeros).fill(0), ...bytes]);
}

function signedWireBlockhash(encoded, encoding) {
  if (encoding !== "base64" || typeof encoded !== "string" || !encoded.length || encoded.length > 10_924) return null;
  let bytes;
  try {
    const decoded = atob(encoded);
    if (btoa(decoded) !== encoded || decoded.length > 8192) return null;
    bytes = Uint8Array.from(decoded, character => character.charCodeAt(0));
  } catch { return null; }
  let offset = 0;
  function shortvec() {
    let result = 0;
    for (let index = 0; index < 3; index++) {
      if (offset >= bytes.length) return null;
      const byte = bytes[offset++];
      result |= (byte & 127) << (7 * index);
      if (!(byte & 128)) return index > 0 && byte === 0 ? null : result;
    }
    return null;
  }
  const signatures = shortvec();
  if (signatures === null || signatures > 256) return null;
  offset += signatures * 64;
  if (offset + 3 >= bytes.length) return null;
  if (bytes[offset] & 128) {
    // Diagnostics recognize standard legacy/v0 transactions, not other encodings.
    if (bytes[offset++] !== 0x80) return null;
  }
  if (bytes[offset] !== signatures) return null;
  offset += 3;
  const accounts = shortvec();
  if (accounts === null || accounts < signatures || accounts > 256) return null;
  offset += accounts * 32;
  if (offset + 32 > bytes.length) return null;
  return bytes.slice(offset, offset + 32);
}

/** Bounded, public-context diagnostics only; never gate or rewrite an RPC request. */
export async function rpcBlockhashDiagnostics(payload, responseBody) {
  const details = {};
  let bytes = null;
  if (payload.method === "getLatestBlockhash") {
    bytes = decodeBlockhash(responseBody?.result?.value?.blockhash);
    const slot = responseBody?.result?.context?.slot;
    const height = responseBody?.result?.value?.lastValidBlockHeight;
    if (Number.isSafeInteger(slot) && slot >= 0) details.contextSlot = slot;
    if (Number.isSafeInteger(height) && height > 0) details.lastValidBlockHeight = height;
  } else if (["simulateTransaction", "sendTransaction"].includes(payload.method)) {
    const options = payload.params?.[1];
    bytes = signedWireBlockhash(payload.params?.[0], options?.encoding);
    if (Number.isSafeInteger(options?.minContextSlot) && options.minContextSlot >= 0) details.minContextSlot = options.minContextSlot;
    const slot = responseBody?.result?.context?.slot;
    if (Number.isSafeInteger(slot) && slot >= 0) details.responseContextSlot = slot;
  }
  if (bytes) {
    try {
      const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
      details.blockhashFingerprint = [...digest.subarray(0, 8)].map(byte => byte.toString(16).padStart(2, "0")).join("");
    } catch { /* Missing crypto diagnostics must not affect transport. */ }
  }
  return details;
}
