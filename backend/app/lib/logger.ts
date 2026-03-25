type LogLevel = "info" | "warn" | "error";

interface LogMeta {
  [key: string]: unknown;
}

function writeLog(level: LogLevel, event: string, meta?: LogMeta) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...(meta ? { meta } : {})
  };

  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

export const logger = {
  info(event: string, meta?: LogMeta) {
    writeLog("info", event, meta);
  },
  warn(event: string, meta?: LogMeta) {
    writeLog("warn", event, meta);
  },
  error(event: string, meta?: LogMeta) {
    writeLog("error", event, meta);
  }
};
