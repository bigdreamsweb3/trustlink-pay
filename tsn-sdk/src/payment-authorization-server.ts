import { createPublicKey, verify } from "node:crypto";

import { PublicKey } from "@solana/web3.js";

function solanaPublicKeyToEd25519Spki(publicKey: PublicKey) {
  const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
  return Buffer.concat([spkiPrefix, publicKey.toBuffer()]);
}

export async function verifySenderPaymentAuthorization(params: {
  senderWallet: string;
  signatureBase64: string;
  message: string;
}) {
  const publicKey = new PublicKey(params.senderWallet);
  const keyObject = createPublicKey({
    key: solanaPublicKeyToEd25519Spki(publicKey),
    format: "der",
    type: "spki",
  });

  return verify(null, Buffer.from(params.message), keyObject, Buffer.from(params.signatureBase64, "base64"));
}
