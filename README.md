# Azure OpenAI Test Application

A simple web interface for testing multiple Azure OpenAI model deployments with built-in health monitoring.

## Features

- **Multi-Model Support**: Test multiple Azure OpenAI deployments from one interface
- **Health Monitoring**: Real-time connection status with traffic light indicators (🟢/🔴)
- **Auto-Detection**: Automatically detects Codex models and uses the appropriate API format
- **Low-Cost Health Checks**: Minimal token usage for connection testing
- **OAuth Authentication**: Optional Azure AD integration for secure access
- **Production Ready**: NGINX configuration and systemd service included

## Deployment Options

- **Local Development**: Quick start guide below
- **Azure Web App**: See [AZURE_DEPLOYMENT.md](AZURE_DEPLOYMENT.md) for Azure Web App deployment
- **Linux VM/Server**: See [docs/VM_DEPLOYMENT.md](docs/VM_DEPLOYMENT.md) for VM deployment with NGINX and SSL
- **Security Guide**: See [docs/SECURITY_CHECKLIST.md](docs/SECURITY_CHECKLIST.md) for security best practices

## Prerequisites

* [Node.js](https://nodejs.org/) (v18+ recommended)
* An Azure OpenAI resource with deployed models
* Your Azure API key and endpoint

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your Azure OpenAI credentials:

```bash
cp .env.example .env
```

Edit `.env` with your values:
- `AZURE_OPENAI_ENDPOINT`: Your Azure OpenAI endpoint URL
- `AZURE_OPENAI_API_KEY`: Your API key
- `AZURE_OPENAI_API_VERSION`: API version (e.g., `2024-02-01`)
- Model deployment names (must match your Azure deployments exactly)

### 3. Run the Server

```bash
npm start
```

Then open http://localhost:3000 in your browser.

## Model Configuration

The application supports 4 model slots, each configured via environment variables:

| Slot | Environment Variable | Intended Use | Example Deployment |
|------|---------------------|--------------|-------------------|
| Coding LLM | `CODING_LLM_DEPLOYMENT_NAME` | Code generation | `gpt-5-codex` |
| Smallest LLM | `SMALLEST_LLM_DEPLOYMENT_NAME` | Lightweight tasks | `gpt-4o-mini` |
| All-Around LLM | `ALLAROUND_LLM_DEPLOYMENT_NAME` | General purpose | `gpt-4o` |
| Best LLM | `BEST_LLM_DEPLOYMENT_NAME` | Complex reasoning | `o1-preview`, `o3-mini` |

## Health Check Feature

The application includes a `/health` endpoint that pings each configured model with a minimal request (10 tokens) to verify connectivity.

**Access health check:**
- Web UI: Status indicators appear at the top of the page
- API: `GET http://localhost:3000/health`

**Status indicators:**
- 🟢 Green: Model is accessible and responding
- 🔴 Red: Connection error (see error message for details)

## Troubleshooting

### "Resource not found" Error

This typically means:

1. **Incorrect Deployment Name**: The deployment name in `.env` doesn't match your Azure deployment
   - Check Azure Portal → Your OpenAI Resource → Deployments
   - Deployment names are case-sensitive
   - Example: If Azure shows `my-gpt-5-codex`, use exactly that in `.env`

2. **API Version Mismatch**: Some models require newer API versions
   - For Codex models, try `2024-08-01-preview` or later
   - Update `AZURE_OPENAI_API_VERSION` in `.env`

3. **Model Not Deployed**: The model doesn't exist in your Azure account
   - Verify the deployment exists in Azure Portal
   - Create deployment if needed

4. **Wrong API Format**: The application auto-detects Codex models (by checking if deployment name contains "codex")
   - Ensure your Codex deployment name includes "codex" in it
   - Otherwise, the app will use the wrong API endpoint

### Debugging Steps

1. **Check Health Status**: Load the web interface and check the status indicators
2. **View Server Logs**: The server logs detailed request/response information
3. **Verify .env**: Ensure all required variables are set
4. **Test Azure Portal**: Verify you can access the deployments in Azure Portal
5. **API Version**: Try updating to the latest API version for newer models

### Server Logs

When you send a message, the server logs show:
- Request URL being called
- Deployment name being used
- Request body format
- Response status and data

Example log output:
```
Request URL: https://your-resource.openai.azure.com/openai/deployments/gpt-5-codex/responses?api-version=2024-02-01
Deployment Name: gpt-5-codex
Request body: {"input":"test message","max_output_tokens":800}
```

## API Formats

The application automatically handles two different API formats:

### Chat Completions API (Standard Models)
Used for: GPT-4o, o1-preview, o3-mini, etc.

Endpoint: `/openai/deployments/{deployment}/chat/completions`

### Responses API (Codex Models)
Used for: gpt-5-codex and similar code generation models

Endpoint: `/openai/deployments/{deployment}/responses`

**Auto-detection**: If the deployment name contains "codex" (case-insensitive), the Responses API is automatically used.

## Development

### Project Structure

* `index.html` – The front-end chat UI with health status indicators
* `server.js` – The Node.js Express backend with chat and health endpoints
* `.env.example` – Environment variables template with documentation
* `.gitignore` – Prevents committing secrets and unnecessary files
* `README.md` – This guide

### Adding New Models

1. Add a new environment variable in `.env`:
   ```
   NEW_MODEL_DEPLOYMENT_NAME=your-deployment-name
   ```

2. Update `deploymentMap` in `server.js`:
   ```javascript
   const deploymentMap = {
     // ... existing models
     'new_model_api': process.env.NEW_MODEL_DEPLOYMENT_NAME
   };
   ```

3. Add option to `index.html`:
   ```html
   <option value="new_model_api">New Model Name</option>
   ```

4. Update `modelNames` object in `index.html` for health status display

## Cost Optimization

- Health checks use only 10 tokens per model
- No conversation history is maintained (each message is independent)
- You can disable automatic health checks by removing the `window.addEventListener` in `index.html`

## Security Notes

- Never commit your `.env` file to git
- Keep your API keys secure
- The `.env` file is already in `.gitignore`

## Notes

* This app is for testing only and not production‑ready.
* Do **not** commit your real `.env` file to GitHub.
