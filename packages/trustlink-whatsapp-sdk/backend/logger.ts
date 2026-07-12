export type WhatsAppSdkLogger = {
  info(event: string, metadata?: Record<string, unknown>): void;
  warn(event: string, metadata?: Record<string, unknown>): void;
  error(event: string, metadata?: Record<string, unknown>): void;
};

let configuredLogger: WhatsAppSdkLogger = {
  info: (event, metadata) => console.info(event, metadata ?? {}),
  warn: (event, metadata) => console.warn(event, metadata ?? {}),
  error: (event, metadata) => console.error(event, metadata ?? {}),
};

export function configureWhatsAppSdkLogger(logger: WhatsAppSdkLogger) {
  configuredLogger = logger;
}

export function getWhatsAppSdkLogger() {
  return configuredLogger;
}
