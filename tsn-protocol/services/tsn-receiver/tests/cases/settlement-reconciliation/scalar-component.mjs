

export function scalarComponent(n) {
    return BigInt(n).toString(16).padStart(64, "0");
}
