function format(event, payload) {
    return payload ? `${event} ${JSON.stringify(payload)}` : event;
}
export const logger = {
    info(event, payload) {
        console.info(format(event, payload));
    },
    warn(event, payload) {
        console.warn(format(event, payload));
    },
    error(event, payload) {
        console.error(format(event, payload));
    },
};
