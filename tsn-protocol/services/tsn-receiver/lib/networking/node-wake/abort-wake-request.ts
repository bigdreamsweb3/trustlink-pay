

/** abortWakeRequest component. Inputs and results retain the original node-wake contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function abortWakeRequest(context: { controller: AbortController }) {
const { controller } = context;
return controller.abort();
}
