"""
GigaTIME Explorer — FastAPI Backend

Serves pre-computed predictions, ground-truth masks, and live inference
for the React frontend.
"""

from __future__ import annotations

import io
import json
import os
import sys
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from PIL import Image

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parents[2]  # GigaTIME/
SCRIPTS = ROOT / "scripts"
MODEL_PATH = ROOT / "model" / "model.pth"
DATA_DIR = ROOT / "data" / "sample_test_data" / "data"
PRECOMPUTED = ROOT / "frontend" / "precomputed"
METADATA_CSV = ROOT / "data" / "sample_test_data" / "sample_metadata.csv"

# Ensure scripts/ is importable
sys.path.insert(0, str(SCRIPTS))

# ---------------------------------------------------------------------------
# Channel metadata
# ---------------------------------------------------------------------------
CHANNEL_NAMES = [
    "DAPI", "TRITC", "Cy5", "PD-1", "CD14", "CD4", "T-bet", "CD34",
    "CD68", "CD16", "CD11c", "CD138", "CD20", "CD3", "CD8", "PD-L1",
    "CK", "Ki67", "Tryptase", "Actin-D", "Caspase3-D", "PHH3-B", "Transgelin",
]
BACKGROUND_CHANNELS = {"TRITC", "Cy5"}

CHANNEL_META: dict[str, dict] = {
    "DAPI":       {"category": "structural",   "cell_type": "All nuclei",          "desc": "Nuclear stain — labels DNA in every cell nucleus"},
    "TRITC":      {"category": "background",   "cell_type": "—",                   "desc": "Background autofluorescence channel (not used in analysis)"},
    "Cy5":        {"category": "background",   "cell_type": "—",                   "desc": "Background autofluorescence channel (not used in analysis)"},
    "PD-1":       {"category": "checkpoint",   "cell_type": "Exhausted T-cells",   "desc": "Immune checkpoint receptor on T-cells — target of immunotherapy drugs like pembrolizumab"},
    "CD14":       {"category": "immune",       "cell_type": "Monocytes",           "desc": "Surface marker for monocytes and macrophages — part of innate immunity"},
    "CD4":        {"category": "immune",       "cell_type": "Helper T-cells",      "desc": "Marks helper T-cells that coordinate the immune response"},
    "T-bet":      {"category": "immune",       "cell_type": "Th1 cells",           "desc": "Transcription factor driving Th1 immune response and IFN-γ production"},
    "CD34":       {"category": "structural",   "cell_type": "Endothelial/Stem",    "desc": "Marks blood vessel endothelial cells and hematopoietic stem cells"},
    "CD68":       {"category": "immune",       "cell_type": "Macrophages",         "desc": "Macrophage marker — these cells engulf pathogens and present antigens"},
    "CD16":       {"category": "immune",       "cell_type": "NK cells/Macrophages","desc": "Fc receptor on natural killer cells and some macrophages"},
    "CD11c":      {"category": "immune",       "cell_type": "Dendritic cells",     "desc": "Dendritic cell marker — professional antigen-presenting cells"},
    "CD138":      {"category": "immune",       "cell_type": "Plasma cells",        "desc": "Plasma cell marker (Syndecan-1) — antibody-producing B-cell descendants"},
    "CD20":       {"category": "immune",       "cell_type": "B-cells",             "desc": "B-cell marker — target of rituximab therapy"},
    "CD3":        {"category": "immune",       "cell_type": "All T-cells",         "desc": "Pan T-cell marker — labels every type of T-cell"},
    "CD8":        {"category": "immune",       "cell_type": "Cytotoxic T-cells",   "desc": "Cytotoxic T-cells that directly kill cancer cells via perforin/granzyme"},
    "PD-L1":      {"category": "checkpoint",   "cell_type": "Tumor/Immune",        "desc": "Checkpoint ligand expressed by tumors to evade immune attack — key immunotherapy biomarker"},
    "CK":         {"category": "tumor",        "cell_type": "Epithelial/Tumor",    "desc": "Cytokeratin marks epithelial and tumor cells — defines the tumor compartment"},
    "Ki67":       {"category": "tumor",        "cell_type": "Proliferating cells", "desc": "Proliferation marker — present in actively dividing cells (any type)"},
    "Tryptase":   {"category": "immune",       "cell_type": "Mast cells",          "desc": "Mast cell marker — involved in allergic responses and TME remodeling"},
    "Actin-D":    {"category": "structural",   "cell_type": "Stromal",             "desc": "Smooth muscle actin — marks myofibroblasts and stromal cells"},
    "Caspase3-D": {"category": "tumor",        "cell_type": "Apoptotic cells",     "desc": "Cleaved caspase-3 — marks cells undergoing programmed cell death (apoptosis)"},
    "PHH3-B":     {"category": "tumor",        "cell_type": "Mitotic cells",       "desc": "Phospho-histone H3 — marks cells in active mitosis"},
    "Transgelin": {"category": "structural",   "cell_type": "Smooth muscle",       "desc": "Smooth muscle/myofibroblast marker in tumor stroma"},
}

CATEGORY_COLORS = {
    "immune": "#4dabf7",
    "checkpoint": "#ff6b6b",
    "tumor": "#51cf66",
    "structural": "#fcc419",
    "background": "#868e96",
}

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="GigaTIME Explorer API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Lazy model loader
# ---------------------------------------------------------------------------
_model = None
_device = None


def _get_model():
    global _model, _device
    if _model is not None:
        return _model, _device

    import torch
    import archs  # from scripts/

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = archs.gigatime(num_classes=23, input_channels=3)
    if not MODEL_PATH.is_file():
        raise RuntimeError(f"Model weights not found at {MODEL_PATH}")
    state_dict = torch.load(str(MODEL_PATH), map_location="cpu")
    model.load_state_dict(state_dict)
    model = model.to(device).eval()
    _model = model
    _device = device
    return model, device


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def _preprocess_image(img_array: np.ndarray, target_size: int = 512) -> np.ndarray:
    """Resize, normalise, return CHW float32 array."""
    from PIL import Image as PILImage

    img = PILImage.fromarray(img_array).resize((target_size, target_size), PILImage.BILINEAR)
    arr = np.array(img, dtype=np.float32) / 255.0
    arr = (arr - MEAN) / STD
    return arr.transpose(2, 0, 1)  # CHW


def _run_inference(img_chw: np.ndarray, window_size: int = 256):
    """Sliding-window inference → probability array (23, H, W)."""
    import torch

    model, device = _get_model()
    tensor = torch.from_numpy(img_chw).unsqueeze(0).to(device)
    _, c, h, w = tensor.shape
    output = torch.zeros(1, 23, h, w, device=device)

    with torch.no_grad():
        for i in range(0, h, window_size):
            for j in range(0, w, window_size):
                window = tensor[:, :, i:i + window_size, j:j + window_size]
                output[:, :, i:i + window_size, j:j + window_size] = model(window)

    probs = torch.sigmoid(output).squeeze(0).cpu().numpy()  # (23, H, W)
    return probs


def _tile_names() -> list[str]:
    """Return sorted list of tile pair names from sample data."""
    names = sorted({
        p.name.replace("_he.png", "")
        for p in DATA_DIR.glob("*_he.png")
    })
    return names


def _encode_png(arr_2d: np.ndarray, cmap: str = "gray") -> bytes:
    """Encode a 2-D float32 array as a PNG."""
    clipped = np.clip(arr_2d * 255, 0, 255).astype(np.uint8)
    img = Image.fromarray(clipped, mode="L")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/")
def root():
    """Redirect visitors to the frontend or show API info."""
    return {
        "service": "GigaTIME Explorer API",
        "docs": "/docs",
        "frontend": "http://localhost:3000",
        "hint": "The web UI is at http://localhost:3000 — this port (8000) is the API only.",
    }


@app.get("/api/channels")
def get_channels():
    """Return channel metadata."""
    channels = []
    for i, name in enumerate(CHANNEL_NAMES):
        meta = CHANNEL_META[name]
        channels.append({
            "index": i,
            "name": name,
            "category": meta["category"],
            "categoryColor": CATEGORY_COLORS[meta["category"]],
            "cellType": meta["cell_type"],
            "description": meta["desc"],
            "isBackground": name in BACKGROUND_CHANNELS,
        })
    return channels


@app.get("/api/tiles")
def get_tiles():
    """Return list of available sample tiles."""
    # Check precomputed directory first
    precomputed_tiles = sorted({
        p.stem.replace("_pred", "")
        for p in PRECOMPUTED.glob("*_pred.npz")
    })
    # Also check raw data
    raw_tiles = _tile_names()
    return {
        "tiles": raw_tiles,
        "precomputed": precomputed_tiles,
        "dataDir": str(DATA_DIR),
    }


@app.get("/api/tile/{tile_name}/he")
def get_tile_he(tile_name: str):
    """Serve the H&E PNG image for a tile."""
    path = DATA_DIR / f"{tile_name}_he.png"
    if not path.is_file():
        raise HTTPException(404, f"H&E image not found: {tile_name}")
    return StreamingResponse(open(path, "rb"), media_type="image/png")


@app.get("/api/tile/{tile_name}/channel/{channel_idx}")
def get_tile_channel(
    tile_name: str,
    channel_idx: int,
    kind: str = Query("pred", pattern="^(pred|gt|prob|cam)$"),
):
    """Serve a single channel as a grayscale PNG.

    kind=pred  → binary prediction (threshold 0.5)
    kind=gt    → ground-truth mask
    kind=prob  → raw probability map
    kind=cam   → Grad-CAM attention map
    """
    pred_path = PRECOMPUTED / f"{tile_name}_pred.npz"
    gt_path = PRECOMPUTED / f"{tile_name}_gt.npz"
    cam_path = PRECOMPUTED / f"{tile_name}_cam.npz"

    if kind == "cam" and cam_path.is_file():
        data = np.load(cam_path)
        cams = data["cams"]  # (23, H, W) uint8
        arr = cams[channel_idx]
        img = Image.fromarray(arr, mode="L")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return StreamingResponse(io.BytesIO(buf.getvalue()), media_type="image/png")

    if kind in ("pred", "prob") and pred_path.is_file():
        data = np.load(pred_path)
        probs = data["probs"]  # (23, H, W)
        if channel_idx < 0 or channel_idx >= probs.shape[0]:
            raise HTTPException(400, "Invalid channel index")
        arr = probs[channel_idx] if kind == "prob" else (probs[channel_idx] > 0.5).astype(np.float32)
    elif kind == "gt" and gt_path.is_file():
        data = np.load(gt_path)
        masks = data["masks"]  # (23, H, W)
        if channel_idx < 0 or channel_idx >= masks.shape[0]:
            raise HTTPException(400, "Invalid channel index")
        arr = masks[channel_idx].astype(np.float32)
    else:
        raise HTTPException(404, f"Precomputed data not found for {tile_name} ({kind})")

    png_bytes = _encode_png(arr)
    return StreamingResponse(io.BytesIO(png_bytes), media_type="image/png")


@app.get("/api/tile/{tile_name}/prediction")
def get_tile_prediction_json(tile_name: str):
    """Return full prediction metadata (positive pixel ratios per channel)."""
    pred_path = PRECOMPUTED / f"{tile_name}_pred.npz"
    if not pred_path.is_file():
        raise HTTPException(404, "Precomputed prediction not found")

    probs = np.load(pred_path)["probs"]  # (23, H, W)
    binary = (probs > 0.5).astype(np.float32)

    channel_stats = []
    for i, name in enumerate(CHANNEL_NAMES):
        if name in BACKGROUND_CHANNELS:
            continue
        pos_ratio = float(binary[i].mean())
        mean_prob = float(probs[i].mean())
        channel_stats.append({
            "index": i,
            "name": name,
            "positiveRatio": round(pos_ratio, 4),
            "meanProbability": round(mean_prob, 4),
        })

    return {"tileName": tile_name, "channels": channel_stats}


@app.get("/api/metrics")
def get_metrics():
    """Return pre-computed per-channel metrics summary."""
    metrics_path = PRECOMPUTED / "metrics_summary.json"
    if not metrics_path.is_file():
        raise HTTPException(404, "Metrics not computed yet. Run precompute.py first.")
    return json.loads(metrics_path.read_text())


@app.post("/api/infer")
async def infer_upload(file: UploadFile = File(...)):
    """Run live inference on an uploaded H&E image."""
    contents = await file.read()
    img = Image.open(io.BytesIO(contents)).convert("RGB")
    img_array = np.array(img)

    chw = _preprocess_image(img_array, target_size=512)
    probs = _run_inference(chw)  # (23, H, W)
    binary = (probs > 0.5).astype(np.float32)

    channel_stats = []
    for i, name in enumerate(CHANNEL_NAMES):
        if name in BACKGROUND_CHANNELS:
            continue
        channel_stats.append({
            "index": i,
            "name": name,
            "positiveRatio": round(float(binary[i].mean()), 4),
            "meanProbability": round(float(probs[i].mean()), 4),
        })

    # Encode each channel as base64 PNG for the frontend
    import base64
    channel_images = {}
    for i, name in enumerate(CHANNEL_NAMES):
        if name in BACKGROUND_CHANNELS:
            continue
        png_bytes = _encode_png(binary[i])
        channel_images[name] = base64.b64encode(png_bytes).decode()

    prob_images = {}
    for i, name in enumerate(CHANNEL_NAMES):
        if name in BACKGROUND_CHANNELS:
            continue
        png_bytes = _encode_png(probs[i])
        prob_images[name] = base64.b64encode(png_bytes).decode()

    return {
        "channels": channel_stats,
        "images": channel_images,
        "probImages": prob_images,
        "inputSize": list(img_array.shape[:2]),
    }


@app.get("/api/health")
def health():
    import torch
    return {
        "ok": True,
        "cuda": torch.cuda.is_available(),
        "device": str(torch.device("cuda" if torch.cuda.is_available() else "cpu")),
        "modelLoaded": _model is not None,
        "precomputedTiles": len(list(PRECOMPUTED.glob("*_pred.npz"))),
    }
