import { config } from "dotenv";
import { PublicKey } from "@solana/web3.js";

import {
  DEFAULT_TINS_PROGRAM_ID,
  buildClaimEscrowInstruction,
  buildCreateEscrowInstruction,
  buildInitializeIdentityInstruction,
  buildInitializeProgramInstruction,
  createTinsClient,
  fetchRegistryByTin,
  formatInstructionData,
  generateTin,
  getEscrowPda,
  getGlobalStatePda,
  getRegistryPda,
  getVaultPda,
  randomPublicKey,
  resolveProgramId,
  validateTin,
} from "../../tins-sdk/src/index";

config({ path: ".env.local" });

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const explicitProgramId = process.env.TINS_PROGRAM_ID?.trim()
    ? new PublicKey(process.env.TINS_PROGRAM_ID)
    : undefined;
  const client = createTinsClient({
    rpcUrl:
      process.env.TINS_RPC_URL?.trim() ??
      process.env.SOLANA_RPC_URL?.trim() ??
      "http://127.0.0.1:8899",
    programId: explicitProgramId,
  });
  const programId = client.programId;
  const connection = client.connection;
  const sequence = BigInt(process.env.TINS_TEST_SEQUENCE ?? "1");
  const amountLamports = BigInt(
    process.env.TINS_TEST_AMOUNT_LAMPORTS ?? "1000000",
  );
  const name = process.env.TINS_TEST_NAME ?? "Daniel";
  const payer = randomPublicKey();
  const masterPrivacy = randomPublicKey();
  const destination = randomPublicKey();

  const tin = generateTin(sequence);
  assert(validateTin(tin), "Generated TIN failed validation");
  assert(
    resolveProgramId(undefined).equals(DEFAULT_TINS_PROGRAM_ID),
    "Default SDK program ID changed unexpectedly",
  );

  const [globalState, globalBump] = getGlobalStatePda(programId);
  const [registry, registryBump] = getRegistryPda(tin, programId);
  const [escrow, escrowBump] = getEscrowPda(tin, 1n, programId);
  const [vault, vaultBump] = getVaultPda(tin, 1n, programId);

  const initializeProgramIx = buildInitializeProgramInstruction({
    payer,
    startingSequence: sequence,
    programId,
  });
  const initializeIdentity = buildInitializeIdentityInstruction({
    payer,
    sequence,
    name,
    masterPrivacy,
    programId,
  });
  const createEscrow = buildCreateEscrowInstruction({
    payer,
    tin,
    escrowId: 1n,
    amountLamports,
    programId,
  });
  const claimEscrow = buildClaimEscrowInstruction({
    claimant: payer,
    tin,
    escrowId: 1n,
    destination,
    programId,
  });

  console.log("TINS Phase 1 terminal test");
  console.log("=========================");
  console.log("Program ID:", programId.toBase58());
  console.log(
    "Program ID Source:",
    explicitProgramId ? "explicit override" : "sdk default",
  );
  console.log("RPC URL:", (connection as { rpcEndpoint?: string }).rpcEndpoint);
  console.log("Sequence:", sequence.toString());
  console.log("Generated TIN:", tin.toString());
  console.log("Name:", name);
  console.log("");
  console.log("PDAs");
  console.log("Global State:", globalState.toBase58(), "bump:", globalBump);
  console.log("Registry:", registry.toBase58(), "bump:", registryBump);
  console.log("Escrow #1:", escrow.toBase58(), "bump:", escrowBump);
  console.log("Vault #1:", vault.toBase58(), "bump:", vaultBump);
  console.log("");
  console.log("Instruction payloads");
  console.log(
    "initialize_program:",
    formatInstructionData(initializeProgramIx.data),
  );
  console.log(
    "initialize_identity:",
    formatInstructionData(initializeIdentity.instruction.data),
  );
  console.log(
    "create_escrow:",
    formatInstructionData(createEscrow.instruction.data),
  );
  console.log("claim_escrow:", formatInstructionData(claimEscrow.data));

  assert(
    initializeIdentity.tin === tin,
    "Initialize identity builder returned a mismatched TIN",
  );
  assert(
    initializeIdentity.registry.equals(registry),
    "Registry PDA mismatch in initialize identity builder",
  );
  assert(
    createEscrow.registry.equals(registry),
    "Registry PDA mismatch in create escrow builder",
  );
  assert(
    createEscrow.escrow.equals(escrow),
    "Escrow PDA mismatch in create escrow builder",
  );
  assert(
    createEscrow.vault.equals(vault),
    "Vault PDA mismatch in create escrow builder",
  );

  const lookupTin = process.env.TINS_LOOKUP_TIN?.trim();
  if (lookupTin) {
    console.log("");
    console.log("On-chain lookup");
    const registryState = await fetchRegistryByTin(
      BigInt(lookupTin),
      connection,
      programId,
    );
    if (!registryState) {
      console.log("Registry not found for TIN", lookupTin);
    } else {
      console.log("Registry address:", registryState.address.toBase58());
      console.log("Decoded registry:", {
        ...registryState.data,
        authority: registryState.data.authority.toBase58(),
        masterPrivacy: registryState.data.masterPrivacy.toBase58(),
      });
    }
  }

  console.log("");
  console.log("Phase 1 TS checks passed.");
}

main().catch((error) => {
  console.error("TINS Phase 1 terminal test failed.");
  console.error(error);
  process.exit(1);
});
