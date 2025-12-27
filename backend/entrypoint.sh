#!/bin/sh

MODE=${1:-${SERVICE_MODE:-api}}

ensure_docker_network() {
    if [ -S /var/run/docker.sock ]; then
        NETWORK_NAME="${DOCKER_NETWORK:-claudex-sandbox-net}"
        if ! docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
            echo "Creating Docker network: $NETWORK_NAME"
            docker network create "$NETWORK_NAME" 2>/dev/null || true
        fi
    fi
}

pull_sandbox_image() {
    if [ -S /var/run/docker.sock ]; then
        SANDBOX_IMAGE="${DOCKER_IMAGE:-ghcr.io/mng-dev-ai/claudex-sandbox:latest}"
        echo "Pulling sandbox image: $SANDBOX_IMAGE"
        docker pull "$SANDBOX_IMAGE" || echo "Warning: Failed to pull sandbox image, using cached version if available"
    fi
}

if [ "$MODE" = "migrate" ]; then
    echo "Running database migrations..."
    cd /app && python migrate.py
    exit 0
fi

if [ "$MODE" = "api" ]; then
    echo "Running database migrations..."
    cd /app && python migrate.py

    echo "Seeding data..."
    cd /app && python seed_data.py

    ensure_docker_network
    pull_sandbox_image

    echo "Starting API server..."
    if [ -S /var/run/docker.sock ]; then
        echo "Docker socket detected, running as current user for Docker access..."
        exec sh -c "ulimit -s 65536 && exec granian --interface asgi app.main:app --host 0.0.0.0 --port ${PORT:-8080} --workers $(nproc) --runtime-threads 32 --runtime-mode mt"
    else
        exec gosu appuser sh -c "ulimit -s 65536 && exec granian --interface asgi app.main:app --host 0.0.0.0 --port ${PORT:-8080} --workers $(nproc) --runtime-threads 32 --runtime-mode mt"
    fi
fi

if [ "$MODE" = "celery-worker" ]; then
    echo "Starting Celery worker..."
    CELERY_CONCURRENCY=${CELERY_CONCURRENCY:-25}
    echo "Celery concurrency set to: $CELERY_CONCURRENCY"
    ensure_docker_network
    pull_sandbox_image
    if [ -S /var/run/docker.sock ]; then
        echo "Docker socket detected, running as current user for Docker access..."
        exec celery -A app.core.celery worker --pool=threads --concurrency=$CELERY_CONCURRENCY --loglevel=${LOG_LEVEL:-DEBUG}
    else
        exec gosu appuser celery -A app.core.celery worker --pool=threads --concurrency=$CELERY_CONCURRENCY --loglevel=${LOG_LEVEL:-DEBUG}
    fi
fi

if [ "$MODE" = "celery-beat" ]; then
    echo "Starting Celery Beat..."
    exec gosu appuser celery -A app.core.celery beat --schedule=/tmp/celerybeat-schedule --loglevel=${LOG_LEVEL:-DEBUG}
fi

echo "Unknown mode: $MODE"
echo "Usage: $0 {api|celery-worker|celery-beat|migrate}"
exit 1
