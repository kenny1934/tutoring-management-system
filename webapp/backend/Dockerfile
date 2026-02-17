# Build stage: install dependencies that need compilation
FROM python:3.11-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    default-libmysqlclient-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Runtime stage: slim image without build tools
FROM python:3.11-slim

WORKDIR /app

# Runtime libs (no gcc/pkg-config) + weasyprint deps (pango, cairo)
RUN apt-get update && apt-get install -y --no-install-recommends \
    default-libmysqlclient-dev \
    libpango-1.0-0 libpangoft2-1.0-0 libcairo2 \
    libgdk-pixbuf2.0-0 fontconfig libfreetype6 \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages and scripts from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY . .

# Cloud Run expects PORT environment variable (default 8080)
ENV PORT=8080
EXPOSE 8080

# Run with uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
