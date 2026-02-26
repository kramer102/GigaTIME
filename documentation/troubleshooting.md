# Troubleshooting

Use this page when setup or runtime behavior is unexpected.

## Local/dev issues

### `uv run pytest` fails (`No such file or directory`)

`pytest` is not currently configured as a project dependency and there is no repo test suite wired for it.

Use service-level checks instead:

```bash
curl -s http://localhost:8000/api/health
curl -s http://localhost:8000/api/tiles
```

### `docker-compose` not found

Use modern Compose command:

```bash
docker compose up --build
```

### API 404 for channels or tiles

Check required files exist:

- `model/model.pth`
- `data/sample_test_data/data/*_he.png`
- `frontend/precomputed/*_pred.npz`
- `frontend/precomputed/*_cam.npz` (for `kind=cam`)

## Runtime validation checks

```bash
curl -s http://localhost:8000/api/health
curl -s http://localhost:8000/api/tiles
curl -s -o /dev/null -w "%{http_code}" "http://localhost:8000/api/tile/0_10564_556_556/channel/0?kind=cam"
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

Expected:

- health endpoint returns JSON with `ok: true`
- `kind=cam` request returns `200`
- web homepage returns `200`

## Azure-specific issues

### `Authentication failed. Please run 'az login'`

Authenticate first:

```bash
az login
```

Then select subscription:

```bash
az account set --subscription "<subscription-id>"
```

### Web app starts, API calls fail

- Verify web image was built with the right `API_URL`.
- Confirm API ingress/FQDN and network reachability.

### Missing artifacts in cloud deployment

Ensure one of these is true:

- storage mounts are configured to `/app/model`, `/app/data`, and `/app/frontend/precomputed`
- or images were built with these assets baked in
