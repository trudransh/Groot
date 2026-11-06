ARG PYTHON_VERSION=3.13
FROM ghcr.io/astral-sh/uv:python${PYTHON_VERSION}-bookworm-slim AS base

ENV PYTHONUNBUFFERED=1 \
  UV_COMPILE_BYTECODE=1 \
  # Model files from download-files live in /app so they ship with the app.
  HF_HOME=/app/.cache/huggingface

# ---------------------------------------------------------------------------
# Build stage – install locked dependencies and download model files --------
# ---------------------------------------------------------------------------
FROM base AS build

RUN apt-get update -qy && \
  apt-get install -qyy --no-install-recommends gcc g++ python3-dev && \
  rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first, so code changes reuse this layer.
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

COPY . .
RUN uv sync --locked --no-dev && \
  uv run --no-sync python -m voice_agent download-files

# ---------------------------------------------------------------------------
# Runtime stage ---------------------------------------------------------------
# ---------------------------------------------------------------------------
FROM base

ARG UID=10001
RUN adduser --disabled-password --gecos "" --home /app --shell /sbin/nologin --uid "${UID}" appuser

WORKDIR /app
COPY --from=build --chown=appuser:appuser /app /app
USER appuser

ENTRYPOINT ["uv", "run", "--no-sync", "python", "-m", "voice_agent"]
CMD ["start"]
