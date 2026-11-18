export function snapshotIdentifiers(snapshot) { const ids=[];for(const row of snapshot.docs)ids.push(row.id);return ids; }
