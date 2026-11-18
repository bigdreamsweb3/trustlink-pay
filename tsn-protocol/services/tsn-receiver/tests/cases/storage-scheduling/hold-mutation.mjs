export async function holdMutation(state, data) {
  data["scheduler-state"].row.version = 1;
  state.events.push("first-start");
  state.entered.resolve();
  await state.release.promise;
  state.events.push("first-end");
}
