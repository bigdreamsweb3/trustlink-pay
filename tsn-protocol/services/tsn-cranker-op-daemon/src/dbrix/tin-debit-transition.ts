import { PublicKey } from "@solana/web3.js";
import {
  buildTsnRegisterTcapTinDebitAuthorizationV1Instruction,
  createGpruTinDebitMemoInstructionV1,
  type GpruTinDebitAccountsV1,
  type GpruTinDebitProofV1,
} from "../../../../sdks/tsn-sdk/src/tcap-gpru-tin-debit.js";

const ACCOUNT_FIELDS = [
  "authority",
  "motherEscrow",
  "tcapProgram",
  "tsnProgram",
  "config",
  "assetEntry",
  "commitmentRoot",
  "reserveState",
  "authorizationSigner",
  "tipRouteRoot",
  "tinDebitVerifier",
  "instructions",
  "gpruProgram",
  "tipProgram",
] as const;
const TRANSITION_FIELDS = [
  ...ACCOUNT_FIELDS,
  "proof",
  "memoPayloads",
  "authorizationDigest",
  "tokenId",
  "amountCommitment",
  "authorizationCommitment",
  "actionCommitment",
  "nullifier",
  "previousTcapRoot",
  "newTcapRoot",
  "tcapRootSequence",
  "validAfterSlot",
  "expiresAtSlot",
  "deploymentCommitment",
];

/** Exact public projection; no owner, amount opening, route key or private path is executable. */
export function buildPublicTinDebitInstructionsV1(
  value: unknown,
  authority: PublicKey,
  motherEscrow: PublicKey,
) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join("|") !==
      [...TRANSITION_FIELDS].sort().join("|")
  )
    throw new Error("TIN_DEBIT_EXECUTION_FIELD_SET_INVALID");
  const transition = value as Record<string, unknown>;
  const accounts = Object.fromEntries(
    ACCOUNT_FIELDS.map((field) => {
      if (typeof transition[field] !== "string")
        throw new Error("TIN_DEBIT_EXECUTION_ACCOUNT_INVALID");
      const key = new PublicKey(transition[field]);
      if (key.toBase58() !== transition[field])
        throw new Error("TIN_DEBIT_EXECUTION_ACCOUNT_INVALID");
      return [field, key];
    }),
  ) as GpruTinDebitAccountsV1;
  if (
    !accounts.authority.equals(authority) ||
    !accounts.motherEscrow.equals(motherEscrow)
  )
    throw new Error("TIN_DEBIT_MOTHER_AUTHORITY_MISMATCH");
  const proof = transition.proof as GpruTinDebitProofV1;
  if (
    !proof ||
    typeof proof !== "object" ||
    Array.isArray(proof) ||
    Object.keys(proof).sort().join("|") !== "proofA|proofB|proofC|publicInputs"
  )
    throw new Error("TIN_DEBIT_EXECUTION_PROOF_FIELD_SET_INVALID");
  const ix = buildTsnRegisterTcapTinDebitAuthorizationV1Instruction({
    accounts,
    proof,
    authorizationDigest: String(transition.authorizationDigest),
  });
  const inputs = proof.publicInputs;
  const bindings = {
    previousTcapRoot: inputs[0],
    newTcapRoot: inputs[1],
    deploymentCommitment: inputs[4],
    tokenId: Number(BigInt(`0x${inputs[5]}`)),
    validAfterSlot: BigInt(`0x${inputs[6]}`).toString(),
    expiresAtSlot: BigInt(`0x${inputs[7]}`).toString(),
    amountCommitment: inputs[8],
    authorizationCommitment: inputs[9],
    actionCommitment: inputs[10],
    nullifier: inputs[11],
    tcapRootSequence: (BigInt(`0x${inputs[3]}`) + 1n).toString(),
  };
  if (
    Object.entries(bindings).some(
      ([field, expected]) => transition[field] !== expected,
    )
  )
    throw new Error("TIN_DEBIT_EXECUTION_STATEMENT_MISMATCH");
  const payloads = transition.memoPayloads;
  if (
    !Array.isArray(payloads) ||
    payloads.length !== 2 ||
    payloads.some((payload) => typeof payload !== "string")
  )
    throw new Error("TIN_DEBIT_REQUIRES_TWO_MEMOS");
  return {
    accounts,
    proof,
    transition,
    instructions: [
      ix,
      ...payloads.map((payload, leg) =>
        createGpruTinDebitMemoInstructionV1({
          authority,
          payload,
          publicInputs: inputs,
          expectedLeg: leg as 0 | 1,
        }),
      ),
    ],
  };
}
