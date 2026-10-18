import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await esbuild.build({
  entryPoints: [path.join(root, "protocol-tests/ui/recipient-credit-sdk.ts")],
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "TsnRecipientCreditSdk",
  target: ["es2022"],
  outfile: path.join(root, "protocol-tests/ui/public/tsn-recipient-credit-sdk.bundle.js"),
});

const zkSdkPackage = path.join(root, "tsn-protocol/sdks/tsn-sdk/node_modules/@solana/zk-sdk");
const zkSdkWasm = readFileSync(path.join(zkSdkPackage, "dist/web/index_bg.wasm")).toString("base64");
const bufferInject = path.join(root, "scripts/browser-buffer-inject.ts");
await esbuild.build({
  entryPoints: [path.join(root, "scripts/tin-creation-sdk.browser.ts")],
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "TsnTinCreationSdk",
  target: ["es2022"],
  inject: [bufferInject],
  plugins: [{
    name: "solana-zk-sdk-webassembly",
    setup(build) {
      build.onResolve({ filter: /^@solana\/zk-sdk$/ }, () => ({
        path: "zk-sdk-browser-shim",
        namespace: "tsn-zk-sdk",
      }));
      build.onLoad({ filter: /.*/, namespace: "tsn-zk-sdk" }, () => ({
        contents: `import initSync, { ConfidentialKeys } from "@solana/zk-sdk/web";\nconst wasm = Uint8Array.from(atob("${zkSdkWasm}"), (c) => c.charCodeAt(0));\ninitSync(wasm);\nexport { ConfidentialKeys };`,
        loader: "js",
        resolveDir: zkSdkPackage,
      }));
      build.onResolve({ filter: /^@solana\/zk-sdk\/web$/ }, () => ({
        path: path.join(zkSdkPackage, "dist/web/index.js"),
      }));
    },
  }],
  outfile: path.join(root, "protocol-tests/ui/public/tsn-tin-creation-sdk.bundle.js"),
});
