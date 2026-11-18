import { PublicKey } from "@solana/web3.js";

export const CHALLENGE_TTL_MS = 60_000;
export const CRANKER_SESSION_TTL_MS = 30 * 60_000;
export const CRANKER_SESSION_IDLE_TTL_MS = 5 * 60_000;
export const MAX_LEASE_ATTEMPTS_PER_MINUTE = 30;
export const VERIFIED_TSN_PROGRAM_ID = "TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V";
export const DEFAULT_TSN_RPC_GATEWAY_URL = "https://tsn-rpc-gateway.vercel.app";
export const DEVNET_RPC_URL = "https://api.devnet.solana.com";
export const TSN_PROGRAM_ID = new PublicKey(VERIFIED_TSN_PROGRAM_ID);
export const MOTHER_SEED = Buffer.from("tsn_mother_escrow");
export const CRANKER_SEED = Buffer.from("tsn_cranker");
export const ANCHOR_DISCRIMINATOR_BYTES = 8;
export const PUBKEY_BYTES = 32;
