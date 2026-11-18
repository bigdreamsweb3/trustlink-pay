

export function start(controller) {
    controller.enqueue(new TextEncoder().encode('{"signatureBase64":'));
}
