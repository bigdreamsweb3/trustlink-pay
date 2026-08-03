import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function credential() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  return projectId && clientEmail && privateKey
    ? cert({ projectId, clientEmail, privateKey })
    : applicationDefault();
}

const app = getApps()[0] ?? initializeApp({ credential: credential() });
export const db = getFirestore(app);
export const workCollection = db.collection(process.env.TSN_RECEIVER_COLLECTION ?? "tsn_receiver_work");
