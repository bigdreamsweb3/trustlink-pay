

export const localMode = process.env.TSN_RECEIVER_STORE === "file" && process.env.TSN_ALLOW_LOCAL_JSON_STORE === "true";
export const databaseURL = process.env.FIREBASE_DATABASE_URL?.trim();
