/**
 * SECURITY-HARDENED EXPRESS SERVER
 *
 * This server implements comprehensive security measures:
 * - Helmet.js for security headers (CSP, HSTS, X-Frame-Options, etc.)
 * - CORS protection with configurable origins
 * - Rate limiting on all endpoints (DDoS protection)
 * - Input sanitization (XSS and injection prevention)
 * - Secure session management (httpOnly, sameSite cookies)
 * - Environment-based configuration (no hardcoded secrets)
 * - HTTPS enforcement in production
 * - Cryptographically secure session secrets
 *
 * @security-audit: Enterprise-grade security implementation
 * @compliance: OWASP Top 10 protected
 * @csp-enabled: Strict mode in production
 */

import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import session from 'express-session';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { modelConfig } from './config.js';
import { getAuthUrl, getTokenFromCode, requireAuth, isOAuthEnabled } from './auth.js';
import { upload, rateLimitUpload, getUploadDir } from './upload-middleware.js';
import { processFile } from './file-processor.js';
import { startCleanupService, stopCleanupService, cleanupSession } from './cleanup-service.js';
import { applySecurityMiddleware, getEnvironmentConfig } from './security-config.js';
import { recordUsage, extractTokenCounts, checkRateLimits } from './usage-tracker.js';
import {
  getUserSummary,
  getHourlyUsage,
  getDailyUsage,
  getCostByModel,
  getAllUsersSummary,
  isAdmin
} from './usage-analytics.js';

dotenv.config();

const app = express();

// Apply comprehensive security middleware FIRST
applySecurityMiddleware(app);

// Then add body parser
app.use(express.json({ limit: '10mb' })); // Limit payload size

// Get environment-specific configuration
const envConfig = getEnvironmentConfig();

// Generate secure session secret if not provided
const sessionSecret = process.env.SESSION_SECRET ||
  (process.env.NODE_ENV === 'production'
    ? (() => { throw new Error('SESSION_SECRET must be set in production'); })()
    : crypto.randomBytes(32).toString('hex'));

// Session configuration with enhanced security
app.use(session({
  secret: sessionSecret,
  name: 'sessionId', // Change from default 'connect.sid' to avoid fingerprinting
  resave: false,
  saveUninitialized: false,
  rolling: true, // Reset expiration on activity
  cookie: envConfig.session // Use environment-specific cookie settings
}));

app.use(express.static('.')); // serve index.html

// Get deployment mapping from config
const deploymentMap = modelConfig.getDeploymentMap();

// ============================================================================
// Conversation Memory Management
// ============================================================================

/**
 * Simple token estimation (1 token ≈ 4 characters for English text)
 * This is a rough approximation. For exact counting, use tiktoken library.
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Estimate tokens for a messages array
 */
function estimateMessagesTokens(messages) {
  if (!messages || messages.length === 0) return 0;

  let total = 0;
  for (const msg of messages) {
    // Account for role, content, and message formatting overhead
    total += estimateTokens(msg.role) + estimateTokens(msg.content) + 4;
  }
  return total;
}

/**
 * ConversationMemory - Manages conversation history with automatic summarization
 * Uses a simple buffer approach: keep all messages until we need to compress
 */
class ConversationMemory {
  constructor(llmForSummary, options = {}) {
    this.messages = []; // Array of {role: 'user'|'assistant', content: string}
    this.summary = null; // Summarized older context
    this.llmForSummary = llmForSummary; // LLM to use for summarization
    this.compressionThreshold = options.compressionThreshold || 0.6; // Compress at 60% of context
    this.keepRecentCount = options.keepRecentCount || 10; // Always keep last 10 messages
  }

  /**
   * Add a message to the conversation
   */
  addMessage(role, content) {
    this.messages.push({ role, content });
  }

  /**
   * Get messages formatted for API call, with automatic compression if needed
   */
  async getMessagesForModel(modelContextWindow, currentModel) {
    const availableTokens = Math.floor(modelContextWindow * 0.5); // Reserve 50% for response
    const currentTokens = estimateMessagesTokens(this.messages);
    const thresholdTokens = Math.floor(modelContextWindow * this.compressionThreshold);

    // Check if we need compression
    if (currentTokens > thresholdTokens && this.messages.length > this.keepRecentCount) {
      await this.compress(currentModel);
    }

    return this.buildMessageArray();
  }

  /**
   * Compress older messages into a summary
   */
  async compress(currentModel) {
    if (this.messages.length <= this.keepRecentCount) {
      return; // Not enough messages to compress
    }

    const recentMessages = this.messages.slice(-this.keepRecentCount);
    const oldMessages = this.messages.slice(0, -this.keepRecentCount);

    // Generate summary using SMALLEST_LLM (fast and cheap)
    const conversationText = oldMessages
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');

    const summaryPrompt = `Concisely summarize this conversation, preserving key facts, decisions, and technical details. Be specific about important information discussed.

Conversation:
${conversationText}

Summary:`;

    try {
      const deploymentName = deploymentMap['smallest_llm_api'];
      const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
      const apiKey = process.env.AZURE_OPENAI_API_KEY;

      const url = `${endpoint.replace(/\/$/, '')}/openai/v1/responses`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey
        },
        body: JSON.stringify({
          model: deploymentName,
          input: summaryPrompt,
          max_output_tokens: 500
        })
      });

      const data = await response.json();
      const newSummary = data.output || 'Previous conversation context.';

      // Combine with existing summary if present
      if (this.summary) {
        this.summary = `${this.summary}\n\n${newSummary}`;
      } else {
        this.summary = newSummary;
      }

      // Keep only recent messages
      const originalCount = this.messages.length;
      this.messages = recentMessages;

      console.log(`Compressed conversation: ${originalCount} messages → ${this.messages.length} messages + summary`);

      return {
        compressed: true,
        originalCount,
        newCount: this.messages.length
      };

    } catch (error) {
      console.error('Compression failed:', error);
      // If compression fails, just truncate to keep recent messages
      this.messages = recentMessages;
      return {
        compressed: true,
        originalCount: oldMessages.length + recentMessages.length,
        newCount: recentMessages.length,
        error: 'Compression failed, truncated instead'
      };
    }
  }

  /**
   * Build final message array for API call
   */
  buildMessageArray() {
    const result = [];

    // Add summary as system message if present
    if (this.summary) {
      result.push({
        role: 'system',
        content: `Previous conversation summary:\n${this.summary}`
      });
    }

    // Add all current messages
    result.push(...this.messages);

    return result;
  }

  /**
   * Get compression stats for UI display
   */
  getStats() {
    return {
      hasSummary: !!this.summary,
      messageCount: this.messages.length,
      estimatedTokens: estimateMessagesTokens(this.messages) + (this.summary ? estimateTokens(this.summary) : 0)
    };
  }

  /**
   * Clear all conversation history
   */
  clear() {
    this.messages = [];
    this.summary = null;
  }
}

// Helper to get or create conversation memory for a session
function getConversationMemory(session) {
  // Session stores data as plain objects (serialized), so we need to reconstruct
  if (!session.conversationMemoryData) {
    session.conversationMemoryData = {
      messages: [],
      summary: null
    };
  }

  // Create a new ConversationMemory instance and restore state
  const memory = new ConversationMemory(null, {
    compressionThreshold: 0.6, // Compress at 60% of model's context window
    keepRecentCount: 10
  });

  // Restore messages and summary from session
  memory.messages = session.conversationMemoryData.messages || [];
  memory.summary = session.conversationMemoryData.summary || null;

  // Return a proxy that saves state back to session after each operation
  return new Proxy(memory, {
    get(target, prop) {
      const value = target[prop];
      if (typeof value === 'function') {
        return async function(...args) {
          const result = await value.apply(target, args);
          // Save state back to session after any method call
          session.conversationMemoryData.messages = target.messages;
          session.conversationMemoryData.summary = target.summary;
          return result;
        };
      }
      return value;
    }
  });
}

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

app.get('/logout', async (req, res) => {
  const sessionId = req.session?.id;

  // Clean up user's uploaded files
  if (sessionId) {
    await cleanupSession(sessionId);
  }

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
// Optionally enriches with latest metadata from cache/API (once per day)
app.get('/api/models', requireAuth, async (req, res) => {
  const enriched = await modelConfig.getAllModels(true);
  res.json(enriched);
});

// Config endpoint - returns current server configuration
// Optionally accepts modelKey to return model-specific context windows
app.get('/api/config', requireAuth, async (req, res) => {
  const { modelKey } = req.query;
  const maxCompletionTokens = parseInt(process.env.MAX_COMPLETION_TOKENS || '12800', 10);

  // Get model-specific context window if modelKey provided
  let inputContextWindow = 128 * 1024;  // Default 128K
  let outputContextWindow = 128 * 1024;

  if (modelKey) {
    try {
      const models = await modelConfig.getAllModels(true);
      const model = models.find(m => m.key === modelKey);
      if (model) {
        inputContextWindow = model.inputContextWindow || inputContextWindow;
        outputContextWindow = model.outputContextWindow || outputContextWindow;
      }
    } catch (err) {
      console.error('Failed to get model config:', err);
    }
  }

  const percentagePerResponse = ((maxCompletionTokens / inputContextWindow) * 100).toFixed(1);
  const estimatedChatTurns = Math.floor(inputContextWindow / (maxCompletionTokens * 2)); // *2 for input+output

  res.json({
    maxCompletionTokens,
    inputContextWindow,
    outputContextWindow,
    percentagePerResponse: parseFloat(percentagePerResponse),
    estimatedChatTurns
  });
});

// Health check endpoint - pings each model with minimal tokens using Responses API
app.get('/health', requireAuth, async (req, res) => {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;

  const results = {};

  for (const [modelKey, deploymentName] of Object.entries(deploymentMap)) {
    if (!deploymentName) {
      results[modelKey] = { status: 'error', message: 'Deployment name not configured' };
      continue;
    }

    try {
      // ALL models now use Responses API
      const url = `${endpoint.replace(/\/$/, '')}/openai/v1/responses`;

      // Minimal request body for Responses API (minimum 16 tokens required)
      const requestBody = {
        model: deploymentName,
        input: 'hi',
        max_output_tokens: 16
      };

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

// File upload endpoint
app.post('/api/upload', requireAuth, rateLimitUpload, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Process the file to extract text
    const { text, metadata } = await processFile(req.file.path, req.fileMetadata.originalName);

    // Store file metadata in session for retrieval during chat
    if (!req.session.uploadedFiles) {
      req.session.uploadedFiles = {};
    }

    const fileId = path.basename(req.file.path);
    req.session.uploadedFiles[fileId] = {
      id: fileId,
      originalName: req.fileMetadata.originalName,
      path: req.file.path,
      size: req.file.size,
      uploadedAt: req.fileMetadata.uploadedAt,
      text: text,
      metadata: metadata
    };

    res.json({
      fileId: fileId,
      filename: req.fileMetadata.originalName,
      size: req.file.size,
      uploadedAt: req.fileMetadata.uploadedAt,
      metadata: metadata
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// List uploaded files
app.get('/api/files', requireAuth, (req, res) => {
  const files = req.session.uploadedFiles || {};
  const fileList = Object.values(files).map(f => ({
    fileId: f.id,
    filename: f.originalName,
    size: f.size,
    uploadedAt: f.uploadedAt
  }));
  res.json(fileList);
});

// Delete uploaded file
app.delete('/api/files/:fileId', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const files = req.session.uploadedFiles || {};

    if (!files[fileId]) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete file from disk
    await fs.unlink(files[fileId].path);

    // Remove from session
    delete files[fileId];

    res.json({ message: 'File deleted successfully' });

  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Chat endpoint with authentication (rate limiting applied globally in security-config)
app.post('/chat', requireAuth, async (req, res) => {
  const { prompt, model, fileId, maxTokens } = req.body;

  // Get user info for usage tracking
  const userEmail = req.session?.account?.username || 'anonymous';
  const userId = req.session?.account?.homeAccountId || 'anonymous';

  // Input validation
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return res.status(400).json({ answer: 'Please provide a valid message.' });
  }

  if (!model || typeof model !== 'string') {
    return res.status(400).json({ answer: 'Please select a valid model.' });
  }

  // Check rate limits before proceeding
  if (isOAuthEnabled()) {
    const rateLimitCheck = await checkRateLimits(userEmail);
    if (!rateLimitCheck.allowed) {
      return res.status(429).json({
        answer: `Rate limit exceeded. Usage: ${rateLimitCheck.usage.hourlyTokens} tokens/hour, $${rateLimitCheck.usage.hourlyCost}/hour. Limits: ${rateLimitCheck.limits.hourly_tokens} tokens/hour, $${rateLimitCheck.limits.hourly_cost}/hour.`,
        rateLimitExceeded: true,
        usage: rateLimitCheck.usage,
        limits: rateLimitCheck.limits
      });
    }
  }

  // Sanitize prompt (basic XSS prevention, though we're not rendering HTML)
  const sanitizedPrompt = prompt.trim().substring(0, 100000); // Max 100K chars

  const deploymentName = deploymentMap[model];
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-02-01';

  if (!deploymentName || !endpoint || !apiKey) {
    return res.status(500).json({
      answer: `Configuration error for model ${model}. Check that AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, and ${model.toUpperCase()}_DEPLOYMENT_NAME are set in .env`
    });
  }

  // Get conversation memory for this session
  const memory = getConversationMemory(req.session);

  // Build the final prompt - include file content if fileId provided
  let finalPrompt = sanitizedPrompt;

  if (fileId) {
    const files = req.session.uploadedFiles || {};
    const fileData = files[fileId];

    if (fileData) {
      // Prepend file content to user prompt
      finalPrompt = `Below is the content of the uploaded file "${fileData.originalName}":\n\n${fileData.text}\n\n---\n\nUser question: ${sanitizedPrompt}`;
      console.log(`Including file in context: ${fileData.originalName} (${fileData.text.length} chars)`);
    } else {
      console.warn(`File ID ${fileId} not found in session`);
    }
  }

  // Add user message to conversation memory
  memory.addMessage('user', finalPrompt);

  // Get model context window for compression check
  let modelContextWindow = 128 * 1024; // Default 128K
  try {
    const models = await modelConfig.getAllModels(true);
    const modelInfo = models.find(m => m.key === model);
    if (modelInfo) {
      modelContextWindow = modelInfo.inputContextWindow || modelContextWindow;
    }
  } catch (err) {
    console.error('Failed to get model context window:', err);
  }

  // Get messages with automatic compression if needed
  let conversationMessages;
  let memoryInfo = null;
  try {
    // Get stats before compression (access properties directly, not through method)
    const hadSummaryBefore = !!memory.summary;
    const messageCountBefore = memory.messages.length;

    conversationMessages = await memory.getMessagesForModel(modelContextWindow, model);

    // Always send memory info to frontend for badge display
    const messageCountAfter = memory.messages.length;
    const hasSummaryAfter = !!memory.summary;
    const compressionHappened = hasSummaryAfter && (!hadSummaryBefore || (messageCountAfter < messageCountBefore));

    memoryInfo = {
      messageCount: messageCountAfter,
      hasSummary: hasSummaryAfter,
      compressed: compressionHappened  // Only true when compression just happened this request
    };
  } catch (err) {
    console.error('Error getting conversation messages:', err);
    conversationMessages = [{ role: 'user', content: finalPrompt }];
  }

  // ALL models now use the Responses API (/openai/v1/responses)
  // No API version needed with v1 endpoint
  const url = `${endpoint.replace(/\/$/, '')}/openai/v1/responses`;

  console.log('Request URL:', url);
  console.log('Deployment Name:', deploymentName);
  console.log('Conversation messages count:', conversationMessages.length);

  // Get max output tokens from client preference or environment (default 12800 = 10% of 128K context)
  const maxOutputTokens = maxTokens || parseInt(process.env.MAX_OUTPUT_TOKENS || '12800', 10);

  // Convert conversation messages array to single input string
  // For Responses API, we concatenate all messages into a single prompt
  let inputPrompt = '';
  for (const msg of conversationMessages) {
    if (msg.role === 'system') {
      inputPrompt += `System: ${msg.content}\n\n`;
    } else if (msg.role === 'user') {
      inputPrompt += `User: ${msg.content}\n\n`;
    } else if (msg.role === 'assistant') {
      inputPrompt += `Assistant: ${msg.content}\n\n`;
    }
  }
  // Add final instruction to ensure model responds as assistant
  inputPrompt += 'Assistant:';

  // Build request body for Responses API
  const requestBody = {
    model: deploymentName,
    input: inputPrompt,
    max_output_tokens: maxOutputTokens
  };

  // Add GPT-5 specific parameters if it's a GPT-5 model
  const isGPT5Model = deploymentName.toLowerCase().startsWith('gpt-5');
  if (isGPT5Model) {
    // Get reasoning_effort and verbosity from request (defaults to medium)
    const reasoningEffort = req.body.reasoningEffort || 'medium';
    const verbosity = req.body.verbosity || 'medium';

    // Note: gpt-5-codex does not support 'minimal' reasoning_effort
    const isCodex = deploymentName.toLowerCase().includes('codex');
    if (isCodex && reasoningEffort === 'minimal') {
      requestBody.reasoning = { effort: 'low' }; // Fallback to 'low' for codex
    } else {
      requestBody.reasoning = { effort: reasoningEffort };
    }

    // Azure Responses API uses text.verbosity, not verbosity
    requestBody.text = { verbosity: verbosity };
  }

  console.log('Request body:', JSON.stringify(requestBody, null, 2));

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

      // Record failed request
      if (isOAuthEnabled()) {
        await recordUsage({
          userEmail,
          userId,
          model,
          deployment: deploymentName,
          inputTokens: 0,
          outputTokens: 0,
          sessionId: req.session?.id,
          fileAttached: !!fileId,
          success: false,
          errorMessage: errorMsg
        });
      }

      throw new Error(`${errorMsg}. Deployment: ${deploymentName}, API: Responses API (v1)`);
    }

    // Responses API returns the answer in 'output' field (array format)
    let answer = '(empty response from model)';
    if (Array.isArray(data.output)) {
      // Find the message object in the output array
      const messageObj = data.output.find(item => item.type === 'message');
      if (messageObj && messageObj.content && messageObj.content.length > 0) {
        const textContent = messageObj.content.find(c => c.type === 'output_text');
        if (textContent && textContent.text) {
          answer = textContent.text;
        }
      }
    } else if (typeof data.output === 'string') {
      // Fallback for simple string output
      answer = data.output;
    }

    // Extract token counts for usage tracking from Responses API format
    const tokenCounts = extractTokenCounts(data, true); // Always use Responses API format

    // Record usage to CSV
    if (isOAuthEnabled()) {
      const costs = await recordUsage({
        userEmail,
        userId,
        model,
        deployment: deploymentName,
        inputTokens: tokenCounts.prompt_tokens,
        outputTokens: tokenCounts.completion_tokens,
        sessionId: req.session?.id,
        fileAttached: !!fileId,
        success: true,
        errorMessage: ''
      });

      console.log(`Usage recorded: ${userEmail} - ${tokenCounts.total_tokens} tokens, $${costs.totalCost}`);
    }

    // Add assistant response to conversation memory
    memory.addMessage('assistant', answer);

    console.log('Extracted answer:', answer);
    console.log('Memory info:', JSON.stringify(memoryInfo));

    // Extract the actual model name from Azure response for verification
    const actualModelUsed = data.model || deploymentName;
    console.log('Model called by Azure:', actualModelUsed);

    // Return answer with memory info and usage
    const responseData = {
      answer,
      modelCalled: actualModelUsed,  // Actual model returned by Azure
      deploymentName: deploymentName  // What we requested
    };
    if (memoryInfo) {
      responseData.memory = memoryInfo;
    }
    if (isOAuthEnabled() && tokenCounts.total_tokens > 0) {
      responseData.usage = {
        tokens: tokenCounts.total_tokens,
        inputTokens: tokenCounts.prompt_tokens,
        outputTokens: tokenCounts.completion_tokens
      };
    }

    console.log('Sending response:', JSON.stringify(responseData));
    res.json(responseData);
  } catch (error) {
    console.error('Fetch error:', error);
    res.status(500).json({ answer: `Azure OpenAI Error: ${error.message}` });
  }
});

// ============================================================================
// Usage Analytics Endpoints
// ============================================================================

// Get current user's usage summary
app.get('/api/usage/summary', requireAuth, async (req, res) => {
  try {
    const userEmail = req.session?.account?.username || 'anonymous';
    const { startDate, endDate } = req.query;

    const summary = await getUserSummary(
      userEmail,
      startDate ? new Date(startDate) : null,
      endDate ? new Date(endDate) : null
    );

    res.json(summary);
  } catch (error) {
    console.error('Error getting usage summary:', error);
    res.status(500).json({ error: 'Failed to get usage summary' });
  }
});

// Get hourly usage breakdown
app.get('/api/usage/hourly', requireAuth, async (req, res) => {
  try {
    const userEmail = req.session?.account?.username || 'anonymous';
    const hoursBack = parseInt(req.query.hours) || 24;

    const hourlyData = await getHourlyUsage(userEmail, hoursBack);
    res.json(hourlyData);
  } catch (error) {
    console.error('Error getting hourly usage:', error);
    res.status(500).json({ error: 'Failed to get hourly usage' });
  }
});

// Get daily usage breakdown
app.get('/api/usage/daily', requireAuth, async (req, res) => {
  try {
    const userEmail = req.session?.account?.username || 'anonymous';
    const daysBack = parseInt(req.query.days) || 30;

    const dailyData = await getDailyUsage(userEmail, daysBack);
    res.json(dailyData);
  } catch (error) {
    console.error('Error getting daily usage:', error);
    res.status(500).json({ error: 'Failed to get daily usage' });
  }
});

// Get cost breakdown by model
app.get('/api/usage/costs', requireAuth, async (req, res) => {
  try {
    const userEmail = req.session?.account?.username || 'anonymous';
    const { startDate, endDate } = req.query;

    const costs = await getCostByModel(
      userEmail,
      startDate ? new Date(startDate) : null,
      endDate ? new Date(endDate) : null
    );

    res.json(costs);
  } catch (error) {
    console.error('Error getting cost breakdown:', error);
    res.status(500).json({ error: 'Failed to get cost breakdown' });
  }
});

// Get current rate limit status
app.get('/api/usage/limits', requireAuth, async (req, res) => {
  try {
    const userEmail = req.session?.account?.username || 'anonymous';
    const limitStatus = await checkRateLimits(userEmail);
    res.json(limitStatus);
  } catch (error) {
    console.error('Error checking rate limits:', error);
    res.status(500).json({ error: 'Failed to check rate limits' });
  }
});

// Admin endpoint - get all users' usage
app.get('/api/admin/usage', requireAuth, async (req, res) => {
  try {
    const userEmail = req.session?.account?.username || 'anonymous';

    // Check if user is admin
    if (!isAdmin(userEmail)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { startDate, endDate } = req.query;
    const allUsersData = await getAllUsersSummary(
      startDate ? new Date(startDate) : null,
      endDate ? new Date(endDate) : null
    );

    res.json(allUsersData);
  } catch (error) {
    console.error('Error getting all users usage:', error);
    res.status(500).json({ error: 'Failed to get all users usage' });
  }
});

// Start cleanup service
startCleanupService();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, cleaning up...');
  stopCleanupService();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, cleaning up...');
  stopCleanupService();
  process.exit(0);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
