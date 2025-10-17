# Production Deployment Guide

This guide outlines all steps required to deploy this application from development to validation/production environments.

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Environment Configuration](#environment-configuration)
3. [Security Configuration](#security-configuration)
4. [CORS Setup](#cors-setup)
5. [Azure Deployment](#azure-deployment)
6. [Docker Deployment](#docker-deployment)
7. [Post-Deployment Verification](#post-deployment-verification)
8. [Monitoring & Maintenance](#monitoring--maintenance)
9. [Rollback Procedures](#rollback-procedures)

---

## Pre-Deployment Checklist

### Code Quality
- [ ] All tests pass (if applicable)
- [ ] No console.log statements in production code (except intentional logging)
- [ ] All TODO/FIXME comments addressed
- [ ] Code reviewed and approved
- [ ] Latest security audit findings resolved

### Dependencies
- [ ] `npm audit` shows no high/critical vulnerabilities
- [ ] All dependencies are at stable versions (not pre-release)
- [ ] `package-lock.json` is committed and up-to-date
- [ ] Production-only dependencies verified (`npm ci --only=production`)

### Security
- [ ] No API keys or secrets in code or git history
- [ ] `.env` file is properly excluded in `.gitignore`
- [ ] `.claude/` directory is excluded in `.gitignore`
- [ ] All sensitive configuration uses environment variables
- [ ] SESSION_SECRET is configured (not using auto-generated default)

### Documentation
- [ ] README.md is up-to-date
- [ ] Environment variables documented
- [ ] API endpoints documented
- [ ] Deployment procedures documented

---

## Environment Configuration

### Required Environment Variables

Create a `.env` file in production with the following variables:

```bash
# ========================================
# Environment Settings
# ========================================
NODE_ENV=production
APP_ENV=production
PORT=3000

# ========================================
# Azure OpenAI Configuration
# ========================================
AZURE_OPENAI_ENDPOINT=https://your-resource-name.openai.azure.com
AZURE_OPENAI_API_KEY=your_production_api_key_here
AZURE_OPENAI_API_VERSION=2024-02-01

# Model Deployment Names (must match Azure exactly)
CODING_LLM_DEPLOYMENT_NAME=gpt-5-codex
SMALLEST_LLM_DEPLOYMENT_NAME=gpt-4o-mini
ALLAROUND_LLM_DEPLOYMENT_NAME=gpt-4o
BEST_LLM_DEPLOYMENT_NAME=o1-preview

# ========================================
# Security Configuration (CRITICAL!)
# ========================================

# Session secret - MUST be set in production
# Generate with: openssl rand -base64 32
SESSION_SECRET=<generate-with-openssl-rand-base64-32>

# CORS - Comma-separated list of allowed origins (REQUIRED!)
# Example: https://app.company.com,https://dashboard.company.com
ALLOWED_ORIGINS=https://your-frontend-url.com

# Azure Web App URL (if using Azure)
AZURE_WEBAPP_URL=https://your-app.azurewebsites.net

# Force authentication for all endpoints
REQUIRE_AUTH=true

# ========================================
# OAuth Configuration (if enabled)
# ========================================
ENABLE_OAUTH=true
AZURE_AD_CLIENT_ID=your-client-id
AZURE_AD_TENANT_ID=your-tenant-id
AZURE_AD_CLIENT_SECRET=your-client-secret

# ========================================
# Rate Limiting (Production Defaults)
# ========================================
RATE_LIMIT_MAX=10
RATE_LIMIT_WINDOW_MS=60000

# ========================================
# File Upload Configuration
# ========================================
MAX_FILE_SIZE_MB=10
MAX_FILES_PER_USER=5
FILE_RETENTION_HOURS=1
UPLOAD_RATE_LIMIT_PER_HOUR=10

# ========================================
# LLM Response Configuration
# ========================================
MAX_COMPLETION_TOKENS=12800

# ========================================
# Usage Tracking (if OAuth enabled)
# ========================================
DATA_DIR=/app/data
ADMIN_EMAILS=admin@company.com
ADMIN_DOMAINS=company.com
DEFAULT_HOURLY_TOKENS=100000
DEFAULT_DAILY_TOKENS=1000000
DEFAULT_HOURLY_COST=10
DEFAULT_DAILY_COST=100
```

### Variable Validation Checklist

Before deploying, verify:

- [ ] **AZURE_OPENAI_ENDPOINT** - Valid Azure endpoint URL
- [ ] **AZURE_OPENAI_API_KEY** - Valid API key (test with curl)
- [ ] **SESSION_SECRET** - Set to cryptographically secure random string
- [ ] **ALLOWED_ORIGINS** - Contains your actual frontend URL(s)
- [ ] **ENABLE_OAUTH** - Set to `true` for production
- [ ] **REQUIRE_AUTH** - Set to `true` for production
- [ ] **All deployment names** - Match Azure OpenAI deployments exactly (case-sensitive)

---

## Security Configuration

### 1. Session Secret

**CRITICAL:** Never use the auto-generated session secret in production.

```bash
# Generate a secure session secret
openssl rand -base64 32

# Add to .env
SESSION_SECRET=<output-from-above-command>
```

**What happens if not set:**
- Application will throw error on startup (intentional fail-safe)
- Sessions will not work
- Authentication will fail

### 2. HTTPS Configuration

The application automatically enforces HTTPS in production (`NODE_ENV=production`).

**Requirements:**
- Deploy behind HTTPS-capable reverse proxy (Azure handles this)
- Ensure `X-Forwarded-Proto` header is set by reverse proxy
- Certificate must be valid (no self-signed in production)

**Verification:**
```bash
# Test HTTPS redirect
curl -I http://your-app.com
# Should return 301/302 redirect to https://
```

### 3. Security Headers

Security headers are automatically configured via Helmet.js:

**Production Headers:**
- Content-Security-Policy: Strict (no unsafe-inline for scripts)
- HSTS: max-age=31536000 (1 year)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: no-referrer

**Verify headers:**
```bash
curl -I https://your-app.com
```

### 4. Rate Limiting

**Production defaults:**
- API endpoints: 10 requests/minute
- Auth endpoints: 5 requests/15 minutes
- File uploads: 10 files/hour per user

**Customization:**
```bash
# Adjust in .env
RATE_LIMIT_MAX=10
RATE_LIMIT_WINDOW_MS=60000  # 1 minute
```

---

## CORS Setup

### Understanding CORS for This Application

CORS (Cross-Origin Resource Sharing) controls which websites can call your API.

**Scenario:**
- Your API: `https://api.company.com`
- Your frontend: `https://app.company.com`
- CORS ensures: Only `app.company.com` can call your API

### Configuration Steps

#### Step 1: Identify Your Frontend URL(s)

List all URLs that should access your API:
- Production frontend: `https://app.company.com`
- Staging frontend: `https://staging.app.company.com`
- Admin dashboard: `https://admin.company.com`

#### Step 2: Set ALLOWED_ORIGINS

```bash
# In production .env file
ALLOWED_ORIGINS=https://app.company.com,https://admin.company.com
```

**IMPORTANT:**
- Use HTTPS URLs (not HTTP)
- No trailing slashes
- Comma-separated, no spaces
- Must be exact matches

#### Step 3: Verify CORS Configuration

**Test allowed origin:**
```bash
curl -X OPTIONS https://your-api.com/api/models \
  -H "Origin: https://app.company.com" \
  -H "Access-Control-Request-Method: POST" \
  -v
```

**Expected response:**
- Status: 204 No Content
- Header: `Access-Control-Allow-Origin: https://app.company.com`
- Header: `Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS`

**Test blocked origin:**
```bash
curl -X OPTIONS https://your-api.com/api/models \
  -H "Origin: https://evil.com" \
  -v
```

**Expected response:**
- Status: 500
- Error: "CORS policy violation: Origin https://evil.com not allowed"

#### Step 4: Common CORS Issues

**Problem:** "No 'Access-Control-Allow-Origin' header"
- **Cause:** ALLOWED_ORIGINS not set or doesn't include frontend URL
- **Fix:** Add frontend URL to ALLOWED_ORIGINS

**Problem:** "CORS policy violation" errors in logs
- **Cause:** Legitimate origin not in ALLOWED_ORIGINS
- **Fix:** Add the origin to allowed list

**Problem:** "CORS not configured" error
- **Cause:** ALLOWED_ORIGINS is empty in production
- **Fix:** Set ALLOWED_ORIGINS environment variable

### Azure-Specific CORS

If deploying to Azure Web Apps, you may also need to configure CORS in Azure Portal:

1. Navigate to: Azure Portal → Your Web App → CORS
2. Add allowed origins (same as ALLOWED_ORIGINS env var)
3. Check "Enable Access-Control-Allow-Credentials"

**Note:** Application-level CORS (in code) takes precedence, so ensure consistency.

---

## Azure Deployment

### Option 1: Azure Web Apps (Recommended)

#### Prerequisites
- Azure subscription
- Azure CLI installed
- Resource group created
- Azure OpenAI resource deployed

#### Deployment Steps

```bash
# 1. Login to Azure
az login

# 2. Create App Service Plan (if needed)
az appservice plan create \
  --name llm-test-app-plan \
  --resource-group your-resource-group \
  --sku B1 \
  --is-linux

# 3. Create Web App
az webapp create \
  --name your-app-name \
  --resource-group your-resource-group \
  --plan llm-test-app-plan \
  --runtime "NODE:22-lts"

# 4. Configure environment variables
az webapp config appsettings set \
  --name your-app-name \
  --resource-group your-resource-group \
  --settings \
    NODE_ENV=production \
    AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com" \
    AZURE_OPENAI_API_KEY="your-api-key" \
    SESSION_SECRET="$(openssl rand -base64 32)" \
    ALLOWED_ORIGINS="https://your-frontend-url.com"

# 5. Enable HTTPS only
az webapp update \
  --name your-app-name \
  --resource-group your-resource-group \
  --https-only true

# 6. Deploy code
az webapp deployment source config-zip \
  --name your-app-name \
  --resource-group your-resource-group \
  --src deployment.zip
```

#### Post-Deployment Configuration

1. **Enable Application Insights** (recommended):
   ```bash
   az monitor app-insights component create \
     --app your-app-name \
     --location eastus \
     --resource-group your-resource-group
   ```

2. **Configure Managed Identity** (for secure Azure OpenAI access):
   ```bash
   az webapp identity assign \
     --name your-app-name \
     --resource-group your-resource-group
   ```

3. **Set up continuous deployment** (GitHub Actions, Azure DevOps, etc.)

---

## Docker Deployment

### Building the Image

```bash
# Build production image
docker build -t llm-test-app:latest .

# Tag for registry
docker tag llm-test-app:latest your-registry.azurecr.io/llm-test-app:latest

# Push to registry
docker push your-registry.azurecr.io/llm-test-app:latest
```

### Running Locally

```bash
docker run -d \
  --name llm-test-app \
  -p 3000:3000 \
  --env-file .env.production \
  -v /path/to/data:/app/data \
  llm-test-app:latest
```

### Azure Container Instances

```bash
az container create \
  --name llm-test-app \
  --resource-group your-resource-group \
  --image your-registry.azurecr.io/llm-test-app:latest \
  --dns-name-label your-app-name \
  --ports 3000 \
  --environment-variables \
    NODE_ENV=production \
    AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com" \
  --secure-environment-variables \
    AZURE_OPENAI_API_KEY="your-api-key" \
    SESSION_SECRET="your-session-secret"
```

### Docker Compose (Production)

```yaml
version: '3.8'
services:
  app:
    image: llm-test-app:latest
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - AZURE_OPENAI_ENDPOINT=${AZURE_OPENAI_ENDPOINT}
      - AZURE_OPENAI_API_KEY=${AZURE_OPENAI_API_KEY}
      - SESSION_SECRET=${SESSION_SECRET}
      - ALLOWED_ORIGINS=${ALLOWED_ORIGINS}
    volumes:
      - ./data:/app/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 3s
      retries: 3
```

---

## Post-Deployment Verification

### 1. Health Check

```bash
# Test health endpoint
curl https://your-app.com/health

# Expected response:
{
  "coding_llm_api": { "status": "ok", "deploymentName": "gpt-5-codex" },
  "smallest_llm_api": { "status": "ok", "deploymentName": "gpt-4o-mini" },
  "allaround_llm_api": { "status": "ok", "deploymentName": "gpt-4o" },
  "best_llm_api": { "status": "ok", "deploymentName": "o1-preview" }
}
```

### 2. Authentication Test

```bash
# Should redirect to login
curl -I https://your-app.com/api/models

# Expected: 302 redirect to /login
```

### 3. CORS Verification

```bash
# Test from browser console on your frontend
fetch('https://your-api.com/api/models', {
  credentials: 'include'
})
.then(r => r.json())
.then(console.log)
```

### 4. Security Headers Check

```bash
# Verify all security headers present
curl -I https://your-app.com

# Should include:
# - Strict-Transport-Security
# - X-Frame-Options: DENY
# - X-Content-Type-Options: nosniff
# - Content-Security-Policy
```

### 5. Rate Limiting Test

```bash
# Make 15 rapid requests
for i in {1..15}; do
  curl -w "\n%{http_code}\n" https://your-app.com/api/config
done

# Should see 429 (Too Many Requests) after 10 requests
```

### 6. File Upload Test

```bash
# Test file upload with authentication
curl -X POST https://your-app.com/api/upload \
  -H "Cookie: sessionId=your-session-cookie" \
  -F "file=@test-document.pdf"
```

---

## Monitoring & Maintenance

### Application Logs

**Azure Web Apps:**
```bash
# Enable logging
az webapp log config \
  --name your-app-name \
  --resource-group your-resource-group \
  --application-logging filesystem

# Stream logs
az webapp log tail \
  --name your-app-name \
  --resource-group your-resource-group
```

**Docker:**
```bash
# View logs
docker logs -f llm-test-app

# Save logs to file
docker logs llm-test-app > /var/log/llm-test-app.log
```

### Metrics to Monitor

1. **Usage Tracking** (data/usage.csv):
   - Token consumption per user
   - Cost tracking
   - Request success/failure rates
   - Model usage distribution

2. **System Metrics**:
   - CPU usage
   - Memory usage
   - Response times
   - Error rates

3. **Security Events**:
   - Failed authentication attempts
   - Rate limit violations
   - CORS policy violations
   - Blocked suspicious requests

### Regular Maintenance Tasks

**Weekly:**
- [ ] Review error logs
- [ ] Check usage.csv for anomalies
- [ ] Verify all models are healthy
- [ ] Review rate limit violations

**Monthly:**
- [ ] Update dependencies (`npm audit`, `npm update`)
- [ ] Review and rotate API keys
- [ ] Check for new Azure OpenAI models
- [ ] Review and update rate limits based on usage

**Quarterly:**
- [ ] Full security audit
- [ ] Performance optimization review
- [ ] Capacity planning review
- [ ] Documentation updates

---

## Rollback Procedures

### Quick Rollback (Azure Web Apps)

```bash
# List deployment slots
az webapp deployment slot list \
  --name your-app-name \
  --resource-group your-resource-group

# Swap to previous slot
az webapp deployment slot swap \
  --name your-app-name \
  --resource-group your-resource-group \
  --slot staging \
  --target-slot production
```

### Manual Rollback (Docker)

```bash
# Stop current container
docker stop llm-test-app

# Start previous version
docker run -d \
  --name llm-test-app \
  -p 3000:3000 \
  --env-file .env.production \
  llm-test-app:v1.0.0
```

### Database/Data Rollback

```bash
# If using persistent volume, backup before deployment
tar -czf data-backup-$(date +%Y%m%d-%H%M%S).tar.gz /app/data/

# Restore if needed
tar -xzf data-backup-20250117-120000.tar.gz -C /
```

---

## Troubleshooting

### Common Issues

#### "SESSION_SECRET must be set in production"
**Cause:** SESSION_SECRET environment variable not set
**Fix:** Set SESSION_SECRET in environment variables

#### "CORS policy violation"
**Cause:** Frontend URL not in ALLOWED_ORIGINS
**Fix:** Add frontend URL to ALLOWED_ORIGINS environment variable

#### "Configuration error for model X"
**Cause:** Deployment name doesn't match Azure OpenAI deployment
**Fix:** Verify deployment names in Azure Portal match environment variables exactly

#### All health checks failing
**Cause:** Invalid API key or endpoint
**Fix:** Verify AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY

#### Rate limit errors on legitimate traffic
**Cause:** Rate limits too strict or shared IP addresses
**Fix:** Adjust RATE_LIMIT_MAX and RATE_LIMIT_WINDOW_MS

---

## Checklist Summary

### Before Handoff to Val/Prod Team

- [ ] All environment variables documented
- [ ] ALLOWED_ORIGINS configured for production URLs
- [ ] SESSION_SECRET generated and configured
- [ ] OAuth configured (if required)
- [ ] All API keys rotated to production keys
- [ ] Security audit findings resolved
- [ ] Dependencies updated and audited
- [ ] .claude/ excluded from git
- [ ] No secrets in git history
- [ ] Health checks passing
- [ ] CORS tested and working
- [ ] Rate limiting tested
- [ ] HTTPS enforced
- [ ] Monitoring configured
- [ ] Backup procedures documented
- [ ] Rollback procedures tested

---

**Last Updated:** 2025-01-17
**Version:** 1.0.0
**Maintained By:** Development Team
