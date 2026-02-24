import os
import shlex

from invoke import task


@task(
    help={
        "cuda": "Install Linux CUDA wheels for torch/torchvision after sync.",
        "hf": "Install optional huggingface-hub dependency.",
    }
)
def setup_branch(c, cuda=False, hf=False):
    sync_cmd = "uv sync --extra hf" if hf else "uv sync"
    c.run(sync_cmd, pty=True)
    if cuda:
        c.run(
            "uv run pip install --upgrade --index-url https://download.pytorch.org/whl/cu124 torch torchvision",
            pty=True,
        )
    smoke_imports = "torch, torchvision, albumentations"
    if hf:
        smoke_imports += ", huggingface_hub"
    c.run(
        f'uv run python -c "import {smoke_imports}; print(torch.__version__)"',
        pty=True,
    )


@task(
    help={
        "image": "Docker image name to build/run.",
        "data_dir": "Host path to mount as /data inside container.",
    }
)
def container_test(c, image="gigatime-offline-test", data_dir="/data"):
    c.run(f"docker build -f Dockerfile.offline-test -t {image} .", pty=True)
    c.run(
        f"docker run --rm --network none -v {shlex.quote(data_dir)}:/data:ro {image}",
        pty=True,
    )


@task(
    help={
        "image": "Docker image name to build/run.",
        "data_dir": "Host path to mount as /data inside container.",
        "timeout": "Notebook cell timeout in seconds.",
    }
)
def container_notebook_test(c, image="gigatime-offline-test", data_dir="/data", timeout=120):
    workspace = os.getcwd()
    c.run(f"docker build -f Dockerfile.offline-test -t {image} .", pty=True)
    base = (
        f"docker run --rm --network none "
        f"-v {shlex.quote(workspace)}:/workspace "
        f"-v {shlex.quote(data_dir)}:/data:ro "
        f"-w /workspace {image}"
    )
    c.run(
        f"{base} uv run jupyter nbconvert --to notebook --execute "
        f"--ExecutePreprocessor.timeout={timeout} --ExecutePreprocessor.allow_errors=True "
        f"--output /tmp/gigatime_testing.executed.ipynb scripts/gigatime_testing.ipynb",
        pty=True,
    )
    c.run(
        f"{base} uv run jupyter nbconvert --to notebook --execute "
        f"--ExecutePreprocessor.timeout={timeout} --ExecutePreprocessor.allow_errors=True "
        f"--output /tmp/gigatime_training.executed.ipynb scripts/gigatime_training.ipynb",
        pty=True,
    )