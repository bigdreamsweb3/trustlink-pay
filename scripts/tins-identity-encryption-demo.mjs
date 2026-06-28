import {
  buildSensitiveAuthorizationMessage,
  decryptTinSensitiveField,
  decryptTinSocialIdentity,
  encryptTinSensitiveField,
  encryptTinSocialIdentity,
} from "../tsn-protocol/tsn-sdk/dist/tins.js";

const tin = process.argv[2] ?? "1000000008";
const whatsapp = process.argv[3] ?? "+2349037334349";
const kycDocumentHash = process.argv[4] ?? "sha256:example-kyc-document-hash";

const social = await encryptTinSocialIdentity({
  tin,
  value: whatsapp,
});
const socialPlaintext = await decryptTinSocialIdentity({
  tin,
  nonce: social.nonce,
  ciphertext: social.ciphertext,
});

const authorizationMessage = buildSensitiveAuthorizationMessage({
  tin,
  fieldType: "kyc_document_hash",
  nonce: "demo",
});
const demoUserSignature = `demo-wallet-signature:${authorizationMessage}`;
const sensitive = await encryptTinSensitiveField({
  tin,
  fieldType: "kyc_document_hash",
  value: kycDocumentHash,
  userSignature: demoUserSignature,
});
const sensitivePlaintext = await decryptTinSensitiveField({
  tin,
  fieldType: "kyc_document_hash",
  nonce: sensitive.nonce,
  ciphertext: sensitive.ciphertext,
  userSignature: demoUserSignature,
});

console.log(
  JSON.stringify(
    {
      tin,
      socialIdentity: {
        type: "whatsapp",
        nonceBytes: social.nonce.length,
        ciphertextBytes: social.ciphertext.length,
        decrypted: socialPlaintext,
      },
      sensitiveField: {
        type: "kyc_document_hash",
        authorizationMessage,
        nonceBytes: sensitive.nonce.length,
        ciphertextBytes: sensitive.ciphertext.length,
        decrypted: sensitivePlaintext,
      },
    },
    null,
    2,
  ),
);
