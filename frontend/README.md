# GigaTIME Explorer — Interactive Frontend

An interactive React + FastAPI application for exploring GigaTIME virtual multiplex immunofluorescence (mIF) predictions. Designed for mixed audiences — from pathology beginners to computational biology experts.

## Pages

| Route | Description |
|-------|-------------|
| `/` | **Home** — Overview of virtual staining, the GigaTIME pipeline, and navigation |
| `/gallery` | **Gallery** — Browse sample tiles with an interactive H&E ↔ mIF comparison slider |
| `/explorer` | **Channel Explorer** — View all 21 predicted protein channels for any tile |
| `/biology` | **Biology Guide** — TME primer, channel-by-channel explanations, spatial patterns |
| `/metrics` | **Metrics Dashboard** — Pearson correlation charts, category breakdowns, heatmaps |
| `/inference` | **Live Inference** — Upload your own H&E tile for real-time 23-channel prediction |

## Quick Start (Local)

### 1. Pre-compute predictions (optional but recommended)

```bash
cd GigaTIME
python frontend/precompute.py
```

This generates `frontend/precomputed/` with `.npz` predictions and `metrics_summary.json`. Requires the model weights at `model/model.pth`.

### 2. Start the FastAPI backend

```bash
pip install -r frontend/api/requirements.txt
uvicorn frontend.api.main:app --port 8000 --reload
```

### 3. Start the Next.js frontend

```bash
cd frontend/web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Docker Compose

```bash
docker compose up --build
```

This builds and runs both services. The frontend is at `localhost:3000`, the API at `localhost:8000`.

## Architecture

```
frontend/
├── api/
│   ├── main.py              # FastAPI backend (tiles, channels, inference)
│   └── requirements.txt
├── precompute.py             # One-time script: predictions + metrics
├── precomputed/              # Generated .npz files + metrics_summary.json
├── web/
│   ├── src/
│   │   ├── app/              # Next.js App Router pages
│   │   │   ├── page.tsx      # Home
│   │   │   ├── gallery/      # Tile gallery + comparison
│   │   │   ├── explorer/     # 21-channel grid viewer
│   │   │   ├── biology/      # TME educational guide
│   │   │   ├── metrics/      # Recharts dashboards
│   │   │   └── inference/    # Live upload + inference
│   │   ├── components/       # Sidebar, ImageCompare, ChannelPicker, etc.
│   │   └── lib/              # channels.ts (metadata), api.ts (client)
│   ├── package.json
│   └── next.config.mjs       # Proxies /api/* → FastAPI
├── Dockerfile.api
└── Dockerfile.web
```

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS v4, Recharts
- **Backend**: FastAPI, PyTorch, NumPy, SciPy, Pillow
- **Model**: UNet++ (Nested U-Net), 3-channel RGB → 23-channel binary protein maps
