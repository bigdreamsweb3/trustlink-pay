import type { DocumentPort } from "../../storage/ports";


/** deleteDocumentReference component. Inputs and results retain the original cranker-auth contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function deleteDocumentReference(reference: DocumentPort) {
return reference?.delete();
}
