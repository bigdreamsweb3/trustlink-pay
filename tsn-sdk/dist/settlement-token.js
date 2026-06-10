import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
export const TSN_SETTLEMENT_TOKEN_VERSION = 1;
export const TSN_SETTLEMENT_TOKEN_ALGORITHM = "TSN-HKDF-SHA256-STREAM-HMAC";
function base64UrlEncode(bytes) {
    return Buffer.from(bytes)
        .toString("base64")
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
}
function base64UrlDecode(value) {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
    return Buffer.from(padded, "base64");
}
export function settlementSha256Hex(input) {
    return createHash("sha256").update(input).digest("hex");
}
export function canonicalJson(value) {
    if (value == null || typeof value !== "object")
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
    return `{${Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
        .join(",")}}`;
}
export function settlementTokenCommitmentHash(plaintext) {
    return settlementSha256Hex(canonicalJson(plaintext));
}
export function crankerDnaHash(value) {
    return settlementSha256Hex(`tsn-cranker-dna:${value}`);
}
function normalizeMasterKey(masterKey) {
    const source = masterKey ?? process.env.TSN_SETTLEMENT_TOKEN_MASTER_KEY;
    if (!source) {
        throw new Error("TSN_SETTLEMENT_TOKEN_MASTER_KEY is required for settlement-token encryption");
    }
    if (Buffer.isBuffer(source) || source instanceof Uint8Array)
        return Buffer.from(source);
    const trimmed = source.trim();
    if (/^[0-9a-f]{64}$/i.test(trimmed))
        return Buffer.from(trimmed, "hex");
    try {
        const decoded = Buffer.from(trimmed, "base64");
        if (decoded.length >= 32)
            return decoded;
    }
    catch {
        // fall through to hash-based normalization
    }
    return Buffer.from(settlementSha256Hex(trimmed), "hex");
}
function hmac(key, value) {
    return createHmac("sha256", key).update(value).digest();
}
function deriveKeys(params) {
    const master = normalizeMasterKey(params.masterKey);
    const prk = hmac(master, Buffer.from(`tsn-settlement:${params.transferId}:${params.salt}`, "utf8"));
    const encKey = hmac(prk, `enc:${params.authorizedCrankerDnaHash}`);
    const macKey = hmac(prk, `mac:${params.authorizedCrankerDnaHash}`);
    return { encKey, macKey };
}
function streamXor(input, key, nonce) {
    const output = Buffer.alloc(input.length);
    let offset = 0;
    let counter = 0;
    while (offset < input.length) {
        const counterBuffer = Buffer.alloc(4);
        counterBuffer.writeUInt32BE(counter, 0);
        const block = hmac(key, Buffer.concat([nonce, counterBuffer]));
        for (let index = 0; index < block.length && offset < input.length; index += 1, offset += 1) {
            output[offset] = input[offset] ^ block[index];
        }
        counter += 1;
    }
    return output;
}
export function createEncryptedSettlementToken(params) {
    const plaintext = {
        transferId: params.transferId,
        recipientHash: params.recipientHash,
        tokenMintAddress: params.tokenMintAddress,
        amount: params.amount,
        epoch: params.epoch,
        nonce: base64UrlEncode(randomBytes(24)),
        issuedAt: params.issuedAt ?? new Date().toISOString(),
    };
    const salt = base64UrlEncode(randomBytes(16));
    const nonce = randomBytes(24);
    const authorizedCrankerDnaHash = params.authorizedCrankerDnaHash ?? crankerDnaHash(process.env.TSN_CRANKER_DNA ?? "trustlink-authorized-cranker");
    const aad = canonicalJson({
        transferId: params.transferId,
        commitmentHash: settlementTokenCommitmentHash(plaintext),
        epoch: params.epoch,
        authorizedCrankerDnaHash,
    });
    const { encKey, macKey } = deriveKeys({
        masterKey: params.masterKey,
        transferId: params.transferId,
        salt,
        authorizedCrankerDnaHash,
    });
    const plaintextBytes = Buffer.from(canonicalJson(plaintext), "utf8");
    const ciphertext = streamXor(plaintextBytes, encKey, nonce);
    const tag = hmac(macKey, Buffer.concat([Buffer.from(aad, "utf8"), nonce, ciphertext]));
    const envelope = {
        version: TSN_SETTLEMENT_TOKEN_VERSION,
        algorithm: TSN_SETTLEMENT_TOKEN_ALGORITHM,
        salt,
        nonce: base64UrlEncode(nonce),
        aad: base64UrlEncode(Buffer.from(aad, "utf8")),
        aadHash: settlementSha256Hex(aad),
        authorizedCrankerDnaHash,
        ciphertext: base64UrlEncode(ciphertext),
        tag: base64UrlEncode(tag),
    };
    return {
        plaintext,
        encryptedSettlementToken: base64UrlEncode(Buffer.from(JSON.stringify(envelope), "utf8")),
        commitmentHash: settlementTokenCommitmentHash(plaintext),
    };
}
export function decodeEncryptedSettlementToken(value) {
    const parsed = JSON.parse(base64UrlDecode(value).toString("utf8"));
    if (parsed.version !== TSN_SETTLEMENT_TOKEN_VERSION || parsed.algorithm !== TSN_SETTLEMENT_TOKEN_ALGORITHM) {
        throw new Error("Unsupported TSN settlement token envelope");
    }
    return parsed;
}
export function decryptSettlementToken(params) {
    const envelope = decodeEncryptedSettlementToken(params.encryptedSettlementToken);
    const authorizedCrankerDnaHash = params.authorizedCrankerDnaHash ?? envelope.authorizedCrankerDnaHash;
    if (authorizedCrankerDnaHash !== envelope.authorizedCrankerDnaHash) {
        throw new Error("Cranker DNA is not authorized for this settlement token");
    }
    const { encKey, macKey } = deriveKeys({
        masterKey: params.masterKey,
        transferId: params.transferId,
        salt: envelope.salt,
        authorizedCrankerDnaHash,
    });
    const nonce = base64UrlDecode(envelope.nonce);
    const ciphertext = base64UrlDecode(envelope.ciphertext);
    const aad = base64UrlDecode(envelope.aad).toString("utf8");
    if (settlementSha256Hex(aad) !== envelope.aadHash) {
        throw new Error("Settlement token AAD hash mismatch");
    }
    const suppliedTag = base64UrlDecode(envelope.tag);
    const tag = hmac(macKey, Buffer.concat([Buffer.from(aad, "utf8"), nonce, ciphertext]));
    if (suppliedTag.length !== tag.length || !timingSafeEqual(suppliedTag, tag)) {
        throw new Error("Settlement token authentication failed");
    }
    const plaintext = JSON.parse(streamXor(ciphertext, encKey, nonce).toString("utf8"));
    if (plaintext.transferId !== params.transferId)
        throw new Error("Settlement token transfer ID mismatch");
    if (settlementTokenCommitmentHash(plaintext) !== params.commitmentHash) {
        throw new Error("Settlement token commitment mismatch");
    }
    return plaintext;
}
export function createOneTimeDecryptionToken(params) {
    const issuedAt = params.issuedAt ?? new Date().toISOString();
    const expiresAt = new Date(Date.parse(issuedAt) + (params.ttlMs ?? 10 * 60_000)).toISOString();
    const secret = base64UrlEncode(randomBytes(32));
    return {
        id: base64UrlEncode(randomBytes(16)),
        transferId: params.transferId,
        leaseId: params.leaseId,
        crankerPubkey: params.crankerPubkey,
        commitmentHash: params.commitmentHash,
        issuedAt,
        expiresAt,
        tokenHash: settlementSha256Hex(`${params.transferId}:${params.leaseId}:${params.crankerPubkey}:${params.commitmentHash}:${secret}`),
    };
}
export function currentTsnEpoch(epochMs = 60 * 60 * 1000) {
    return Math.floor(Date.now() / epochMs);
}
