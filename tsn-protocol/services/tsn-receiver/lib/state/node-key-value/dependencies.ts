import type { DatabasePort, CollectionPort } from "../../storage/ports";

export interface Dependencies {
  root: CollectionPort;
  database: DatabasePort;
}
