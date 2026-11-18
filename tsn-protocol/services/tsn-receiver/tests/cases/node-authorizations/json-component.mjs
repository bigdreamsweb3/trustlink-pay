

export function jsonComponent(status, data) {
    return new Response(JSON.stringify(data), {
        status, headers: { "content-type": "application/json" },
    });
}
