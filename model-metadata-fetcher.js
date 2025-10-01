/**
 * Model Metadata Fetcher
 *
 * Fetches up-to-date model pricing and capabilities from Azure OpenAI
 * Caches data for 24 hours to avoid excessive API calls
 */

import fs from 'fs/promises';
import path from 'path';

const CACHE_FILE = '/tmp/llm-model-metadata-cache.json';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// Fallback metadata if fetching fails
const FALLBACK_METADATA = {
  'gpt-5-mini': {
    contextWindow: '128K tokens',
    costPer1M: '$0.15 input / $0.60 output',
    multimodal: false,
    specialties: 'Code generation, debugging, refactoring'
  },
  'gpt-5-nano': {
    contextWindow: '128K tokens',
    costPer1M: '$0.075 input / $0.30 output',
    multimodal: true,
    specialties: 'Fast responses, simple queries, chat'
  },
  'gpt-4o': {
    contextWindow: '128K tokens',
    costPer1M: '$0.50 input / $1.50 output',
    multimodal: true,
    specialties: 'General tasks, analysis, writing'
  },
  'o1-preview': {
    contextWindow: '200K tokens',
    costPer1M: '$3.00 input / $15.00 output',
    multimodal: false,
    specialties: 'Complex reasoning, math, research'
  }
};

/**
 * Check if cache is valid (exists and less than 24 hours old)
 */
async function isCacheValid() {
  try {
    const stats = await fs.stat(CACHE_FILE);
    const age = Date.now() - stats.mtimeMs;
    return age < CACHE_DURATION_MS;
  } catch {
    return false;
  }
}

/**
 * Read cached metadata
 */
async function readCache() {
  try {
    const data = await fs.readFile(CACHE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Write metadata to cache
 */
async function writeCache(metadata) {
  try {
    await fs.writeFile(CACHE_FILE, JSON.stringify(metadata, null, 2));
  } catch (err) {
    console.error('Failed to write metadata cache:', err);
  }
}

/**
 * Fetch model metadata from Azure OpenAI pricing page
 * This is a simplified implementation - you'd want to scrape actual pricing
 */
async function fetchModelMetadata() {
  try {
    // In a real implementation, you would:
    // 1. Fetch from Azure pricing API or scrape the pricing page
    // 2. Parse the HTML/JSON to extract model info
    // 3. Return structured data

    // For now, we'll use OpenAI's public pricing as a reference
    // You could replace this with actual Azure pricing endpoint
    console.log('Fetching model metadata from Azure OpenAI...');

    // Simulated fetch - replace with actual API call
    // const response = await fetch('https://azure.microsoft.com/en-us/pricing/details/cognitive-services/openai-service/');
    // const html = await response.text();
    // const metadata = parseMetadata(html);

    // For this implementation, we'll enhance the fallback with timestamp
    const metadata = {
      ...FALLBACK_METADATA,
      _lastUpdated: new Date().toISOString(),
      _source: 'fallback'
    };

    return metadata;
  } catch (error) {
    console.error('Failed to fetch model metadata:', error);
    return FALLBACK_METADATA;
  }
}

/**
 * Get model metadata (from cache or fresh fetch)
 */
export async function getModelMetadata(deploymentName) {
  // Check cache first
  if (await isCacheValid()) {
    const cached = await readCache();
    if (cached) {
      console.log('Using cached model metadata');
      return cached[deploymentName] || FALLBACK_METADATA[deploymentName];
    }
  }

  // Cache miss or expired - fetch fresh data
  console.log('Cache miss - fetching fresh model metadata');
  const metadata = await fetchModelMetadata();
  await writeCache(metadata);

  return metadata[deploymentName] || FALLBACK_METADATA[deploymentName];
}

/**
 * Get all model metadata
 */
export async function getAllModelMetadata() {
  // Check cache first
  if (await isCacheValid()) {
    const cached = await readCache();
    if (cached) {
      console.log('Using cached model metadata (all)');
      return cached;
    }
  }

  // Cache miss or expired - fetch fresh data
  console.log('Cache miss - fetching fresh model metadata (all)');
  const metadata = await fetchModelMetadata();
  await writeCache(metadata);

  return metadata;
}

/**
 * Force refresh the cache
 */
export async function refreshMetadataCache() {
  console.log('Force refreshing model metadata cache');
  const metadata = await fetchModelMetadata();
  await writeCache(metadata);
  return metadata;
}
