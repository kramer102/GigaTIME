# Run GigaTIME

This guide covers both local development and Docker-based execution.

## Prerequisites

- Python `3.11`
- [`uv`](https://docs.astral.sh/uv/)
- Node.js and npm (for frontend local dev)
- Docker Desktop (for container workflow)

## Option A: Local development (recommended for code changes)

### 1) Install Python dependencies

```bash
uv sync
```

Optional branch setup helper:

```bash
uv run inv setup-branch
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

Services:

- Web: `http://localhost:3000`
- API: `http://localhost:8000`

Stop services:

```bash
docker compose down
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

### `uv run pytest` fails with `No such file or directory`

This repo does not currently include a configured pytest test suite in dependencies. Use endpoint checks and container logs for verification.

### Missing model/data/precomputed files

If API returns not found or empty tile lists, confirm:

- model file exists at `model/model.pth`
- sample data exists under `data/sample_test_data/data`
- `frontend/precomputed` contains `.npz` artifacts
