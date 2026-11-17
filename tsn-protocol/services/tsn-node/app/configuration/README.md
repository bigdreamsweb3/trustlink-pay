# Supporting app configuration

`load_local_env` loads the service directory's `.env.local` followed by `.env`, using `os.environ.setdefault` for every accepted key. Inherited process variables retain priority, followed by `.env.local` and `.env`. Extraction preserves the original directory by resolving three parents from this package's function file. `clean_env` strips surrounding whitespace and quote characters from a supplied value.

`constants.py` preserves the supporting app's original defaults and resolves `MEMPOOL_FILE` against the process working directory at import time. `app.config` is the existing public interface, including the mutable `_store` handle used by supporting store functions. Active HTTP configuration is independently owned by the application; supporting defaults must not be substituted for it. No environment files, program identifiers or deployment settings are changed by this package.

Offline import checks should use the same service working directory as before extraction. Environment precedence and path resolution require isolated-process fixtures; do not print credential-bearing environment values during verification.
