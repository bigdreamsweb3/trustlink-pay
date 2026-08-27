import { createHash } from "node:crypto";

export function hashAccount(data) { return createHash("sha256").update(data).digest("hex"); }
export function decodeFundingAccounts({ reserve, root, nonce, claim }) {
  return {
    reserve: reserve ? { rawHash: hashAccount(reserve.data), actualAssets: reserve.data.readBigUInt64LE(140).toString(), pendingLiabilities: reserve.data.readBigUInt64LE(148).toString() } : null,
    fundingRoot: root ? { rawHash: hashAccount(root.data), currentRoot: root.data.subarray(44, 76).toString("hex"), previousRoot: root.data.subarray(76, 108).toString("hex"), sequence: root.data.readBigUInt64LE(108).toString() } : null,
    fundingNonce: nonce ? { rawHash: hashAccount(nonce.data), nextNonce: nonce.data.readBigUInt64LE(74).toString(), lastFundingClaim: nonce.data.subarray(82, 114).toString("base64") } : null,
    fundingClaim: claim ? { rawHash: hashAccount(claim.data), fundingIdentifier: claim.data.subarray(108, 140).toString("hex"), fundingCommitment: claim.data.subarray(140, 172).toString("hex"), amount: claim.data.readBigUInt64LE(172).toString(), settlementMode: claim.data[180], nonce: claim.data.readBigUInt64LE(245).toString(), expiry: claim.data.readBigUInt64LE(253).toString(), rootSequence: claim.data.readBigUInt64LE(325).toString(), status: claim.data[333] } : null,
  };
}
