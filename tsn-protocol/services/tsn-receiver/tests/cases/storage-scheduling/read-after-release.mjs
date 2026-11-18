export async function readAfterRelease(state) {
  await state.releaseChild.promise;
  return state.duplicate.readStore(state.second);
}
