# Open-model sidecar (specs/020 B3.2). Build context: services/inference.
#   docker build -t budget-portal-inference services/inference                    # CPU (default)
#   docker build -t budget-portal-inference:cuda --build-arg DEVICE=cuda \
#     --build-arg BASE=nvidia/cuda:12.4.1-runtime-ubuntu22.04 services/inference
# Models download on first use into /models (mount a volume there); nothing else is written.
ARG BASE=python:3.12-slim
FROM ${BASE}
ARG DEVICE=cpu
ENV DEVICE=${DEVICE} \
    HF_HOME=/models \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_SYSTEM_PYTHON=1
COPY --from=ghcr.io/astral-sh/uv:0.9.5 /uv /usr/local/bin/uv
# The CUDA base has no Python; python:3.12-slim does.
RUN if ! command -v python3 >/dev/null; then \
      apt-get update && apt-get install -y --no-install-recommends python3 python3-pip && rm -rf /var/lib/apt/lists/*; fi
WORKDIR /app
COPY pyproject.toml uv.lock ./
# CPU: torch from the CPU index (~200 MB, not the ~2.5 GB CUDA build); the lock's pin still holds.
RUN if [ "$DEVICE" = "cpu" ]; then \
      uv pip install --index-url https://download.pytorch.org/whl/cpu \
        "torch==$(uv export --frozen --no-dev --no-hashes | sed -n 's/^torch==\([^ ;]*\).*/\1/p')"; fi \
 && uv export --frozen --no-dev --no-emit-project --no-hashes > /tmp/req.txt \
 # The lock lists torch's CUDA wheels for Linux; a CPU image must not install them (8.9 GB → ~2 GB).
 && if [ "$DEVICE" = "cpu" ]; then sed -i -E '/^(nvidia-|triton|cuda-)/d' /tmp/req.txt; fi \
 && uv pip install -r /tmp/req.txt \
 && rm /tmp/req.txt
COPY app.py ./
RUN useradd --system --uid 10001 app && mkdir -p /models && chown app /models
USER app
EXPOSE 8100
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8100/health')"
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8100", "--workers", "1"]
