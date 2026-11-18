

export function b58(buffer) {
    let n = BigInt(`0x${buffer.toString("hex")}`);
    let out = "";
    while (n) {
        out = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"[Number(n % 58n)] + out;
        n /= 58n;
    }
    for (const b of buffer) {
        if (b !== 0)
            break;
        out = "1" + out;
    }
    return out;
}
