# Modal AI worker

Fanfolio keeps the API, authentication, job state, and asset storage in the
existing backend. Modal runs only the expensive `/analyze` and `/generate`
worker endpoints. The browser never receives the Modal token.

## First-time setup

Create a Modal Secret named `fanfolio-spatial-worker` with:

```text
SPATIAL_SCENE_WORKER_TOKEN=<long-random-server-only-token>
```

Deploy from the repository root:

```bash
modal deploy modal_app.py
```

The deployment prints a generated web URL. The endpoint is protected by the
worker token; configure that URL and the same token only in the Render API
environment:

```text
SPATIAL_SCENE_PROVIDER=modal
SPATIAL_SCENE_AI_URL=https://<modal-generated-url>
SPATIAL_SCENE_AI_TOKEN=<same-server-only-token>
```

Keep local development on `SPATIAL_SCENE_PROVIDER=local_fallback` until a
real-image smoke test passes. Use `modal run modal_app.py` only for a
controlled endpoint check; `max_containers=1`, a 120-second timeout, and the
Modal workspace budget are deliberate credit guardrails.

The Starter workspace includes monthly compute credits, but usage is still
metered. Set a workspace budget and spend limit in Modal before enabling the
Render variable.
