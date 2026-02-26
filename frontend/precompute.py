"""
Pre-compute predictions and metrics for all sample tiles.

Usage:
    python -m frontend.precompute                    # full inference + render
    python -m frontend.precompute --render-only      # bake PNGs/stats/thumbs from existing .npz
    python frontend/precompute.py                    # also works
"""
from __future__ import annotations

import argparse
import io
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image as PILImage
from monai.inferers import sliding_window_inference

ROOT = Path(__file__).resolve().parents[1]  # GigaTIME/
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from frontend.api.config import load_runtime_config

CONFIG = load_runtime_config(ROOT)
DATA_DIR = CONFIG.data_dir
MODEL_PATH = CONFIG.model_path
OUT_DIR = CONFIG.precomputed_dir

CHANNEL_NAMES = [
    "DAPI", "TRITC", "Cy5", "PD-1", "CD14", "CD4", "T-bet", "CD34",
    "CD68", "CD16", "CD11c", "CD138", "CD20", "CD3", "CD8", "PD-L1",
    "CK", "Ki67", "Tryptase", "Actin-D", "Caspase3-D", "PHH3-B", "Transgelin",
]
BACKGROUND = {"TRITC", "Cy5"}

MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def load_model():
    import torch
    import archs

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = archs.gigatime(num_classes=CONFIG.num_classes, input_channels=CONFIG.input_channels)
    state_dict = torch.load(str(MODEL_PATH), map_location="cpu")
    model.load_state_dict(state_dict)
    model.to(device).eval()
    return model, device


def preprocess(img_array: np.ndarray, size: int | None = None) -> np.ndarray:
    from PIL import Image

    target_size = size or CONFIG.input_size
    img = Image.fromarray(img_array).resize((target_size, target_size), Image.BILINEAR)
    arr = np.array(img, dtype=np.float32) / 255.0
    arr = (arr - MEAN) / STD
    return arr.transpose(2, 0, 1)


def infer(model, device, chw: np.ndarray) -> np.ndarray:
    import torch

    tensor = torch.from_numpy(chw).unsqueeze(0).to(device)
    with torch.no_grad():
        logits = sliding_window_inference(
            inputs=tensor,
            roi_size=(CONFIG.window_size, CONFIG.window_size),
            sw_batch_size=CONFIG.sw_batch_size,
            predictor=model,
            overlap=CONFIG.tile_overlap,
            mode="gaussian",
        )
    return torch.sigmoid(logits).squeeze(0).cpu().numpy()


def load_gt(tile_name: str) -> np.ndarray | None:
    """Load ground-truth binary mask from pkl.gz.

    Inlines the unpacking logic from prov_data.unpack_and_load() so we don't
    need to import prov_data (which pulls in matplotlib at module level).
    """
    import gzip
    import pickle

    pkl_path = DATA_DIR / f"{tile_name}_comet_binary_thres_labels.pkl.gz"
    if not pkl_path.is_file():
        return None
    try:
        with gzip.open(str(pkl_path), "rb") as f:
            data = pickle.load(f)

        packed = data["comet_array_binary"]
        original_shape = data["original_shape"]
        original_last_dim = data["original_last_dim"]

        unpacked = np.unpackbits(packed, axis=-1)
        mask = unpacked[..., :original_last_dim].reshape(original_shape)  # (H, W, 23)

        # Resize to configured inference size to match predictions
        from PIL import Image

        resized_channels = []
        for ch in range(mask.shape[2]):
            ch_img = Image.fromarray(mask[:, :, ch].astype(np.uint8) * 255)
            ch_img = ch_img.resize((CONFIG.input_size, CONFIG.input_size), Image.NEAREST)
            resized_channels.append(np.array(ch_img, dtype=np.float32) / 255.0)
        return np.stack(resized_channels, axis=0)  # (C, H, W)
    except Exception as e:
        print(f"  Warning: could not load GT for {tile_name}: {e}")
        return None


def compute_box_pearson(pred: np.ndarray, gt: np.ndarray, box_size: int = 8):
    """Compute per-channel Pearson correlation using box counting."""
    from scipy.stats import pearsonr

    assert pred.shape == gt.shape, f"Shape mismatch: {pred.shape} vs {gt.shape}"
    n_channels, h, w = pred.shape
    results = []

    for ch in range(n_channels):
        p = pred[ch]
        g = gt[ch]
        # Count positives in each box
        n_y, n_x = h // box_size, w // box_size
        p_counts = []
        g_counts = []
        for bi in range(n_y):
            for bj in range(n_x):
                p_box = p[bi * box_size:(bi + 1) * box_size, bj * box_size:(bj + 1) * box_size]
                g_box = g[bi * box_size:(bi + 1) * box_size, bj * box_size:(bj + 1) * box_size]
                p_counts.append(p_box.sum())
                g_counts.append(g_box.sum())
        p_arr = np.array(p_counts)
        g_arr = np.array(g_counts)
        if p_arr.std() == 0 or g_arr.std() == 0:
            results.append(float("nan"))
        else:
            corr, _ = pearsonr(p_arr, g_arr)
            results.append(float(corr))
    return results


# ---------------------------------------------------------------------------
# PNG / thumbnail / stats rendering (can run without GPU)
# ---------------------------------------------------------------------------

THUMB_SIZE = 256


def _encode_png(arr_2d: np.ndarray) -> bytes:
    """Encode a 2-D float32 array (0-1) as a grayscale PNG."""
    clipped = np.clip(arr_2d * 255, 0, 255).astype(np.uint8)
    img = PILImage.fromarray(clipped, mode="L")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _encode_uint8_png(arr_2d: np.ndarray) -> bytes:
    """Encode a 2-D uint8 array as a grayscale PNG."""
    img = PILImage.fromarray(arr_2d, mode="L")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def render_tile_assets(
    tile_name: str,
    out_dir: Path,
    data_dir: Path,
    *,
    threshold: float = 0.5,
) -> None:
    """Render pre-baked PNGs, per-tile stats JSON, and thumbnail.

    Creates ``out_dir/png/<tile_name>/`` with:
    - ``<ch_idx>_pred.png``  — binary prediction
    - ``<ch_idx>_gt.png``    — ground-truth mask
    - ``<ch_idx>_prob.png``  — raw probability heat-map
    - ``<ch_idx>_cam.png``   — Grad-CAM attention map
    - ``stats.json``         — per-channel positive ratio / mean probability
    - ``thumb_256.png``      — 256×256 H&E thumbnail
    """
    tile_dir = out_dir / "png" / tile_name
    tile_dir.mkdir(parents=True, exist_ok=True)

    pred_path = out_dir / f"{tile_name}_pred.npz"
    gt_path = out_dir / f"{tile_name}_gt.npz"
    cam_path = out_dir / f"{tile_name}_cam.npz"

    # --- Prediction PNGs + stats -----------------------------------------
    if pred_path.is_file():
        probs = np.load(pred_path)["probs"]  # (23, H, W)
        binary = (probs > threshold).astype(np.float32)
        channel_stats = []
        for i, name in enumerate(CHANNEL_NAMES):
            # pred + prob PNGs for every channel
            (tile_dir / f"{i}_pred.png").write_bytes(_encode_png(binary[i]))
            (tile_dir / f"{i}_prob.png").write_bytes(_encode_png(probs[i]))
            if name not in BACKGROUND:
                channel_stats.append({
                    "index": i,
                    "name": name,
                    "positiveRatio": round(float(binary[i].mean()), 4),
                    "meanProbability": round(float(probs[i].mean()), 4),
                })
        stats_payload = {"tileName": tile_name, "channels": channel_stats}
        (tile_dir / "stats.json").write_text(json.dumps(stats_payload, indent=2))

    # --- Ground-truth PNGs -----------------------------------------------
    if gt_path.is_file():
        masks = np.load(gt_path)["masks"]  # (23, H, W)
        for i in range(masks.shape[0]):
            (tile_dir / f"{i}_gt.png").write_bytes(
                _encode_png(masks[i].astype(np.float32))
            )

    # --- Grad-CAM PNGs ---------------------------------------------------
    if cam_path.is_file():
        cams = np.load(cam_path)["cams"]  # (23, H, W) uint8
        for i in range(cams.shape[0]):
            (tile_dir / f"{i}_cam.png").write_bytes(_encode_uint8_png(cams[i]))

    # --- H&E thumbnail ---------------------------------------------------
    he_path = data_dir / f"{tile_name}_he.png"
    if he_path.is_file():
        img = PILImage.open(he_path).convert("RGB")
        img.thumbnail((THUMB_SIZE, THUMB_SIZE), PILImage.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        (tile_dir / f"thumb_{THUMB_SIZE}.png").write_bytes(buf.getvalue())


def render_only(out_dir: Path | None = None, data_dir: Path | None = None) -> None:
    """Bake PNGs / stats / thumbnails from existing ``.npz`` files.

    Does **not** load the model or run inference — purely CPU / disk.
    """
    from tqdm import tqdm

    out = out_dir or OUT_DIR
    data = data_dir or DATA_DIR

    tiles = sorted({
        p.stem.replace("_pred", "")
        for p in out.glob("*_pred.npz")
    })
    if not tiles:
        print(f"No *_pred.npz files in {out}")
        return

    print(f"Rendering assets for {len(tiles)} tiles → {out / 'png'}")
    for tile_name in tqdm(tiles, desc="Rendering PNGs"):
        render_tile_assets(
            tile_name,
            out,
            data,
            threshold=CONFIG.probability_threshold,
        )
    print("Done.")


def main():
    from PIL import Image
    from tqdm import tqdm

    parser = argparse.ArgumentParser(description="Pre-compute GigaTIME predictions & assets")
    parser.add_argument(
        "--render-only",
        action="store_true",
        help="Skip inference — bake PNGs/stats/thumbs from existing .npz files",
    )
    args = parser.parse_args()

    if args.render_only:
        render_only()
        return

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    tiles = sorted({
        p.name.replace("_he.png", "")
        for p in DATA_DIR.glob("*_he.png")
    })

    if not tiles:
        print(f"No *_he.png files found in {DATA_DIR}")
        return

    print(f"Found {len(tiles)} tiles in {DATA_DIR}")
    print("Loading model...")
    model, device = load_model()
    print(f"Model loaded on {device}")

    all_metrics: dict[str, list] = {name: [] for name in CHANNEL_NAMES}
    tile_metrics: list[dict] = []

    for tile_name in tqdm(tiles, desc="Pre-computing"):
        he_path = DATA_DIR / f"{tile_name}_he.png"
        img = np.array(Image.open(he_path).convert("RGB"))

        # Inference
        chw = preprocess(img)
        probs = infer(model, device, chw)  # (C, H, W)
        np.savez_compressed(OUT_DIR / f"{tile_name}_pred.npz", probs=probs)

        # Ground truth
        gt = load_gt(tile_name)
        if gt is not None:
            np.savez_compressed(OUT_DIR / f"{tile_name}_gt.npz", masks=gt)

            # Metrics
            binary = (probs > CONFIG.probability_threshold).astype(np.float32)
            pearson = compute_box_pearson(binary, gt)
            row: dict = {"tile": tile_name}
            for i, name in enumerate(CHANNEL_NAMES):
                val = pearson[i]
                row[name] = None if np.isnan(val) else round(float(val), 4)
                if not np.isnan(val):
                    all_metrics[name].append(val)
            tile_metrics.append(row)

        # Render PNGs / thumb / stats for this tile
        render_tile_assets(
            tile_name,
            OUT_DIR,
            DATA_DIR,
            threshold=CONFIG.probability_threshold,
        )

    # Summary
    summary = {
        "perChannel": {},
        "perTile": tile_metrics,
        "numTiles": len(tiles),
    }
    for name in CHANNEL_NAMES:
        vals = all_metrics[name]
        if vals:
            summary["perChannel"][name] = {
                "mean": round(float(np.mean(vals)), 4),
                "std": round(float(np.std(vals)), 4),
                "min": round(float(np.min(vals)), 4),
                "max": round(float(np.max(vals)), 4),
                "n": len(vals),
            }
        else:
            summary["perChannel"][name] = {"mean": None, "std": None, "min": None, "max": None, "n": 0}

    with open(OUT_DIR / "metrics_summary.json", "w") as f:
        json.dump(summary, f, indent=2)

    print(f"\nDone. Saved {len(tiles)} tile predictions + metrics to {OUT_DIR}")


if __name__ == "__main__":
    main()
