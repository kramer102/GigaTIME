# GigaTIME Documentation

This folder explains how the repository works, how to run it locally, and how to deploy it to Azure.

## Contents

- [How the codebase works](how-it-works.md)
- [Run locally and with Docker](run.md)
- [Deploy to Azure Container Apps](deploy-azure.md)
- [Troubleshooting](troubleshooting.md)

## Fast path

If you want to get running quickly:

1. Follow [Run locally and with Docker](run.md).
2. Open the app at `http://localhost:3000`.
3. Use the API health check at `http://localhost:8000/api/health`.

## Notes

- This project is research-oriented and includes model inference code plus an interactive explorer UI.
- The deployment guide targets Azure Container Apps because this repo already ships separate Dockerfiles for API and web services.
