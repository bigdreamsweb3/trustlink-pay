import type { Dependencies } from "./dependencies";
import { bucket } from "./bucket";
import { id } from "./id";

/** item component. Inputs and results retain the original node-state-store contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export const item = (dependencies: Pick<Dependencies, "root">, key: string, field: string) => bucket(dependencies, key).collection("items").doc(id(field));
