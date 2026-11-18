/** Return one fresh stored row without a projection. */
export async function readWork(context, id) {
  const snapshot = await context.dependencies.workCollection.doc(id).get();
  return snapshot.exists ? snapshot.data() : null;
}
