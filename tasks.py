import os
import shlex
import json
import time

from invoke import task


# ---------------------------------------------------------------------------
# Azure deployment constants
# ---------------------------------------------------------------------------
AZURE_RG = "rg-gigatime"
AZURE_ACR = "acrgigatime25961"
AZURE_ENV = "cae-gigatime"
AZURE_API_APP = "gigatime-api"
AZURE_WEB_APP = "gigatime-web"


def _compose_files(gpu=False, isolated=False):
    files = ["docker-compose.yml"]
    if gpu:
        files.append("docker-compose.gpu.yml")
    if isolated:
        files.append("docker-compose.isolated.yml")
    return files


def _compose_base(sudo=False, compose="docker compose"):
    return f"sudo {compose}" if sudo else compose


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
        "gpu": "Enable NVIDIA GPU in container (adds --gpus all).",
    }
)
def container_test(c, image="gigatime-offline-test", data_dir="/data", gpu=False):
    c.run(f"docker build -f Dockerfile.offline-test -t {image} .", pty=True)
    gpu_flag = " --gpus all" if gpu else ""
    c.run(
        f"docker run --rm --network none{gpu_flag} -v {shlex.quote(data_dir)}:/data:ro {image}",
        pty=True,
    )


@task(
    help={
        "image": "Docker image name to build/run.",
        "data_dir": "Host path to mount as /data inside container.",
        "timeout": "Notebook cell timeout in seconds.",
        "gpu": "Enable NVIDIA GPU in container (adds --gpus all).",
    }
)
def container_notebook_test(c, image="gigatime-offline-test", data_dir="/data", timeout=120, gpu=False):
    workspace = os.getcwd()
    c.run(f"docker build -f Dockerfile.offline-test -t {image} .", pty=True)
    gpu_flag = " --gpus all" if gpu else ""
    base = (
        f"docker run --rm --network none{gpu_flag} "
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


@task(
    help={
        "compose": "Compose command to use (default: docker compose).",
        "sudo": "Prefix docker compose commands with sudo.",
    }
)
def compose_gpu_isolated_smoke(c, compose="docker compose", sudo=False):
    compose_base = _compose_base(sudo=sudo, compose=compose)
    up_cmd = f"{compose_base} -f docker-compose.yml -f docker-compose.gpu.yml -f docker-compose.isolated.yml up --build -d"
    check_cmd = (
        f"{compose_base} exec api python -c "
        f"\"import socket, torch; "
        f"print('cuda', torch.cuda.is_available()); "
        f"print('device', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'no-gpu'); "
        f"socket.gethostbyname('pypi.org')\""
    )
    down_cmd = f"{compose_base} -f docker-compose.yml -f docker-compose.gpu.yml -f docker-compose.isolated.yml down"

    try:
        c.run(up_cmd, pty=True)
        c.run(check_cmd, pty=True)
    finally:
        c.run(down_cmd, pty=True, warn=True)


@task(
    help={
        "gpu": "Include docker-compose.gpu.yml override.",
        "isolated": "Include docker-compose.isolated.yml override.",
        "build": "Build images before starting.",
        "sudo": "Prefix docker compose commands with sudo.",
        "compose": "Compose command to use (default: docker compose).",
    }
)
def compose_start(c, gpu=False, isolated=False, build=True, sudo=False, compose="docker compose"):
    files = _compose_files(gpu=gpu, isolated=isolated)
    compose_base = _compose_base(sudo=sudo, compose=compose)
    file_args = " ".join(f"-f {file_name}" for file_name in files)
    build_arg = " --build" if build else ""
    c.run(f"{compose_base} {file_args} up{build_arg} -d", pty=True)


@task(
    help={
        "gpu": "Include docker-compose.gpu.yml override.",
        "isolated": "Include docker-compose.isolated.yml override.",
        "sudo": "Prefix docker compose commands with sudo.",
        "compose": "Compose command to use (default: docker compose).",
    }
)
def compose_stop(c, gpu=False, isolated=False, sudo=False, compose="docker compose"):
    files = _compose_files(gpu=gpu, isolated=isolated)
    compose_base = _compose_base(sudo=sudo, compose=compose)
    file_args = " ".join(f"-f {file_name}" for file_name in files)
    c.run(f"{compose_base} {file_args} down", pty=True)


@task(
    help={
        "gpu": "Include docker-compose.gpu.yml override.",
        "isolated": "Include docker-compose.isolated.yml override.",
        "sudo": "Prefix docker compose commands with sudo.",
        "compose": "Compose command to use (default: docker compose).",
    }
)
def compose_ps(c, gpu=False, isolated=False, sudo=False, compose="docker compose"):
    files = _compose_files(gpu=gpu, isolated=isolated)
    compose_base = _compose_base(sudo=sudo, compose=compose)
    file_args = " ".join(f"-f {file_name}" for file_name in files)
    c.run(f"{compose_base} {file_args} ps", pty=True)


@task(
    help={
        "render_only": "Skip inference — bake PNGs/stats/thumbs from existing .npz files.",
    }
)
def precompute_render(c, render_only=True):
    flag = " --render-only" if render_only else ""
    c.run(f"uv run python -m frontend.precompute{flag}", pty=True)


@task
def compose_up_api_gpu_sudo(c):
    c.run(
        "sudo docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build -d api",
        pty=True,
    )


# ---------------------------------------------------------------------------
# Azure helpers
# ---------------------------------------------------------------------------

def _az_json(c, cmd):
    """Run an az CLI command and return parsed JSON."""
    result = c.run(f"az {cmd} -o json", hide=True, warn=True)
    if result.ok:
        return json.loads(result.stdout)
    return None


def _get_api_fqdn(c):
    return c.run(
        f"az containerapp show --name {AZURE_API_APP} --resource-group {AZURE_RG} "
        f"--query properties.configuration.ingress.fqdn -o tsv",
        hide=True,
    ).stdout.strip()


def _get_web_fqdn(c):
    return c.run(
        f"az containerapp show --name {AZURE_WEB_APP} --resource-group {AZURE_RG} "
        f"--query properties.configuration.ingress.fqdn -o tsv",
        hide=True,
    ).stdout.strip()


def _next_tag(c, repo):
    """Return the next sequential tag (v3, v4, ...) for an ACR repository."""
    result = c.run(
        f"az acr repository show-tags --name {AZURE_ACR} --repository {repo} "
        f"--orderby time_desc --top 1 -o tsv",
        hide=True, warn=True,
    )
    if result.ok and result.stdout.strip():
        last = result.stdout.strip()
        if last.startswith("v") and last[1:].isdigit():
            return f"v{int(last[1:]) + 1}"
    return "v1"


# ---------------------------------------------------------------------------
# Azure deployment tasks
# ---------------------------------------------------------------------------

@task(
    help={
        "tag": "Image tag (default: auto-increment from latest in ACR).",
    }
)
def az_build_api(c, tag=""):
    """Build the API image in ACR (cloud build, no local Docker needed)."""
    tag = tag or _next_tag(c, "gigatime-api")
    image = f"gigatime-api:{tag}"
    print(f"Building {AZURE_ACR}.azurecr.io/{image} ...")
    c.run(
        f"az acr build --registry {AZURE_ACR} --image {image} "
        f"--file frontend/Dockerfile.api .",
        pty=True,
    )
    print(f"API image ready: {AZURE_ACR}.azurecr.io/{image}")
    return tag


@task(
    help={
        "tag": "Image tag (default: auto-increment from latest in ACR).",
    }
)
def az_build_web(c, tag=""):
    """Build the Web image in ACR with the correct API_URL baked in."""
    tag = tag or _next_tag(c, "gigatime-web")
    api_fqdn = _get_api_fqdn(c)
    api_url = f"https://{api_fqdn}"
    image = f"gigatime-web:{tag}"
    print(f"Building {AZURE_ACR}.azurecr.io/{image} (API_URL={api_url}) ...")
    c.run(
        f"az acr build --registry {AZURE_ACR} --image {image} "
        f"--file frontend/Dockerfile.web "
        f"--build-arg API_URL={api_url} .",
        pty=True,
    )
    print(f"Web image ready: {AZURE_ACR}.azurecr.io/{image}")
    return tag


@task(
    help={
        "tag": "Image tag to deploy (default: latest in ACR).",
    }
)
def az_deploy_api(c, tag=""):
    """Deploy the API container app with a new image tag."""
    if not tag:
        result = c.run(
            f"az acr repository show-tags --name {AZURE_ACR} --repository gigatime-api "
            f"--orderby time_desc --top 1 -o tsv",
            hide=True,
        )
        tag = result.stdout.strip()
    image = f"{AZURE_ACR}.azurecr.io/gigatime-api:{tag}"
    print(f"Deploying API → {image}")
    c.run(
        f"az containerapp update --name {AZURE_API_APP} --resource-group {AZURE_RG} "
        f"--image {image}",
        pty=True,
    )


@task(
    help={
        "tag": "Image tag to deploy (default: latest in ACR).",
    }
)
def az_deploy_web(c, tag=""):
    """Deploy the Web container app with a new image tag."""
    if not tag:
        result = c.run(
            f"az acr repository show-tags --name {AZURE_ACR} --repository gigatime-web "
            f"--orderby time_desc --top 1 -o tsv",
            hide=True,
        )
        tag = result.stdout.strip()
    image = f"{AZURE_ACR}.azurecr.io/gigatime-web:{tag}"
    print(f"Deploying Web → {image}")
    c.run(
        f"az containerapp update --name {AZURE_WEB_APP} --resource-group {AZURE_RG} "
        f"--image {image}",
        pty=True,
    )


@task(
    help={
        "tag": "Shared image tag for both images (default: auto-increment).",
        "api_only": "Only build+deploy the API.",
        "web_only": "Only build+deploy the web frontend.",
    }
)
def az_deploy(c, tag="", api_only=False, web_only=False):
    """One-command build + deploy for both API and Web to Azure Container Apps."""
    if not tag:
        # Use the higher of the two repos' next tag for consistency
        api_next = _next_tag(c, "gigatime-api")
        web_next = _next_tag(c, "gigatime-web")
        tag = max(api_next, web_next, key=lambda t: int(t[1:]) if t[1:].isdigit() else 0)
    print(f"=== Azure deploy (tag={tag}) ===")

    if not web_only:
        print("\n--- Build API ---")
        az_build_api(c, tag=tag)
        print("\n--- Deploy API ---")
        az_deploy_api(c, tag=tag)

    if not api_only:
        print("\n--- Build Web ---")
        az_build_web(c, tag=tag)
        print("\n--- Deploy Web ---")
        az_deploy_web(c, tag=tag)

    print(f"\n--- Waiting 15s for containers to start ---")
    time.sleep(15)
    az_status(c)
    az_smoke(c)


@task
def az_status(c):
    """Show current Azure deployment status for both container apps."""
    for app_name in [AZURE_API_APP, AZURE_WEB_APP]:
        info = _az_json(
            c,
            f"containerapp show --name {app_name} --resource-group {AZURE_RG} "
            f"--query \"{{name:name, image:properties.template.containers[0].image, "
            f"revision:properties.latestRevisionName, status:properties.runningStatus, "
            f"fqdn:properties.configuration.ingress.fqdn}}\"",
        )
        if info:
            external = "external" if app_name == AZURE_WEB_APP else "internal"
            print(f"{info['name']:20s}  {info['image']:50s}  {info['status']:10s}  ({external})")
            if app_name == AZURE_WEB_APP:
                print(f"  Live URL: https://{info['fqdn']}")


@task
def az_smoke(c):
    """Quick smoke test — hit key endpoints and report HTTP status codes."""
    web_fqdn = _get_web_fqdn(c)
    base = f"https://{web_fqdn}"
    endpoints = [
        ("/", "Homepage"),
        ("/methodology", "Methodology"),
        ("/api/health", "API Health"),
        ("/api/metrics", "API Metrics"),
    ]
    print(f"\nSmoke test: {base}")
    all_ok = True
    for path, label in endpoints:
        result = c.run(
            f'curl -sw "%{{http_code}}" -o /dev/null "{base}{path}"',
            hide=True, warn=True,
        )
        code = result.stdout.strip()
        status = "OK" if code == "200" else "FAIL"
        if code != "200":
            all_ok = False
        print(f"  {label:20s} → {code} {status}")

    # Check security headers
    result = c.run(f'curl -sI "{base}/"', hide=True, warn=True)
    headers = result.stdout.lower()
    sec_headers = ["x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy"]
    present = [h for h in sec_headers if h in headers]
    print(f"  Security headers   → {len(present)}/{len(sec_headers)} present")

    if all_ok and len(present) == len(sec_headers):
        print("\nAll checks passed.")
    else:
        print("\nSome checks failed — review output above.")


@task(
    help={
        "app": "Which app to show logs for: api or web (default: api).",
        "lines": "Number of log lines to show (default: 50).",
    }
)
def az_logs(c, app="api", lines=50):
    """Tail recent container logs from Azure."""
    app_name = AZURE_API_APP if app == "api" else AZURE_WEB_APP
    c.run(
        f"az containerapp logs show --name {app_name} --resource-group {AZURE_RG} "
        f"--tail {lines} --type console",
        pty=True,
    )


@task
def az_teardown(c):
    """Delete the entire Azure resource group (irreversible!)."""
    print(f"This will delete resource group '{AZURE_RG}' and ALL resources within it.")
    confirm = input("Type 'yes' to confirm: ")
    if confirm.strip().lower() == "yes":
        c.run(f"az group delete --name {AZURE_RG} --yes --no-wait", pty=True)
        print("Deletion initiated (async). Resources will be removed in a few minutes.")
    else:
        print("Aborted.")