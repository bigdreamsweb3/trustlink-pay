#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";

function run(command, args, options = {}) {
  console.log(`> ${command} ${args.join(" ")}`);
  execFileSync(command, args, { stdio: "inherit", ...options });
}

function remove(path) {
  rmSync(path, { recursive: true, force: true });
}

run("npm", ["--prefix", "tsn-protocol/tsn-sdk", "install"]);
run("npm", ["--prefix", "tsn-protocol/tsn-sdk", "run", "build"]);

run("npm", ["--prefix", "packages/trustlink-whatsapp-sdk", "install"]);
run("npm", ["--prefix", "packages/trustlink-whatsapp-sdk", "run", "build"]);

run("npm", ["--prefix", "utils/observability", "install"]);
run("npm", ["--prefix", "utils/observability", "run", "build"]);

remove("frontend/.next");
remove("frontend/node_modules/@trustlink/tsn-sdk");
remove("frontend/node_modules/@trustlink/observability");
remove("frontend/node_modules/trustlink-whatsapp-sdk");

run("npm", ["--prefix", "frontend", "install"]);

run("node", [
  "--input-type=module",
  "-e",
  "for (const mod of ['@trustlink/tsn-sdk/tins','@trustlink/tsn-sdk/pru-route-auth','@trustlink/tsn-sdk/canonical-message','@trustlink/observability/tracer','trustlink-whatsapp-sdk','trustlink-whatsapp-sdk/ui']) console.log(mod, '=>', await import.meta.resolve(mod));"
], { cwd: "frontend" });
