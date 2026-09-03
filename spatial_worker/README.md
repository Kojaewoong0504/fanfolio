# Fanfolio spatial scene worker

This optional private service performs expensive preprocessing outside the main API. It estimates monocular depth with Depth Anything V2 Small, extracts the foreground with IS-Net through `rembg`, and creates a hidden-background plate with OpenCV inpainting.

Run it on a machine with enough memory for Torch and ONNX Runtime:

```bash
docker build -f spatial_worker/Dockerfile -t fanfolio-spatial-worker .
docker run --rm -p 8080:8080 -e SPATIAL_SCENE_WORKER_TOKEN=replace-me fanfolio-spatial-worker
```

Configure the main API with:

```dotenv
SPATIAL_SCENE_PROVIDER=http
SPATIAL_SCENE_AI_URL=http://spatial-worker:8080/generate
SPATIAL_SCENE_AI_TOKEN=replace-me
SPATIAL_SCENE_AI_TIMEOUT_SECONDS=90
```

The worker endpoint must remain private. The main API stores only validated derivatives through its configured local, R2, S3, or Supabase storage provider.

