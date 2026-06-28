import net from "node:net";
import readline from "node:readline";
import { spawn } from "node:child_process";

const rootDir = process.cwd();
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const backendCommand = process.platform === "win32" ? "python" : "python3";
const backendArgs = ["-u", "server.py"];
const frontendNextBin = "../../frontend/node_modules/next/dist/bin/next";
const frontendArgs = ["dev", "-p", "3002"];
const mempoolPort = Number(process.env.MEMPOOL_PORT ?? "8000");
const frontendPort = Number(process.env.MEMPOOL_FRONTEND_PORT ?? "3002");

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    const finish = (value) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };

    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(800, () => finish(false));
  });
}

async function inspectMempoolApi(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/openapi.json`, {
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) return { compatible: false, reason: `HTTP ${response.status}` };

    const document = await response.json();
    const properties =
      document?.components?.schemas?.CreateIntentRequest?.properties ?? {};
    const requiredFields = [
      "privacyVersion",
      "commitmentRecord",
      "encryptedSettlementToken",
    ];
    const missingFields = requiredFields.filter((field) => !(field in properties));
    return missingFields.length === 0
      ? { compatible: true }
      : {
          compatible: false,
          reason: `missing private-settlement fields: ${missingFields.join(", ")}`,
        };
  } catch (error) {
    return {
      compatible: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function spawnTagged(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? rootDir,
    env: options.env ?? process.env,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const prefix = `[${name}]`;
  readline.createInterface({ input: child.stdout }).on("line", (line) => {
    console.log(`${prefix} ${line}`);
  });
  readline.createInterface({ input: child.stderr }).on("line", (line) => {
    console.log(`${prefix} ${line}`);
  });

  child.on("exit", (code, signal) => {
    const exitLabel = signal ? `signal ${signal}` : `code ${code ?? 0}`;
    console.log(`${prefix} exited with ${exitLabel}`);
  });

  return child;
}

const children = [];
const backendBusy = await isPortOpen(mempoolPort);
const frontendBusy = await isPortOpen(frontendPort);

if (backendBusy) {
  const inspection = await inspectMempoolApi(mempoolPort);
  if (!inspection.compatible) {
    throw new Error(
      [
        `[mempool-api] port ${mempoolPort} is occupied by an incompatible or unknown service (${inspection.reason}).`,
        "Stop the existing process and rerun this command so the current TSN mempool API starts.",
        `Windows: netstat -ano | findstr :${mempoolPort}`,
        `WSL/Linux: lsof -i :${mempoolPort}`,
      ].join("\n"),
    );
  }
  console.log(`[mempool-api] port ${mempoolPort} already in use; reusing the compatible API`);
} else {
  const backendEnv = {
    ...process.env,
    MEMPOOL_STORE: process.env.MEMPOOL_STORE ?? "file",
    PYTHONUNBUFFERED: "1",
  };
  children.push(
    spawnTagged("mempool-api", backendCommand, backendArgs, {
      cwd: `${rootDir}/tsn-protocol/tsn-mempool-backend`,
      env: backendEnv,
    }),
  );
}

if (frontendBusy) {
  console.log(`[mempool-ui] port ${frontendPort} already in use; reusing the existing UI`);
} else {
  children.push(
    spawnTagged("mempool-ui", process.execPath, [frontendNextBin, ...frontendArgs], {
      cwd: `${rootDir}/tsn-protocol/tsn-mempool-frontend`,
    }),
  );
}

function shutdown() {
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(130);
});

process.on("SIGTERM", () => {
  shutdown();
  process.exit(143);
});

const exitCodes = await Promise.all(
  children.map(
    (child) =>
      new Promise((resolve) => {
        child.on("exit", (code, signal) => resolve(signal ? 1 : code ?? 0));
      }),
  ),
);

const failedCode = exitCodes.find((code) => code !== 0);
process.exit(failedCode ?? 0);
