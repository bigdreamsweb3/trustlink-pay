export function writeVersion(state, version, data) {
  state.mutationCalls = (state.mutationCalls ?? 0) + 1;
  data["scheduler-state"].row.version = version;
  state.events?.push(`write:${version}`);
  return version;
}
