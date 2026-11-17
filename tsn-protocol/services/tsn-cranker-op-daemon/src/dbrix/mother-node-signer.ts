import { address, assertIsTransactionWithinSizeLimit, blockhash,
  type SignatureBytes, type Transaction, type TransactionModifyingSigner } from "@solana/kit";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";

function positiveU64(value: unknown): bigint {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,19}$/.test(value)
      || BigInt(value) > 0xffffffffffffffffn) throw new Error("TCAP_MOTHER_BLOCKHASH_METADATA_INVALID");
  return BigInt(value);
}

function canonicalBase64(value: unknown): Buffer {
  if (typeof value !== "string" || !value.length) throw new Error("TCAP_MOTHER_SIGNING_RESPONSE_INVALID");
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) throw new Error("TCAP_MOTHER_SIGNING_RESPONSE_INVALID");
  return bytes;
}

/** Mother may refresh only the V1 blockhash, before the payer signs. */
export function createMotherNodeTransactionSigner(authority: PublicKey,
  request: (messageBase64: string) => Promise<unknown>,
): { signer: TransactionModifyingSigner; getBlockhashContextSlot: () => bigint } {
  const signerAddress = address(authority.toBase58());
  let contextSlot: bigint | undefined;
  const signer: TransactionModifyingSigner = {
    address: signerAddress,
    modifyAndSignTransactions: async transactions => {
      if (transactions.length !== 1) throw new Error("TCAP_MOTHER_SIGNING_TRANSACTION_COUNT_INVALID");
      const transaction = transactions[0];
      if (!Object.hasOwn(transaction.signatures, signerAddress)
          || Object.values(transaction.signatures).some(signature => signature !== null)) {
        throw new Error("TCAP_SETTLEMENT_EXECUTION_CHECKPOINT_PRESENT");
      }
      const original = Buffer.from(transaction.messageBytes);
      if (original.length < 40 || original[0] !== 0x81) throw new Error("TCAP_MOTHER_MESSAGE_FORMAT_INVALID");
      const raw = await request(original.toString("base64"));
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("TCAP_MOTHER_SIGNING_RESPONSE_INVALID");
      const response = raw as Record<string, unknown>;
      if (response.authority !== signerAddress) throw new Error("TCAP_MOTHER_SIGNING_AUTHORITY_MISMATCH");
      const message = canonicalBase64(response.messageBase64);
      if (message.length !== original.length || !message.subarray(0, 8).equals(original.subarray(0, 8))
          || !message.subarray(40).equals(original.subarray(40))) throw new Error("TCAP_MOTHER_MESSAGE_CHANGED");
      const signature = canonicalBase64(response.signatureBase64);
      if (signature.length !== 64 || !nacl.sign.detached.verify(message, signature, authority.toBytes())) {
        throw new Error("TCAP_MOTHER_TRANSACTION_SIGNATURE_INVALID");
      }
      let hash: PublicKey;
      try { hash = new PublicKey(String(response.blockhash)); }
      catch { throw new Error("TCAP_MOTHER_BLOCKHASH_METADATA_INVALID"); }
      if (typeof response.blockhash !== "string" || hash.toBase58() !== response.blockhash
          || hash.toBytes().every(byte => byte === 0) || !Buffer.from(hash.toBytes()).equals(message.subarray(8, 40))) {
        throw new Error("TCAP_MOTHER_BLOCKHASH_METADATA_INVALID");
      }
      const lastValidBlockHeight = positiveU64(response.lastValidBlockHeight);
      const finalContextSlot = positiveU64(response.blockhashContextSlot);
      const updated = { ...transaction, messageBytes: Uint8Array.from(message) as unknown as Transaction["messageBytes"],
        signatures: { ...transaction.signatures, [signerAddress]: Uint8Array.from(signature) as SignatureBytes },
        lifetimeConstraint: { blockhash: blockhash(response.blockhash), lastValidBlockHeight },
      };
      assertIsTransactionWithinSizeLimit(updated);
      contextSlot = finalContextSlot;
      return [updated];
    },
  };
  return { signer, getBlockhashContextSlot: () => {
    if (contextSlot === undefined) throw new Error("TCAP_MOTHER_BLOCKHASH_METADATA_INVALID");
    return contextSlot;
  } };
}
