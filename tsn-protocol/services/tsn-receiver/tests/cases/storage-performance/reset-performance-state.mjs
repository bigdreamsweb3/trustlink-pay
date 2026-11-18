export function resetPerformanceState(state) {
  state.active = 0;
  state.peak = 0;
  state.recordReads = 0;
  state.recordPaths = [];
  state.readsAfterUnlock = 0;
  state.failures = new Map();
  state.delays = new Map();
}
