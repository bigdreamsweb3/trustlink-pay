

export function hComponent(n) {
    return n.toString(16).padStart(2, "0").repeat(32);
}
