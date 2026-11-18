import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";

export const TCAP = new PublicKey("tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF");
export const [ROOT, ROOT_BUMP] = PublicKey.findProgramAddressSync([Buffer.from("tcap:commitment-root:v1")], TCAP);
export const discriminator = createHash("sha256").update("account:TcapCommitmentRootStateV1").digest().subarray(0, 8);
