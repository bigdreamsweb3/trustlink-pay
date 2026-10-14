import path from "node:path";
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
