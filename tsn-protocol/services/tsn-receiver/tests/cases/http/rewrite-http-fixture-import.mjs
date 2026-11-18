import path from "node:path";
export function rewriteHttpFixtureImport(context,match,prefix,quote,specifier){
  if(!specifier.startsWith("."))throw new Error("HTTP_FIXTURE_UNSTUBBED_RUNTIME_IMPORT: "+specifier);
  const source=path.resolve(path.dirname(context.source),specifier.replace(/\.(?:js|ts)$/,"")+".ts");
  const readinessProjection=path.join(context.root,"lib","contracts","projection","public-funding-readiness.ts");
  const fundingLeaseFilter=path.join(context.root,"lib","work","assert-node-funding-lease-filter.ts");
  if(!source.startsWith(context.root+path.sep)||(!source.includes(path.sep+"lib"+path.sep+"http"+path.sep)&&source!==readinessProjection&&source!==fundingLeaseFilter))throw new Error("HTTP_FIXTURE_IMPORT_OUTSIDE_ROUTE_COMPONENTS");
  context.pending.push(source);
  const target=path.join(context.directory,path.relative(context.root,source)).replace(/\.ts$/,".mjs");
  let relative=path.relative(path.dirname(context.destination),target).replaceAll("\\","/");
  if(!relative.startsWith("."))relative="./"+relative;
  return prefix+quote+relative+quote;
}
