FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TRANSFORMERS_CACHE=/models/transformers \
    U2NET_HOME=/models/rembg

WORKDIR /app
COPY spatial_worker/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY spatial_worker /app/spatial_worker
RUN python -c "from transformers import pipeline; pipeline('depth-estimation', model='depth-anything/Depth-Anything-V2-Small-hf')" \
    && python -c "from rembg import new_session; new_session('isnet-general-use')"

EXPOSE 8080
CMD ["uvicorn", "spatial_worker.app:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
