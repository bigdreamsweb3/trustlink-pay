import { bankSlot } from "./bank-slot";
import { u64 } from "./u64";
import { fail } from "./fail";
import { TCAP, ROOT, ROOT_BUMP, discriminator } from "./configuration";

/** assertUnchangedRoot component. Inputs and results retain the original failed-settlement-resolution contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function assertUnchangedRoot(reply: any, t: Record<string, any>, minimum: number) {
  const slot = bankSlot(reply?.context?.slot, minimum);
  if (BigInt(slot) <= u64(t.expiresAtSlot)) fail("AUTHORIZATION_NOT_EXPIRED");
  const account = reply?.value;
  if (account?.owner !== TCAP.toBase58() || !Array.isArray(account.data) || account.data[1] !== "base64"
      || typeof account.data[0] !== "string") fail("INVALID_ROOT_ACCOUNT");
  const data = Buffer.from(account.data[0], "base64");
  if (data.length !== 124 || data.toString("base64") !== account.data[0] || !data.subarray(0, 8).equals(discriminator)
      || data.readUInt16LE(8) !== 1 || data.readUInt16LE(10) !== 1 || data[123] !== ROOT_BUMP) fail("INVALID_ROOT_ACCOUNT");
  const attempted = u64(t.tcapRootSequence), sequence = data.readBigUInt64LE(80);
  // This monotonic chain checkpoint, not RPC absence, establishes nonexecution.
  if (sequence !== attempted - 1n || !data.subarray(12, 44).equals(Buffer.from(t.previousTcapRoot, "hex"))) fail("ROOT_CHANGED");
  return { finalizedSlot: slot, rootSequence: String(sequence), attemptedSequence: String(attempted), commitmentRoot: ROOT.toBase58(), previousRoot: t.previousTcapRoot };
}
