

/** hasRpcUrl component. Inputs and results retain the original cranker-auth contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function hasRpcUrl(url: string) : url is string {
return Boolean(url);
}
