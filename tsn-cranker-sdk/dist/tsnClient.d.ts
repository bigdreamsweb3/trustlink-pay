import type { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
export declare class TsnClient {
    readonly program: Program;
    readonly programId: PublicKey;
    constructor(program: Program);
    motherEscrowPda(): [PublicKey, number];
    crankerPda(motherEscrow: PublicKey, operator: PublicKey): [PublicKey, number];
    intentPda(motherEscrow: PublicKey, intentId: Uint8Array): [PublicKey, number];
    registerCrankerIx(motherEscrow: PublicKey, operator: PublicKey): import("@coral-xyz/anchor/dist/cjs/program/namespace/methods.js").MethodsBuilder<import("@coral-xyz/anchor").Idl, import("@coral-xyz/anchor/dist/cjs/idl.js").IdlInstruction & {
        name: string;
    }, import("@coral-xyz/anchor/dist/cjs/idl.js").IdlInstructionAccountItem>;
    claimIntentIx(motherEscrow: PublicKey, operator: PublicKey, intent: PublicKey): import("@coral-xyz/anchor/dist/cjs/program/namespace/methods.js").MethodsBuilder<import("@coral-xyz/anchor").Idl, import("@coral-xyz/anchor/dist/cjs/idl.js").IdlInstruction & {
        name: string;
    }, import("@coral-xyz/anchor/dist/cjs/idl.js").IdlInstructionAccountItem>;
    reassignIntentIx(motherEscrow: PublicKey, intent: PublicKey): import("@coral-xyz/anchor/dist/cjs/program/namespace/methods.js").MethodsBuilder<import("@coral-xyz/anchor").Idl, import("@coral-xyz/anchor/dist/cjs/idl.js").IdlInstruction & {
        name: string;
    }, import("@coral-xyz/anchor/dist/cjs/idl.js").IdlInstructionAccountItem>;
    submitProofIx(motherEscrow: PublicKey, operator: PublicKey, intent: PublicKey, payoutTxSig: Uint8Array): import("@coral-xyz/anchor/dist/cjs/program/namespace/methods.js").MethodsBuilder<import("@coral-xyz/anchor").Idl, import("@coral-xyz/anchor/dist/cjs/idl.js").IdlInstruction & {
        name: string;
    }, import("@coral-xyz/anchor/dist/cjs/idl.js").IdlInstructionAccountItem>;
}
//# sourceMappingURL=tsnClient.d.ts.map