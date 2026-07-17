export const runtime = "nodejs";

import { createHash } from "node:crypto";
import { ed25519 } from "@noble/curves/ed25519.js";
import { PublicKey } from "@solana/web3.js";
import { buildTinWalletBindingMessage } from "@trustlink/tsn-sdk/canonical-message";
import { decodeTinAccount, getTinsIdentityPda, getTinsRegistryPda } from "@trustlink/tsn-sdk/tins";
import { z } from "zod";

import { updateUserTinMapping } from "@/app/db/users";
import { withAuthenticatedRoute } from "@/app/controllers/authenticated-route";
import { invalidateUserCache } from "@/app/lib/cache";
import { getEnv } from "@/app/lib/env";
import { createSolanaConnection } from "@/app/lib/rpc";
import { fail, ok, toErrorResponse } from "@/app/lib/http";

const TIN_BINDING_MAX_AGE_MS = 5 * 60 * 1000;

const tinRegistrationSchema = z.object({
  tin: z.union([z.string(), z.number(), z.bigint()]).transform((value) => String(value)),
  tinsIdentityPublicKey: z.string(),
  tinsRegistryPublicKey: z.string().optional().nullable(),
  signerPublicKey: z.string(),
  tinsProgramId: z.string().optional().nullable(),
  bindingIssuedAt: z.string(),
  bindingMessage: z.string(),
  bindingSignature: z.string(),
});

function normalizeOptionalPublicKey(value: string | null | undefined) {
  if (!value) return null;
  return new PublicKey(value).toBase58();
}


function verifyTinBindingSignature(params: {
  message: string;
  signatureBase64: string;
  walletPublicKey: PublicKey;
}) {
  const signature = Buffer.from(params.signatureBase64, "base64");
  return ed25519.verify(signature, new TextEncoder().encode(params.message), params.walletPublicKey.toBytes());
}

function walletMatchesTinOwnerCommitment(params: {
  ownerCommitment: Uint8Array;
  walletPublicKey: PublicKey;
  identityPublicKey: PublicKey;
}) {
  const walletBytes = params.walletPublicKey.toBytes();
  const commitment = Buffer.from(params.ownerCommitment);
  const acceptedCommitments = [
    createHash("sha256").update(walletBytes).digest(),
    Buffer.from(walletBytes),
    Buffer.from(params.identityPublicKey.toBytes()),
  ];
  return acceptedCommitments.some((candidate) => commitment.equals(candidate));
}

export async function POST(request: Request) {
  return withAuthenticatedRoute(request, async (authUser) => {
    try {
      const payload = tinRegistrationSchema.parse(await request.json());
      if (!/^\d{1,20}$/.test(payload.tin)) {
        return fail("TIN must be a numeric on-chain identifier", 400);
      }
      const parsedEnv = getEnv();
      const programId = new PublicKey(payload.tinsProgramId ?? parsedEnv.TINS_PROGRAM_ID);
      const walletPublicKey = new PublicKey(payload.signerPublicKey);
      const identityPublicKey = new PublicKey(payload.tinsIdentityPublicKey);
      const expectedIdentityPublicKey = getTinsIdentityPda({ walletPubkey: walletPublicKey, programId });

      const bindingIssuedAtMs = Date.parse(payload.bindingIssuedAt);
      if (!Number.isFinite(bindingIssuedAtMs) || Math.abs(Date.now() - bindingIssuedAtMs) > TIN_BINDING_MAX_AGE_MS) {
        return fail("TIP wallet binding signature expired. Please sign again.", 400);
      }
      const expectedBindingMessage = buildTinWalletBindingMessage({
        tin: payload.tin,
        walletPublicKey: walletPublicKey.toBase58(),
        identityPublicKey: identityPublicKey.toBase58(),
        programId: programId.toBase58(),
        issuedAt: payload.bindingIssuedAt,
      });
      if (payload.bindingMessage !== expectedBindingMessage) {
        return fail("TIP wallet binding message does not match this account", 400);
      }
      if (
        !verifyTinBindingSignature({
          message: payload.bindingMessage,
          signatureBase64: payload.bindingSignature,
          walletPublicKey,
        })
      ) {
        return fail("TIP wallet binding signature is invalid", 400);
      }

      const connection = createSolanaConnection({ frontendSafe: false });
      const account = await connection.getAccountInfo(identityPublicKey, "confirmed");
      if (!account) {
        return fail("TIP identity account was not found on devnet", 400);
      }
      if (!account.owner.equals(programId)) {
        return fail("TIP identity account is not owned by the configured TIP program", 400);
      }
      const decoded = decodeTinAccount(account.data);
      if (decoded.tin.toString() !== payload.tin) {
        return fail("Submitted TIN does not match the on-chain TIP account", 400);
      }
      if (
        !walletMatchesTinOwnerCommitment({
          ownerCommitment: decoded.ownerPubkeyHash,
          walletPublicKey,
          identityPublicKey,
        })
      ) {
        return fail("Connected wallet does not match the on-chain TIP owner commitment", 400);
      }
      if (!identityPublicKey.equals(expectedIdentityPublicKey)) {
        return fail("TIP identity account is not derived from the connected wallet", 400);
      }
      const registryPublicKey = getTinsRegistryPda({ tin: decoded.tin, programId }).toBase58();
      const submittedRegistryPublicKey = normalizeOptionalPublicKey(payload.tinsRegistryPublicKey);
      if (submittedRegistryPublicKey && submittedRegistryPublicKey !== registryPublicKey) {
        return fail("TIP registry PDA does not match the submitted TIN", 400);
      }

      const updated = await updateUserTinMapping({
        userId: authUser.id,
        tin: payload.tin,
        tinsIdentityPublicKey: identityPublicKey.toBase58(),
        tinsRegistryPublicKey: registryPublicKey,
        tinsProgramId: programId.toBase58(),
        bindingSignature: payload.bindingSignature,
      });
      invalidateUserCache(authUser.id);

      return ok({
        tin: updated.tin,
        tinsIdentityPublicKey: updated.tins_identity_pubkey,
        tinsRegistryPublicKey: updated.tins_registry_pubkey,
        tinsProgramId: updated.tins_program_id,
        tinsCreatedAt: updated.tins_created_at,
      });
    } catch (error) {
      if (error instanceof Error) return fail(error.message, 400);
      return toErrorResponse(error);
    }
  });
}
