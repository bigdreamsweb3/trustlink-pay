import { env } from "@/app/lib/env";
import type { AuthenticatedUser } from "@/app/types/auth";
import { isUserActiveSession } from "@/app/db/users";
import { signToken, verifyToken } from "@/app/utils/token";

interface AccessTokenPayload {
  sub: string;
  phoneNumber: string;
  sessionId: string;
  exp: number;
}

interface AuthChallengePayload {
  sub: string;
  phoneNumber: string;
  stage: "pin_setup" | "pin_verify";
  exp: number;
}

export function issueAccessToken(user: { id: string; phoneNumber: string; sessionId: string }) {
  const payload: AccessTokenPayload = {
    sub: user.id,
    phoneNumber: user.phoneNumber,
    sessionId: user.sessionId,
    exp: Math.floor(Date.now() / 1000) + env.ACCESS_TOKEN_TTL_MINUTES * 60,
  };

  // Will throw at runtime if SESSION_SECRET is not set (see env.ts proxy)
  return signToken(
    payload as unknown as Record<string, unknown>,
    env.SESSION_SECRET!,
  );
}

export function issueAuthChallengeToken(user: {
  id: string;
  phoneNumber: string;
  stage: "pin_setup" | "pin_verify";
}) {
  const payload: AuthChallengePayload = {
    sub: user.id,
    phoneNumber: user.phoneNumber,
    stage: user.stage,
    exp: Math.floor(Date.now() / 1000) + env.AUTH_CHALLENGE_TTL_MINUTES * 60,
  };

  // Will throw at runtime if SESSION_SECRET is not set (see env.ts proxy)
  return signToken(
    payload as unknown as Record<string, unknown>,
    env.SESSION_SECRET!,
  );
}

export function requireAuthChallengeToken(
  token: string,
  expectedStage?: "pin_setup" | "pin_verify",
) {
  // Will throw at runtime if SESSION_SECRET is not set (see env.ts proxy)
  const payload = verifyToken<AuthChallengePayload>(token, env.SESSION_SECRET!);

  if (!payload || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Invalid or expired auth challenge");
  }

  if (expectedStage && payload.stage !== expectedStage) {
    throw new Error("Invalid auth challenge stage");
  }

  return payload;
}

export async function requireAuthenticatedUser(request: Request): Promise<AuthenticatedUser> {
  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : null;

  if (!token) {
    throw new Error("Missing access token");
  }

  // Will throw at runtime if SESSION_SECRET is not set (see env.ts proxy)
  const payload = verifyToken<AccessTokenPayload>(token, env.SESSION_SECRET!);

  if (!payload || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Invalid or expired access token");
  }

  if (!payload.sessionId || !(await isUserActiveSession(payload.sub, payload.sessionId))) {
    throw new Error("Access token was replaced by a newer login");
  }

  return {
    id: payload.sub,
    phoneNumber: payload.phoneNumber,
  };
}
