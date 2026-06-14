.PHONY: help dev down logs test test-unit test-e2e build generate-types print-schema

help:
	@echo " make dev             Start the subgraph (Docker Compose)"
	@echo " make down            Stop the subgraph"
	@echo " make logs            Tail container logs"
	@echo " make test            Run unit tests"
	@echo " make test-unit       Run unit tests"
	@echo " make test-e2e        Run containerized E2E tests"
	@echo " make build           Build Docker image"
	@echo " make print-schema    Export assembled GraphQL SDL artifact"
	@echo " make generate-types  Generate OpenAPI TypeScript types"

dev:
	docker compose up --build -d

down:
	docker compose down

logs:
	docker compose logs -f yoga-subgraph

test:
	npm run test:unit

test-unit:
	npm run test:unit

test-e2e:
	npm run test:e2e

build:
	docker compose build

print-schema:
	npm run print:schema

generate-types:
	npm run generate-types
