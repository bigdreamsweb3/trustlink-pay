export async function queryPage(context) {
  context.reads += 1;
  const docs = [];
  for (const row of context.rows) {
    if (row.id <= context.after) continue;
    docs.push({ id: row.id, data: structuredClone.bind(null, row) });
    if (docs.length === context.maximum) break;
  }
  return { docs };
}
