import { refGet } from "./ref-get";
import { refSet } from "./ref-set";
import { refCreate } from "./ref-create";
import { refDelete } from "./ref-delete";
import { refCollection } from "./ref-collection";
import type { StorageContext } from "./types";
export class Ref {
  get = refGet; set = refSet; create = refCreate; delete = refDelete; collection = refCollection;
  constructor(public context: StorageContext, public collectionPath: string, public id: string) {}
}
