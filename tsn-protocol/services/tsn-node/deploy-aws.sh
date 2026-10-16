#!/usr/bin/env bash
set -euo pipefail

# Run locally from WSL. This uploads the already-reviewed .env and rebuilds the
# pinned TSN Node image on the AWS host. Secrets are never printed.
: "${TSN_AWS_HOST:?Set TSN_AWS_HOST, for example ubuntu@51.21.218.67}"
: "${TSN_AWS_KEY:?Set TSN_AWS_KEY to your SSH private-key path}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ROOT}/.env"
REMOTE_DIR="/home/ubuntu/trustlink-pay/tsn-protocol/services/tsn-node"

test -f "${ENV_FILE}" || { echo "Missing ${ENV_FILE}" >&2; exit 1; }
required=(TSN_RECEIVER_NODE_API_KEY TSN_NODE_VERIFICATION_SIGNING_KEY TINS_LOOKUP_SECRET TSN_THRESHOLD_NONCE_SIGNING_KEY TSN_SETTLEMENT_AUTHORIZATION_SIGNING_KEY TSN_ROUTE_ATTESTATION_SIGNING_KEY TSN_NODE_CLAIM_SLOT_HMAC_SECRET TSN_PROGRAM_ID TSN_RECEIVER_URL)
for key in "${required[@]}"; do
  value="$(awk -F= -v k="${key}" '$1==k {sub(/^[^=]*=/,""); print; exit}' "${ENV_FILE}")"
  [[ -n "${value}" && "${value}" != *replace-with* && "${value}" != *your_* ]] || { echo "Missing or placeholder: ${key}" >&2; exit 1; }
done
rpc_url="$(awk -F= '$1=="TSN_RPC_URL" {preferred=substr($0,index($0,"=")+1)} $1=="TSN_RPC_GATEWAY_URL" {legacy=substr($0,index($0,"=")+1)} END {print preferred != "" ? preferred : legacy}' "${ENV_FILE}")"
[[ -n "${rpc_url}" && "${rpc_url}" != *replace-with* && "${rpc_url}" != *your_* ]] || { echo "Missing or placeholder: TSN_RPC_URL (or legacy TSN_RPC_GATEWAY_URL)" >&2; exit 1; }

scp -i "${TSN_AWS_KEY}" "${ENV_FILE}" "${TSN_AWS_HOST}:/home/ubuntu/tsn-node.env"
ssh -i "${TSN_AWS_KEY}" "${TSN_AWS_HOST}" bash -s -- "${REMOTE_DIR}" <<'REMOTE'
set -euo pipefail
REMOTE_DIR="$1"
chmod 600 /home/ubuntu/tsn-node.env
cd "${REMOTE_DIR}"
git pull --ff-only
docker build -t tsn-node:prod .
docker rm -f tsn-node 2>/dev/null || true
docker run -d --name tsn-node --restart unless-stopped --env-file /home/ubuntu/tsn-node.env -p 127.0.0.1:8000:8000 tsn-node:prod
docker ps --filter name=tsn-node
docker logs --tail 40 tsn-node
REMOTE
