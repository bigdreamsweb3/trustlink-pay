import nacl from "tweetnacl";

const keypair = nacl.sign.keyPair();
const encode = (value) => Buffer.from(value).toString("base64");

console.log("# TSN Node immutable claim/recovery settlement authorization");
console.log(`TSN_SETTLEMENT_AUTHORIZATION_SIGNER_PUBLIC_KEY=${encode(keypair.publicKey)}`);
console.log(`TSN_SETTLEMENT_AUTHORIZATION_SIGNING_KEY=${encode(keypair.secretKey)}`);
