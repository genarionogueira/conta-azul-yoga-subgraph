# Conta Azul Yoga Subgraph — Makefile
# Follows AVCD conventions: make dev / make dev-down / make pull-secrets

.DEFAULT_GOAL := help

COMPOSE ?= docker compose
COMPOSE_ENV_FILE ?= .env.local
COMPOSE_BASE = -f compose.yaml -f compose.dev.yaml
COMPOSE_LOCAL = $(COMPOSE_BASE) -f compose.override.local.yaml

INFISICAL_API_URL ?= https://secrets.avcd.ai/api
INFISICAL_PROJECT_ID ?= 85a92fa7-85df-4343-bcbd-9ddd88ae656d
INFISICAL_SECRET_PATH ?= /conta-azul-yoga-subgraph
INFISICAL_ENV ?= dev
INFISICAL_PUSH_FILE ?= .env.development
INFISICAL_PULL_FILE ?= .env.development
INFISICAL_CREDENTIALS_FILE ?= ../infisical/.env
INFISICAL_SECRET_KEYS_FILE ?= config/infisical-secret-keys.list

.PHONY: help dev down logs compose-config test test-unit test-e2e test-e2e-auth build generate-types print-schema sync-auth \
	infisical-check pull-secrets upload-secrets validate-secrets bootstrap-deploy-secrets set-github-env

help:
	@echo "Conta Azul Yoga Subgraph — Local Development Commands:"
	@echo ""
	@echo "  make dev             Start the subgraph (Docker Compose)"
	@echo "                       compose.yaml + compose.dev.yaml + compose.override.local.yaml"
	@echo "                       Secrets: .env.local | Zitadel auth always on"
	@echo "                       Connect UI: http://localhost:4000/connect"
	@echo "  make compose-config  Print merged compose config (local stack)"
	@echo "  make down            Stop the subgraph (Redis tokens kept in volume)"
	@echo "  make logs            Tail container logs"
	@echo "  make test            Run unit tests"
	@echo "  make test-unit       Run unit tests"
	@echo "  make test-e2e        Run containerized E2E tests (auth disabled)"
	@echo "  make test-e2e-auth   Run Keycloak/JWT auth E2E tests"
	@echo "  make sync-auth       Fetch DEV_AUTH_BEARER via conta-azul-service sync-dev-auth.sh"
	@echo "  make build           Build Docker image"
	@echo "  make print-schema    Export assembled GraphQL SDL artifact"
	@echo "  make generate-types  Generate OpenAPI TypeScript types"
	@echo ""
	@echo "Infisical (deploy secrets — config/infisical-secret-keys.list):"
	@echo "  make pull-secrets           Export Infisical → $(INFISICAL_PULL_FILE)"
	@echo "  make upload-secrets         Upload $(INFISICAL_PUSH_FILE) → Infisical ($(INFISICAL_ENV))"
	@echo "  make validate-secrets       Verify required secrets exist in Infisical"
	@echo "  make bootstrap-deploy-secrets Build $(INFISICAL_PUSH_FILE) from .env.local + managed Valkey (db 2)"
	@echo "  make set-github-env         Push GitHub development env vars (export vars first)"

dev:
	@test -f $(COMPOSE_ENV_FILE) || (echo "❌ Copy .env.example → $(COMPOSE_ENV_FILE) and fill values" && exit 1)
	@test -f compose.override.local.yaml || (echo "❌ Copy compose.override.local.example.yaml → compose.override.local.yaml" && exit 1)
	@set -a; . ./$(COMPOSE_ENV_FILE); set +a; \
	  test -n "$$CONTA_AZUL_CLIENT_ID" && test -n "$$CONTA_AZUL_CLIENT_SECRET" || \
	  (echo "❌ Set CONTA_AZUL_CLIENT_ID and CONTA_AZUL_CLIENT_SECRET in $(COMPOSE_ENV_FILE)" && exit 1)
	$(COMPOSE) --env-file $(COMPOSE_ENV_FILE) $(COMPOSE_LOCAL) up --build -d

down:
	@$(COMPOSE) --env-file $(COMPOSE_ENV_FILE) $(COMPOSE_LOCAL) down 2>/dev/null || $(COMPOSE) down

logs:
	@$(COMPOSE) --env-file $(COMPOSE_ENV_FILE) $(COMPOSE_LOCAL) logs -f yoga-subgraph 2>/dev/null || $(COMPOSE) logs -f yoga-subgraph

compose-config:
	@test -f $(COMPOSE_ENV_FILE) || (echo "❌ Copy .env.example → $(COMPOSE_ENV_FILE) and fill values" && exit 1)
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
	@../conta-azul-service/scripts/sync-dev-auth.sh
	@echo "Copy DEV_AUTH_BEARER from conta-azul-service/.env for GraphQL Authorization header"

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
	@./scripts/set-github-env.sh development
