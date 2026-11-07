import { poseidon5 } from "poseidon-lite/poseidon5";
import { canonicalFundingFieldHex } from "./funding-note.js";
export const CREDIT_AMOUNT_DOMAIN_V2=1880519585059740412114005250091737410720192050n;
/** Open an amount commitment after decrypting the owner record. Blinding stays private. */
export function deriveCreditAmountCommitmentV2(tokenId:number,amount:bigint,blinding:string,nullifier:string):string {
    if(!Number.isInteger(tokenId)||tokenId<=0||tokenId>0xffffffff||amount<=0n||amount>0xffffffffffffffffn)throw new Error("INVALID_PRIVATE_CREDIT_AMOUNT");
    return poseidon5([CREDIT_AMOUNT_DOMAIN_V2,BigInt(tokenId),amount,
        BigInt("0x"+canonicalFundingFieldHex(blinding,"Amount blinding")),
        BigInt("0x"+canonicalFundingFieldHex(nullifier,"Credit nullifier"))]).toString(16).padStart(64,"0");
}
