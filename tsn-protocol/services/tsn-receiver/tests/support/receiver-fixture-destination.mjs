import path from "node:path";

/** Keep legacy lib fixture locations while retaining app source structure. */
export function receiverFixtureDestination(context, source) {
  const relative = path.relative(context.root, source).replace(/\.ts$/, ".mjs");
  const override = context.destinations?.get(source);
  return override ?? path.join(context.moduleDirectory, relative.startsWith(`lib${path.sep}`) ? relative.slice(4) : relative);
}
