# Deploy GigaTIME to Azure (Container Apps)

This guide deploys **two containers**:

- `api` (FastAPI, internal ingress)
- `web` (Next.js, external ingress)

This matches the existing repo Docker structure (`frontend/Dockerfile.api` and `frontend/Dockerfile.web`).

## Before you start

Install and authenticate:

```bash
az login
az extension add --name containerapp --upgrade
az provider register --namespace Microsoft.App
az provider register --namespace Microsoft.OperationalInsights
```

Set variables (example):

```bash
SUBSCRIPTION_ID="<subscription-id>"
LOCATION="westus2"
RG="rg-gigatime"
ACR="acrgigatime<unique>"
ENV_NAME="cae-gigatime"
API_APP="gigatime-api"
WEB_APP="gigatime-web"
IMAGE_TAG="v1"
```

Select subscription:

```bash
az account set --subscription "$SUBSCRIPTION_ID"
```

## MVP deployment runbook

### 1) Create resource group and registry

```bash
az group create --name "$RG" --location "$LOCATION"
az acr create --name "$ACR" --resource-group "$RG" --location "$LOCATION" --sku Basic
az acr login --name "$ACR"
ACR_LOGIN_SERVER=$(az acr show --name "$ACR" --resource-group "$RG" --query loginServer -o tsv)
```

### 2) Build and push API and web images

From repo root:

```bash
docker build -f frontend/Dockerfile.api -t "$ACR_LOGIN_SERVER/gigatime-api:$IMAGE_TAG" .
docker build -f frontend/Dockerfile.web -t "$ACR_LOGIN_SERVER/gigatime-web:$IMAGE_TAG" --build-arg API_URL="http://$API_APP" .
docker push "$ACR_LOGIN_SERVER/gigatime-api:$IMAGE_TAG"
docker push "$ACR_LOGIN_SERVER/gigatime-web:$IMAGE_TAG"
```

> Note: For production, set `API_URL` to the API app FQDN after API creation, then rebuild web image.

### 3) Create Container Apps environment

```bash
az containerapp env create --name "$ENV_NAME" --resource-group "$RG" --location "$LOCATION"
```

### 4) Deploy API app (internal ingress)

```bash
az containerapp create \
  --name "$API_APP" \
  --resource-group "$RG" \
  --environment "$ENV_NAME" \
  --image "$ACR_LOGIN_SERVER/gigatime-api:$IMAGE_TAG" \
  --target-port 8000 \
  --ingress internal \
  --registry-server "$ACR_LOGIN_SERVER" \
  --min-replicas 1 --max-replicas 2
```

Get API FQDN:

```bash
API_FQDN=$(az containerapp show --name "$API_APP" --resource-group "$RG" --query properties.configuration.ingress.fqdn -o tsv)
echo "$API_FQDN"
```

### 5) Rebuild web image with API URL and deploy web app

```bash
docker build -f frontend/Dockerfile.web -t "$ACR_LOGIN_SERVER/gigatime-web:$IMAGE_TAG" --build-arg API_URL="https://$API_FQDN" .
docker push "$ACR_LOGIN_SERVER/gigatime-web:$IMAGE_TAG"

az containerapp create \
  --name "$WEB_APP" \
  --resource-group "$RG" \
  --environment "$ENV_NAME" \
  --image "$ACR_LOGIN_SERVER/gigatime-web:$IMAGE_TAG" \
  --target-port 3000 \
  --ingress external \
  --registry-server "$ACR_LOGIN_SERVER" \
  --min-replicas 1 --max-replicas 2
```

Get web URL:

```bash
WEB_FQDN=$(az containerapp show --name "$WEB_APP" --resource-group "$RG" --query properties.configuration.ingress.fqdn -o tsv)
echo "https://$WEB_FQDN"
```

### 6) Smoke tests

```bash
curl -s "https://$API_FQDN/api/health"
curl -s "https://$API_FQDN/api/tiles"
curl -s -o /dev/null -w "%{http_code}" "https://$API_FQDN/api/tile/0_10564_556_556/channel/0?kind=cam"
```

## Handling model/data/precomputed assets (two options)

The API expects these paths in-container:

- `/app/model/model.pth`
- `/app/data/sample_test_data/data`
- `/app/frontend/precomputed`

### Option A (recommended): mount Azure Storage

Use Azure Files or Blobfuse mounts and mount to the paths above. Benefits:

- smaller images
- update data/model without image rebuild
- easier operations for large artifact sets

Suggested layout in storage:

- `model/model.pth`
- `data/sample_test_data/data/*`
- `frontend/precomputed/*`

Then configure container app volume mounts so the API can read these directories.

### Option B: bake assets into image

Extend `frontend/Dockerfile.api` to copy model/data/precomputed into image at build time. Benefits:

- simpler runtime configuration
- fully immutable deploy artifact

Trade-offs:

- much larger image size
- slower deploys
- must rebuild and redeploy for any data/model refresh

## Production hardening checklist

- Restrict CORS in `frontend/api/main.py` (`allow_origins` should not be `*` in production).
- Keep API internal-only unless external access is required.
- Use managed identity and secret references for registry/storage credentials.
- Add health probes and alerts (Container Apps + Log Analytics).
- Set autoscaling rules based on HTTP concurrency or CPU/memory.
- Add custom domain + managed TLS for the web app.
- Add WAF (Front Door/Application Gateway) if internet exposure is high.
- Log/monitor 5xx rates, latency, and container restarts.

## Troubleshooting

### 401/registry pull failures

- Confirm ACR credentials/identity permissions for container apps.
- Verify image exists: `az acr repository show-tags --name "$ACR" --repository gigatime-api`.

### API returns empty tile list

- Validate mounted data path contains files at expected location.
- Verify `DATA_DIR` assumptions in `frontend/api/main.py`.

### `kind=cam` returns 404

- Ensure `_cam.npz` files are present in mounted `frontend/precomputed` path.
- If missing, generate using `uv run python scripts/precompute_gradcam.py` before deploying artifacts.

### Web cannot reach API

- Confirm `API_URL` was set correctly at web image build time.
- Confirm API ingress and DNS/FQDN are correct.

## Optional teardown

```bash
az group delete --name "$RG" --yes --no-wait
```
