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
    }
)
def container_test(c, image="gigatime-offline-test"):
    c.run(f"docker build -f Dockerfile.offline-test -t {image} .", pty=True)
    c.run(f"docker run --rm --network none {image}", pty=True)