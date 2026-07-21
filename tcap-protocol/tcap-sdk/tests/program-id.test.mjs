import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sdk = readFileSync(new URL("../src/program-id.ts", import.meta.url), "utf8");
const rust = readFileSync(new URL("../../programs/tcap/src/lib.rs", import.meta.url), "utf8");
const anchor = readFileSync(new URL("../../Anchor.toml", import.meta.url), "utf8");

test("TCAP program identity is synchronized across source-of-truth files", () => {
  const id = sdk.match(/TCAP_PROGRAM_ID = "([1-9A-HJ-NP-Za-km-z]{32,44})"/)?.[1];
  assert.ok(id, "SDK program ID is missing");
  assert.match(rust, new RegExp(`declare_id\\!(?:\\s*)\\(\\"${id}\\"\\)`));
  assert.match(anchor, new RegExp(`tcap\\s*=\\s*\\"${id}\\"`));
});
