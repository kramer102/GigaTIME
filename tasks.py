from invoke import task


@task(help={"cuda": "Install Linux CUDA wheels for torch/torchvision after sync."})
def setup_branch(c, cuda=False):
    c.run("uv sync", pty=True)
    if cuda:
        c.run(
            "uv run pip install --upgrade --index-url https://download.pytorch.org/whl/cu124 torch torchvision",
            pty=True,
        )
    c.run(
        'uv run python -c "import torch, torchvision, albumentations, huggingface_hub; print(torch.__version__)"',
        pty=True,
    )