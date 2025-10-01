# Docker Deployment Guide

Complete guide for running the LLM Test App in Docker containers - locally, on VM, and in Azure.

---

## Quick Start - Local Testing

### Prerequisites
- Docker installed ([Get Docker](https://docs.docker.com/get-docker/))
- Docker Compose installed (included with Docker Desktop)

### 1. Test Locally with Docker Compose

```bash
# Make sure you have a .env file
cp .env.example .env
nano .env  # Add your Azure OpenAI credentials

# Build and start
docker-compose up --build

# Access at: http://localhost:3000
```

### 2. Stop the Container

```bash
# Stop gracefully
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

---

## Docker Commands Reference

### Build Image

```bash
# Build the image
docker build -t llm-test-app .

# Build with tag
docker build -t llm-test-app:v1.0 .
```

### Run Container

```bash
# Run with .env file
docker run -d \
  --name llm-test \
  --env-file .env \
  -p 3000:3000 \
  --restart unless-stopped \
  llm-test-app

# Run with individual environment variables
docker run -d \
  --name llm-test \
  -e AZURE_OPENAI_ENDPOINT="https://..." \
  -e AZURE_OPENAI_API_KEY="..." \
  -e ENABLE_OAUTH="false" \
  -p 3000:3000 \
  llm-test-app
```

### Container Management

```bash
# View logs
docker logs llm-test -f

# Check health
docker ps
docker inspect llm-test --format='{{.State.Health.Status}}'

# Stop container
docker stop llm-test

# Start container
docker start llm-test

# Restart container
docker restart llm-test

# Remove container
docker rm -f llm-test

# Remove image
docker rmi llm-test-app
```

---

## Deployment Option 1: VM with Docker

Deploy to your Azure VM using Docker instead of direct Node.js.

### Step 1: Install Docker on VM

```bash
# SSH to VM
ssh your-username@alp-dsvm-003.azure.dhe.duke.edu

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add your user to docker group (optional, to run without sudo)
sudo usermod -aG docker $USER
newgrp docker

# Verify installation
docker --version
docker-compose --version
```

### Step 2: Clone Repository

```bash
# Create directory
sudo mkdir -p /opt/llm-test-app
sudo chown $USER:$USER /opt/llm-test-app

# Clone repo
cd /opt/llm-test-app
git clone https://github.com/sagearbor/test-llm-apis.git .
```

### Step 3: Configure Environment

```bash
# Create .env file
cp .env.example .env
nano .env

# Add your credentials:
AZURE_OPENAI_ENDPOINT=https://ai-sandbox-instance.openai.azure.com/
AZURE_OPENAI_API_KEY=your-key
AZURE_OPENAI_API_VERSION=2025-03-01-preview

ENABLE_OAUTH=true
AZURE_AD_CLIENT_ID=your-client-id
AZURE_AD_TENANT_ID=your-tenant-id
AZURE_AD_CLIENT_SECRET=your-secret
SESSION_SECRET=your-random-secret
NODE_ENV=production
```

### Step 4: Start with Docker Compose

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Check status
docker-compose ps
```

### Step 5: Configure NGINX (same as before)

Use the NGINX configuration from `docs/nginx-config-example.conf`, but point to:
```nginx
proxy_pass http://localhost:3000;  # Docker container
```

### Step 6: Auto-Start on VM Reboot

Create systemd service for Docker Compose:

```bash
sudo nano /etc/systemd/system/llm-test-docker.service
```

Paste:
```ini
[Unit]
Description=LLM Test App Docker Container
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/llm-test-app
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

Enable:
```bash
sudo systemctl daemon-reload
sudo systemctl enable llm-test-docker
sudo systemctl start llm-test-docker

# Check status
sudo systemctl status llm-test-docker
```

---

## Deployment Option 2: Azure Container Instances (ACI)

Deploy as a managed container in Azure - simplest option.

### Step 1: Build and Push to Azure Container Registry

```bash
# Create Azure Container Registry (one-time)
az acr create \
  --name yourregistryname \
  --resource-group your-resource-group \
  --sku Basic \
  --admin-enabled true

# Login to registry
az acr login --name yourregistryname

# Build and push
docker build -t yourregistryname.azurecr.io/llm-test-app:latest .
docker push yourregistryname.azurecr.io/llm-test-app:latest
```

### Step 2: Get Registry Credentials

```bash
az acr credential show --name yourregistryname
# Save username and password
```

### Step 3: Create Container Instance

```bash
az container create \
  --name llm-test-app \
  --resource-group your-resource-group \
  --image yourregistryname.azurecr.io/llm-test-app:latest \
  --registry-login-server yourregistryname.azurecr.io \
  --registry-username <username> \
  --registry-password <password> \
  --dns-name-label llm-test-app-unique \
  --ports 3000 \
  --environment-variables \
    NODE_ENV=production \
    AZURE_OPENAI_ENDPOINT="https://..." \
    AZURE_OPENAI_API_KEY="..." \
    ENABLE_OAUTH="true" \
  --secure-environment-variables \
    AZURE_AD_CLIENT_SECRET="..." \
    SESSION_SECRET="..." \
  --cpu 1 \
  --memory 1
```

### Step 4: Access Your Container

```bash
# Get the FQDN
az container show \
  --name llm-test-app \
  --resource-group your-resource-group \
  --query ipAddress.fqdn

# Access at: http://llm-test-app-unique.region.azurecontainer.io:3000
```

### Step 5: View Logs

```bash
az container logs \
  --name llm-test-app \
  --resource-group your-resource-group \
  --follow
```

---

## Deployment Option 3: Azure Container Apps (Recommended)

Modern, fully managed container hosting with auto-scaling and HTTPS.

### Step 1: Create Container Apps Environment

```bash
# Install the extension
az extension add --name containerapp

# Create environment
az containerapp env create \
  --name llm-test-env \
  --resource-group your-resource-group \
  --location eastus2
```

### Step 2: Deploy Container App

```bash
az containerapp create \
  --name llm-test-app \
  --resource-group your-resource-group \
  --environment llm-test-env \
  --image yourregistryname.azurecr.io/llm-test-app:latest \
  --registry-server yourregistryname.azurecr.io \
  --registry-username <username> \
  --registry-password <password> \
  --target-port 3000 \
  --ingress external \
  --min-replicas 1 \
  --max-replicas 3 \
  --env-vars \
    NODE_ENV=production \
    AZURE_OPENAI_ENDPOINT="https://..." \
    AZURE_OPENAI_API_KEY="..." \
    ENABLE_OAUTH=true \
  --secrets \
    azure-ad-secret="..." \
    session-secret="..."
```

### Step 3: Update OAuth Redirect URI

Azure Portal → Entra ID → App registrations → Your app → Authentication:

Add redirect URI:
```
https://llm-test-app.nicegrass-12345.eastus2.azurecontainerapps.io/auth/redirect
```

### Step 4: Access Your App

```bash
# Get the URL
az containerapp show \
  --name llm-test-app \
  --resource-group your-resource-group \
  --query properties.configuration.ingress.fqdn

# Access at: https://<fqdn>
```

### Benefits of Container Apps:
- ✅ Automatic HTTPS (no NGINX needed)
- ✅ Auto-scaling based on load
- ✅ Built-in monitoring and logs
- ✅ Easier than Container Instances
- ✅ Custom domains supported
- ✅ Zero-downtime deployments

---

## Updating Your Deployment

### Local / VM Docker

```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker-compose up -d --build

# Or manually:
docker build -t llm-test-app .
docker stop llm-test
docker rm llm-test
docker run -d --name llm-test --env-file .env -p 3000:3000 llm-test-app
```

### Azure Container Registry

```bash
# Rebuild and push
docker build -t yourregistryname.azurecr.io/llm-test-app:latest .
docker push yourregistryname.azurecr.io/llm-test-app:latest

# Restart container instance
az container restart \
  --name llm-test-app \
  --resource-group your-resource-group

# Or update container app
az containerapp update \
  --name llm-test-app \
  --resource-group your-resource-group \
  --image yourregistryname.azurecr.io/llm-test-app:latest
```

---

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker logs llm-test

# Common issues:
# 1. Missing environment variables
docker inspect llm-test | grep -A 20 Env

# 2. Port already in use
sudo netstat -tulpn | grep 3000

# 3. .env file not found
ls -la .env
```

### Health Check Failing

```bash
# Check health endpoint
curl http://localhost:3000/health

# Enter container to debug
docker exec -it llm-test sh

# Inside container:
node -e "console.log(process.env)"
wget -O- http://localhost:3000/health
```

### Azure Container Issues

```bash
# View detailed logs
az container logs \
  --name llm-test-app \
  --resource-group your-resource-group \
  --tail 100

# Check container state
az container show \
  --name llm-test-app \
  --resource-group your-resource-group \
  --query instanceView.state
```

---

## Comparison: Deployment Options

| Feature | Local Docker | VM + Docker | Azure Container Instances | Azure Container Apps |
|---------|-------------|-------------|--------------------------|---------------------|
| **Complexity** | Low | Medium | Medium | Low |
| **HTTPS** | Manual | NGINX | Manual cert | Auto |
| **Auto-scale** | No | No | No | Yes |
| **Cost** | Free | VM cost | Per second | Per request |
| **Startup** | Instant | Instant | 30-60s | Fast |
| **Monitoring** | Manual | journalctl | Azure Monitor | Built-in |
| **Updates** | git pull | git pull | Image push | Image push |
| **Best for** | Development | Duke network | Simple hosting | Production |

---

## Security Notes

### Container Security

```bash
# The container runs as non-root (nodejs user, UID 1001)
docker exec llm-test id
# Should show: uid=1001(nodejs) gid=1001(nodejs)

# Check for vulnerabilities
docker scan llm-test-app
```

### Environment Variables

- Never commit `.env` to git
- Use Azure Key Vault for secrets in production
- Use `--secure-environment-variables` in ACI for sensitive data

---

## Quick Reference

**Local testing:**
```bash
docker-compose up --build
```

**VM deployment:**
```bash
docker-compose up -d
sudo systemctl enable llm-test-docker
```

**Azure Container Apps:**
```bash
az containerapp create --name llm-test-app ...
```

**View logs:**
```bash
docker logs llm-test -f
az container logs --name llm-test-app --follow
```

**Update:**
```bash
docker-compose up -d --build
```
