"""
In-memory LRU cache for precomputed numpy arrays.

Used as a fallback when pre-rendered PNGs are not available (e.g. after live
inference or for tiles that haven't been processed by ``precompute --render-only``).

The cache key is ``(tile_name, file_type)`` where *file_type* is one of
``"pred"``, ``"gt"``, or ``"cam"``.  Each value is the full numpy array from
the corresponding ``.npz`` file (~23 MB per entry).

With ``maxsize=16`` → worst-case ~370 MB RAM.
"""

from __future__ import annotations

import functools
from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    pass

# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------

@functools.lru_cache(maxsize=16)
def _load_npz_array(path_str: str, key: str) -> np.ndarray:
    """Load a single array from a compressed ``.npz`` and hold it in cache.

    Parameters are strings (not ``Path``) so that :pep:`functools.lru_cache`
    can hash them.
    """
    data = np.load(path_str)
    return data[key]


def load_pred(precomputed: Path, tile_name: str) -> np.ndarray:
    """Return the ``probs`` array for *tile_name* (cached)."""
    p = precomputed / f"{tile_name}_pred.npz"
    return _load_npz_array(str(p), "probs")


def load_gt(precomputed: Path, tile_name: str) -> np.ndarray:
    """Return the ``masks`` array for *tile_name* (cached)."""
    p = precomputed / f"{tile_name}_gt.npz"
    return _load_npz_array(str(p), "masks")


def load_cam(precomputed: Path, tile_name: str) -> np.ndarray:
    """Return the ``cams`` array for *tile_name* (cached)."""
    p = precomputed / f"{tile_name}_cam.npz"
    return _load_npz_array(str(p), "cams")


def cache_info():
    """Expose the underlying cache statistics."""
    return _load_npz_array.cache_info()
