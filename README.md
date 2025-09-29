# test-llm-apis Azure OpenAI Chatbox Test

A super-simple test app for Azure OpenAI chat endpoints.

## Setup

1. Clone this repo.
2. Run `npm init -y` then `npm install express node-fetch dotenv`.
3. Fill in your `.env` with:
   - `AZURE_OPENAI_KEY`
   - Endpoint URLs for each model.
4. Start the server:
   ```bash
   node server.js

