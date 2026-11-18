import { Ref } from "./ref";
import type { LocalCollection } from "./local-collection";
export function collectionDoc(this: LocalCollection, id: string) { return new Ref(this.context,this.name,id); }
