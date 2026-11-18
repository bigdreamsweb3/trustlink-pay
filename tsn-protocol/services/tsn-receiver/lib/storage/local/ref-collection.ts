import { LocalCollection } from "./local-collection";
import type { Ref } from "./ref";
export function refCollection(this: Ref, name: string) { return new LocalCollection(this.context, `${this.collectionPath}/${this.id}/${name}`); }
