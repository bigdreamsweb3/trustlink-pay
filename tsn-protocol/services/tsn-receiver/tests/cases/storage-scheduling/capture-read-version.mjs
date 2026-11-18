export function captureReadVersion(state, data) {
  const version = data["scheduler-state"].row.version;
  state.events.push(`read:${version}`);
  return version;
}
