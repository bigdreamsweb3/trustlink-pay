import nacl from "tweetnacl";

const keypair = nacl.box.keyPair();
const encode = (value) => Buffer.from(value).toString("base64");

console.log("# Frontend");
console.log(`NEXT_PUBLIC_TSN_CRANKER_ENCRYPTION_PUBLIC_KEY=${encode(keypair.publicKey)}`);
console.log("");
console.log("# Cranker daemon (keep private)");
console.log(`TSN_CRANKER_ENCRYPTION_SECRET_KEY=${encode(keypair.secretKey)}`);
