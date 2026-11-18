import { existsSync } from "node:fs";
import path from "node:path";
import { receiverFixtureDestination } from "./receiver-fixture-destination.mjs";

/** Resolve authored relative modules into the isolated compiled fixture graph. */
export function rewriteReceiverImport(context, match, prefix, quote, specifier) {
  if (!specifier.startsWith(".")) {
    if (specifier === "@solana/web3.js") return `${prefix}${quote}${import.meta.resolve(specifier)}${quote}`;
    const stub = specifier === "next/server" ? "next-stub.mjs" : specifier === "firebase-admin/firestore" ? "firestore-stub.mjs" : undefined;
    if (!stub) return match;
    let relative = path.relative(path.dirname(receiverFixtureDestination(context, context.source)), path.join(context.moduleDirectory, stub)).replaceAll("\\", "/");
    if (!relative.startsWith(".")) relative = `./${relative}`;
    return `${prefix}${quote}${relative}${quote}`;
  }
  const extensionless = specifier.replace(/\.(?:[cm]?js|ts)$/, "");
  const resolved = path.resolve(path.dirname(context.source), `${extensionless}.ts`);
  if (!resolved.startsWith(`${context.root}${path.sep}`) || !existsSync(resolved)) return match;
  context.pending.push(path.relative(context.root, resolved));
  let relative = path.relative(path.dirname(receiverFixtureDestination(context, context.source)), receiverFixtureDestination(context, resolved)).replaceAll("\\", "/");
  if (!relative.startsWith(".")) relative = `./${relative}`;
  return `${prefix}${quote}${relative}${quote}`;
}
