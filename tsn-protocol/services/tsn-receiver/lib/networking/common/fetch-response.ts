/** Production transport adapter reads the current fetch at invocation; isolated components can receive their own transport. */
export function fetchResponse(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): ReturnType<typeof fetch> {
  return globalThis.fetch(input, init);
}
