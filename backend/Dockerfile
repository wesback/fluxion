# Multi-stage build for Fluxion FastAPI service
FROM python:3.11-slim as builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --user -r requirements.txt

# Final stage
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user first
RUN useradd -m -u 1000 fluxion

# Copy Python dependencies from builder to fluxion user's home
COPY --from=builder --chown=fluxion:fluxion /root/.local /home/fluxion/.local

# Make sure scripts in .local are usable
ENV PATH=/home/fluxion/.local/bin:$PATH

# Copy application code
COPY --chown=fluxion:fluxion fluxion ./fluxion
COPY --chown=fluxion:fluxion alembic ./alembic
COPY --chown=fluxion:fluxion alembic.ini .

# Switch to non-root user
USER fluxion

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Run the application
CMD ["python", "-m", "uvicorn", "fluxion.main:app", "--host", "0.0.0.0", "--port", "8000"]
