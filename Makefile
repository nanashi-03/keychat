-include .env

.PHONY: up down restart status logs clean db-shell redis-shell Help

# Default target when running just 'make'
help:
	@echo "========================================================================"
	@echo "                   KEYCHAT INFRASTRUCTURE MANAGEMENT                    "
	@echo "========================================================================"
	@echo "Available commands:"
	@echo "  make up          - Spin up state storage instances (Postgres, Redis, Backend, and Frontend)"
	@echo "  make down        - Halt all running storage containers safely"
	@echo "  make restart     - Hard restart all state infrastructure services"
	@echo "  make status      - Display the live status and health of the infrastructure"
	@echo "  make logs        - Follow and tail logs for all core storage engines"
	@echo "  make db-shell    - Open an interactive terminal directly inside PostgreSQL"
	@echo "  make redis-shell - Open an interactive CLI inside the secure Redis engine"
	@echo "  make clean       - Destroy all containers and clear underlying persistent disk volumes"
	@echo "  make rebuild     - Deletes all the containers and rebuild them"
	@echo "========================================================================"

# Launch only the foundational database, cache, and object storage containers in detached mode
up:
	@echo "Initiating KeyChat database, cache, frontend, and backend..."
	podman compose up -d postgres redis backend
	@echo "Waiting for service container health status loops to resolve..."
	@podman compose ps

# Stop the running database, cache, and storage services
down:
	@echo "Stopping KeyChat infrastructure containers..."
	podman compose stop postgres redis backend

# Force a full bounce of the state containers
restart: down up

# Check runtime status and verify that health checks are passing
status:
	@echo "Auditing local network state maps and engine health metrics..."
	podman compose ps

# Follow container application outputs
logs:
	podman compose logs -f --tail=100 postgres redis backend

# Open direct interactive CLI to query the PostgreSQL system catalog metadata maps
db-shell:
	@echo "Entering interactive psql console environment..."
	podman compose exec postgres psql -U ${DB_USER} -d ${DB_NAME}

# Open direct interactive CLI to run operational cache checks using the cluster password
redis-shell:
	@echo "Connecting to protected Redis command console..."
	podman compose exec redis redis-cli -a ${REDIS_PASSWORD}

# Complete teardown. WARNING: This wipes out all database records and storage blobs
clean:
	@echo "WARNING: Purging all storage blocks and removing volumes from disk!"
	podman compose down -v
	@echo "Storage layout deep-cleaned."

# Rebuild all containers from scratch
rebuild: down clean up
	@echo "Rebuilding all containers from scratch..."
	podman compose up --build --no-cache -d redis postgres backend
