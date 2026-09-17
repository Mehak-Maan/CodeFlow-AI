FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    WORKSPACE_DIR=/app/workspace

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY agents/ ./agents/
COPY graph/ ./graph/
COPY schemas/ ./schemas/
COPY tools/ ./tools/
COPY utils/ ./utils/
COPY sample_test_files/ ./sample_test_files/
COPY api.py .

# Create workspace folder
RUN mkdir -p /app/workspace

# Expose backend port
EXPOSE 8000

# Run FastAPI backend with Uvicorn
CMD ["python", "-m", "uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
