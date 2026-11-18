import type { DatabasePort, CollectionPort } from "../../storage/ports";

export interface Dependencies {
  clock: DateConstructor;
  environment: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  workCollection: CollectionPort;
  database: DatabasePort;
  wakeNode: (reason: string) => Promise<void>;
}
