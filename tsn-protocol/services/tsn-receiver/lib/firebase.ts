/** Stable firebase facade and production composition; implementations live in storage/firebase. */
import { getApps } from "firebase-admin/app";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { localDb } from "./local-firestore";
import { credential } from "./storage/firebase/credential";
import { localMode, databaseURL } from "./storage/firebase/configuration";

const app = localMode ? null : (getApps()[0] ?? initializeApp({
  credential: credential({ environment: process.env }),
  ...(databaseURL ? { databaseURL } : {}),
}));
const db: any = localMode ? localDb : getFirestore(app!);
const workCollection = db.collection(process.env.TSN_RECEIVER_COLLECTION ?? "tsn_receiver_work");

const dependencies = {
  environment: process.env,
};

export { app };

export { db };

export { workCollection };
