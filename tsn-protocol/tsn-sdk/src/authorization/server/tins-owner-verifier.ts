import { createHash } from "node:crypto";

import { Connection, PublicKey } from "@solana/web3.js";

import {
  decodeTinAccount,
  getTinsIdentityPda,
  getTinsRegistryPda,
} from "../../tins.js";

export interface TinsOwnerVerificationResult {
  tin: string;
  ownerIdentityCommitment: string;
  tinsAccount: string;
}

export interface TinsOwnerVerifier {
  verifyOwner(params: {
    tin: string;
    transientSignerPublicKey: string;
  }): Promise<TinsOwnerVerificationResult>;
}

function sha256Hex(value: Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function verifyDecodedOwner(params: {
  tin: string;
  ownerPublicKey: PublicKey;
  ownerCommitments: Set<string>;
  accountAddress: PublicKey;
  accountData: Uint8Array;
}): TinsOwnerVerificationResult | null {
  let decoded: ReturnType<typeof decodeTinAccount>;
  try {
    decoded = decodeTinAccount(params.accountData);
  } catch {
    return null;
  }
  if (decoded.tin.toString() !== params.tin) return null;
  const onchainCommitment = Buffer.from(decoded.ownerPubkeyHash).toString("hex");
  if (!params.ownerCommitments.has(onchainCommitment)) {
    throw new Error("Owner wallet does not match the on-chain TINS owner commitment");
  }
  return {
    tin: params.tin,
    ownerIdentityCommitment: sha256Hex(params.ownerPublicKey.toBytes()),
    tinsAccount: params.accountAddress.toBase58(),
  };
}

export function createSolanaTinsOwnerVerifier(params: {
  connection: Connection;
  programId: PublicKey;
}): TinsOwnerVerifier {
  return {
    async verifyOwner({ tin, transientSignerPublicKey }) {
      const owner = new PublicKey(transientSignerPublicKey);
      const ownerBytes = owner.toBytes();
      const ownerCommitments = new Set([
        sha256Hex(ownerBytes),
        Buffer.from(ownerBytes).toString("hex"),
        Buffer.from(
          getTinsIdentityPda({
            walletPubkey: owner,
            programId: params.programId,
          }).toBytes(),
        ).toString("hex"),
      ]);

      const registryAddress = getTinsRegistryPda({
        tin,
        programId: params.programId,
      });
      const registryAccount = await params.connection.getAccountInfo(
        registryAddress,
        "confirmed",
      );
      if (registryAccount) {
        const verified = verifyDecodedOwner({
          tin,
          ownerPublicKey: owner,
          ownerCommitments,
          accountAddress: registryAddress,
          accountData: registryAccount.data,
        });
        if (verified) return verified;
      }

      const accounts = await params.connection.getProgramAccounts(
        params.programId,
        { commitment: "confirmed" },
      );
      for (const account of accounts) {
        const verified = verifyDecodedOwner({
          tin,
          ownerPublicKey: owner,
          ownerCommitments,
          accountAddress: account.pubkey,
          accountData: account.account.data,
        });
        if (verified) return verified;
      }
      throw new Error("TIN owner account was not found on-chain");
    },
  };
}
