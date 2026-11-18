

export function requestComponent(data, owner = "operator") {
    return new Request("http://receiver.invalid/api/cranker/settlement-signature", {
        method: "POST", headers: { "x-test-cranker": owner }, body: JSON.stringify(data),
    });
}
