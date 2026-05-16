type LogPayload = Record<string, unknown> | undefined;

function format(event: string, payload?: LogPayload) {
  return payload ? `${event} ${JSON.stringify(payload)}` : event;
}

export const logger = {
  info(event: string, payload?: LogPayload) {
    console.info(format(event, payload));
  },
  warn(event: string, payload?: LogPayload) {
    console.warn(format(event, payload));
  },
  error(event: string, payload?: LogPayload) {
    console.error(format(event, payload));
  },
};
