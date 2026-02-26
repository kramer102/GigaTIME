# Run GigaTIME

This guide covers both local development and Docker-based execution.

## Prerequisites

- Python `3.11`
- [`uv`](https://docs.astral.sh/uv/)
- Node.js and npm (for frontend local dev)
- Docker Desktop (for container workflow)

Runtime config is loaded from `config/runtime.json` (override with `GIGATIME_CONFIG=/path/to/runtime.json`).

## Option A: Local development (recommended for code changes)

### 1) Install Python dependencies

```bash
uv sync
```

Optional branch setup helper:

```bash
uv run inv setup-branch
```

NVIDIA GPU setup (recommended when CUDA is available):

```bash
uv run inv setup-branch --cuda
```

Optional with Hugging Face dependency:

```bash
uv run inv setup-branch --cuda --hf
```

Verify GPU is visible to PyTorch:

```bash
uv run python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'no-gpu')"
```

### 2) Ensure model and sample data exist

Expected paths:

- `model/model.pth`
- `data/sample_test_data/data/*.png`

### 3) (Optional) Generate precomputed predictions/metrics

```bash
uv run python frontend/precompute.py
```

### 4) (Optional) Generate Grad-CAM files

```bash
uv run python scripts/precompute_gradcam.py
```

### 5) Start the API

```bash
uv run pip install -r frontend/api/requirements.txt
uv run uvicorn frontend.api.main:app --host 0.0.0.0 --port 8000 --reload
```

### 6) Start the web app

```bash
cd frontend/web
npm install
npm run dev
```

### 7) Open and verify

- Web UI: `http://localhost:3000`
- API health: `http://localhost:8000/api/health`
- API tiles: `http://localhost:8000/api/tiles`

## Option B: Docker Compose

From repo root:

```bash
docker compose up --build
```

Use `docker compose` (not `docker-compose`) on modern Docker installations.

For NVIDIA GPU in Compose, use the GPU override file:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build
```

Equivalent Invoke task:

```bash
uv run inv compose-start --gpu
```

Without the GPU override, containers run CPU-only.

For isolated/offline simulation (no outbound internet egress), add the isolated override:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml -f docker-compose.isolated.yml up --build
```

Equivalent Invoke task:

```bash
uv run inv compose-start --gpu --isolated
```

GPU + isolated environment smoke test:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build -d
docker compose exec api python -c "import socket, torch; print('cuda', torch.cuda.is_available()); print('device', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'no-gpu'); socket.gethostbyname('pypi.org')"
```

Equivalent Invoke task:

```bash
uv run inv compose-gpu-isolated-smoke
```

If your Docker socket requires elevated permissions, add `--sudo` to these tasks (for example: `uv run inv compose-start --gpu --sudo`).

Expected for isolation test: GPU line should be `True` (on GPU hosts), and DNS lookup for `pypi.org` should fail in the internal network.

GPU-enabled offline tests via Invoke:

```bash
uv run inv container-test --gpu --data-dir /data
uv run inv container-notebook-test --gpu --data-dir /data
```

Services:

- Web: `http://localhost:3000`
- API: `http://localhost:8000`

Stop services:

```bash
docker compose down
```

Equivalent Invoke tasks:

```bash
uv run inv compose-ps --gpu
uv run inv compose-stop --gpu
```

## Quick verification commands

```bash
curl -s http://localhost:8000/api/health
curl -s http://localhost:8000/api/tiles
curl -s -o /dev/null -w "%{http_code}" "http://localhost:8000/api/tile/0_10564_556_556/channel/0?kind=cam"
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

Expected:

- health endpoint returns JSON with `ok: true`
- cam channel returns `200`
- web returns `200`

## Common issues

### `docker-compose: command not found`

Use:

```bash
docker compose up --build
```

### `docker: command not found` in WSL

Enable Docker Desktop WSL integration for your distro, then retry the compose command.

### `permission denied` on `/var/run/docker.sock`

Use `--sudo` with invoke compose tasks, or add your user to the `docker` group:

```bash
sudo usermod -aG docker $USER
newgrp docker
```

### `uv run pytest` fails with `No such file or directory`

This repo does not currently include a configured pytest test suite in dependencies. Use endpoint checks and container logs for verification.

### Missing model/data/precomputed files

If API returns not found or empty tile lists, confirm:

- model file exists at `model/model.pth`
- sample data exists under `data/sample_test_data/data`
- `frontend/precomputed` contains `.npz` artifacts
