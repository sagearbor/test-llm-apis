# Docker Deployment Guide

This guide covers building and deploying the LLM Test App using Docker containers.

## Quick Start

```bash
# 1. Ensure .env file is configured with required variables (see below)
cp .env.example .env
# Edit .env with your values

# 2. Build and start with docker-compose
docker-compose up -d

# 3. Check health
curl http://localhost:3003/health

# 4. View logs
docker-compose logs -f

# 5. Stop
docker-compose down
```

## Required Environment Variables

Your `.env` file MUST contain these variables for Docker deployment:

```bash
# Azure OpenAI (REQUIRED)
AZURE_OPENAI_ENDPOINT=https://your-resource-name.openai.azure.com
AZURE_OPENAI_API_KEY=your_actual_api_key_here
AZURE_OPENAI_API_VERSION=2024-02-01

# Model deployments (REQUIRED)
CODING_LLM_DEPLOYMENT_NAME=gpt-5-codex
SMALLEST_LLM_DEPLOYMENT_NAME=gpt-4o-mini
ALLAROUND_LLM_DEPLOYMENT_NAME=gpt-4o
BEST_LLM_DEPLOYMENT_NAME=o1-preview

# Environment (REQUIRED for production)
NODE_ENV=production
APP_ENV=production

# Port (optional, defaults to 3003 in Dockerfile)
PORT=3003

# CORS (REQUIRED for production)
# For Duke deployment:
ALLOWED_ORIGINS=https://aidemo.dcri.duke.edu

# Session (REQUIRED for production if OAuth enabled)
SESSION_SECRET=<generate-with-openssl-rand-base64-32>

# OAuth (optional)
ENABLE_OAUTH=false
# If true, also set:
# AZURE_AD_CLIENT_ID=...
# AZURE_AD_TENANT_ID=...
# AZURE_AD_CLIENT_SECRET=...
```

## Docker Build

### Build Image Manually

```bash
docker build -t llm-test-app .
```

### Build with docker-compose

```bash
docker-compose build
```

## Running the Container

### Option 1: docker-compose (Recommended)

```bash
# Start in detached mode
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down

# Rebuild and restart
docker-compose up -d --build
```

### Option 2: Docker run (Manual)

```bash
docker run -d \
  --name llm-test-app \
  -p 3003:3003 \
  --env-file .env \
  -v $(pwd)/src/data:/app/src/data \
  -v $(pwd)/logs:/app/logs \
  --restart unless-stopped \
  llm-test-app
```

## Volume Mounts

The container uses two volume mounts for persistent data:

### 1. `./src/data` → `/app/src/data` (CRITICAL)
- **Purpose**: Stores usage tracking and rate limit data
- **Must Persist**: YES - data loss on restart will reset all usage metrics
- **Permissions**: Must be writable by container user (UID 1001)

### 2. `./logs` → `/app/logs` (Optional)
- **Purpose**: Application logs
- **Must Persist**: Optional - useful for debugging
- **Permissions**: Must be writable by container user (UID 1001)

### Creating Host Directories

```bash
# Create directories with correct permissions
mkdir -p src/data logs
chmod 755 src/data logs

# If permission errors occur, set ownership:
sudo chown -R 1001:1001 src/data logs
```

## Health Checks

The container includes automatic health checks every 30 seconds:

```bash
# Check health status
docker inspect llm-test-app | grep -A 10 Health

# Manual health check
curl http://localhost:3003/health
```

Expected response:
```json
{
  "status": "healthy",
  "models": {
    "gpt-5-codex": "healthy",
    "gpt-4o-mini": "healthy",
    "gpt-4o": "healthy",
    "o1-preview": "healthy"
  }
}
```

## Resource Limits

The `docker-compose.yml` includes default resource limits:

```yaml
resources:
  limits:
    cpus: '1.0'      # Maximum 1 CPU core
    memory: 512M     # Maximum 512MB RAM
  reservations:
    cpus: '0.5'      # Reserve 0.5 CPU core
    memory: 256M     # Reserve 256MB RAM
```

Adjust these based on your VM resources and load requirements.

## Nginx Reverse Proxy Configuration

For Duke deployment behind Nginx:

```nginx
location /sageapp03 {
    proxy_pass http://localhost:3003;
    proxy_http_version 1.1;

    # Forward original host and protocol
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # WebSocket support (if needed)
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_cache_bypass $http_upgrade;

    # Timeouts for long-running LLM requests
    proxy_connect_timeout 60s;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;
}
```

## Troubleshooting

### Container fails to start

```bash
# Check logs
docker-compose logs llm-test-app

# Common issues:
# 1. Missing .env file → Copy .env.example and configure
# 2. Invalid API key → Check AZURE_OPENAI_API_KEY
# 3. Permission denied on volumes → Run: sudo chown -R 1001:1001 src/data logs
```

### Cannot reach application

```bash
# Check if container is running
docker ps | grep llm-test-app

# Check port binding
docker port llm-test-app

# Expected: 3003/tcp -> 0.0.0.0:3003

# Test from host
curl http://localhost:3003/health
```

### CORS errors in production

```bash
# Verify ALLOWED_ORIGINS is set
docker exec llm-test-app node -e "console.log(process.env.ALLOWED_ORIGINS)"

# Should output: https://aidemo.dcri.duke.edu

# If empty, add to .env and restart:
docker-compose restart
```

### Volume permission errors

```bash
# Error: EACCES: permission denied, open '/app/src/data/usage.csv'

# Fix: Set correct ownership
sudo chown -R 1001:1001 src/data logs

# Or run container as root (NOT RECOMMENDED for production):
docker run --user root ...
```

### High memory usage

```bash
# Check container resource usage
docker stats llm-test-app

# If exceeding limits, adjust in docker-compose.yml:
resources:
  limits:
    memory: 1G  # Increase to 1GB
```

## Production Deployment Checklist

Before deploying to production:

- [ ] `.env` file configured with production values
- [ ] `NODE_ENV=production` set
- [ ] `APP_ENV=production` set
- [ ] `ALLOWED_ORIGINS` set to production URL
- [ ] `SESSION_SECRET` generated with `openssl rand -base64 32`
- [ ] API keys rotated and secured
- [ ] Volume directories created with correct permissions
- [ ] Resource limits adjusted for production load
- [ ] Nginx reverse proxy configured
- [ ] SSL/TLS certificate installed (Let's Encrypt recommended)
- [ ] Health endpoint verified: `curl https://aidemo.dcri.duke.edu/sageapp03/health`
- [ ] Logs monitoring configured
- [ ] Backup strategy for `src/data/` directory

## Updating the Application

```bash
# 1. Pull latest code
git pull origin main

# 2. Rebuild and restart
docker-compose up -d --build

# 3. Verify health
curl http://localhost:3003/health
```

## Backup and Restore

### Backup Usage Data

```bash
# Create backup
tar -czf backup-$(date +%Y%m%d-%H%M%S).tar.gz src/data/

# Store backup securely
mv backup-*.tar.gz /path/to/backup/location/
```

### Restore Usage Data

```bash
# Stop container
docker-compose down

# Restore from backup
tar -xzf backup-YYYYMMDD-HHMMSS.tar.gz

# Start container
docker-compose up -d
```

## Security Notes

1. **Never commit `.env` file** - It's in `.gitignore` for a reason
2. **Rotate API keys** - Azure OpenAI keys should be rotated every 90 days
3. **Container runs as non-root** - User `nodejs` (UID 1001) for security
4. **Volume permissions** - Only UID 1001 should have write access
5. **Network isolation** - Use Docker networks to isolate containers
6. **Resource limits** - Always set CPU and memory limits in production
7. **HTTPS only** - Use Nginx with SSL termination, never HTTP in production

## Monitoring

### Container Logs

```bash
# Follow logs
docker-compose logs -f

# Last 100 lines
docker-compose logs --tail=100

# Specific service
docker-compose logs llm-test-app
```

### Usage Metrics

Usage data is stored in `src/data/usage.csv` and persisted via volume mount.

View recent usage:
```bash
docker exec llm-test-app cat /app/src/data/usage.csv | tail -20
```

## Support

For issues with Docker deployment:
1. Check this guide's troubleshooting section
2. Review container logs: `docker-compose logs`
3. See main deployment guide: `docs/DEPLOYMENT.md`
4. Check security audit: `docs/security-audits/20251017-135325-security-audit.md`
