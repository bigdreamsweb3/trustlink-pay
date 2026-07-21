import type { Digest } from "./models.js";

export type HashFunction = (input: Uint8Array) => Promise<Uint8Array>;

function concat(...values: readonly Uint8Array[]): Uint8Array {
  const length = values.reduce((sum, value) => sum + value.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const value of values) {
    output.set(value, offset);
    offset += value.length;
  }
  return output;
}

function hex(value: Uint8Array): Digest {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("") as Digest;
}

export async function buildDeterministicRoot(
  domain: string,
  leaves: readonly Uint8Array[],
  hash: HashFunction,
): Promise<Digest> {
  if (leaves.length === 0) throw new Error("empty_accumulator");
  const encoder = new TextEncoder();
  const domainBytes = encoder.encode(domain);
  const seen = new Set(leaves.map((leaf) => Array.from(leaf).join(",")));
  if (seen.size !== leaves.length) throw new Error("duplicate_accumulator_leaf");
  let level = await Promise.all(leaves.map((leaf) => hash(concat(domainBytes, new Uint8Array([0]), leaf))));
  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let index = 0; index < level.length; index += 2) {
      const left = level[index];
      const right = level[index + 1] ?? left;
      next.push(await hash(concat(domainBytes, new Uint8Array([1]), left, right)));
    }
    level = next;
  }
  return hex(level[0]);
}

export class NullifierRegistry {
  readonly #seen = new Set<string>();

  consume(nullifier: string): void {
    if (!/^[0-9a-f]{64}$/i.test(nullifier)) throw new Error("invalid_nullifier_encoding");
    if (this.#seen.has(nullifier)) throw new Error("nullifier_already_consumed");
    this.#seen.add(nullifier);
  }

  has(nullifier: string): boolean {
    return this.#seen.has(nullifier);
  }
}
