import type { initializeApp } from "firebase-admin/app";

export interface Dependencies {
  environment: NodeJS.ProcessEnv;
  clock: DateConstructor;
  app: ReturnType<typeof initializeApp> | null;
}
