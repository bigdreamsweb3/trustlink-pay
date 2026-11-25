/** Durable notification replaces Receiver-to-Node HTTP calls. Failure never rolls back already committed work. */
export async function wakeTsnNode(dependencies: { signal: () => Promise<void> }, reason: string): Promise<void> {
  try { await dependencies.signal(); }
  catch { console.warn("TSN Node revision notification unavailable", {reason:reason.slice(0,64)}); }
}
