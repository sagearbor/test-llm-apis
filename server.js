import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import session from 'express-session';
import { modelConfig } from './config.js';
import { getAuthUrl, getTokenFromCode, requireAuth, isOAuthEnabled } from './auth.js';

dotenv.config();

const app = express();
app.use(express.json());

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 // 24 hours
  }
}));

app.use(express.static('.')); // serve index.html

// Get deployment mapping from config
const deploymentMap = modelConfig.getDeploymentMap();

// OAuth routes
app.get('/login', async (req, res) => {
  if (!isOAuthEnabled()) {
    return res.status(400).send('OAuth is not enabled. Set ENABLE_OAUTH=true in environment variables.');
  }

  try {
    const redirectUri = `${req.protocol}://${req.get('host')}/auth/redirect`;
    const authUrl = await getAuthUrl(redirectUri);
    res.redirect(authUrl);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).send('Authentication error');
  }
});

app.get('/auth/redirect', async (req, res) => {
  if (!isOAuthEnabled()) {
    return res.status(400).send('OAuth is not enabled.');
  }

  try {
    const redirectUri = `${req.protocol}://${req.get('host')}/auth/redirect`;
    const tokenResponse = await getTokenFromCode(req.query.code, redirectUri);

    // Store user info in session
    req.session.isAuthenticated = true;
    req.session.account = tokenResponse.account;

    res.redirect('/');
  } catch (error) {
    console.error('Auth redirect error:', error);
    res.status(500).send('Authentication failed');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// Check auth status endpoint
app.get('/api/auth/status', (req, res) => {
  res.json({
    isAuthenticated: req.session?.isAuthenticated || false,
    oauthEnabled: isOAuthEnabled(),
    user: req.session?.account?.username || null
  });
});

// Model metadata endpoint - returns all model configurations
app.get('/api/models', requireAuth, (req, res) => {
  res.json(modelConfig.getAllModels());
});

// Health check endpoint - pings each model with minimal tokens
app.get('/health', requireAuth, async (req, res) => {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-02-01';

  const results = {};

  for (const [modelKey, deploymentName] of Object.entries(deploymentMap)) {
    if (!deploymentName) {
      results[modelKey] = { status: 'error', message: 'Deployment name not configured' };
      continue;
    }

    try {
      // Detect if codex model
      const isCodexModel = deploymentName.toLowerCase().includes('codex');
      const apiPath = isCodexModel ? 'responses' : 'chat/completions';
      const url = `${endpoint.replace(/\/$/, '')}/openai/deployments/${deploymentName}/${apiPath}?api-version=${apiVersion}`;

      // Minimal request body - some models need higher token counts
      const requestBody = isCodexModel
        ? { input: 'hi', max_output_tokens: 10 }
        : { messages: [{ role: 'user', content: 'hi' }], max_completion_tokens: 10 };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey
        },
        body: JSON.stringify(requestBody)
      });

      if (response.ok) {
        results[modelKey] = { status: 'ok', deploymentName };
      } else {
        const data = await response.json();
        results[modelKey] = {
          status: 'error',
          deploymentName,
          message: data.error?.message || `HTTP ${response.status}`
        };
      }
    } catch (error) {
      results[modelKey] = {
        status: 'error',
        deploymentName,
        message: error.message
      };
    }
  }

  res.json(results);
});

app.post('/chat', requireAuth, async (req, res) => {
  const { prompt, model } = req.body;

  const deploymentName = deploymentMap[model];
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-02-01';

  if (!deploymentName || !endpoint || !apiKey) {
    return res.status(500).json({
      answer: `Configuration error for model ${model}. Check that AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, and ${model.toUpperCase()}_DEPLOYMENT_NAME are set in .env`
    });
  }

  // Determine API endpoint & format based on model type
  // gpt-5-codex and similar codex models use the "Responses API"
  const isCodexModel = deploymentName.toLowerCase().includes('codex');
  const apiPath = isCodexModel ? 'responses' : 'chat/completions';
  const url = `${endpoint.replace(/\/$/, '')}/openai/deployments/${deploymentName}/${apiPath}?api-version=${apiVersion}`;

  console.log('Request URL:', url);
  console.log('Deployment Name:', deploymentName);

  let requestBody;

  if (isCodexModel) {
    // Responses API body format for codex
    requestBody = {
      input: prompt,
      max_output_tokens: 800
    };
  } else {
    // Standard Chat Completions format for other models
    requestBody = {
      messages: [{ role: 'user', content: prompt }],
      max_completion_tokens: 800
    };
  }

  console.log('Request body:', JSON.stringify(requestBody));

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(data));

    if (!response.ok) {
      // Enhanced error message with troubleshooting info
      const errorMsg = data.error?.message || JSON.stringify(data);
      throw new Error(`${errorMsg}. Deployment: ${deploymentName}, API: ${apiPath}, Version: ${apiVersion}`);
    }

    // Extract response based on the API format used
    let answer;
    if (isCodexModel) {
        // Responses API returns the answer in 'output_text'
        answer = data.output_text || '(no response from codex model)';
    } else {
        answer = data.choices?.[0]?.message?.content || '(empty response from chat model)';
    }

    console.log('Extracted answer:', answer);
    res.json({ answer });
  } catch (error) {
    console.error('Fetch error:', error);
    res.status(500).json({ answer: `Azure OpenAI Error: ${error.message}` });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
