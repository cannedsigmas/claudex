FROM python:3.13-slim

# Create a non-root user because claude-code causes permission issues when using bypassPermissions mode
# see https://github.com/anthropics/claude-code-sdk-python/issues/30
RUN groupadd -r appuser && useradd -r -g appuser -m -d /home/appuser appuser

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc libpq-dev curl git wget gnupg \
    chromium chromium-sandbox chromium-driver \
    fonts-liberation ca-certificates \
    gosu docker-cli && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code

# Install uv package manager
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

COPY requirements.txt .

RUN /root/.local/bin/uv pip install --system --no-cache -r requirements.txt

COPY . /app/

RUN chown -R appuser:appuser /app && \
    chmod -R 755 /app && \
    chmod +x /app/entrypoint.sh

ENV HOME=/home/appuser
ENV CLAUDE_CONFIG_DIR=/app/storage/claude-data
ENV CLAUDE_HOME=/app/storage/claude-data
ENV CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
ENV PYTHONUNBUFFERED=1
ENV LOG_LEVEL=DEBUG

RUN mkdir -p /app/storage/claude-data /app/storage/images /app/storage/pdfs /app/storage/xlsx /app/storage/chrome-profile

EXPOSE 8080

ENV SERVICE_MODE=api

ENTRYPOINT ["/app/entrypoint.sh"]
CMD []