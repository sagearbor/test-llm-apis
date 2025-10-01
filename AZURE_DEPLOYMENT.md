# Azure Web App Deployment Guide

This guide covers deploying the LLM Test Application to Azure Web App with OAuth authentication.

## Overview

When deploying to Azure Web App:
- **Sensitive credentials** (endpoint, API key, OAuth secrets) → Azure Web App environment variables
- **Model deployment names** → Either environment variables OR `config.js` file
- **OAuth authentication** → Optional, enable via environment variable

## Important: VM vs Azure Web App

**If you deployed to a VM first:**
- The VM setup uses `llmtest` service account, NGINX, and systemd
- **None of that applies to Azure Web App**
- Azure Web App runs in a managed container (no systemd, no NGINX needed)
- Simply push your code and set environment variables

**What transfers from VM to Web App:**
- ✅ The Node.js app code (server.js, config.js, etc.)
- ✅ OAuth configuration (same Azure AD app)
- ✅ Environment variables (copy values from VM .env to Azure config)
- ❌ systemd service files (not used)
- ❌ NGINX configuration (Azure handles SSL automatically)
- ❌ Service account setup (not needed)

**TL;DR:** The app itself works the same. Just different deployment infrastructure.

## Prerequisites

1. Azure subscription
2. Azure OpenAI resource with deployed models
3. (Optional) Azure AD app registration for OAuth

## Part 1: Basic Deployment

### Step 1: Create Azure Web App

```bash
# Using Azure CLI
az webapp create \
  --name your-app-name \
  --resource-group your-resource-group \
  --plan your-app-service-plan \
  --runtime "NODE:22-lts"
```

Or use Azure Portal:
1. Go to Azure Portal → Create a resource → Web App
2. Name: `your-app-name`
3. Runtime stack: Node 22 LTS
4. Region: Choose closest to your Azure OpenAI resource

### Step 2: Configure Environment Variables

In Azure Portal → Your Web App → Settings → Configuration → Application settings:

Add the following:

#### Required - Azure OpenAI Configuration
```
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=your-api-key-here
AZURE_OPENAI_API_VERSION=2024-02-01
```

#### Required - Model Deployment Names
Option A: Set as environment variables (recommended for flexibility)
```
CODING_LLM_DEPLOYMENT_NAME=gpt-5-codex
SMALLEST_LLM_DEPLOYMENT_NAME=gpt-5-nano
ALLAROUND_LLM_DEPLOYMENT_NAME=gpt-5-mini
BEST_LLM_DEPLOYMENT_NAME=gpt-5
```

Option B: Edit `config.js` in your repository (simpler for static deployments)

#### Optional - OAuth Configuration (see Part 2)
```
ENABLE_OAUTH=true
AZURE_AD_CLIENT_ID=your-client-id
AZURE_AD_TENANT_ID=your-tenant-id
AZURE_AD_CLIENT_SECRET=your-client-secret
SESSION_SECRET=your-random-secret-string
NODE_ENV=production
```

### Step 3: Deploy from GitHub

#### Option A: GitHub Actions (Continuous Deployment)

1. In Azure Portal → Your Web App → Deployment Center
2. Source: GitHub
3. Authorize GitHub and select your repository
4. Azure will create a workflow file automatically

#### Option B: Local Git

```bash
# Get deployment credentials from Azure Portal
# Then push to Azure Git repository
git remote add azure https://<username>@<app-name>.scm.azurewebsites.net/<app-name>.git
git push azure main
```

### Step 4: Verify Deployment

1. Browse to `https://your-app-name.azurewebsites.net`
2. Check Model Connection Status - should show green indicators
3. Test chat functionality

## Part 2: Enable OAuth Authentication

OAuth is **required** for production deployment to secure your application.

### Step 1: Register Azure AD Application

1. **Go to Azure Portal → Entra ID → App registrations → New registration**

2. **Basic settings:**
   - Name: `LLM Test App` (or your preference)
   - Supported account types:
     - Single tenant: Only your organization
     - Multitenant: Any Microsoft account (personal or work)
   - Redirect URI:
     - Type: Web
     - URI: `https://your-app-name.azurewebsites.net/auth/redirect`

3. **Click Register**

### Step 2: Configure Application

After registration:

1. **Copy Application Details:**
   - Go to Overview page
   - Copy "Application (client) ID" → This is `AZURE_AD_CLIENT_ID`
   - Copy "Directory (tenant) ID" → This is `AZURE_AD_TENANT_ID`

2. **Create Client Secret:**
   - Go to "Certificates & secrets"
   - Click "New client secret"
   - Description: "LLM Test App Secret"
   - Expires: Choose duration (1 year recommended)
   - Click "Add"
   - **Copy the VALUE immediately** → This is `AZURE_AD_CLIENT_SECRET`
   - ⚠️ You can't see it again after leaving the page!

3. **Configure Redirect URI (if not done earlier):**
   - Go to "Authentication"
   - Under "Platform configurations" → "Web"
   - Add redirect URI: `https://your-app-name.azurewebsites.net/auth/redirect`
   - For testing locally, also add: `http://localhost:3000/auth/redirect`

### Step 3: Update Environment Variables

In Azure Web App → Configuration → Application settings, add:

```
ENABLE_OAUTH=true
AZURE_AD_CLIENT_ID=<from step 2.1>
AZURE_AD_TENANT_ID=<from step 2.1>
AZURE_AD_CLIENT_SECRET=<from step 2.2>
SESSION_SECRET=<generate a random string>
NODE_ENV=production
```

To generate a secure session secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 4: Save and Restart

1. Click "Save" in Application settings
2. App will restart automatically
3. Browse to your app - you should see login page

### Step 5: Grant Access to Users

1. Go to Azure Portal → Entra ID → Enterprise applications
2. Find your app (same name as the app registration)
3. Go to "Users and groups"
4. Click "Add user/group"
5. Select users who should have access
6. Click "Assign"

## Model Configuration Management

You have two options for managing deployment names:

### Option A: Environment Variables (Recommended)

**Pros:**
- Change without redeploying code
- Different configs per environment (dev/staging/prod)
- No code changes needed

**Cons:**
- More environment variables to manage

**How to use:**
Set in Azure Web App → Configuration → Application settings

### Option B: config.js File

**Pros:**
- Version controlled with code
- Easier to see all configurations
- Fewer environment variables

**Cons:**
- Requires code push to update
- Same config for all environments (unless using env vars as override)

**How to use:**
Edit `config.js` → commit → push to Azure

**Best practice:** Use `config.js` for defaults, override with environment variables when needed

## Troubleshooting

### "Resource not found" for Codex Model

**Possible causes:**
1. Deployment name doesn't match Azure
2. API version too old
3. Model not deployed in your Azure OpenAI resource

**Solutions:**
1. Check exact deployment name in Azure Portal → OpenAI → Deployments
2. Try newer API version: `2024-08-01-preview` or `2024-10-21`
3. Verify model exists and is deployed

### OAuth Login Fails

**Check:**
1. Redirect URI matches exactly (including https vs http)
2. Client secret hasn't expired
3. Users are assigned in Enterprise Applications
4. `SESSION_SECRET` is set
5. `NODE_ENV=production` for secure cookies

### App Won't Start

**Check Azure Web App logs:**
```bash
az webapp log tail --name your-app-name --resource-group your-resource-group
```

Common issues:
- Missing required environment variables
- Invalid OAuth credentials (if enabled)
- Port binding (app should use `process.env.PORT`)

## Security Best Practices

1. **Always enable OAuth in production** (`ENABLE_OAUTH=true`)
2. **Use HTTPS only** (Azure Web Apps provide this by default)
3. **Rotate secrets regularly**:
   - Azure OpenAI API keys
   - Azure AD client secrets
   - Session secrets
4. **Limit user access** via Azure AD user assignment
5. **Monitor access** via Azure AD sign-in logs
6. **Don't commit secrets** to git (use `.env` locally, Azure env vars in prod)

## Monitoring

### Application Insights (Recommended)

1. Enable Application Insights in Azure Web App settings
2. View real-time metrics, errors, and usage
3. Set up alerts for failures

### Health Monitoring

The `/health` endpoint returns JSON status of all models:
```bash
curl https://your-app-name.azurewebsites.net/health
```

Create an Azure Monitor alert on this endpoint to detect model issues.

## Cost Optimization

1. **App Service Plan**: Use appropriate tier for your usage
   - Development: B1 (Basic)
   - Production: P1V2 or higher (supports auto-scaling)

2. **Model tokens**: Health checks use only 10 tokens per model
3. **Auto-scale**: Enable for production based on CPU/memory metrics

## Updating Deployment

### Update Code
```bash
git push azure main
# or via GitHub Actions (automatic)
```

### Update Environment Variables
1. Azure Portal → Web App → Configuration
2. Modify values
3. Save (auto-restarts app)

### Update Model Deployments

If using environment variables:
- Update `CODING_LLM_DEPLOYMENT_NAME` etc. in Azure config

If using `config.js`:
- Edit file → commit → push

## GPT Codex Note

**Important**: The original GPT Codex (Codex) has been deprecated by OpenAI. If you're seeing "Resource not found" for `gpt-5-codex`:

1. Check if this deployment actually exists in your Azure OpenAI resource
2. It might be a custom deployment name your organization chose
3. For code generation, consider using `gpt-4o` or `gpt-4-turbo` instead
4. Update the deployment name in either:
   - Environment variable: `CODING_LLM_DEPLOYMENT_NAME=gpt-4o`
   - Or in `config.js`: `defaultDeployment: 'gpt-4o'`

## Migrating from VM to Azure Web App

**Already deployed on a VM? Here's how to move to Azure Web App:**

### Step 1: Extract Configuration from VM

```bash
# SSH to your VM
ssh your-username@alp-dsvm-003.azure.dhe.duke.edu

# View your current .env (copy these values)
sudo cat /opt/llm-test-app/.env
```

### Step 2: Create Azure Web App

Follow "Part 1: Basic Deployment" above to create the Web App.

### Step 3: Copy Environment Variables

In Azure Portal → Your Web App → Configuration → Application settings:

Add all the values from your VM's `.env` file:
- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_API_VERSION`
- `ENABLE_OAUTH` (set to `true`)
- `AZURE_AD_CLIENT_ID`
- `AZURE_AD_TENANT_ID`
- `AZURE_AD_CLIENT_SECRET`
- `SESSION_SECRET`
- `NODE_ENV` (set to `production`)
- Model deployment names (if you used env vars)

### Step 4: Update OAuth Redirect URI

Azure Portal → Entra ID → App registrations → Your app → Authentication:

Add new redirect URI:
```
https://your-app-name.azurewebsites.net/auth/redirect
```

Keep the VM redirect URI too (both will work).

### Step 5: Deploy Code

```bash
# From your local machine
cd /path/to/test-llm-apis
git push azure main
# or use GitHub Actions
```

### Step 6: Test

1. Browse to `https://your-app-name.azurewebsites.net`
2. Verify OAuth login works
3. Check health status

### Step 7: Update DNS (Optional)

If you want a custom domain:
1. Azure Portal → Web App → Custom domains
2. Add your custom domain
3. Configure SSL certificate

### What You Can Delete from VM:

Once Web App is working, you can optionally shut down the VM to save costs:

```bash
# Stop the service
sudo systemctl stop llm-test
sudo systemctl disable llm-test

# Or deallocate the entire VM in Azure Portal
```

### Differences Summary:

| Aspect | VM Deployment | Azure Web App |
|--------|---------------|---------------|
| **URL** | `https://vm-name.duke.edu:3060` | `https://app-name.azurewebsites.net` |
| **SSL** | NGINX + Duke certs | Automatic (Azure-managed) |
| **Port** | 3060 (NGINX) → 3000 (Node) | 80/443 (automatic) |
| **Auto-restart** | systemd | Built-in (Azure manages) |
| **Logs** | journalctl + NGINX logs | Azure App Service logs |
| **Updates** | git pull + systemctl restart | git push (auto-deploy) |
| **Scaling** | Manual (VM size) | Auto-scale (built-in) |
| **Cost** | VM + compute time | App Service plan |

**Recommendation:** Start with VM for testing, move to Azure Web App for production if you want:
- Auto-scaling
- Easier management
- No server maintenance
- Built-in deployment CI/CD

## Support

For issues:
1. Check Azure Web App logs
2. Verify environment variables are set correctly
3. Test health endpoint
4. Review server logs for detailed error messages
