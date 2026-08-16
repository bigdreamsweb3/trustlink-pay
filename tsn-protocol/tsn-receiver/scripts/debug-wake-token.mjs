import fs from 'node:fs';
import path from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function normalizePrivateKey(raw) {
    let value = raw.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1).trim();
    }
    value = value.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\r\\n/g, "\n").replace(/\\r/g, "\n").trim();
    if (value.startsWith('{')) {
        try {
            const parsed = JSON.parse(value);
            if (typeof parsed.private_key === 'string') value = parsed.private_key.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\r\\n/g, "\n").replace(/\\r/g, "\n").trim();
        } catch (e) { }
    }
    return value;
}

async function main() {
    try {
        const envPath = path.resolve('tsn-protocol/tsn-receiver/.env.local');
        const envText = fs.readFileSync(envPath, 'utf8');
        const env = Object.fromEntries(envText.split(/\r?\n/).filter(Boolean).map((line) => {
            const idx = line.indexOf('=');
            if (idx < 0) return [line, ''];
            const key = line.slice(0, idx);
            const val = line.slice(idx + 1);
            return [key, val];
        }));
        const projectId = env.FIREBASE_PROJECT_ID;
        const clientEmail = env.FIREBASE_CLIENT_EMAIL;
        const privateKeyRaw = env.FIREBASE_PRIVATE_KEY;
        const webApiKey = env.FIREBASE_WEB_API_KEY;
        if (!projectId || !clientEmail || !privateKeyRaw || !webApiKey) {
            console.error('Missing one of FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, FIREBASE_WEB_API_KEY');
            process.exit(1);
        }
        const privateKey = normalizePrivateKey(privateKeyRaw);
        const app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
        const auth = getAuth(app);
        const customToken = await auth.createCustomToken('debug-cranker', { role: 'cranker' });
        console.log('customToken created length=', customToken.length);
        const exchangeRes = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(webApiKey)}`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ token: customToken, returnSecureToken: true }),
            },
        );
        const text = await exchangeRes.text();
        console.log('exchange.status=', exchangeRes.status);
        console.log('exchange.body=', text);
        process.exit(0);
    } catch (err) {
        console.error('ERROR', err && err.stack ? err.stack : err);
        process.exit(1);
    }
}

main();
