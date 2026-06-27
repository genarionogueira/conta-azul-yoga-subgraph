# Conta Azul Yoga Subgraph — Makefile
# Follows AVCD conventions: make dev / make dev-down / make pull-secrets

.DEFAULT_GOAL := help

COMPOSE ?= docker compose
COMPOSE_ENV_FILE ?= .env.local
COMPOSE_BASE = -f compose.yaml -f compose.dev.yaml
COMPOSE_LOCAL = $(COMPOSE_BASE) -f compose.override.local.yaml
GRAPHQL_PORT ?= 4000
WORKER_PORT ?= 8010
DEV_HEALTH_RETRIES ?= 15
DEV_HEALTH_INTERVAL ?= 2

INFISICAL_API_URL ?= https://secrets.avcd.ai/api
INFISICAL_PROJECT_ID ?= 85a92fa7-85df-4343-bcbd-9ddd88ae656d
INFISICAL_SECRET_PATH ?= /conta-azul-yoga-subgraph
INFISICAL_ENV ?= dev
INFISICAL_PUSH_FILE ?= .env.development
INFISICAL_PULL_FILE ?= .env.development
INFISICAL_CREDENTIALS_FILE ?= ../infisical/.env
INFISICAL_SECRET_KEYS_FILE ?= config/infisical-secret-keys.list

.PHONY: help dev dev-down dev-logs down logs compose-config test test-unit test-e2e test-e2e-auth build generate-types print-schema sync-auth test-compose-worker local-mongo \
	infisical-check pull-secrets upload-secrets validate-secrets bootstrap-deploy-secrets set-github-env

help:
	@echo "Conta Azul Yoga Subgraph — Local Development Commands:"
	@echo ""
	@echo "  make dev             Start yoga + avcd-worker + Redis + Mongo; open Compass"
	@echo "                       compose.yaml + compose.dev.yaml + compose.override.local.yaml"
	@echo "                       GraphQL: http://localhost:$(GRAPHQL_PORT)/graphql"
	@echo "                       Worker:  http://localhost:$(WORKER_PORT)/health"
	@echo "                       Connect: http://localhost:$(GRAPHQL_PORT)/connect"
	@echo "  make dev-down        Stop yoga stack (same as make down)"
	@echo "  make dev-logs        Tail yoga-subgraph + worker logs"
	@echo "  make local-mongo     Start local MongoDB and open conta_azul in Compass"
	@echo "                       Host: 127.0.0.1:\$$MONGO_LOCAL_PORT (default 27018)"
	@echo "  make compose-config  Print merged compose config (local stack)"
	@echo "  make down            Stop the subgraph stack (Redis tokens kept in volume)"
	@echo "  make test            Run unit tests"
	@echo "  make test-unit       Run unit tests"
	@echo "  make test-e2e        Run containerized E2E tests (auth disabled)"
	@echo "  make test-e2e-auth   Run Keycloak/JWT auth E2E tests"
	@echo "  make sync-auth       Fetch DEV_AUTH_BEARER via scripts/sync-dev-auth.sh"
	@echo "  make build           Build Docker image"
	@echo "  make print-schema    Export assembled GraphQL SDL artifact"
	@echo "  make generate-types  Generate OpenAPI TypeScript types"
	@echo ""
	@echo "Infisical (deploy secrets — config/infisical-secret-keys.list):"
	@echo "  make pull-secrets           Export Infisical → $(INFISICAL_PULL_FILE)"
	@echo "  make upload-secrets         Upload $(INFISICAL_PUSH_FILE) → Infisical ($(INFISICAL_ENV))"
	@echo "  make validate-secrets       Verify required secrets exist in Infisical"
	@echo "  make bootstrap-deploy-secrets Build $(INFISICAL_PUSH_FILE) from .env.local + managed Valkey (db 2)"
	@echo "  make set-github-env         Push config/github-env.local vars to GitHub development environment"

dev:
	@test -f $(COMPOSE_ENV_FILE) || (echo "❌ Copy config/local-env.example → $(COMPOSE_ENV_FILE) and fill values" && exit 1)
	@test -f compose.override.local.yaml || (echo "❌ Copy compose.override.local.example.yaml → compose.override.local.yaml" && exit 1)
	@set -a; . ./$(COMPOSE_ENV_FILE); set +a; \
	  test -n "$$CONTA_AZUL_CLIENT_ID" && test -n "$$CONTA_AZUL_CLIENT_SECRET" || \
	  (echo "❌ Set CONTA_AZUL_CLIENT_ID and CONTA_AZUL_CLIENT_SECRET in $(COMPOSE_ENV_FILE)" && exit 1); \
	  WP="$${WORKER_PORT:-$(WORKER_PORT)}"; \
	  GP="$${PORT:-$(GRAPHQL_PORT)}"; \
	  if lsof -nP -iTCP:"$$WP" -sTCP:LISTEN >/dev/null 2>&1; then \
	    if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'avcd-worker-worker-1'; then \
	      echo "Stopping standalone avcd-worker on port $$WP (use yoga bundle instead)..."; \
	      (cd ../avcd-worker && $(COMPOSE) -f docker-compose.yml down) || exit 1; \
	    elif docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null | grep -q "conta-azul-yoga-subgraph-worker-1.*$$WP"; then \
	      echo "Bundled worker already running on port $$WP — continuing..."; \
	    else \
	      echo "⚠️  Port $$WP is in use by another process."; \
	      echo "   Standalone worker: cd ../avcd-worker && make dev-down"; \
	      echo "   Or set WORKER_PORT in $(COMPOSE_ENV_FILE) to a free port."; \
	      exit 1; \
	    fi; \
	  fi
	@echo "Starting yoga-subgraph, avcd-worker, Redis, and Mongo..."
	@set -a; . ./$(COMPOSE_ENV_FILE); set +a; \
	  if [ -z "$$CONTA_AZUL_SERVICE_JWT" ] && [ -n "$$JWT_SECRET" ]; then \
	    export CONTA_AZUL_SERVICE_JWT=$$(node scripts/generate-worker-jwt.mjs); \
	    echo "ℹ️  Generated CONTA_AZUL_SERVICE_JWT for worker (add to $(COMPOSE_ENV_FILE) to persist)"; \
	  elif [ -z "$$CONTA_AZUL_SERVICE_JWT" ]; then \
	    echo "⚠️  CONTA_AZUL_SERVICE_JWT unset — worker reconcile/cleanup GraphQL will fail until set"; \
	  fi; \
	  $(COMPOSE) --env-file $(COMPOSE_ENV_FILE) $(COMPOSE_LOCAL) up --build -d --remove-orphans
	@chmod +x scripts/local-mongo-compass.sh
	@MONGO_SKIP_UP=1 COMPASS_SOFT_FAIL=1 ./scripts/local-mongo-compass.sh
	@set -a; . ./$(COMPOSE_ENV_FILE); set +a; \
	  WP="$${WORKER_PORT:-$(WORKER_PORT)}"; \
	  GP="$${PORT:-$(GRAPHQL_PORT)}"; \
	  echo ""; \
	  echo "Waiting for yoga-subgraph (http://localhost:$$GP/health)..."; \
	  for i in $$(seq 1 $(DEV_HEALTH_RETRIES)); do \
	    if curl -sf "http://localhost:$$GP/health" >/dev/null 2>&1; then \
	      echo "✓ yoga-subgraph is healthy"; break; \
	    fi; \
	    if [ $$i -eq $(DEV_HEALTH_RETRIES) ]; then \
	      echo "✗ yoga-subgraph failed to become healthy"; \
	      $(COMPOSE) --env-file $(COMPOSE_ENV_FILE) $(COMPOSE_LOCAL) logs --tail 30 yoga-subgraph worker; \
	      exit 1; \
	    fi; \
	    sleep $(DEV_HEALTH_INTERVAL); \
	  done; \
	  echo "Waiting for avcd-worker (http://localhost:$$WP/health)..."; \
	  for i in $$(seq 1 $(DEV_HEALTH_RETRIES)); do \
	    if curl -sf "http://localhost:$$WP/health" >/dev/null 2>&1; then \
	      echo "✓ avcd-worker is healthy"; break; \
	    fi; \
	    if [ $$i -eq $(DEV_HEALTH_RETRIES) ]; then \
	      echo "✗ avcd-worker failed to become healthy"; \
	      echo "   Set CONTA_AZUL_SERVICE_JWT in $(COMPOSE_ENV_FILE) (HS256, sub=avcd-worker) if worker cannot reach yoga GraphQL."; \
	      $(COMPOSE) --env-file $(COMPOSE_ENV_FILE) $(COMPOSE_LOCAL) logs --tail 30 worker; \
	      exit 1; \
	    fi; \
	    sleep $(DEV_HEALTH_INTERVAL); \
	  done; \
	  echo ""; \
	  echo "GraphQL:  http://localhost:$$GP/graphql"; \
	  echo "Connect:  http://localhost:$$GP/connect"; \
	  echo "Worker:   http://localhost:$$WP/health"; \
	  echo "Reconcile: curl -X POST http://localhost:$$WP/internal/reconcile-once"; \
	  echo ""; \
	  echo "Logs: make dev-logs | Stop: make dev-down"

dev-down: down

dev-logs: logs

local-mongo:
	@chmod +x scripts/local-mongo-compass.sh
	@./scripts/local-mongo-compass.sh

down:
	@$(COMPOSE) --env-file $(COMPOSE_ENV_FILE) $(COMPOSE_LOCAL) down 2>/dev/null || $(COMPOSE) down

logs:
	@$(COMPOSE) --env-file $(COMPOSE_ENV_FILE) $(COMPOSE_LOCAL) logs -f yoga-subgraph worker 2>/dev/null || $(COMPOSE) logs -f yoga-subgraph worker

test-compose-worker:
	@test -f $(COMPOSE_ENV_FILE) || (echo "❌ Copy config/local-env.example → $(COMPOSE_ENV_FILE) and fill values" && exit 1)
	@test -f compose.override.local.yaml || (echo "❌ Copy compose.override.local.example.yaml → compose.override.local.yaml" && exit 1)
	@$(COMPOSE) --env-file $(COMPOSE_ENV_FILE) $(COMPOSE_LOCAL) config | grep -q 'worker:'

compose-config:
	@test -f $(COMPOSE_ENV_FILE) || (echo "❌ Copy config/local-env.example → $(COMPOSE_ENV_FILE) and fill values" && exit 1)
	@test -f compose.override.local.yaml || (echo "❌ Copy compose.override.local.example.yaml → compose.override.local.yaml" && exit 1)
	@$(COMPOSE) --env-file $(COMPOSE_ENV_FILE) $(COMPOSE_LOCAL) config

test:
	npm run test:unit

test-unit:
	npm run test:unit

test-e2e:
	npm run test:e2e

test-e2e-auth:
	npm run test:e2e:auth

sync-auth:
	@./scripts/sync-dev-auth.sh
	@echo "Copy DEV_AUTH_BEARER from .env.local for GraphQL Authorization header"

build:
	$(COMPOSE) -f compose.yaml build

print-schema:
	npm run print:schema

generate-types:
	npm run generate-types

infisical-check:
	@command -v infisical >/dev/null 2>&1 || (echo "❌ Infisical CLI not installed. Run: brew install infisical/get-cli/infisical" && exit 1)
	@test -f "$(INFISICAL_CREDENTIALS_FILE)" || test -n "$$INFISICAL_CLIENT_ID" || (echo "❌ Missing INFISICAL_CLIENT_ID/SECRET or $(INFISICAL_CREDENTIALS_FILE)" && exit 1)
	@echo "✓ Infisical CLI ready"

upload-secrets: infisical-check
	@chmod +x scripts/infisical-upload-env.sh
	@INFISICAL_API_URL="$(INFISICAL_API_URL)" \
	  INFISICAL_PROJECT_ID="$(INFISICAL_PROJECT_ID)" \
	  INFISICAL_SECRET_PATH="$(INFISICAL_SECRET_PATH)" \
	  INFISICAL_ENV="$(INFISICAL_ENV)" \
	  INFISICAL_PUSH_FILE="$(INFISICAL_PUSH_FILE)" \
	  INFISICAL_CREDENTIALS_FILE="$(INFISICAL_CREDENTIALS_FILE)" \
	  INFISICAL_SECRET_KEYS_FILE="$(INFISICAL_SECRET_KEYS_FILE)" \
	  ./scripts/infisical-upload-env.sh

pull-secrets: infisical-check
	@set -a; [ -f "$(INFISICAL_CREDENTIALS_FILE)" ] && . "$(INFISICAL_CREDENTIALS_FILE)"; set +a; \
	export INFISICAL_API_URL="$(INFISICAL_API_URL)"; \
	INFISICAL_TOKEN=$$(infisical login --method=universal-auth \
	  --client-id="$$INFISICAL_CLIENT_ID" --client-secret="$$INFISICAL_CLIENT_SECRET" \
	  --domain="$${INFISICAL_API_URL%/api}" --silent --plain); \
	infisical export --env="$(INFISICAL_ENV)" --path="$(INFISICAL_SECRET_PATH)" \
	  --projectId="$(INFISICAL_PROJECT_ID)" --token="$$INFISICAL_TOKEN" \
	  --format=dotenv --domain="$${INFISICAL_API_URL%/api}" --silent \
	  > "$(INFISICAL_PULL_FILE)"; \
	test -s "$(INFISICAL_PULL_FILE)" || (echo "❌ Infisical export empty" && exit 1); \
	echo "✓ Exported → $(INFISICAL_PULL_FILE)"

validate-secrets: infisical-check
	@chmod +x scripts/validate-infisical-deploy.sh
	@INFISICAL_API_URL="$(INFISICAL_API_URL)" \
	  INFISICAL_PROJECT_ID="$(INFISICAL_PROJECT_ID)" \
	  INFISICAL_SECRET_PATH="$(INFISICAL_SECRET_PATH)" \
	  INFISICAL_ENV="$(INFISICAL_ENV)" \
	  INFISICAL_CREDENTIALS_FILE="$(INFISICAL_CREDENTIALS_FILE)" \
	  INFISICAL_SECRET_KEYS_FILE="$(INFISICAL_SECRET_KEYS_FILE)" \
	  ./scripts/validate-infisical-deploy.sh

bootstrap-deploy-secrets: infisical-check
	@chmod +x scripts/bootstrap-deploy-secrets.sh
	@./scripts/bootstrap-deploy-secrets.sh

set-github-env:
	@chmod +x scripts/set-github-env.sh
	@test -f config/github-env.local || (echo "❌ cp config/github-env.example → config/github-env.local and fill values" && exit 1)
	@set -a; . ./config/github-env.local; set +a; ./scripts/set-github-env.sh development
