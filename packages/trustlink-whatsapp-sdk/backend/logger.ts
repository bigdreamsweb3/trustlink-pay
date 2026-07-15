export type WhatsAppSdkLogger = {
  info(event: string, metadata?: Record<string, unknown>): void;
  warn(event: string, metadata?: Record<string, unknown>): void;
  error(event: string, metadata?: Record<string, unknown>): void;
};

let configuredLogger: WhatsAppSdkLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export function configureWhatsAppSdkLogger(logger: WhatsAppSdkLogger) {
  configuredLogger = logger;
}

export function getWhatsAppSdkLogger() {
  return configuredLogger;
}
