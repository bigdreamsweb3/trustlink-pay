/** Share the existing 30-per-minute operator lease budget without awaiting another lane's HTTP response. */
export function createCrankerLeaseGate(ports: {
  clock: () => number;
  sleep: (milliseconds: number) => Promise<void>;
}): () => Promise<void> {
  let nextAt = 0;
  let previous = Promise.resolve();
  return () => {
    const turn = previous.then(async () => {
      const delay = Math.max(0, nextAt - ports.clock());
      if (delay) await ports.sleep(delay);
      nextAt = ports.clock() + 2000;
    });
    previous = turn.catch(() => undefined);
    return turn;
  };
}
