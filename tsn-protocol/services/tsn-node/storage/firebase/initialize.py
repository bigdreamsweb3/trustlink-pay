from __future__ import annotations
import glob
import os
from core.configuration import FIREBASE_COLLECTION

def __init__(self):
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
    except ImportError as exc:
        raise RuntimeError(
            "firebase-admin is required for TSN mempool storage. "
            "Run: pip install -r requirements.txt"
        ) from exc

    if not firebase_admin._apps:
        project_id = os.environ.get("FIREBASE_PROJECT_ID")
        client_email = os.environ.get("FIREBASE_CLIENT_EMAIL")
        private_key = os.environ.get("FIREBASE_PRIVATE_KEY", "").replace("\\n", "\n")
        credentials_path = (
            os.environ.get("FIREBASE_CREDENTIALS")
            or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        )
        if not credentials_path:
            credential_files = glob.glob(os.path.join(".fb_creds", "*.json"))
            credentials_path = credential_files[0] if credential_files else None

        if credentials_path:
            firebase_admin.initialize_app(credentials.Certificate(credentials_path))
        elif project_id and client_email and private_key:
            firebase_admin.initialize_app(
                credentials.Certificate({
                    "type": "service_account",
                    "project_id": project_id,
                    "client_email": client_email,
                    "private_key": private_key,
                    "token_uri": "https://oauth2.googleapis.com/token",
                })
            )
        else:
            raise RuntimeError(
                "Firebase mempool storage requires FIREBASE_PROJECT_ID, "
                "FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in .env, "
                "or a Firebase service-account JSON file in .fb_creds"
            )

    self.firestore = firestore
    self.db = firestore.client()
    self.root = self.db.collection(FIREBASE_COLLECTION)
