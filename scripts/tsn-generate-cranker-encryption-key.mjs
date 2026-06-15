import nacl from "tweetnacl";
import { Keypair } from "@solana/web3.js";

const keypair = nacl.box.keyPair();
const encode = (value) => Buffer.from(value).toString("base64");

console.log("# Frontend");
console.log(`NEXT_PUBLIC_TSN_ROUTE_ENCRYPTION_PUBLIC_KEY=${encode(keypair.publicKey)}`);
console.log("");
console.log("# TSN mempool verifier (keep private)");
console.log(`TSN_ROUTE_ENCRYPTION_SECRET_KEY=${encode(keypair.secretKey)}`);
console.log("");

const permitSigner = Keypair.generate();
console.log("# TSN mempool verifier / on-chain private settlement config");
console.log(`TSN_PRIVATE_PERMIT_SIGNER_PUBKEY=${permitSigner.publicKey.toBase58()}`);
console.log(`TSN_PERMIT_SIGNER_SECRET_KEY=${encode(permitSigner.secretKey)}`);
