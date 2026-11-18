import type { Dependencies } from "./dependencies";
import { id } from "./id";

/** bucket component. Inputs and results retain the original node-state-store contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export const bucket = (dependencies: Pick<Dependencies, "root">, key: string) => dependencies.root.doc(id(key));
