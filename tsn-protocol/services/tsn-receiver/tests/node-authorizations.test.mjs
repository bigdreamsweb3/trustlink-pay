import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

test("Node forwarding distinguishes domain rejection from service availability", async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tsn-node-forwarding-"));
  const variables = ["TSN_NODE_URL", "TSN_NODE_FALLBACK_URL", "TSN_RECEIVER_NODE_API_KEY"];
  const previous = Object.fromEntries(variables.map(key => [key, process.env[key]]));
  const previousFetch = globalThis.fetch;
  process.env.TSN_NODE_URL = "http://primary-node.invalid/";
  process.env.TSN_NODE_FALLBACK_URL = "http://fallback-node.invalid";
  process.env.TSN_RECEIVER_NODE_API_KEY = "isolated-test-credential";
  try {
    const compile = source => ts.transpileModule(source, { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022,
    } }).outputText;
    await writeFile(path.join(directory, "node-authorizations.mjs"), compile(
      await readFile(new URL("../lib/node-authorizations.ts", import.meta.url), "utf8")));
    await writeFile(path.join(directory, "next-stub.mjs"),
      'export class NextResponse extends Response { static json(data, options={}) { return new this(JSON.stringify(data), {...options,headers:{"content-type":"application/json"}}); } }');
    await writeFile(path.join(directory, "cranker-auth.mjs"),
      'export async function authenticateCrankerRequest(request) { if(request.headers.get("x-test-cranker")!=="operator") throw new Error("CRANKER_SESSION_INVALID"); return "operator"; } export async function enforceCrankerLeaseRateLimit() {}');
    const route = compile(await readFile(new URL("../app/api/cranker/settlement-signature/route.ts", import.meta.url), "utf8"))
      .replace('from "next/server"', 'from "./next-stub.mjs"')
      .replace(/from "(?:\.\.\/)+lib\/([^".]+)"/g, 'from "./$1.mjs"');
    await writeFile(path.join(directory, "route.mjs"), route);
    const { requestNodeAuthorization } = await import(pathToFileURL(path.join(directory, "node-authorizations.mjs")).href);
    const { POST } = await import(pathToFileURL(path.join(directory, "route.mjs")).href);
    const endpoint = "/internal/settlement-authorizations/signature";
    const body = { workId: "work", crankerPubkey: "operator", messageBase64: "dGVzdA==" };
    let calls = [];
    const mocked = responses => {
      calls = [];
      globalThis.fetch = async (url, options) => {
        calls.push({ url, options });
        const result = responses[calls.length - 1];
        if (result instanceof Error) throw result;
        assert.ok(result, "unexpected fallback request");
        return result;
      };
    };
    const json = (status, data) => new Response(JSON.stringify(data), {
      status, headers: { "content-type": "application/json" },
    });
    const interrupted = () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('{"signatureBase64":')); },
      pull(controller) { controller.error(new Error("private body transport failure")); },
    }), { status: 200 });
    await t.test("domain404 and authentication/validation rejection remain terminal", async () => {
      for (const [status, detail] of [[404, "Receiver work was not found"], [401, "Unauthorized"],
        [403, "Denied"], [409, "TCAP_EPOCH_ALREADY_ACCOUNTED"], [422, "Invalid transaction"]]) {
        mocked([json(status, { detail })]);
        const result = await requestNodeAuthorization(endpoint, body);
        assert.equal(result.response.status, status);
        assert.deepEqual(await result.response.json(), { detail });
        assert.equal(calls.length, 1);
      }
    });
    await t.test("route404,5xx and transport failure reach the configured fallback", async () => {
      for (const failure of [json(404, { detail: "Not Found" }), new Response("missing", { status: 404 }),
        json(500, { detail: "private dependency error" }), json(503, {}), new Error("private endpoint credential"), interrupted()]) {
        mocked([failure, json(200, { signatureBase64: "signature" })]);
        const result = await requestNodeAuthorization(endpoint, body);
        assert.equal(result.response.status, 200);
        assert.deepEqual(await result.response.json(), { signatureBase64: "signature" });
        assert.deepEqual(calls.map(call => call.url), ["http://primary-node.invalid" + endpoint, "http://fallback-node.invalid" + endpoint]);
        for (const call of calls) {
          assert.equal(call.options.method, "POST");
          assert.equal(call.options.headers["x-api-key"], "isolated-test-credential");
          assert.equal(call.options.body, JSON.stringify(body));
        }
      }
    });
    await t.test("duplicate endpoints run once and failed forwarding has bounded diagnostics", async () => {
      process.env.TSN_NODE_FALLBACK_URL = " 'http://primary-node.invalid/' ";
      mocked([json(404, { detail: "Not Found at private URL" })]);
      const result = await requestNodeAuthorization(endpoint, body);
      assert.equal(calls.length, 1);
      assert.deepEqual(result, { configured: true, response: null, nodeStatus: 404 });
      process.env.TSN_NODE_FALLBACK_URL = "http://fallback-node.invalid";
    });
    const request = (data, owner = "operator") => new Request("http://receiver.invalid/api/cranker/settlement-signature", {
      method: "POST", headers: { "x-test-cranker": owner }, body: JSON.stringify(data),
    });
    await t.test("signing route forwards domain404 and returns sanitized503 for unavailable endpoints", async () => {
      mocked([json(404, { detail: "Receiver work was not found" })]);
      let response = await POST(request(body));
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { detail: "Receiver work was not found" });
      assert.equal(calls.length, 1);
      mocked([new Error("secret URL"), json(404, { detail: "private URL Not Found" })]);
      response = await POST(request(body));
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: "TSN Node signing service is unavailable", nodeStatus: 404 });
      mocked([new Error("private credential"), new Error("private credential")]);
      response = await POST(request(body));
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: "TSN Node signing service is unavailable" });
      mocked([interrupted(), interrupted()]);
      response = await POST(request(body));
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: "TSN Node signing service is unavailable" });
    });
    await t.test("authentication, malformed requests and absent configuration do not contact Node", async () => {
      mocked([]);
      assert.equal((await POST(request(body, "unauthorized"))).status, 401);
      assert.equal((await POST(request({ workId: "work" }))).status, 422);
      delete process.env.TSN_RECEIVER_NODE_API_KEY;
      const response = await POST(request(body));
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: "TSN Node signing service is not configured" });
      assert.equal(calls.length, 0);
    });
  } finally {
    globalThis.fetch = previousFetch;
    for (const key of variables) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
    await rm(directory, { recursive: true, force: true });
  }
});
