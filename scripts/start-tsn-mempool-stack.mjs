import net from "node:net";
import readline from "node:readline";
import { spawn } from "node:child_process";

const rootDir = process.cwd();
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const receiverPort = Number(process.env.TSN_RECEIVER_PORT ?? "8010");
const nodePort = Number(process.env.TSN_NODE_PORT ?? "8000");
const uiPort = Number(process.env.TSN_MEMPOOL_UI_PORT ?? "3002");
const startLocalReceiver = process.env.TSN_START_RECEIVER === "true";
const liveReceiverUrl = "https://tsn-receiver-kappa.vercel.app";
const liveNodeUrl = "https://tsn-node.wasmer.app";

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    const done = (value) => { socket.removeAllListeners(); socket.destroy(); resolve(value); };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.setTimeout(800, () => done(false));
  });
}

function spawnTagged(name, command, args, cwd, env = process.env) {
  const child = spawn(command, args, { cwd, env, shell: false, stdio: ["ignore", "pipe", "pipe"] });
  for (const stream of [child.stdout, child.stderr]) {
    readline.createInterface({ input: stream }).on("line", (line) => console.log(`[${name}] ${line}`));
  }
  child.on("exit", (code, signal) => console.log(`[${name}] exited with ${signal ?? `code ${code ?? 0}`}`));
  return child;
}

async function isHttpReachable(url) {
  try {
    await fetch(url, { method: "GET", signal: AbortSignal.timeout(2500) });
    return true;
  } catch {
    return false;
  }
}

const children = [];
if (startLocalReceiver && !(await isPortOpen(receiverPort))) {
  children.push(spawnTagged("tsn-receiver", npm, ["run", "dev", "--", "-p", String(receiverPort)],
    `${rootDir}/tsn-protocol/tsn-receiver`));
} else if (startLocalReceiver) console.log(`[tsn-receiver] reusing localhost:${receiverPort}`);

if (!(await isPortOpen(nodePort))) {
  if (process.env.TSN_FORCE_LOCAL_NODE !== "true" && await isHttpReachable(liveNodeUrl)) {
    console.log(`[tsn-node] using live service ${liveNodeUrl}`);
  } else {
    children.push(spawnTagged("tsn-node", process.platform === "win32" ? "python" : "python3", ["-u", "server.py"],
      `${rootDir}/tsn-protocol/tsn-node`, {
        ...process.env,
        TSN_RECEIVER_URL: process.env.TSN_RECEIVER_URL ||
          (startLocalReceiver ? `http://127.0.0.1:${receiverPort}` : liveReceiverUrl),
        TSN_RECEIVER_FALLBACK_URL: process.env.TSN_RECEIVER_FALLBACK_URL || liveReceiverUrl,
        PYTHONUNBUFFERED: "1",
      }));
  }
} else console.log(`[tsn-node] reusing localhost:${nodePort}`);

if (process.env.TSN_START_MEMPOOL_UI === "true") {
  if (!(await isPortOpen(uiPort))) {
    children.push(spawnTagged("tsn-mempool-ui", npm, ["run", "dev", "--", "-p", String(uiPort)],
      `${rootDir}/tsn-protocol/tsn-mempool-ui`));
  } else console.log(`[tsn-mempool-ui] reusing localhost:${uiPort}`);
}

const shutdown = () => { for (const child of children) if (!child.killed) child.kill(); };
process.once("SIGINT", () => { shutdown(); process.exit(130); });
process.once("SIGTERM", () => { shutdown(); process.exit(143); });
const codes = await Promise.all(children.map((child) => new Promise((resolve) => child.once("exit", (code, signal) => resolve(signal ? 1 : code ?? 0)))));
process.exit(codes.find((code) => code !== 0) ?? 0);
