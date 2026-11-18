/** Request component: original validation, status mapping, privacy projection and errors are preserved. */
import type { getAuth } from "firebase-admin/auth";
import type { NextRequest, NextResponse } from "next/server";
import type { authenticateCrankerRequest } from "../../../../cranker-auth";
import type { app } from "../../../../firebase";

import type { Dependencies } from "./dependencies";

export async function POST(dependencies: Pick<Dependencies, "NextResponse" | "app" | "authenticateCrankerRequest" | "getAuth">, request: NextRequest) {
    try {
        const bodyText = await request.text();
        const crankerId = await dependencies.authenticateCrankerRequest(request, bodyText, "POST", "/api/cranker/wake-token");
        const body = JSON.parse(bodyText) as {
            crankerId?: string;
        };
        if (body.crankerId && body.crankerId !== crankerId)
            return dependencies.NextResponse.json({ error: "operator identity mismatch" }, { status: 403 });
        if (!crankerId || crankerId.length > 128) {
            return dependencies.NextResponse.json({ error: "crankerId is required" }, { status: 400 });
        }
        const webApiKey = process.env.FIREBASE_WEB_API_KEY?.trim();
        if (!webApiKey) {
            return dependencies.NextResponse.json({ error: "Realtime Database wake authentication is not configured" }, { status: 503 });
        }
        if (!dependencies.app) {
            return dependencies.NextResponse.json({ error: "Realtime Database wake authentication is unavailable with the local JSON store" }, { status: 503 });
        }
        const customToken = await dependencies.getAuth(dependencies.app).createCustomToken(crankerId, {
            role: "cranker",
            service: "tsn-cranker-wake",
        });
        const exchange = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(webApiKey)}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ token: customToken, returnSecureToken: true }),
        });
        if (!exchange.ok) {
            const detail = (await exchange.text()).slice(0, 300);
            console.error("Firebase Cranker wake token exchange failed", { status: exchange.status, detail });
            return dependencies.NextResponse.json({ error: "Realtime Database wake authentication failed" }, { status: 503 });
        }
        const token = await exchange.json() as {
            idToken?: string;
            expiresIn?: string;
        };
        if (!token.idToken) {
            return dependencies.NextResponse.json({ error: "Realtime Database wake token was empty" }, { status: 503 });
        }
        return dependencies.NextResponse.json({ idToken: token.idToken, expiresIn: token.expiresIn ?? "3600" });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "ERROR";
        return dependencies.NextResponse.json({ error: message.includes("CRANKER") ? message : "Realtime Database wake token unavailable" }, { status: message.includes("CRANKER") ? 401 : 503 });
    }
}
