import type { Dependencies } from "./dependencies";
import { randomBytes } from "node:crypto";
import { assertMotherDnaCranker } from "./assert-mother-dna-cranker";
import { pruneCrankerChallenges } from "./prune-cranker-challenges";
import { pruneCrankerSessions } from "./prune-cranker-sessions";
import { challengeId } from "./challenge-id";
import { CHALLENGE_TTL_MS } from "./configuration";

/** issueCrankerChallenge component. Inputs and results retain the original cranker-auth contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export async function issueCrankerChallenge(dependencies: Pick<Dependencies, "clock" | "challengeCollection" | "rpcUrls" | "connect" | "sessionCollection">, publicKey: string) {
  await assertMotherDnaCranker(dependencies, publicKey);
  await Promise.all([pruneCrankerChallenges(dependencies), pruneCrankerSessions(dependencies)]);
  const nonce = randomBytes(32).toString("base64url");
  const expiresAt = new dependencies.clock(dependencies.clock.now() + CHALLENGE_TTL_MS).toISOString();
  await dependencies.challengeCollection.doc(challengeId(publicKey, nonce)).create({ publicKey, nonce, expiresAt, used: false });
  return { nonce, expiresAt };
}
