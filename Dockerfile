# ==============================================================================
# Epako Voice AI - Backend Speech Gateway (Cloud Run & Docker)
# ==============================================================================
FROM python:3.11-slim

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    PIPER_VOICES_DIR=/app/models/piper

# Install system dependencies required by soundfile, librosa, and Piper TTS
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    espeak-ng \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency specifications
COPY requirements.txt .

# Install dependencies (including PyTorch, transformers, Piper, FastAPI)
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download Piper neural voices into image so the container starts instantly
RUN mkdir -p /app/models/piper && \
    python -m piper.download_voices en_US-ryan-medium --download-dir /app/models/piper && \
    python -m piper.download_voices en_US-amy-medium --download-dir /app/models/piper

# Copy backend source code
COPY src/ /app/src/

# Expose default backend port
EXPOSE 8000

# Start FastAPI gateway via Uvicorn (reads PORT dynamically from environment)
CMD ["python", "src/api.py"]

