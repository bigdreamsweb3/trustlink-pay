import type { DatabasePort, CollectionPort } from "../../storage/ports";

import type { ReceiverWork } from "../../work-contract";

export interface Dependencies {
  projectNodeWork(work: ReceiverWork): ReceiverWork | null;
  workCollection: CollectionPort;
  database: DatabasePort;
  clock: DateConstructor;
}
