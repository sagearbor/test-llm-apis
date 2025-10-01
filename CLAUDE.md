# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a test application for Azure OpenAI chat endpoints. It provides a web interface for testing multiple Azure OpenAI model deployments through a Node.js Express server, with built-in health monitoring to verify model connectivity.

## Development Commands

### Install Dependencies
```bash
npm install
```

### Run Server
```bash
npm start
# or
node server.js
```

The server runs on `http://localhost:3000` by default (configurable via PORT environment variable).

  ## Session Continuity Pattern

  When pausing work mid-task, use empty commits for context preservation:

  ```bash
  # Create descriptive branch
  git checkout -b <type>/<brief-description>

  # Empty commit with session context
  git commit --allow-empty -m "<Subject line>

  BUGS/FEATURES:
  - <What needs to be done>

  CONTEXT:
  - <Key details from investigation>

  NEXT SESSION:
  - <First steps to take>

  STATUS: <Not started|In progress>
  Session: <YYYY-MM-DD>"

  # Push to preserve across machines
  git push -u origin <branch-name>

  # Stay on branch (DO NOT return to main)

  Next session: Branch will be active, git log -1 shows full context.

## Architecture

### Tech Stack
- **Backend**: Node.js with Express (ES modules)
- **Frontend**: Vanilla HTML/JavaScript
- **Dependencies**:
  - `express` (^5.1.0) - Web server
  - `node-fetch` (^3.3.2) - HTTP requests to Azure OpenAI
  - `dotenv` (^17.2.2) - Environment variable management

### Key Components

1. **server.js**: Express server that:
   - Serves the static HTML interface
   - Handles POST requests to `/chat` endpoint for chat interactions
   - Handles GET requests to `/health` endpoint for model connectivity checks
   - Auto-detects Codex models and uses appropriate API format (Responses API vs Chat Completions API)
   - Routes requests to appropriate Azure OpenAI model endpoints based on the selected model
   - Uses environment variables to dynamically select deployment names

2. **index.html**: Single-page chat interface with:
   - Health status panel with traffic light indicators (🟢/🔴)
   - Model selector dropdown (4 pre-configured models)
   - Chat display area
   - Input field for user messages
   - Client-side JavaScript for API communication and health monitoring

### Environment Configuration

The application expects specific environment variables in `.env`:
- `AZURE_OPENAI_ENDPOINT`: Azure OpenAI resource endpoint URL
- `AZURE_OPENAI_API_KEY`: API key for Azure OpenAI
- `AZURE_OPENAI_API_VERSION`: API version (default: `2024-02-01`, may need newer for some models)
- Model deployment names:
  - `CODING_LLM_DEPLOYMENT_NAME` - For code generation models (e.g., gpt-5-codex)
  - `SMALLEST_LLM_DEPLOYMENT_NAME` - For lightweight tasks (e.g., gpt-4o-mini)
  - `ALLAROUND_LLM_DEPLOYMENT_NAME` - For general purpose (e.g., gpt-4o)
  - `BEST_LLM_DEPLOYMENT_NAME` - For complex reasoning (e.g., o1-preview, o3-mini)

### API Integration

The application supports two Azure OpenAI API formats:

1. **Chat Completions API** (Standard models):
   - Endpoint: `/openai/deployments/{deployment}/chat/completions`
   - Used for: GPT-4o, o1-preview, o3-mini, etc.
   - Request format: `{ messages: [...], max_completion_tokens: 800 }`

2. **Responses API** (Codex models):
   - Endpoint: `/openai/deployments/{deployment}/responses`
   - Used for: gpt-5-codex and similar code generation models
   - Request format: `{ input: "...", max_output_tokens: 800 }`
   - Auto-detected if deployment name contains "codex"

Features:
- API version configurable via environment variable
- Max tokens: 800 for chat, 10 for health checks
- Single-turn conversations (no conversation history maintained)
- Health endpoint tests each model with minimal token usage
