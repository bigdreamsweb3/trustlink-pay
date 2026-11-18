import { mutateStore } from "./mutate-store";
import { deleteDocument } from "./delete-document";
import type { Ref } from "./ref";
export async function refDelete(this: Ref) { return mutateStore(this.context, deleteDocument.bind(null, this)); }
