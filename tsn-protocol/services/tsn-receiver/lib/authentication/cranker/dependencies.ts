import type { DatabasePort, CollectionPort } from "../../storage/ports";
import type { connectSolana } from "../cranker/connect-solana";

export interface Dependencies {
  rpcUrls: readonly string[];
  connect: typeof connectSolana;
  clock: DateConstructor;
  challengeCollection: CollectionPort;
  sessionCollection: CollectionPort;
  database: DatabasePort;
  rateCollection: CollectionPort;
}
