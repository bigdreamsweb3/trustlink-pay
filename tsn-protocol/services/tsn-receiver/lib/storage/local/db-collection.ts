import { LocalCollection } from "./local-collection";
import type { LocalDb } from "./local-db";
export function dbCollection(this: LocalDb, name: string) { return new LocalCollection(this.context,name); }
