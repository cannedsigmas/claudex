#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SANDBOX_DIR="$(dirname "$SCRIPT_DIR")"

IMAGE_NAME="claudex-sandbox:latest"
GHCR_IMAGE="ghcr.io/mng-dev-ai/claudex-sandbox:latest"

if [ "$1" = "--push" ]; then
    echo "Building and pushing to GHCR..."
    docker build -t "$IMAGE_NAME" -t "$GHCR_IMAGE" -f "$SCRIPT_DIR/Dockerfile" "$SANDBOX_DIR"
    docker push "$GHCR_IMAGE"
    echo "Done! Image pushed: $GHCR_IMAGE"
else
    echo "Building claudex-sandbox image..."
    docker build -t "$IMAGE_NAME" -f "$SCRIPT_DIR/Dockerfile" "$SANDBOX_DIR"
    echo "Done! Image built: $IMAGE_NAME"
    echo ""
    echo "To push to GHCR, run:"
    echo "  ./build.sh --push"
fi

echo "Creating docker network (if not exists)..."
docker network create claudex-sandbox-net 2>/dev/null || true

echo ""
echo "To test the image, run:"
echo "  docker run -it --rm $IMAGE_NAME"
