#!/usr/bin/env python
"""
Patch-level tissue-type classification using GigaTIME virtual mIF features
and a Random Forest classifier on the TIGER breast-cancer dataset.

Goal: demonstrate that GigaTIME's predicted virtual multiplex immuno-
fluorescence (mIF) encodes biologically meaningful tumour-microenvironment
information.  A simple RF trained *only* on per-patch virtual-protein
statistics should separate tissue compartments — and the feature importances
should align with known marker-tissue associations (CK → tumor, CD3/CD8 →
inflamed stroma, etc.).

Workflow
--------
1. Tile TIGER BCSS ROI images + tissue masks into aligned 256×256 patches.
2. Run GigaTIME inference on each H&E patch → 23-channel probability map.
3. Extract summary features from the 21 non-background channels.
4. Train / evaluate a Random Forest (stratified split by slide ID).
5. Report accuracy, per-class F1, confusion matrix, and feature importances.

Usage
-----
    # Full pipeline: tile → infer → train → evaluate
    python scripts/tiger_rf_tissue_classification.py

    # Skip tiling + inference (reuse cached features)
    python scripts/tiger_rf_tissue_classification.py --skip-inference

    # Use a different TIGER path
    python scripts/tiger_rf_tissue_classification.py \
        --tiger-dir /data/tiger \
        --output-dir outputs/tiger_rf

Requires the TIGER `tissue-bcss` ROI images **and** masks:
    wsirois/roi-level-annotations/tissue-bcss/images/*.png
    wsirois/roi-level-annotations/tissue-bcss/masks/*.png

Download masks with:
    aws s3 cp s3://tiger-training/wsirois/roi-level-annotations/tissue-bcss/masks/ \
        data/tiger/wsirois/roi-level-annotations/tissue-bcss/masks/ \
        --recursive --no-sign-request
"""
from __future__ import annotations

import argparse
import json
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image
from tqdm import tqdm

# ---------------------------------------------------------------------------
# Resolve project paths so we can import GigaTIME modules
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parents[1]           # GigaTIME/
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))
sys.path.insert(0, str(ROOT))

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
CHANNEL_NAMES = [
    "DAPI", "TRITC", "Cy5", "PD-1", "CD14", "CD4", "T-bet", "CD34",
    "CD68", "CD16", "CD11c", "CD138", "CD20", "CD3", "CD8", "PD-L1",
    "CK", "Ki67", "Tryptase", "Actin-D", "Caspase3-D", "PHH3-B", "Transgelin",
]
BACKGROUND_CHANNELS = {"TRITC", "Cy5"}       # indices 1, 2
BIO_INDICES = [i for i, n in enumerate(CHANNEL_NAMES) if n not in BACKGROUND_CHANNELS]
BIO_NAMES   = [CHANNEL_NAMES[i] for i in BIO_INDICES]

# TIGER BCSS tissue labels (0 = exclude / background)
TISSUE_LABELS = {
    1: "invasive_tumor",
    2: "tumor_assoc_stroma",
    3: "in_situ_tumor",
    4: "healthy_glands",
    5: "necrosis",
    6: "inflamed_stroma",
    7: "rest",
}

PATCH_SIZE = 256                                     # GigaTIME native tile size
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD  = np.array([0.229, 0.224, 0.225], dtype=np.float32)


# ======================================================================== #
# 1  TILING
# ======================================================================== #

def tile_roi(
    img: np.ndarray,
    mask: np.ndarray,
    patch_size: int = PATCH_SIZE,
    bg_threshold: float = 0.5,
) -> list[dict]:
    """Tile an H&E ROI and its tissue mask into aligned patches.

    Parameters
    ----------
    img : (H, W, 3) uint8 H&E image
    mask : (H, W) uint8 tissue-label mask (0–7)
    patch_size : side length of square patches
    bg_threshold : discard patch if this fraction is label-0

    Returns
    -------
    List of dicts with keys: ``he`` (uint8 array), ``label`` (int 1-7),
    ``row``, ``col`` (grid position).
    """
    h, w = img.shape[:2]
    patches = []
    for r in range(0, h - patch_size + 1, patch_size):
        for c in range(0, w - patch_size + 1, patch_size):
            m_patch = mask[r:r + patch_size, c:c + patch_size]
            # Skip tiles dominated by exclude / background
            bg_frac = (m_patch == 0).mean()
            if bg_frac > bg_threshold:
                continue
            # Majority non-zero label
            nonzero = m_patch[m_patch > 0]
            if len(nonzero) == 0:
                continue
            counts = np.bincount(nonzero, minlength=8)
            label = int(counts[1:].argmax()) + 1  # labels 1-7
            patches.append({
                "he": img[r:r + patch_size, c:c + patch_size],
                "label": label,
                "row": r,
                "col": c,
            })
    return patches


def _tile_roi_dir(
    img_dir: Path,
    mask_dir: Path,
    patch_size: int,
    label: str,
) -> list[dict]:
    """Tile all matched image/mask pairs in a single ROI directory."""
    img_paths = sorted(img_dir.glob("*.png"))
    patches: list[dict] = []
    skipped = 0

    for img_path in tqdm(img_paths, desc=f"Tiling {label}"):
        mask_path = mask_dir / img_path.name
        if not mask_path.exists():
            skipped += 1
            continue

        img_arr  = np.array(Image.open(img_path).convert("RGB"))
        mask_arr = np.array(Image.open(mask_path))  # single-channel uint8
        # Some masks might be RGB where the label is in channel 0
        if mask_arr.ndim == 3:
            mask_arr = mask_arr[:, :, 0]

        roi_patches = tile_roi(img_arr, mask_arr, patch_size=patch_size)

        # Derive slide ID from filename (everything before the ROI coords)
        slide_id = img_path.stem.split("_[")[0]

        for p in roi_patches:
            p["slide_id"] = slide_id
            p["roi_name"] = img_path.stem
            p["source"] = label

        patches.extend(roi_patches)

    if skipped:
        warnings.warn(f"{label}: {skipped}/{len(img_paths)} images had no matching mask")
    print(f"  {label}: {len(patches)} patches from {len(img_paths) - skipped} ROIs")
    return patches


def build_tile_dataset(
    tiger_dir: Path,
    *,
    patch_size: int = PATCH_SIZE,
) -> tuple[list[dict], list[str]]:
    """Tile TIGER ROIs from both tissue-bcss and tissue-cells subsets.

    Returns
    -------
    patches : list of dicts (he, label, row, col, slide_id, roi_name, source)
    slide_ids : unique slide identifiers (for grouped train/test split)
    """
    roi_base = tiger_dir / "wsirois" / "roi-level-annotations"

    # Discover available ROI directories
    roi_dirs: list[tuple[Path, Path, str]] = []

    bcss_img  = roi_base / "tissue-bcss" / "images"
    bcss_mask = roi_base / "tissue-bcss" / "masks"
    if bcss_img.is_dir() and bcss_mask.is_dir():
        roi_dirs.append((bcss_img, bcss_mask, "tissue-bcss"))

    cells_img  = roi_base / "tissue-cells" / "images"
    cells_mask = roi_base / "tissue-cells" / "masks"
    if cells_img.is_dir() and cells_mask.is_dir():
        roi_dirs.append((cells_img, cells_mask, "tissue-cells"))

    if not roi_dirs:
        raise FileNotFoundError(
            f"No ROI image/mask directories found under {roi_base}\n"
            "Download with:\n"
            "  aws s3 cp s3://tiger-training/wsirois/roi-level-annotations/ "
            f"{roi_base}/ --recursive --no-sign-request"
        )

    all_patches: list[dict] = []
    for img_dir, mask_dir, label in roi_dirs:
        all_patches.extend(
            _tile_roi_dir(img_dir, mask_dir, patch_size, label)
        )

    slide_ids = sorted({p["slide_id"] for p in all_patches})
    print(f"Total: {len(all_patches)} patches from {len(slide_ids)} unique slides")
    return all_patches, slide_ids


# ======================================================================== #
# 2  GIGATIME INFERENCE
# ======================================================================== #

def _load_gigatime(model_path: Path | None = None):
    """Load the GigaTIME model (UNet++) and return (model, device)."""
    import torch
    import archs
    from frontend.api.config import load_runtime_config

    cfg = load_runtime_config(ROOT)
    mpath = model_path or Path(cfg.model_path)
    if not mpath.is_absolute():
        mpath = ROOT / mpath

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = archs.gigatime(num_classes=cfg.num_classes, input_channels=cfg.input_channels)
    state = torch.load(str(mpath), map_location="cpu", weights_only=True)
    model.load_state_dict(state)
    model.to(device).eval()
    print(f"GigaTIME loaded on {device}")
    return model, device


def _preprocess_patch(patch_rgb: np.ndarray) -> np.ndarray:
    """Resize to 256×256, ImageNet-normalise, return CHW float32."""
    img = Image.fromarray(patch_rgb).resize(
        (PATCH_SIZE, PATCH_SIZE), Image.BILINEAR
    )
    arr = np.array(img, dtype=np.float32) / 255.0
    arr = (arr - IMAGENET_MEAN) / IMAGENET_STD
    return arr.transpose(2, 0, 1)                    # (3, 256, 256)


def run_inference_batch(
    model,
    device,
    patches: list[dict],
    batch_size: int = 16,
) -> np.ndarray:
    """Run GigaTIME on a list of patches, return (N, 23, 256, 256) probs.

    .. warning:: This returns the full probability tensor and uses ~4.7 GB
       for 784 patches.  Prefer :func:`run_inference_and_extract` which
       computes features incrementally and never stores the full tensor.
    """
    import torch

    n = len(patches)
    all_probs = np.empty((n, 23, PATCH_SIZE, PATCH_SIZE), dtype=np.float32)

    for start in tqdm(range(0, n, batch_size), desc="GigaTIME inference"):
        end = min(start + batch_size, n)
        batch = np.stack([
            _preprocess_patch(patches[i]["he"]) for i in range(start, end)
        ])
        tensor = torch.from_numpy(batch).to(device)
        with torch.no_grad():
            logits = model(tensor)
            probs = torch.sigmoid(logits).cpu().numpy()
        all_probs[start:end] = probs

    return all_probs


def run_inference_and_extract(
    model,
    device,
    patches: list[dict],
    batch_size: int = 16,
    threshold: float = 0.5,
) -> np.ndarray:
    """Run GigaTIME inference and extract features *incrementally*.

    Instead of materialising the full (N, 23, H, W) probability tensor
    (~4.7 GB for 784 patches), this function computes per-batch features
    on-the-fly and only keeps the small (N, 63) feature matrix in memory.
    This makes it safe to run under memory-constrained environments like
    WSL without risk of OOM.

    Returns
    -------
    features : (N, n_bio*3) float32
    """
    import torch, gc

    n = len(patches)
    n_bio = len(BIO_INDICES)
    features = np.empty((n, n_bio * 3), dtype=np.float32)

    for start in tqdm(range(0, n, batch_size), desc="GigaTIME inference"):
        end = min(start + batch_size, n)
        batch = np.stack([
            _preprocess_patch(patches[i]["he"]) for i in range(start, end)
        ])
        tensor = torch.from_numpy(batch).to(device)
        with torch.no_grad():
            logits = model(tensor)
            probs = torch.sigmoid(logits).cpu().numpy()
        del tensor, logits

        # Extract features for this batch immediately
        for j, ch_idx in enumerate(BIO_INDICES):
            ch = probs[:, ch_idx]                        # (B, H, W)
            features[start:end, j * 3 + 0] = ch.mean(axis=(1, 2))
            features[start:end, j * 3 + 1] = (ch > threshold).astype(np.float32).mean(axis=(1, 2))
            features[start:end, j * 3 + 2] = ch.var(axis=(1, 2))
        del probs

        # Periodic GC to keep memory tidy
        if start % (batch_size * 10) == 0:
            gc.collect()

    return features


# ======================================================================== #
# 3  FEATURE EXTRACTION
# ======================================================================== #

def extract_features(probs: np.ndarray, threshold: float = 0.5) -> np.ndarray:
    """Extract per-patch summary features from virtual mIF probability maps.

    For each of the 21 biologically meaningful channels computes:
        - mean_prob         : average predicted probability
        - positive_frac     : fraction of pixels above threshold
        - spatial_variance  : variance of the probability map

    Parameters
    ----------
    probs : (N, 23, H, W) float32 probability maps
    threshold : binarisation threshold for positive fraction

    Returns
    -------
    features : (N, 63) float32  — 21 channels × 3 stats
    """
    n = probs.shape[0]
    n_bio = len(BIO_INDICES)
    features = np.empty((n, n_bio * 3), dtype=np.float32)

    for i, ch_idx in enumerate(BIO_INDICES):
        ch = probs[:, ch_idx]                        # (N, H, W)
        features[:, i * 3 + 0] = ch.mean(axis=(1, 2))
        features[:, i * 3 + 1] = (ch > threshold).astype(np.float32).mean(axis=(1, 2))
        features[:, i * 3 + 2] = ch.var(axis=(1, 2))

    return features


def feature_names() -> list[str]:
    """Return human-readable feature names (aligned with extract_features)."""
    names = []
    for ch_name in BIO_NAMES:
        names.append(f"{ch_name}_mean_prob")
        names.append(f"{ch_name}_positive_frac")
        names.append(f"{ch_name}_spatial_var")
    return names


def extract_rgb_baseline_features(patches: list[dict]) -> np.ndarray:
    """Extract simple H&E colour statistics as a baseline feature set.

    Per patch:  mean R, G, B, var R, G, B  → 6 features.
    """
    n = len(patches)
    features = np.empty((n, 6), dtype=np.float32)
    for i, p in enumerate(patches):
        arr = p["he"].astype(np.float32) / 255.0
        for c in range(3):
            features[i, c]     = arr[:, :, c].mean()
            features[i, c + 3] = arr[:, :, c].var()
    return features


# ======================================================================== #
# 4  TRAIN / EVALUATE
# ======================================================================== #

def train_and_evaluate(
    X: np.ndarray,
    y: np.ndarray,
    slide_ids: np.ndarray,
    feat_names: list[str],
    output_dir: Path,
    *,
    tag: str = "vmif",
    n_estimators: int = 300,
    test_size: float = 0.2,
    random_state: int = 42,
) -> dict:
    """Train an RF classifier with grouped (by slide) train/test split.

    Returns dict with accuracy, per-class F1, feature importances, etc.
    """
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.metrics import (
        accuracy_score,
        classification_report,
        confusion_matrix,
        f1_score,
    )
    from sklearn.model_selection import GroupShuffleSplit

    # --- Grouped train/test split (no slide overlap) --------------------
    gss = GroupShuffleSplit(
        n_splits=1, test_size=test_size, random_state=random_state
    )
    train_idx, test_idx = next(gss.split(X, y, groups=slide_ids))
    X_train, X_test = X[train_idx], X[test_idx]
    y_train, y_test = y[train_idx], y[test_idx]
    print(f"[{tag}] Train {len(X_train)} | Test {len(X_test)} patches")

    # --- Train Random Forest -------------------------------------------
    clf = RandomForestClassifier(
        n_estimators=n_estimators,
        max_depth=None,
        class_weight="balanced",
        n_jobs=-1,
        random_state=random_state,
    )
    clf.fit(X_train, y_train)
    y_pred = clf.predict(X_test)

    acc = accuracy_score(y_test, y_pred)
    f1_macro = f1_score(y_test, y_pred, average="macro", zero_division=0)
    f1_weighted = f1_score(y_test, y_pred, average="weighted", zero_division=0)

    present_labels = sorted(set(y_test) | set(y_pred))
    target_names = [TISSUE_LABELS.get(l, f"label_{l}") for l in present_labels]
    report = classification_report(
        y_test, y_pred,
        labels=present_labels,
        target_names=target_names,
        zero_division=0,
        output_dict=True,
    )
    cm = confusion_matrix(y_test, y_pred, labels=present_labels)

    # --- Feature importances -------------------------------------------
    importances = clf.feature_importances_
    fi_df = pd.DataFrame({
        "feature": feat_names,
        "importance": importances,
    }).sort_values("importance", ascending=False)

    # --- Print results -------------------------------------------------
    print(f"\n{'='*60}")
    print(f"Results [{tag}]")
    print(f"{'='*60}")
    print(f"Accuracy:        {acc:.4f}")
    print(f"F1 (macro):      {f1_macro:.4f}")
    print(f"F1 (weighted):   {f1_weighted:.4f}")
    print(f"\nClassification Report:\n")
    print(classification_report(
        y_test, y_pred,
        labels=present_labels,
        target_names=target_names,
        zero_division=0,
    ))
    print("Top-15 features:")
    print(fi_df.head(15).to_string(index=False))

    # --- Save artefacts ------------------------------------------------
    out = output_dir / tag
    out.mkdir(parents=True, exist_ok=True)

    fi_df.to_csv(out / "feature_importances.csv", index=False)

    cm_df = pd.DataFrame(cm, index=target_names, columns=target_names)
    cm_df.to_csv(out / "confusion_matrix.csv")

    results = {
        "tag": tag,
        "accuracy": round(acc, 4),
        "f1_macro": round(f1_macro, 4),
        "f1_weighted": round(f1_weighted, 4),
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "n_features": int(X.shape[1]),
        "classification_report": report,
    }
    with open(out / "results.json", "w") as f:
        json.dump(results, f, indent=2, default=str)

    # --- Plots (optional, best-effort) ---------------------------------
    try:
        _plot_feature_importances(fi_df, out, tag=tag)
        _plot_confusion_matrix(cm, target_names, out, tag=tag)
        _plot_channel_importance_heatmap(fi_df, present_labels, target_names, out, tag=tag)
    except Exception as e:
        warnings.warn(f"Plotting failed (non-critical): {e}")

    return results


# ======================================================================== #
# 5  VISUALISATION HELPERS
# ======================================================================== #

def _plot_feature_importances(fi_df: pd.DataFrame, out: Path, *, tag: str):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    top = fi_df.head(20)
    fig, ax = plt.subplots(figsize=(8, 6))
    ax.barh(range(len(top)), top["importance"].values, color="#3B82F6")
    ax.set_yticks(range(len(top)))
    ax.set_yticklabels(top["feature"].values, fontsize=8)
    ax.invert_yaxis()
    ax.set_xlabel("Gini Importance")
    ax.set_title(f"Top-20 Feature Importances ({tag})")
    fig.tight_layout()
    fig.savefig(out / "feature_importances.png", dpi=150)
    plt.close(fig)
    print(f"  Saved {out / 'feature_importances.png'}")


def _plot_confusion_matrix(cm, target_names, out: Path, *, tag: str):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(8, 7))
    im = ax.imshow(cm, interpolation="nearest", cmap="Blues")
    fig.colorbar(im, ax=ax)
    ax.set(
        xticks=range(len(target_names)),
        yticks=range(len(target_names)),
        xticklabels=target_names,
        yticklabels=target_names,
        ylabel="True",
        xlabel="Predicted",
        title=f"Confusion Matrix ({tag})",
    )
    plt.setp(ax.get_xticklabels(), rotation=45, ha="right", fontsize=8)
    plt.setp(ax.get_yticklabels(), fontsize=8)
    # Annotate cells
    thresh = cm.max() / 2.0
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            ax.text(j, i, f"{cm[i, j]}", ha="center", va="center",
                    color="white" if cm[i, j] > thresh else "black",
                    fontsize=7)
    fig.tight_layout()
    fig.savefig(out / "confusion_matrix.png", dpi=150)
    plt.close(fig)
    print(f"  Saved {out / 'confusion_matrix.png'}")


def _plot_channel_importance_heatmap(
    fi_df: pd.DataFrame,
    labels: list[int],
    target_names: list[str],
    out: Path,
    *,
    tag: str,
):
    """Aggregate feature importances per mIF channel (sum of 3 stats)."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    channel_imp = {}
    for _, row in fi_df.iterrows():
        parts = row["feature"].rsplit("_", 2)
        if len(parts) >= 3:
            ch_name = parts[0]
        else:
            ch_name = row["feature"]
        channel_imp[ch_name] = channel_imp.get(ch_name, 0) + row["importance"]

    channels = [ch for ch in BIO_NAMES if ch in channel_imp]
    values   = [channel_imp[ch] for ch in channels]

    fig, ax = plt.subplots(figsize=(10, 5))
    bars = ax.bar(range(len(channels)), values, color="#10B981")
    ax.set_xticks(range(len(channels)))
    ax.set_xticklabels(channels, rotation=45, ha="right", fontsize=8)
    ax.set_ylabel("Summed Gini Importance")
    ax.set_title(f"Per-Channel Importance ({tag})")
    fig.tight_layout()
    fig.savefig(out / "channel_importance.png", dpi=150)
    plt.close(fig)
    print(f"  Saved {out / 'channel_importance.png'}")


# ======================================================================== #
# 6  CACHING
# ======================================================================== #

def _save_cache(cache_path: Path, X, y, slide_ids, X_rgb):
    np.savez_compressed(
        cache_path,
        X=X, y=y, slide_ids=slide_ids, X_rgb=X_rgb,
    )
    print(f"Cached features → {cache_path}")


def _load_cache(cache_path: Path):
    data = np.load(cache_path, allow_pickle=True)
    return data["X"], data["y"], data["slide_ids"], data["X_rgb"]


# ======================================================================== #
# MAIN
# ======================================================================== #

def main():
    parser = argparse.ArgumentParser(
        description="Patch-level tissue classification with GigaTIME virtual mIF + Random Forest",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--tiger-dir", type=Path,
        default=ROOT / "data" / "tiger",
        help="Path to unpacked TIGER dataset root.",
    )
    parser.add_argument(
        "--output-dir", type=Path,
        default=ROOT / "outputs" / "tiger_rf",
        help="Directory for outputs (models, plots, CSVs).",
    )
    parser.add_argument(
        "--model-path", type=Path, default=None,
        help="Override path to GigaTIME model weights (.pth).",
    )
    parser.add_argument(
        "--batch-size", type=int, default=16,
        help="Inference batch size.",
    )
    parser.add_argument(
        "--n-estimators", type=int, default=300,
        help="Number of trees in the Random Forest.",
    )
    parser.add_argument(
        "--test-size", type=float, default=0.2,
        help="Fraction of slides held out for test.",
    )
    parser.add_argument(
        "--skip-inference", action="store_true",
        help="Skip tiling + inference; load cached features from output-dir.",
    )
    parser.add_argument(
        "--seed", type=int, default=42,
        help="Random seed for reproducibility.",
    )
    args = parser.parse_args()

    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    cache_path = output_dir / "features_cache.npz"

    # ------------------------------------------------------------------
    # A) Tile + infer + extract features  (or load from cache)
    # ------------------------------------------------------------------
    if args.skip_inference and cache_path.exists():
        print(f"Loading cached features from {cache_path}")
        X, y, slide_ids, X_rgb = _load_cache(cache_path)
    else:
        # 1) Tile
        patches, _ = build_tile_dataset(args.tiger_dir)
        if len(patches) == 0:
            print("ERROR: No patches generated. Check that masks are present.")
            sys.exit(1)

        # 2) Infer + extract features (memory-efficient: no full probs tensor)
        model, device = _load_gigatime(args.model_path)
        X = run_inference_and_extract(
            model, device, patches,
            batch_size=args.batch_size, threshold=0.5,
        )
        del model  # free model memory before RF training
        import gc; gc.collect()
        y = np.array([p["label"] for p in patches], dtype=np.int64)
        slide_ids = np.array([p["slide_id"] for p in patches])
        X_rgb = extract_rgb_baseline_features(patches)

        # 4) Cache
        _save_cache(cache_path, X, y, slide_ids, X_rgb)

    # ------------------------------------------------------------------
    # B) Train & evaluate — virtual mIF features
    # ------------------------------------------------------------------
    feat_names_vmif = feature_names()
    results_vmif = train_and_evaluate(
        X, y, slide_ids, feat_names_vmif, output_dir,
        tag="vmif",
        n_estimators=args.n_estimators,
        test_size=args.test_size,
        random_state=args.seed,
    )

    # ------------------------------------------------------------------
    # C) Baseline — raw H&E RGB statistics
    # ------------------------------------------------------------------
    rgb_names = ["R_mean", "G_mean", "B_mean", "R_var", "G_var", "B_var"]
    results_rgb = train_and_evaluate(
        X_rgb, y, slide_ids, rgb_names, output_dir,
        tag="rgb_baseline",
        n_estimators=args.n_estimators,
        test_size=args.test_size,
        random_state=args.seed,
    )

    # ------------------------------------------------------------------
    # D) Combined — virtual mIF + RGB
    # ------------------------------------------------------------------
    X_combined = np.hstack([X, X_rgb])
    combined_names = feat_names_vmif + rgb_names
    results_combined = train_and_evaluate(
        X_combined, y, slide_ids, combined_names, output_dir,
        tag="vmif_plus_rgb",
        n_estimators=args.n_estimators,
        test_size=args.test_size,
        random_state=args.seed,
    )

    # ------------------------------------------------------------------
    # E) Summary comparison
    # ------------------------------------------------------------------
    summary = pd.DataFrame([results_vmif, results_rgb, results_combined])
    summary = summary[["tag", "accuracy", "f1_macro", "f1_weighted", "n_train", "n_test", "n_features"]]
    print(f"\n{'='*60}")
    print("COMPARISON SUMMARY")
    print(f"{'='*60}")
    print(summary.to_string(index=False))
    summary.to_csv(output_dir / "comparison_summary.csv", index=False)
    print(f"\nAll outputs saved to {output_dir}")


if __name__ == "__main__":
    main()
