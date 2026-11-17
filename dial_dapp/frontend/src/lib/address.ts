export function shortenAddress(value: string, start = 4, end = 4) {
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}
