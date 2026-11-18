

export function uint(n, size) {
    const b = Buffer.alloc(size);
    let v = BigInt(n);
    for (let i = 0; i < size; i++) {
        b[i] = Number(v & 255n);
        v >>= 8n;
    }
    return b;
}
