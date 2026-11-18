import { PublicKey } from "@solana/web3.js";

export function pubComponent(key) {
    return new PublicKey(key.publicKey.export({ format: "der", type: "spki" }).subarray(-32));
}
