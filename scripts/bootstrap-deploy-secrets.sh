#!/usr/bin/env bash
# Build .env.infisical from local .env + managed Valkey REDIS_URI (db index 2).
# Does not commit secrets — output is gitignored (.env.infisical).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${ENV_FILE:-.env}"
OUT_FILE="${OUT_FILE:-.env.infisical}"
REDIS_DB_INDEX="${REDIS_DB_INDEX:-2}"
INFISICAL_CREDENTIALS_FILE="${INFISICAL_CREDENTIALS_FILE:-../infisical/.env}"
INFISICAL_API_URL="${INFISICAL_API_URL:-https://secrets.avcd.ai/api}"

[[ -f "$ENV_FILE" ]] || { echo "❌ Missing $ENV_FILE" >&2; exit 1; }

if [[ -f "$INFISICAL_CREDENTIALS_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$INFISICAL_CREDENTIALS_FILE"
  set +a
fi

: "${INFISICAL_CLIENT_ID:?Set INFISICAL_CLIENT_ID}"
: "${INFISICAL_CLIENT_SECRET:?Set INFISICAL_CLIENT_SECRET}"

DOMAIN="${INFISICAL_API_URL%/api}"
TOKEN="$(infisical login --method=universal-auth \
  --client-id="$INFISICAL_CLIENT_ID" \
  --client-secret="$INFISICAL_CLIENT_SECRET" \
  --domain="$DOMAIN" \
  --silent --plain)"

AI_PROJECT_ID="$(curl -sS -H "Authorization: Bearer $TOKEN" "${DOMAIN}/api/v1/projects" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(next(p['id'] for p in d['projects'] if p['slug']=='avcd-ai'))")"

AI_EXPORT="$(infisical export --env=dev --path=/ai --projectId="$AI_PROJECT_ID" \
  --token="$TOKEN" --format=dotenv --domain="$DOMAIN" --silent)"

python3 - "$ENV_FILE" "$OUT_FILE" "$AI_EXPORT" "$REDIS_DB_INDEX" <<'PY'
import os
import secrets
import sys
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, urlparse, urlunparse

env_file = Path(sys.argv[1])
out_file = Path(sys.argv[2])
ai_export = sys.argv[3]
redis_db_index = sys.argv[4]


def parse_dotenv(text: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        if "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip()
        val = val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
            val = val[1:-1]
        values[key] = val
    return values


def valid_deploy_secret(value: str, *, max_len: int = 512) -> bool:
    if not value or len(value) > max_len:
        return False
    if any(ch in value for ch in "\n\r\t"):
        return False
    return True


def redis_url_from_admin_uri(export_text: str, db_index: str) -> str:
    redis_uri = ""
    for line in export_text.splitlines():
        if line.startswith("REDIS_URI="):
            redis_uri = line.split("=", 1)[1].strip().strip('"').strip("'")
            break
    if not redis_uri:
        raise SystemExit("❌ REDIS_URI not found in avcd-ai Infisical export (/ai dev)")
    parsed = urlparse(redis_uri)
    if not parsed.scheme or not parsed.netloc:
        raise SystemExit("❌ REDIS_URI from Infisical is not a valid URL")
    return urlunparse(parsed._replace(path=f"/{db_index}"))


DEV_MONGO_SRV_SEED_HOST = "avcd-dev-mongo-1b007f0-e60b28c6.mongo.ondigitalocean.com"


def mongodb_url_for_deploy(mongo_uri: str, database: str) -> str:
    split = urlsplit(mongo_uri)
    if not split.scheme or not split.netloc:
        raise SystemExit("❌ Mongo connection URL is invalid")
    if split.scheme == "mongodb+srv":
        return urlunsplit((split.scheme, split.netloc, f"/{database}", split.query, split.fragment))
    if split.scheme != "mongodb":
        raise SystemExit(f"❌ Unsupported Mongo URL scheme: {split.scheme}")

    userinfo = split.username or ""
    if split.password:
        userinfo = f"{split.username}:{split.password}"
    host = DEV_MONGO_SRV_SEED_HOST
    netloc = f"{userinfo}@{host}" if userinfo else host
    query = split.query or "authSource=admin&tls=true"
    return urlunsplit(("mongodb+srv", netloc, f"/{database}", query, split.fragment))


def mongodb_url_from_ai_export(export_text: str, database: str = "conta_azul_yoga") -> str:
    mongo_uri = ""
    for line in export_text.splitlines():
        if line.startswith("MONGO_URI="):
            mongo_uri = line.split("=", 1)[1].strip().strip('"').strip("'")
            break
    if not mongo_uri:
        raise SystemExit("❌ MONGO_URI not found in avcd-ai Infisical export (/ai dev)")
    return mongodb_url_for_deploy(mongo_uri, database)


local = parse_dotenv(env_file.read_text(encoding="utf-8"))
redis_url = redis_url_from_admin_uri(ai_export, redis_db_index)

mongodb_url = local.get("MONGODB_URL", "")
if not valid_deploy_secret(mongodb_url):
    mongodb_url = mongodb_url_from_ai_export(ai_export)
else:
    split_mongo = urlsplit(mongodb_url)
    db_name = split_mongo.path.strip("/") or "conta_azul_yoga"
    mongodb_url = mongodb_url_for_deploy(mongodb_url, db_name)

jwt_secret = local.get("JWT_SECRET", "")
if not valid_deploy_secret(jwt_secret, max_len=128):
    jwt_secret = secrets.token_hex(32)

client_id = local.get("CONTA_AZUL_CLIENT_ID", "")
client_secret = local.get("CONTA_AZUL_CLIENT_SECRET", "")
if not client_id:
    raise SystemExit(f"❌ CONTA_AZUL_CLIENT_ID missing in {env_file}")
if not client_secret:
    raise SystemExit(f"❌ CONTA_AZUL_CLIENT_SECRET missing in {env_file}")

lines = [
    f"REDIS_URL={redis_url}",
    f"MONGODB_URL={mongodb_url}",
    f"JWT_SECRET={jwt_secret}",
    f"CONTA_AZUL_CLIENT_ID={client_id}",
    f"CONTA_AZUL_CLIENT_SECRET={client_secret}",
]

out_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
os.chmod(out_file, 0o600)

if not urlparse(redis_url).netloc:
    raise SystemExit("❌ Computed REDIS_URL is invalid")
PY

echo "✓ Wrote ${OUT_FILE} (Valkey db index ${REDIS_DB_INDEX})"
echo "  Next: make upload-secrets && make validate-secrets"
