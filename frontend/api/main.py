"""
GigaTIME Explorer — FastAPI Backend

Serves pre-computed predictions, ground-truth masks, and live inference
for the React frontend.
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
import io
import json
import sys
from pathlib import Path

import numpy as np
from fastapi import FastAPI, File, UploadFile, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from monai.inferers import sliding_window_inference
from PIL import Image

from frontend.api.config import load_runtime_config
from frontend.api.cache import load_pred, load_gt, load_cam

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parents[2]  # GigaTIME/
SCRIPTS = ROOT / "scripts"
RUNTIME_CONFIG = load_runtime_config(ROOT)
MODEL_PATH = RUNTIME_CONFIG.model_path
DATA_DIR = RUNTIME_CONFIG.data_dir
PRECOMPUTED = RUNTIME_CONFIG.precomputed_dir
METADATA_CSV = RUNTIME_CONFIG.metadata_csv
PNG_DIR = PRECOMPUTED / "png"

# Ensure scripts/ is importable
sys.path.insert(0, str(SCRIPTS))

# ---------------------------------------------------------------------------
# Cache-Control helpers
# ---------------------------------------------------------------------------
_IMMUTABLE = "public, max-age=86400, immutable"  # 24 h – precomputed data
_SHORT = "public, max-age=300"                    # 5 min – tile list, channels

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


@asynccontextmanager
async def app_lifespan(app: FastAPI):
    import torch
    import archs

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = archs.gigatime(
        num_classes=RUNTIME_CONFIG.num_classes,
        input_channels=RUNTIME_CONFIG.input_channels,
    )
    if not MODEL_PATH.is_file():
        raise RuntimeError(f"Model weights not found at {MODEL_PATH}")
    state_dict = torch.load(str(MODEL_PATH), map_location="cpu")
    model.load_state_dict(state_dict)
    app.state.model = model.to(device).eval()
    app.state.model_device = device
    app.state.runtime_config = RUNTIME_CONFIG
    yield


app = FastAPI(title="GigaTIME Explorer API", version="0.1.0", lifespan=app_lifespan)

import os as _os
_allowed_origins = [
    o.strip()
    for o in _os.getenv("ALLOWED_ORIGINS", "*").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Accept"],
)

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


def _run_inference(img_chw: np.ndarray, model, device, config):
    """Sliding-window inference → probability array (23, H, W)."""
    import torch

    tensor = torch.from_numpy(img_chw).unsqueeze(0).to(device)

    with torch.no_grad():
        logits = sliding_window_inference(
            inputs=tensor,
            roi_size=(config.window_size, config.window_size),
            sw_batch_size=config.sw_batch_size,
            predictor=model,
            overlap=config.tile_overlap,
            mode="gaussian",
        )
    probs = torch.sigmoid(logits).squeeze(0).cpu().numpy()  # (23, H, W)
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


def _json_response(content, cache_control: str) -> JSONResponse:
    return JSONResponse(content=content, headers={"Cache-Control": cache_control})


def _foreground_channel_entries():
    for i, name in enumerate(CHANNEL_NAMES):
        if name in BACKGROUND_CHANNELS:
            continue
        yield i, name


def _build_channel_stats(probs: np.ndarray, threshold: float) -> list[dict]:
    binary = (probs > threshold).astype(np.float32)
    channel_stats = []
    for i, name in _foreground_channel_entries():
        channel_stats.append({
            "index": i,
            "name": name,
            "positiveRatio": round(float(binary[i].mean()), 4),
            "meanProbability": round(float(probs[i].mean()), 4),
        })
    return channel_stats


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
    return _json_response(channels, _SHORT)


@app.get("/api/tiles")
def get_tiles():
    """Return list of available sample tiles."""
    precomputed_tiles = sorted({
        p.stem.replace("_pred", "")
        for p in PRECOMPUTED.glob("*_pred.npz")
    })
    raw_tiles = _tile_names()
    tiles = raw_tiles if raw_tiles else precomputed_tiles
    return _json_response(
        content={"tiles": tiles, "precomputed": precomputed_tiles, "dataDir": str(DATA_DIR)},
        cache_control=_SHORT,
    )


@app.get("/api/tile/{tile_name}/he")
def get_tile_he(tile_name: str):
    """Serve the H&E PNG image for a tile."""
    path = DATA_DIR / f"{tile_name}_he.png"
    if not path.is_file():
        raise HTTPException(404, f"H&E image not found: {tile_name}")
    return FileResponse(
        path, media_type="image/png",
        headers={"Cache-Control": _IMMUTABLE},
    )


@app.get("/api/tile/{tile_name}/thumb")
def get_tile_thumb(tile_name: str):
    """Serve a 256×256 H&E thumbnail (pre-rendered by precompute.py)."""
    thumb = PNG_DIR / tile_name / "thumb_256.png"
    if thumb.is_file():
        return FileResponse(
            thumb, media_type="image/png",
            headers={"Cache-Control": _IMMUTABLE},
        )
    # Fallback: serve full-res H&E
    path = DATA_DIR / f"{tile_name}_he.png"
    if not path.is_file():
        raise HTTPException(404, f"Thumbnail not found: {tile_name}")
    return FileResponse(
        path, media_type="image/png",
        headers={"Cache-Control": _IMMUTABLE},
    )


@app.get("/api/tile/{tile_name}/channel/{channel_idx}")
async def get_tile_channel(
    request: Request,
    tile_name: str,
    channel_idx: int,
    kind: str = Query("pred", pattern="^(pred|gt|prob|cam)$"),
):
    """Serve a single channel as a grayscale PNG.

    Prefers pre-rendered static PNGs; falls back to LRU-cached .npz +
    run_in_executor for CPU-bound encoding.
    """
    # ---- Fast path: static pre-rendered PNG ----------------------------
    static_png = PNG_DIR / tile_name / f"{channel_idx}_{kind}.png"
    if static_png.is_file():
        return FileResponse(
            static_png, media_type="image/png",
            headers={"Cache-Control": _IMMUTABLE},
        )

    # ---- Slow path: decompress .npz via LRU cache ----------------------
    loop = asyncio.get_running_loop()

    def _render():
        if kind == "cam":
            cam_path = PRECOMPUTED / f"{tile_name}_cam.npz"
            if not cam_path.is_file():
                raise HTTPException(404, f"Precomputed data not found for {tile_name} (cam)")
            cams = load_cam(PRECOMPUTED, tile_name)  # cached
            if channel_idx < 0 or channel_idx >= cams.shape[0]:
                raise HTTPException(400, "Invalid channel index")
            arr = cams[channel_idx]
            img = Image.fromarray(arr, mode="L")
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            return buf.getvalue()

        if kind in ("pred", "prob"):
            pred_path = PRECOMPUTED / f"{tile_name}_pred.npz"
            if not pred_path.is_file():
                raise HTTPException(404, f"Precomputed data not found for {tile_name} ({kind})")
            config = request.app.state.runtime_config
            probs = load_pred(PRECOMPUTED, tile_name)  # cached
            if channel_idx < 0 or channel_idx >= probs.shape[0]:
                raise HTTPException(400, "Invalid channel index")
            arr = probs[channel_idx] if kind == "prob" else (probs[channel_idx] > config.probability_threshold).astype(np.float32)
        elif kind == "gt":
            gt_path = PRECOMPUTED / f"{tile_name}_gt.npz"
            if not gt_path.is_file():
                raise HTTPException(404, f"Precomputed data not found for {tile_name} (gt)")
            masks = load_gt(PRECOMPUTED, tile_name)  # cached
            if channel_idx < 0 or channel_idx >= masks.shape[0]:
                raise HTTPException(400, "Invalid channel index")
            arr = masks[channel_idx].astype(np.float32)
        else:
            raise HTTPException(404, f"Precomputed data not found for {tile_name} ({kind})")
        return _encode_png(arr)

    png_bytes = await loop.run_in_executor(None, _render)
    return StreamingResponse(
        io.BytesIO(png_bytes),
        media_type="image/png",
        headers={"Cache-Control": _IMMUTABLE},
    )


@app.get("/api/tile/{tile_name}/prediction")
async def get_tile_prediction_json(request: Request, tile_name: str):
    """Return full prediction metadata (positive pixel ratios per channel).

    Prefers pre-baked ``stats.json``; falls back to LRU-cached .npz in executor.
    """
    # ---- Fast path: pre-rendered stats.json ----------------------------
    stats_path = PNG_DIR / tile_name / "stats.json"
    if stats_path.is_file():
        return _json_response(
            content=json.loads(stats_path.read_text()),
            cache_control=_IMMUTABLE,
        )

    # ---- Slow path: compute from .npz ---------------------------------
    pred_path = PRECOMPUTED / f"{tile_name}_pred.npz"
    if not pred_path.is_file():
        raise HTTPException(404, "Precomputed prediction not found")

    loop = asyncio.get_running_loop()

    def _compute():
        probs = load_pred(PRECOMPUTED, tile_name)
        threshold = request.app.state.runtime_config.probability_threshold
        channel_stats = _build_channel_stats(probs, threshold)
        return {"tileName": tile_name, "channels": channel_stats}

    result = await loop.run_in_executor(None, _compute)
    return _json_response(result, _IMMUTABLE)


@app.get("/api/metrics")
def get_metrics():
    """Return pre-computed per-channel metrics summary."""
    metrics_path = PRECOMPUTED / "metrics_summary.json"
    if not metrics_path.is_file():
        raise HTTPException(404, "Metrics not computed yet. Run precompute.py first.")
    return _json_response(
        content=json.loads(metrics_path.read_text()),
        cache_control=_IMMUTABLE,
    )


_MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB
_ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/tiff"}


@app.post("/api/infer")
async def infer_upload(request: Request, file: UploadFile = File(...)):
    """Run live inference on an uploaded H&E image."""
    # --- upload validation ---
    if file.content_type and file.content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            415,
            f"Unsupported file type '{file.content_type}'. "
            f"Accepted: {', '.join(sorted(_ALLOWED_CONTENT_TYPES))}",
        )
    contents = await file.read()
    if len(contents) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            413,
            f"File too large ({len(contents) / 1024 / 1024:.1f} MB). "
            f"Maximum is {_MAX_UPLOAD_BYTES / 1024 / 1024:.0f} MB.",
        )
    try:
        img = Image.open(io.BytesIO(contents)).convert("RGB")
    except Exception:
        raise HTTPException(400, "Could not decode file as an image.")
    img_array = np.array(img)

    config = request.app.state.runtime_config
    chw = _preprocess_image(img_array, target_size=config.input_size)
    probs = _run_inference(chw, request.app.state.model, request.app.state.model_device, config)  # (23, H, W)
    binary = (probs > config.probability_threshold).astype(np.float32)
    channel_stats = _build_channel_stats(probs, config.probability_threshold)

    # Encode each channel as base64 PNG for the frontend
    import base64
    channel_images = {}
    for i, name in _foreground_channel_entries():
        png_bytes = _encode_png(binary[i])
        channel_images[name] = base64.b64encode(png_bytes).decode()

    prob_images = {}
    for i, name in _foreground_channel_entries():
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
        "modelLoaded": hasattr(app.state, "model"),
        "precomputedTiles": len(list(PRECOMPUTED.glob("*_pred.npz"))),
    }
