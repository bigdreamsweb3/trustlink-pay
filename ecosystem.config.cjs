const fs = require("node:fs");
const path = require("node:path");

const root = fs.realpathSync.native(__dirname);
const logDirectory = path.join(root, ".logs");

function createNpmApplication(name, workingDirectory, command, environment = {}) {
  return {
    name: name === "backend" ? "trustlink-backend" : `tsn-${name}`,
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

const tsnNodeApplication = {
  name: "tsn-node",
  script: path.join(root, ".venv", "Scripts", "python.exe"),
  args: "-u server.py",
  cwd: path.join(root, "tsn-protocol", "tsn-node"),
  interpreter: "none",
  instances: 1,
  autorestart: true,
  watch: false,
  windowsHide: true,
  kill_timeout: 10000,
  out_file: path.join(logDirectory, "tsn-node-out.log"),
  error_file: path.join(logDirectory, "tsn-node-error.log"),
  time: true,
  env: {
    PYTHONUNBUFFERED: "1",
  },
};

module.exports = {
  apps: [
    createNpmApplication("receiver", "tsn-protocol/tsn-receiver", "dev"),
    tsnNodeApplication,
    createNpmApplication("backend", "backend", "dev"),
    createNpmApplication("mempool-ui", "tsn-protocol/tsn-mempool-ui", "dev"),
    createNpmApplication("rpc-gateway", "tsn-protocol/tsn-rpc-gateway", "dev"),
    createNpmApplication("cranker", "tsn-protocol/tsn-cranker-op-daemon", "crank:start"),
  ],
};
