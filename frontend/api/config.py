from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class RuntimeConfig:
    model_path: Path
    data_dir: Path
    precomputed_dir: Path
    metadata_csv: Path
    num_classes: int
    input_channels: int
    input_size: int
    window_size: int
    sw_batch_size: int
    tile_overlap: float
    probability_threshold: float


def _resolve_path(root: Path, path_value: str) -> Path:
    path = Path(path_value)
    if path.is_absolute():
        return path
    return root / path


def _resolve_path_with_fallback(root: Path, path_value: str) -> Path:
    resolved = _resolve_path(root, path_value)
    if resolved.exists():
        return resolved

    raw = Path(path_value)
    if raw.is_absolute():
        return resolved

    fallback = root / "data" / raw
    if fallback.exists():
        return fallback
    return resolved


def load_runtime_config(root: Path) -> RuntimeConfig:
    config_path = Path(os.getenv("GIGATIME_CONFIG", root / "config" / "runtime.json"))
    if not config_path.is_absolute():
        config_path = root / config_path

    data = json.loads(config_path.read_text())
    return RuntimeConfig(
        model_path=_resolve_path_with_fallback(root, data["model_path"]),
        data_dir=_resolve_path_with_fallback(root, data["data_dir"]),
        precomputed_dir=_resolve_path_with_fallback(root, data["precomputed_dir"]),
        metadata_csv=_resolve_path_with_fallback(root, data["metadata_csv"]),
        num_classes=int(data["num_classes"]),
        input_channels=int(data["input_channels"]),
        input_size=int(data["input_size"]),
        window_size=int(data["window_size"]),
        sw_batch_size=int(data.get("sw_batch_size", 8)),
        tile_overlap=float(data.get("tile_overlap", 0.0)),
        probability_threshold=float(data.get("probability_threshold", 0.5)),
    )
