import { txGet } from "./tx-get";
import { txCreate } from "./tx-create";
import { txSet } from "./tx-set";
import { txUpdate } from "./tx-update";
import type { Database } from "./types";
export class Tx {
  get = txGet; create = txCreate; set = txSet; update = txUpdate;
  constructor(public data: Database) {}
}
