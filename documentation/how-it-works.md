# How GigaTIME Works

This repository has two major parts:

- **Model and preprocessing pipeline** (Python/PyTorch)
- **Interactive explorer app** (FastAPI backend + Next.js frontend)

## High-level architecture

```text
H&E tiles + mIF labels + model weights
          │
          ├─ frontend/precompute.py (offline precompute)
          │     ├─ runs sliding-window inference
          │     ├─ writes *_pred.npz and *_gt.npz
          │     └─ writes metrics_summary.json
          │
          ├─ scripts/precompute_gradcam.py (offline interpretability)
          │     └─ writes *_cam.npz
          │
          └─ frontend/api/main.py (FastAPI runtime)
                ├─ serves H&E, pred/gt/prob/cam channels
                ├─ serves metrics and tile lists
                └─ supports live inference endpoint

frontend/web (Next.js)
  └─ renders gallery, explorer, biology, metrics, inference pages
     via /api/* calls proxied to FastAPI
```

## Key directories

- `scripts/`: model architecture and training/testing scripts (`archs.py`, `db_train.py`, `db_test.py`)
- `model/`: local checkpoint (`model.pth`) and model metadata
- `data/sample_test_data/`: sample H&E and paired labels
- `frontend/api/`: FastAPI service code
- `frontend/web/`: Next.js UI
- `frontend/precomputed/`: generated `.npz` artifacts consumed by the API
- `documentation/`: this documentation set

## Backend behavior

Main API file: `frontend/api/main.py`

Important endpoints:

- `GET /api/health`: health and model status
- `GET /api/tiles`: available tile IDs
- `GET /api/tile/{tile}/he`: source H&E image
- `GET /api/tile/{tile}/channel/{idx}?kind=pred|gt|prob|cam`: per-channel image
- `GET /api/tile/{tile}/prediction`: per-channel stats for selected tile
- `POST /api/infer`: upload image for live inference

### Path assumptions

The API currently expects these repo-relative paths:

- `model/model.pth`
- `data/sample_test_data/data`
- `frontend/precomputed`

In containerized or cloud deployments, make sure these paths are available in the container (via image contents or mounted storage).

## Frontend behavior

Main UI pages live under `frontend/web/src/app`.

- `/explorer` includes:
  - channel grid with `pred|gt|prob|cam` views
  - biological context from `frontend/web/src/data/biomarkers.json`
  - multiplex overlay from `frontend/web/src/components/MultiplexViewer.tsx`

API access is centralized in `frontend/web/src/lib/api.ts` and proxied by `frontend/web/next.config.mjs`:

- frontend path: `/api/:path*`
- destination: `${API_URL}/api/:path*` (or `http://localhost:8000` by default)

## Inference/precompute model details

- Model architecture: UNet++ variant in `scripts/archs.py`
- Input preprocessing: resize to 512, ImageNet normalization
- Inference strategy: sliding windows (typically 256x256)
- Output: 23 channels (including background channels)

## Data artifact formats

- `*_pred.npz`: contains `probs` with shape `(23, H, W)`
- `*_gt.npz`: contains `masks` with shape `(23, H, W)`
- `*_cam.npz`: contains `cams` with shape `(23, H, W)`

These are loaded directly by the API and converted to PNG on request.
