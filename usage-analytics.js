/**
 * Usage Analytics Module
 *
 * Provides analytics and reporting on LLM usage data.
 * Reads from CSV file and generates summaries, reports, and insights.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const USAGE_FILE = path.join(DATA_DIR, 'usage.csv');

/**
 * Parse CSV line handling quoted values
 */
function parseCSVLine(line) {
  const parts = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);

  return parts;
}

/**
 * Read and parse usage data from CSV
 */
async function readUsageData() {
  try {
    const csvData = await fs.readFile(USAGE_FILE, 'utf8');
    const lines = csvData.split('\n').filter(line => line.trim());

    if (lines.length <= 1) {
      return [];  // No data beyond header
    }

    const headers = parseCSVLine(lines[0]);
    const data = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = parseCSVLine(lines[i]);
      if (parts.length !== headers.length) continue;

      const entry = {};
      headers.forEach((header, index) => {
        const value = parts[index];
        // Parse numbers
        if (['input_tokens', 'output_tokens', 'total_tokens'].includes(header)) {
          entry[header] = parseInt(value) || 0;
        } else if (['input_cost', 'output_cost', 'total_cost'].includes(header)) {
          entry[header] = parseFloat(value) || 0;
        } else if (header === 'file_attached' || header === 'success') {
          entry[header] = value === 'true';
        } else {
          entry[header] = value;
        }
      });

      data.push(entry);
    }

    return data;
  } catch (error) {
    console.error('Error reading usage data:', error);
    return [];
  }
}

/**
 * Get usage summary for a specific user
 */
export async function getUserSummary(userEmail, startDate = null, endDate = null) {
  const data = await readUsageData();

  const userEntries = data.filter(entry => {
    if (entry.user_email !== userEmail && userEmail !== 'admin') {
      return false;
    }

    const timestamp = new Date(entry.timestamp);
    if (startDate && timestamp < startDate) return false;
    if (endDate && timestamp > endDate) return false;

    return true;
  });

  // Calculate summary statistics
  const summary = {
    totalRequests: userEntries.length,
    successfulRequests: userEntries.filter(e => e.success).length,
    failedRequests: userEntries.filter(e => !e.success).length,
    totalTokens: userEntries.reduce((sum, e) => sum + e.total_tokens, 0),
    inputTokens: userEntries.reduce((sum, e) => sum + e.input_tokens, 0),
    outputTokens: userEntries.reduce((sum, e) => sum + e.output_tokens, 0),
    totalCost: userEntries.reduce((sum, e) => sum + e.total_cost, 0),
    filesProcessed: userEntries.filter(e => e.file_attached).length,
    modelUsage: {},
    hourlyUsage: {},
    dailyUsage: {}
  };

  // Group by model
  userEntries.forEach(entry => {
    const model = entry.model || 'unknown';
    if (!summary.modelUsage[model]) {
      summary.modelUsage[model] = {
        requests: 0,
        tokens: 0,
        cost: 0
      };
    }
    summary.modelUsage[model].requests++;
    summary.modelUsage[model].tokens += entry.total_tokens;
    summary.modelUsage[model].cost += entry.total_cost;
  });

  // Group by hour and day
  userEntries.forEach(entry => {
    const timestamp = new Date(entry.timestamp);
    const hour = timestamp.toISOString().substring(0, 13);  // YYYY-MM-DDTHH
    const day = timestamp.toISOString().substring(0, 10);   // YYYY-MM-DD
    const model = entry.model || 'unknown';

    if (!summary.hourlyUsage[hour]) {
      summary.hourlyUsage[hour] = { requests: 0, tokens: 0, cost: 0, models: {} };
    }
    summary.hourlyUsage[hour].requests++;
    summary.hourlyUsage[hour].tokens += entry.total_tokens;
    summary.hourlyUsage[hour].cost += entry.total_cost;

    // Track per-model usage within each hour
    if (!summary.hourlyUsage[hour].models[model]) {
      summary.hourlyUsage[hour].models[model] = { requests: 0, tokens: 0, cost: 0 };
    }
    summary.hourlyUsage[hour].models[model].requests++;
    summary.hourlyUsage[hour].models[model].tokens += entry.total_tokens;
    summary.hourlyUsage[hour].models[model].cost += entry.total_cost;

    if (!summary.dailyUsage[day]) {
      summary.dailyUsage[day] = { requests: 0, tokens: 0, cost: 0, models: {} };
    }
    summary.dailyUsage[day].requests++;
    summary.dailyUsage[day].tokens += entry.total_tokens;
    summary.dailyUsage[day].cost += entry.total_cost;

    // Track per-model usage within each day
    if (!summary.dailyUsage[day].models[model]) {
      summary.dailyUsage[day].models[model] = { requests: 0, tokens: 0, cost: 0 };
    }
    summary.dailyUsage[day].models[model].requests++;
    summary.dailyUsage[day].models[model].tokens += entry.total_tokens;
    summary.dailyUsage[day].models[model].cost += entry.total_cost;
  });

  // Round costs for display
  summary.totalCost = parseFloat(summary.totalCost.toFixed(4));
  Object.values(summary.modelUsage).forEach(usage => {
    usage.cost = parseFloat(usage.cost.toFixed(4));
  });
  Object.values(summary.hourlyUsage).forEach(usage => {
    usage.cost = parseFloat(usage.cost.toFixed(4));
    // Round model costs too
    if (usage.models) {
      Object.values(usage.models).forEach(modelUsage => {
        modelUsage.cost = parseFloat(modelUsage.cost.toFixed(4));
      });
    }
  });
  Object.values(summary.dailyUsage).forEach(usage => {
    usage.cost = parseFloat(usage.cost.toFixed(4));
    // Round model costs too
    if (usage.models) {
      Object.values(usage.models).forEach(modelUsage => {
        modelUsage.cost = parseFloat(modelUsage.cost.toFixed(4));
      });
    }
  });

  return summary;
}

/**
 * Get hourly usage breakdown
 */
export async function getHourlyUsage(userEmail, hoursBack = 24) {
  const endDate = new Date();
  const startDate = new Date(endDate - hoursBack * 60 * 60 * 1000);

  const data = await readUsageData();
  const hourlyData = {};

  // Initialize all hours
  for (let i = 0; i < hoursBack; i++) {
    const hourTime = new Date(endDate - i * 60 * 60 * 1000);
    const hour = hourTime.toISOString().substring(0, 13);
    hourlyData[hour] = {
      hour,
      requests: 0,
      tokens: 0,
      cost: 0,
      models: {}
    };
  }

  // Fill with actual data
  data.forEach(entry => {
    if (userEmail !== 'admin' && entry.user_email !== userEmail) {
      return;
    }

    const timestamp = new Date(entry.timestamp);
    if (timestamp < startDate || timestamp > endDate) return;

    const hour = timestamp.toISOString().substring(0, 13);
    if (!hourlyData[hour]) return;

    hourlyData[hour].requests++;
    hourlyData[hour].tokens += entry.total_tokens;
    hourlyData[hour].cost += entry.total_cost;

    const model = entry.model || 'unknown';
    if (!hourlyData[hour].models[model]) {
      hourlyData[hour].models[model] = { requests: 0, tokens: 0, cost: 0 };
    }
    hourlyData[hour].models[model].requests++;
    hourlyData[hour].models[model].tokens += entry.total_tokens;
    hourlyData[hour].models[model].cost += entry.total_cost;
  });

  // Convert to array and sort by hour
  return Object.values(hourlyData)
    .map(h => ({
      ...h,
      cost: parseFloat(h.cost.toFixed(4))
    }))
    .sort((a, b) => a.hour.localeCompare(b.hour));
}

/**
 * Get daily usage breakdown
 */
export async function getDailyUsage(userEmail, daysBack = 30) {
  const endDate = new Date();
  const startDate = new Date(endDate - daysBack * 24 * 60 * 60 * 1000);

  const data = await readUsageData();
  const dailyData = {};

  // Initialize all days
  for (let i = 0; i < daysBack; i++) {
    const dayTime = new Date(endDate - i * 24 * 60 * 60 * 1000);
    const day = dayTime.toISOString().substring(0, 10);
    dailyData[day] = {
      date: day,
      requests: 0,
      tokens: 0,
      cost: 0,
      models: {}
    };
  }

  // Fill with actual data
  data.forEach(entry => {
    if (userEmail !== 'admin' && entry.user_email !== userEmail) {
      return;
    }

    const timestamp = new Date(entry.timestamp);
    if (timestamp < startDate || timestamp > endDate) return;

    const day = timestamp.toISOString().substring(0, 10);
    if (!dailyData[day]) return;

    dailyData[day].requests++;
    dailyData[day].tokens += entry.total_tokens;
    dailyData[day].cost += entry.total_cost;

    const model = entry.model || 'unknown';
    if (!dailyData[day].models[model]) {
      dailyData[day].models[model] = { requests: 0, tokens: 0, cost: 0 };
    }
    dailyData[day].models[model].requests++;
    dailyData[day].models[model].tokens += entry.total_tokens;
    dailyData[day].models[model].cost += entry.total_cost;
  });

  // Convert to array and sort by date
  return Object.values(dailyData)
    .map(d => ({
      ...d,
      cost: parseFloat(d.cost.toFixed(4))
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get cost breakdown by model
 */
export async function getCostByModel(userEmail, startDate = null, endDate = null) {
  const data = await readUsageData();
  const modelCosts = {};

  data.forEach(entry => {
    if (userEmail !== 'admin' && entry.user_email !== userEmail) {
      return;
    }

    const timestamp = new Date(entry.timestamp);
    if (startDate && timestamp < startDate) return;
    if (endDate && timestamp > endDate) return;

    const model = entry.model || 'unknown';
    if (!modelCosts[model]) {
      modelCosts[model] = {
        model,
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
        avgTokensPerRequest: 0,
        avgCostPerRequest: 0
      };
    }

    modelCosts[model].requests++;
    modelCosts[model].inputTokens += entry.input_tokens;
    modelCosts[model].outputTokens += entry.output_tokens;
    modelCosts[model].totalTokens += entry.total_tokens;
    modelCosts[model].inputCost += entry.input_cost;
    modelCosts[model].outputCost += entry.output_cost;
    modelCosts[model].totalCost += entry.total_cost;
  });

  // Calculate averages
  Object.values(modelCosts).forEach(model => {
    model.avgTokensPerRequest = model.requests > 0
      ? Math.round(model.totalTokens / model.requests)
      : 0;
    model.avgCostPerRequest = model.requests > 0
      ? parseFloat((model.totalCost / model.requests).toFixed(4))
      : 0;
    model.inputCost = parseFloat(model.inputCost.toFixed(4));
    model.outputCost = parseFloat(model.outputCost.toFixed(4));
    model.totalCost = parseFloat(model.totalCost.toFixed(4));
  });

  // Sort by total cost descending
  return Object.values(modelCosts).sort((a, b) => b.totalCost - a.totalCost);
}

/**
 * Get all users' usage summary (admin only)
 */
export async function getAllUsersSummary(startDate = null, endDate = null) {
  const data = await readUsageData();
  const userSummaries = {};

  data.forEach(entry => {
    const timestamp = new Date(entry.timestamp);
    if (startDate && timestamp < startDate) return;
    if (endDate && timestamp > endDate) return;

    const user = entry.user_email || 'anonymous';
    if (!userSummaries[user]) {
      userSummaries[user] = {
        email: user,
        requests: 0,
        tokens: 0,
        cost: 0,
        lastUsed: null,
        models: new Set()
      };
    }

    userSummaries[user].requests++;
    userSummaries[user].tokens += entry.total_tokens;
    userSummaries[user].cost += entry.total_cost;
    userSummaries[user].models.add(entry.model);

    const entryTime = new Date(entry.timestamp);
    if (!userSummaries[user].lastUsed || entryTime > userSummaries[user].lastUsed) {
      userSummaries[user].lastUsed = entryTime;
    }
  });

  // Convert sets to arrays and format
  return Object.values(userSummaries)
    .map(user => ({
      ...user,
      cost: parseFloat(user.cost.toFixed(4)),
      avgTokensPerRequest: user.requests > 0
        ? Math.round(user.tokens / user.requests)
        : 0,
      avgCostPerRequest: user.requests > 0
        ? parseFloat((user.cost / user.requests).toFixed(4))
        : 0,
      models: Array.from(user.models),
      lastUsed: user.lastUsed ? user.lastUsed.toISOString() : null
    }))
    .sort((a, b) => b.cost - a.cost);  // Sort by cost descending
}

/**
 * Check if user is admin (based on email domain or specific list)
 */
export function isAdmin(userEmail) {
  const adminDomains = (process.env.ADMIN_DOMAINS || '').split(',').filter(d => d);
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').filter(e => e);

  // Check specific admin emails
  if (adminEmails.includes(userEmail)) {
    return true;
  }

  // Check admin domains
  const domain = userEmail.split('@')[1];
  if (domain && adminDomains.includes(domain)) {
    return true;
  }

  return false;
}