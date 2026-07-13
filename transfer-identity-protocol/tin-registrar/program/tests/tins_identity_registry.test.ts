import assert from "node:assert";
import { randomBytes } from "node:crypto";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import nacl from "tweetnacl";
import {
  buildInitializePlatformRegistryInstruction,
  buildLinkSensitiveFieldInstruction,
  buildLinkSocialIdentityInstruction,
  buildLinkVerifiedSocialIdentityInstructions,
  buildPlatformSignedProofMessage,
  buildSensitiveAuthorizationMessage,
  buildUpsertVerificationPlatformInstruction,
  encryptTinSensitiveField,
  encryptTinSocialIdentity,
  getTinsPlatformRegistryPda,
  getTinsRegistryPda,
  resolveTIN,
} from "../../../../tsn-protocol/tsn-sdk/dist/tins.js";

const PROGRAM_ID = new PublicKey("TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT");
const DEFAULT_SOLANA_RPC_URL = "https://api.devnet.solana.com";

function resolveSolanaRpcUrl() {
  return (
    process.env.TSN_SOLANA_RPC_URLS?.split(/[,\s]+/g)
      .map((entry) => entry.trim().replace(/\/+$/, ""))
      .find(Boolean) ?? DEFAULT_SOLANA_RPC_URL
  );
}

/**
 * Anchor-style integration script.
 *
 * Run after building `tsn-sdk` and deploying/initializing TIP on a local validator
 * or devnet. The script intentionally uses SDK builders so external developers can
 * copy the same flow into wallet/app integrations.
 */
describe("TIP encrypted identity registry", () => {
  it("links encrypted social and sensitive identities with platform proof", async () => {
    const connection = new Connection(
      resolveSolanaRpcUrl({ frontendSafe: false }),
      "confirmed",
    );
    const owner = Keypair.generate();
    const platform = Keypair.generate();
    const tin = BigInt(process.env.TEST_TIN ?? "1000000008");
    const registry = getTinsRegistryPda({ tin, programId: PROGRAM_ID });
    const platformRegistry = getTinsPlatformRegistryPda(PROGRAM_ID);

    const social = await encryptTinSocialIdentity({
      tin,
      value: "+2349037334349",
    });
    const sensitiveAuthMessage = buildSensitiveAuthorizationMessage({
      tin,
      fieldType: "kyc_document_hash",
      nonce: "anchor-test",
    });
    const ownerSensitiveSignature = Buffer.from(
      nacl.sign.detached(Buffer.from(sensitiveAuthMessage), owner.secretKey),
    );
    const sensitive = await encryptTinSensitiveField({
      tin,
      fieldType: "kyc_document_hash",
      value: "sha256:kyc-doc-example",
      userSignature: ownerSensitiveSignature,
    });

    const encryptedPayloadHash = randomBytes(32);
    const proofMessage = buildPlatformSignedProofMessage({
      tin,
      identityType: "whatsapp",
      label: "Primary WhatsApp",
      encryptedPayloadHash,
      subjectWallet: owner.publicKey,
      issuedAt: BigInt(Math.floor(Date.now() / 1000)),
    });
    const platformSignature = nacl.sign.detached(proofMessage, platform.secretKey);

    const tx = new Transaction().add(
      buildInitializePlatformRegistryInstruction({
        authority: owner.publicKey,
        platformRegistry,
        programId: PROGRAM_ID,
      }),
      buildUpsertVerificationPlatformInstruction({
        authority: owner.publicKey,
        platformRegistry,
        platformId: "trustlink-whatsapp",
        platformPubkey: platform.publicKey,
        programId: PROGRAM_ID,
      }),
      buildLinkSocialIdentityInstruction({
        owner: owner.publicKey,
        registry,
        identityType: "whatsapp",
        label: "Primary WhatsApp",
        nonce: social.nonce,
        ciphertext: social.ciphertext,
        metadata: JSON.stringify({ display: "WhatsApp", verified: false }),
        programId: PROGRAM_ID,
      }),
      buildLinkSensitiveFieldInstruction({
        owner: owner.publicKey,
        registry,
        fieldType: "kyc_document_hash",
        nonce: sensitive.nonce,
        ciphertext: sensitive.ciphertext,
        metadata: JSON.stringify({ issuer: "demo" }),
        userAuthorizationHash: sensitive.userAuthorizationHash,
        programId: PROGRAM_ID,
      }),
      ...buildLinkVerifiedSocialIdentityInstructions({
        owner: owner.publicKey,
        registry,
        platformRegistry,
        platformPubkey: platform.publicKey,
        platformSignature,
        proofMessage,
        identityType: "whatsapp",
        label: "Primary WhatsApp",
        nonce: social.nonce,
        ciphertext: social.ciphertext,
        metadata: JSON.stringify({ display: "WhatsApp", verified: true }),
        programId: PROGRAM_ID,
      }),
    );

    if (process.env.RUN_CHAIN_TESTS !== "1") {
      assert.ok(tx.instructions.length >= 5);
      return;
    }

    await sendAndConfirmTransaction(connection, tx, [owner]);
    const resolved = await resolveTIN({
      tin,
      connection,
      programId: PROGRAM_ID,
      sensitiveAuthorizations: {
        kyc_document_hash: ownerSensitiveSignature,
      },
    });
    assert.equal(resolved.socialIdentities[0]?.value, "+2349037334349");
    assert.equal(resolved.sensitiveFields[0]?.value, "sha256:kyc-doc-example");
  });
});
