import { PublicKey } from "@solana/web3.js";

export function pdaComponent(seed, program) {
    return PublicKey.findProgramAddressSync([Buffer.from(seed)], program)[0];
}
