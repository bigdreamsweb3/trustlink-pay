

/**
 * Decode the supplied sender public key with the existing Base58 alphabet and leading-zero rules.
 * Input: the explicit typed parameters below. Output: Exactly 32 public-key bytes.
 * Dependencies: named imports; no service/database initialization.
 * Errors: INVALID_SENDER_WALLET on invalid alphabet/length; native conversion errors propagate.
 * Verification: existing Receiver contract/coordination/recovery fixtures; individual branch coverage is unmeasured.
 */
export function decodeBase58(value: string): Buffer {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let number = 0n;
  for (const character of value) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error("INVALID_SENDER_WALLET");
    number = number * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  while (number > 0n) { bytes.unshift(Number(number & 255n)); number >>= 8n; }
  for (const character of value) if (character === "1") bytes.unshift(0); else break;
  const result = Buffer.from(bytes);
  if (result.length !== 32) throw new Error("INVALID_SENDER_WALLET");
  return result;
}
