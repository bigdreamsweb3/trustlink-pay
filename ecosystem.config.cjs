const fs = require("node:fs");
const path = require("node:path");

const root = fs.realpathSync.native(__dirname);
const logDirectory = path.join(root, ".logs");

function createNpmApplication(name, workingDirectory, command, environment = {}) {
  return {
    name: `trustlink-${name}`,
    script: "cmd.exe",
    args: `/d /s /c "npm.cmd run ${command}"`,
    cwd: path.join(root, workingDirectory),
    interpreter: "none",
    instances: 1,
    autorestart: true,
    watch: false,
    windowsHide: true,
    kill_timeout: 10000,
    out_file: path.join(logDirectory, `${name}-out.log`),
    error_file: path.join(logDirectory, `${name}-error.log`),
    time: true,
    env: {
      NODE_ENV: "development",
      ...environment,
    },
  };
}

const mempoolApplication = {
  name: "trustlink-mempool",
  script: path.join(root, ".venv", "Scripts", "python.exe"),
  args: "-u server.py",
  cwd: path.join(root, "tsn-protocol", "tsn-mempool-backend"),
  interpreter: "none",
  instances: 1,
  autorestart: true,
  watch: false,
  windowsHide: true,
  kill_timeout: 10000,
  out_file: path.join(logDirectory, "mempool-out.log"),
  error_file: path.join(logDirectory, "mempool-error.log"),
  time: true,
  env: {
    PYTHONUNBUFFERED: "1",
    MEMPOOL_STORE: "file",
  },
};

module.exports = {
  apps: [
    mempoolApplication,
    createNpmApplication("backend", "backend", "dev"),
    createNpmApplication("mempool-ui", "tsn-protocol/tsn-mempool-frontend", "dev"),
    createNpmApplication("rpc-gateway", "tsn-protocol/tsn-rpc-gateway", "dev"),
    createNpmApplication("cranker", "tsn-protocol/tsn-cranker-op-daemon", "crank:start"),
  ],
};
