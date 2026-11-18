

/** scheduleRpcRetry component. Inputs and results retain the original cranker-auth contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function scheduleRpcRetry(context: { attempt: number }, resolve: (value: unknown) => void) {
const { attempt } = context;
return setTimeout(resolve, attempt * 500);
}
