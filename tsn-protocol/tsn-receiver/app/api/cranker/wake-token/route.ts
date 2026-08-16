import { getAuth } from "firebase-admin/auth";
import { NextRequest, NextResponse } from "next/server";
import { requireService } from "../../../../lib/auth";
import { app } from "../../../../lib/firebase";

export const runtime = "nodejs";

/**
 * Exchanges a short-lived Cranker service request for a Firebase ID token.
 * The token is used only to read the payload-free Realtime Database wake
 * marker. No work item, route, amount, or recipient data is returned here.
 */
export async function POST(request: NextRequest) {
  try {
    requireService(request, "cranker");
    const body = await request.json() as { crankerId?: string };
    const crankerId = body.crankerId?.trim();
    if (!crankerId || crankerId.length > 128) {
      return NextResponse.json({ error: "crankerId is required" }, { status: 400 });
    }

    const webApiKey = process.env.FIREBASE_WEB_API_KEY?.trim();
    if (!webApiKey) {
      return NextResponse.json(
        { error: "Realtime Database wake authentication is not configured" },
        { status: 503 },
      );
    }

    const customToken = await getAuth(app).createCustomToken(crankerId, {
      role: "cranker",
      service: "tsn-cranker-wake",
    });
    const exchange = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(webApiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: customToken, returnSecureToken: true }),
      },
    );
    if (!exchange.ok) {
      const detail = (await exchange.text()).slice(0, 300);
      console.error("Firebase Cranker wake token exchange failed", { status: exchange.status, detail });
      return NextResponse.json({ error: "Realtime Database wake authentication failed" }, { status: 503 });
    }

    const token = await exchange.json() as { idToken?: string; expiresIn?: string };
    if (!token.idToken) {
      return NextResponse.json({ error: "Realtime Database wake token was empty" }, { status: 503 });
    }
    return NextResponse.json({ idToken: token.idToken, expiresIn: token.expiresIn ?? "3600" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json(
      { error: message === "UNAUTHORIZED_SERVICE" ? message : "Realtime Database wake token unavailable" },
      { status: message === "UNAUTHORIZED_SERVICE" ? 401 : 503 },
    );
  }
}
