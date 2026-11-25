export const storage = process.env.TSN_RECEIVER_STORE === "file" && process.env.TSN_ALLOW_LOCAL_JSON_STORE === "true"
    ? "FILE"
    : "D1";
