/**
 * Usage Tracking Module
 *
 * Tracks all LLM API usage to CSV file for cost monitoring and analytics.
 * Designed for Docker deployment with persistent volume mounting.
 *
 * CSV Schema:
 * timestamp,user_email,user_id,model,deployment,input_tokens,output_tokens,
 * total_tokens,input_cost,output_cost,total_cost,session_id,file_attached,success,error_message
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use /data directory for Docker volume mounting
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const USAGE_FILE = path.join(DATA_DIR, 'usage.csv');
const RATE_LIMITS_FILE = path.join(DATA_DIR, 'rate-limits.json');

// Model pricing (per 1K tokens) - update these as Azure pricing changes
// Source: https://azure.microsoft.com/pricing/details/cognitive-services/openai-service/
const MODEL_PRICING = {
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4-32k': { input: 0.06, output: 0.12 },
  'gpt-35-turbo': { input: 0.0005, output: 0.0015 },
  'gpt-35-turbo-16k': { input: 0.003, output: 0.004 },
  'o1-preview': { input: 0.015, output: 0.06 },
  'o1-mini': { input: 0.003, output: 0.012 },
  'o3-mini': { input: 0.004, output: 0.016 },
  'gpt-5-codex': { input: 0.002, output: 0.008 },
  // Add more models as needed
};

// Default rate limits (can be overridden per user)
const DEFAULT_RATE_LIMITS = {
  hourly_tokens: 100000,  // 100K tokens per hour
  daily_tokens: 1000000,   // 1M tokens per day
  hourly_cost: 10,         // $10 per hour
  daily_cost: 100,         // $100 per day
};

/**
 * Ensure data directory and files exist
 */
async function ensureDataFiles() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });

    // Check if usage file exists, create with header if not
    try {
      await fs.access(USAGE_FILE);
    } catch {
      const header = 'timestamp,user_email,user_id,model,deployment,input_tokens,output_tokens,total_tokens,input_cost,output_cost,total_cost,session_id,file_attached,success,error_message\n';
      await fs.writeFile(USAGE_FILE, header);
    }

    // Check if rate limits file exists, create with defaults if not
    try {
      await fs.access(RATE_LIMITS_FILE);
    } catch {
      await fs.writeFile(RATE_LIMITS_FILE, JSON.stringify({
        default: DEFAULT_RATE_LIMITS,
        users: {}
      }, null, 2));
    }
  } catch (error) {
    console.error('Error ensuring data files:', error);
  }
}

/**
 * Get pricing for a model/deployment
 */
function getModelPricing(deployment) {
  // Try exact match first
  if (MODEL_PRICING[deployment]) {
    return MODEL_PRICING[deployment];
  }

  // Try to match by partial name
  const deploymentLower = deployment.toLowerCase();
  for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
    if (deploymentLower.includes(model.toLowerCase()) ||
        model.toLowerCase().includes(deploymentLower)) {
      return pricing;
    }
  }

  // Default pricing if model not found
  return { input: 0.001, output: 0.002 };
}

/**
 * Calculate costs based on tokens and model
 */
function calculateCosts(inputTokens, outputTokens, deployment) {
  const pricing = getModelPricing(deployment);
  const inputCost = (inputTokens / 1000) * pricing.input;
  const outputCost = (outputTokens / 1000) * pricing.output;
  const totalCost = inputCost + outputCost;

  return {
    inputCost: parseFloat(inputCost.toFixed(6)),
    outputCost: parseFloat(outputCost.toFixed(6)),
    totalCost: parseFloat(totalCost.toFixed(6))
  };
}

/**
 * Extract token counts from Azure OpenAI response
 */
export function extractTokenCounts(response, isResponsesAPI = false) {
  // Responses API format (gpt-5-codex, gpt-5-nano, etc.)
  if (isResponsesAPI) {
    // Check for usage in Responses API format
    if (response.usage) {
      return {
        prompt_tokens: response.usage.input_tokens || response.usage.prompt_tokens || 0,
        completion_tokens: response.usage.output_tokens || response.usage.completion_tokens || 0,
        total_tokens: response.usage.total_tokens ||
                     (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0)
      };
    }

    // Fallback: estimate from output text if usage not available
    let outputText = '';
    if (Array.isArray(response.output)) {
      const messageObj = response.output.find(item => item.type === 'message');
      if (messageObj?.content) {
        const textContent = messageObj.content.find(c => c.type === 'output_text');
        outputText = textContent?.text || '';
      }
    } else if (typeof response.output === 'string') {
      outputText = response.output;
    }

    return {
      prompt_tokens: Math.ceil(outputText.length / 4) * 0.3,  // Rough estimate
      completion_tokens: Math.ceil(outputText.length / 4),
      total_tokens: Math.ceil(outputText.length / 4) * 1.3
    };
  }

  // Standard Chat Completions API format
  return {
    prompt_tokens: response.usage?.prompt_tokens || 0,
    completion_tokens: response.usage?.completion_tokens || 0,
    total_tokens: response.usage?.total_tokens || 0
  };
}

/**
 * Record usage to CSV file
 */
export async function recordUsage(data) {
  await ensureDataFiles();

  const {
    userEmail,
    userId,
    model,
    deployment,
    inputTokens,
    outputTokens,
    sessionId,
    fileAttached = false,
    success = true,
    errorMessage = ''
  } = data;

  const totalTokens = inputTokens + outputTokens;
  const costs = calculateCosts(inputTokens, outputTokens, deployment);

  // Format CSV row
  const timestamp = new Date().toISOString();
  const row = [
    timestamp,
    userEmail || 'anonymous',
    userId || 'anonymous',
    model,
    deployment,
    inputTokens,
    outputTokens,
    totalTokens,
    costs.inputCost,
    costs.outputCost,
    costs.totalCost,
    sessionId || '',
    fileAttached,
    success,
    errorMessage.replace(/,/g, ';')  // Replace commas to avoid CSV issues
  ].join(',') + '\n';

  try {
    await fs.appendFile(USAGE_FILE, row);
    console.log(`Usage recorded: ${userEmail} used ${totalTokens} tokens ($${costs.totalCost})`);
  } catch (error) {
    console.error('Error recording usage:', error);
  }

  return costs;
}

/**
 * Get user's rate limits
 */
export async function getUserRateLimits(userEmail) {
  await ensureDataFiles();

  try {
    const data = await fs.readFile(RATE_LIMITS_FILE, 'utf8');
    const config = JSON.parse(data);

    // Return user-specific limits or defaults
    return config.users[userEmail] || config.default || DEFAULT_RATE_LIMITS;
  } catch (error) {
    console.error('Error reading rate limits:', error);
    return DEFAULT_RATE_LIMITS;
  }
}

/**
 * Check if user has exceeded rate limits
 */
export async function checkRateLimits(userEmail) {
  const limits = await getUserRateLimits(userEmail);
  const now = new Date();
  const oneHourAgo = new Date(now - 60 * 60 * 1000);
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

  try {
    const csvData = await fs.readFile(USAGE_FILE, 'utf8');
    const lines = csvData.split('\n').filter(line => line.trim());

    let hourlyTokens = 0;
    let hourlyCost = 0;
    let dailyTokens = 0;
    let dailyCost = 0;

    // Skip header, process each line
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts[1] !== userEmail) continue;

      const timestamp = new Date(parts[0]);
      const tokens = parseInt(parts[7]) || 0;  // total_tokens
      const cost = parseFloat(parts[10]) || 0;  // total_cost

      if (timestamp >= oneHourAgo) {
        hourlyTokens += tokens;
        hourlyCost += cost;
      }
      if (timestamp >= oneDayAgo) {
        dailyTokens += tokens;
        dailyCost += cost;
      }
    }

    return {
      allowed: hourlyTokens < limits.hourly_tokens &&
               dailyTokens < limits.daily_tokens &&
               hourlyCost < limits.hourly_cost &&
               dailyCost < limits.daily_cost,
      usage: {
        hourlyTokens,
        dailyTokens,
        hourlyCost: parseFloat(hourlyCost.toFixed(2)),
        dailyCost: parseFloat(dailyCost.toFixed(2))
      },
      limits,
      remaining: {
        hourlyTokens: Math.max(0, limits.hourly_tokens - hourlyTokens),
        dailyTokens: Math.max(0, limits.daily_tokens - dailyTokens),
        hourlyCost: Math.max(0, limits.hourly_cost - hourlyCost),
        dailyCost: Math.max(0, limits.daily_cost - dailyCost)
      }
    };
  } catch (error) {
    console.error('Error checking rate limits:', error);
    // Allow on error to avoid blocking users
    return { allowed: true, usage: {}, limits, remaining: limits };
  }
}

/**
 * Update user rate limits
 */
export async function updateUserRateLimits(userEmail, newLimits) {
  await ensureDataFiles();

  try {
    const data = await fs.readFile(RATE_LIMITS_FILE, 'utf8');
    const config = JSON.parse(data);

    if (!config.users) {
      config.users = {};
    }

    config.users[userEmail] = {
      ...DEFAULT_RATE_LIMITS,
      ...newLimits
    };

    await fs.writeFile(RATE_LIMITS_FILE, JSON.stringify(config, null, 2));
    console.log(`Updated rate limits for ${userEmail}`);
  } catch (error) {
    console.error('Error updating rate limits:', error);
  }
}

// Initialize data files on module load
ensureDataFiles().catch(console.error);