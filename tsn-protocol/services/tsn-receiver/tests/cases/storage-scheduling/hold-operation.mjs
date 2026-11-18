export async function holdOperation(state) {
  state.entered.resolve();
  await state.release.promise;
}
