import type { Dependencies } from "./dependencies";
import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { scheduleRpcRetry } from "./schedule-rpc-retry";
import { TSN_PROGRAM_ID, MOTHER_SEED, CRANKER_SEED, ANCHOR_DISCRIMINATOR_BYTES, PUBKEY_BYTES } from "./configuration";

/** assertMotherDnaCranker component. Inputs and results retain the original cranker-auth contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export async function assertMotherDnaCranker(dependencies: Pick<Dependencies, "rpcUrls" | "connect">, operatorText: string): Promise<void> {
  let operator: PublicKey;
  try {
    operator = new PublicKey(operatorText);
  } catch {
    throw new Error("CRANKER_PUBLIC_KEY_INVALID");
  }

  const mother = PublicKey.findProgramAddressSync([MOTHER_SEED], TSN_PROGRAM_ID)[0];
  const cranker = PublicKey.findProgramAddressSync(
    [CRANKER_SEED, mother.toBuffer(), operator.toBuffer()],
    TSN_PROGRAM_ID,
  )[0];
  let motherInfo = null;
  let crankerInfo = null;
  let rpcFailure: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      let lastError: unknown;
      for (const rpcUrl of dependencies.rpcUrls) {
        try {
          const connection = dependencies.connect(rpcUrl);
          [motherInfo, crankerInfo] = await Promise.all([
            connection.getAccountInfo(mother, "confirmed"),
            connection.getAccountInfo(cranker, "confirmed"),
          ]);
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (lastError) throw lastError;
      rpcFailure = undefined;
      break;
    } catch (error) {
      rpcFailure = error;
      const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
      if (attempt === 3 || !/fetch failed|timeout|timed out|ECONNRESET|EAI_AGAIN|UND_ERR_CONNECT/i.test(message)) break;
      await new Promise(scheduleRpcRetry.bind(null, { attempt }));
    }
  }
  if (rpcFailure) {
    throw new Error("CRANKER_RPC_UNAVAILABLE: Mother-DNA lookup failed at the configured RPC endpoint after retries");
  }
  if (!motherInfo || !crankerInfo || !motherInfo.owner.equals(TSN_PROGRAM_ID) || !crankerInfo.owner.equals(TSN_PROGRAM_ID)) {
    throw new Error("CRANKER_MOTHER_DNA_NOT_FOUND");
  }

  const motherData = motherInfo.data;
  const crankerData = crankerInfo.data;
  const motherProtocolSeedOffset = ANCHOR_DISCRIMINATOR_BYTES + PUBKEY_BYTES + PUBKEY_BYTES;
  const crankerOperatorOffset = ANCHOR_DISCRIMINATOR_BYTES + PUBKEY_BYTES;
  const crankerDnaOffset = crankerOperatorOffset + PUBKEY_BYTES;
  if (motherData.length < motherProtocolSeedOffset + PUBKEY_BYTES || crankerData.length < crankerDnaOffset + PUBKEY_BYTES) {
    throw new Error("CRANKER_ACCOUNT_LAYOUT_INVALID");
  }
  if (!crankerData.subarray(ANCHOR_DISCRIMINATOR_BYTES, crankerOperatorOffset).equals(mother.toBuffer())) {
    throw new Error("CRANKER_MOTHER_DNA_MISMATCH");
  }
  if (!crankerData.subarray(crankerOperatorOffset, crankerDnaOffset).equals(operator.toBuffer())) {
    throw new Error("CRANKER_OPERATOR_MISMATCH");
  }

  const expectedDna = createHash("sha256")
    .update(Buffer.concat([Buffer.from("tsn_dna"), mother.toBuffer(), operator.toBuffer(), motherData.subarray(motherProtocolSeedOffset, motherProtocolSeedOffset + PUBKEY_BYTES)]))
    .digest();
  if (!crankerData.subarray(crankerDnaOffset, crankerDnaOffset + PUBKEY_BYTES).equals(expectedDna)) {
    throw new Error("CRANKER_MOTHER_DNA_MISMATCH");
  }
}
