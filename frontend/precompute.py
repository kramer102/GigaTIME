"""
Pre-compute predictions and metrics for all sample tiles.

Usage:
    python -m frontend.precompute          # from GigaTIME root
    python frontend/precompute.py          # also works
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]  # GigaTIME/
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

DATA_DIR = ROOT / "data" / "sample_test_data" / "data"
MODEL_PATH = ROOT / "model" / "model.pth"
OUT_DIR = ROOT / "frontend" / "precomputed"

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
    model = archs.gigatime(num_classes=23, input_channels=3)
    state_dict = torch.load(str(MODEL_PATH), map_location="cpu")
    model.load_state_dict(state_dict)
    model.to(device).eval()
    return model, device


def preprocess(img_array: np.ndarray, size: int = 512) -> np.ndarray:
    from PIL import Image

    img = Image.fromarray(img_array).resize((size, size), Image.BILINEAR)
    arr = np.array(img, dtype=np.float32) / 255.0
    arr = (arr - MEAN) / STD
    return arr.transpose(2, 0, 1)


def infer(model, device, chw: np.ndarray, window: int = 256) -> np.ndarray:
    import torch

    tensor = torch.from_numpy(chw).unsqueeze(0).to(device)
    _, c, h, w = tensor.shape
    output = torch.zeros(1, 23, h, w, device=device)
    with torch.no_grad():
        for i in range(0, h, window):
            for j in range(0, w, window):
                win = tensor[:, :, i:i + window, j:j + window]
                output[:, :, i:i + window, j:j + window] = model(win)
    return torch.sigmoid(output).squeeze(0).cpu().numpy()


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

        # Resize to 512×512 to match predictions
        from PIL import Image

        resized_channels = []
        for ch in range(mask.shape[2]):
            ch_img = Image.fromarray(mask[:, :, ch].astype(np.uint8) * 255)
            ch_img = ch_img.resize((512, 512), Image.NEAREST)
            resized_channels.append(np.array(ch_img, dtype=np.float32) / 255.0)
        return np.stack(resized_channels, axis=0)  # (23, 512, 512)
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


def main():
    from PIL import Image
    from tqdm import tqdm

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
        probs = infer(model, device, chw)  # (23, 512, 512)
        np.savez_compressed(OUT_DIR / f"{tile_name}_pred.npz", probs=probs)

        # Ground truth
        gt = load_gt(tile_name)
        if gt is not None:
            np.savez_compressed(OUT_DIR / f"{tile_name}_gt.npz", masks=gt)

            # Metrics
            binary = (probs > 0.5).astype(np.float32)
            pearson = compute_box_pearson(binary, gt)
            row: dict = {"tile": tile_name}
            for i, name in enumerate(CHANNEL_NAMES):
                val = pearson[i]
                row[name] = None if np.isnan(val) else round(float(val), 4)
                if not np.isnan(val):
                    all_metrics[name].append(val)
            tile_metrics.append(row)

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
