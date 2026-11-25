import path from "node:path";
export function rewriteHttpFixtureImport(context,match,prefix,quote,specifier){
  const payloadHash=path.join(context.root,"lib","contracts","commitments","payload-commitment.ts");
  if(specifier==="node:crypto"&&context.source===payloadHash)return match;
  if(!specifier.startsWith("."))throw new Error("HTTP_FIXTURE_UNSTUBBED_RUNTIME_IMPORT: "+specifier);
  const source=path.resolve(path.dirname(context.source),specifier.replace(/\.(?:js|ts)$/,"")+".ts");
  const readinessProjection=path.join(context.root,"lib","contracts","projection","public-funding-readiness.ts");
  const fundingLeaseFilter=path.join(context.root,"lib","work","assert-node-funding-lease-filter.ts");
  const tinDebitReplacement=path.join(context.root,"lib","contracts","recovery","can-replace-tin-debit.ts");
  const resolvedNonExecution=path.join(context.root,"lib","contracts","recovery","has-resolved-non-execution.ts");
  const pureContracts=["lib/contracts/recovery/non-execution-context-commitment.ts","lib/contracts/commitments/payload-commitment.ts","lib/contracts/commitments/stable.ts","lib/contracts/commitments/compare-stable-keys.ts","lib/contracts/commitments/format-stable-entry.ts"].map(file=>path.join(context.root,file));
  if(!source.startsWith(context.root+path.sep)||(!source.includes(path.sep+"lib"+path.sep+"http"+path.sep)&&source!==readinessProjection&&source!==fundingLeaseFilter&&source!==tinDebitReplacement&&source!==resolvedNonExecution&&!pureContracts.includes(source)))throw new Error("HTTP_FIXTURE_IMPORT_OUTSIDE_ROUTE_COMPONENTS: "+path.relative(context.root,source));
  context.pending.push(source);
  const target=path.join(context.directory,path.relative(context.root,source)).replace(/\.ts$/,".mjs");
  let relative=path.relative(path.dirname(context.destination),target).replaceAll("\\","/");
  if(!relative.startsWith("."))relative="./"+relative;
  return prefix+quote+relative+quote;
}
