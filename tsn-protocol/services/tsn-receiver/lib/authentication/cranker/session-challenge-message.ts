

/** sessionChallengeMessage component. Inputs and results retain the original cranker-auth contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function sessionChallengeMessage(publicKey: string, timestamp: string, nonce: string) {
  return `TSN_RECEIVER_CRANKER_SESSION_V1|${publicKey}|${timestamp}|${nonce}`;
}
