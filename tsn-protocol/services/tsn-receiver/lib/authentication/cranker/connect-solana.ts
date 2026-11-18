import { Connection } from "@solana/web3.js";
/** Construct the unchanged confirmed-commitment RPC client behind an explicit test seam. */
export function connectSolana(url: string): Pick<Connection, "getAccountInfo"> { return new Connection(url, "confirmed"); }
