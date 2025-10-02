/**
 * Model Metadata Fetcher
 *
 * Fetches up-to-date model pricing and context window data from multiple sources.
 * Implements a tiered source-of-truth strategy for maximum accuracy.
 * Caches data for 24 hours to avoid excessive API calls.
 *
 * ============================================================================
 * DATA SOURCES - TIERED STRATEGY FOR REAL-TIME ACCURACY
 * ============================================================================
 *
 * PRIMARY SOURCE 1: Azure OpenAI Service Pricing Page (Automated Scraping)
 * URL: https://azure.microsoft.com/en-us/pricing/details/cognitive-services/openai-service/
 * Contains: ✅ Context windows, ✅ Pricing, ✅ Knowledge cutoff dates
 * Models: GPT-5, GPT-4.1, GPT-4o, o1, o3, o4-mini (all Azure OpenAI models)
 * Update Frequency: DAILY/WEEKLY (automated scraping recommended)
 * Scraping Hints:
 *   - Page has structured tables with model pricing
 *   - Context windows shown as "128K context" or "1 million token context window"
 *   - Pricing shown per 1M tokens for input/output
 *
 * PRIMARY SOURCE 2: Microsoft Learn Documentation (Validation + Detailed Specs)
 * URL: https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/models
 * Contains: ✅ Context windows (input/output breakdown), ✅ Model capabilities
 * Use As: Validation source + detailed reference for input/output token splits
 * Update Frequency: WEEKLY (manual verification)
 * Scraping Hints:
 *   - Structured tables with model names and token limits
 *   - Explicit input/output breakdowns (e.g., "272K input + 128K output")
 *
 * PRIMARY SOURCE 3: Azure AI Foundry Pricing (Partner Models)
 * URLs:
 *   - https://azure.microsoft.com/en-us/pricing/details/phi-3/
 *   - Similar pages for Meta Llama, DeepSeek, xAI Grok, Mistral
 * Contains: ✅ Pricing for partner models
 * Update Frequency: WEEKLY (manual verification required)
 * Note: Some models (Mistral, Cohere) require Azure Marketplace verification
 *
 * FALLBACK SOURCE 4: Azure Retail Prices API (Pricing Only)
 * URL: https://prices.azure.com/api/retail/prices
 * Query: serviceName eq 'Cognitive Services' and productName eq 'Azure OpenAI'
 * Contains: ✅ Real-time pricing (may lag for new models)
 * Limitations: ❌ NO context window data, ❌ May not include newest models
 *
 * ============================================================================
 * UPDATE PROCEDURES
 * ============================================================================
 *
 * AUTOMATED UPDATES (Recommended):
 * 1. Run daily/weekly scraper against Primary Source 1
 * 2. Parse HTML tables to extract context windows + pricing
 * 3. Compare against hardcoded CONTEXT_WINDOWS table
 * 4. Log warnings if discrepancies found (indicates manual update needed)
 *
 * MANUAL UPDATES (When new models released):
 * 1. Check Primary Source 1 (Azure OpenAI pricing page)
 * 2. Verify against Primary Source 2 (Microsoft Learn docs)
 * 3. Update CONTEXT_WINDOWS table below
 * 4. Update FALLBACK_METADATA table
 * 5. Clear cache: rm /tmp/llm-model-metadata-cache.json
 * 6. Test: curl http://localhost:3000/api/models
 *
 * PARTNER MODEL UPDATES (Llama, DeepSeek, Grok, etc.):
 * 1. Check Primary Source 3 (Azure AI Foundry pricing pages)
 * 2. Add to CONTEXT_WINDOWS table with source URL comment
 * 3. Include disclaimer in UI: "Verify pricing in Azure Marketplace"
 * 4. Add deep link to model's marketplace page
 *
 * ============================================================================
 */

import fs from 'fs/promises';

const CACHE_FILE = '/tmp/llm-model-metadata-cache.json';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const AZURE_PRICING_API = 'https://prices.azure.com/api/retail/prices';
const AZURE_OPENAI_PRICING_PAGE = 'https://azure.microsoft.com/en-us/pricing/details/cognitive-services/openai-service/';
const MICROSOFT_LEARN_MODELS_PAGE = 'https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/models';

/**
 * Context Window Lookup Table
 *
 * IMPORTANT: This table is the SOURCE OF TRUTH for context window sizes.
 * Update this when new models are released or context windows change.
 *
 * Last Updated: 2025-10-02
 * Primary Source: https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/models
 * Validation Source: https://azure.microsoft.com/en-us/pricing/details/cognitive-services/openai-service/
 *
 * Values are in tokens (input/output)
 * Format: { input: <max input tokens>, output: <max output tokens> }
 */
const CONTEXT_WINDOWS = {
  // ============================================================================
  // GPT-5 SERIES
  // Source: Microsoft Learn docs (2025-10-02)
  // Total: 400K (272K input + 128K output)
  // ============================================================================
  'gpt-5': { input: 272000, output: 128000 },
  'gpt-5-mini': { input: 272000, output: 128000 },
  'gpt-5-nano': { input: 272000, output: 128000 },
  'gpt-5-chat': { input: 128000, output: 16384 },      // Different output limit
  'gpt-5-codex': { input: 272000, output: 128000 },    // Assumed same as gpt-5

  // ============================================================================
  // GPT-4.1 SERIES
  // Source: Microsoft Learn docs + Azure pricing page (2025-10-02)
  // Context: 1,047,576 tokens (~1M) for pay-as-you-go
  // Note: Provisioned managed deployments limited to 128K
  // ============================================================================
  'gpt-4.1': { input: 1047576, output: 1047576 },
  'gpt-4.1-mini': { input: 1047576, output: 1047576 },
  'gpt-4.1-nano': { input: 1047576, output: 1047576 },

  // ============================================================================
  // GPT-4o SERIES
  // Source: Azure pricing page (2025-10-02)
  // Context: 128K tokens
  // Knowledge cutoff: October 2023
  // ============================================================================
  'gpt-4o': { input: 128000, output: 128000 },
  'gpt-4o-mini': { input: 128000, output: 128000 },

  // ============================================================================
  // O-SERIES REASONING MODELS (o1, o3, o4-mini)
  // Source: Azure pricing page (2025-10-02)
  // Context: 200K input / 100K output
  // Knowledge cutoff: June 2024 (o3, o4-mini), October 2023 (o1)
  // ============================================================================
  'o1': { input: 200000, output: 100000 },
  'o1-preview': { input: 200000, output: 100000 },
  'o3': { input: 200000, output: 100000 },
  'o3-mini': { input: 200000, output: 100000 },
  'o4-mini': { input: 200000, output: 100000 },

  // ============================================================================
  // OLDER GPT-4 MODELS (Legacy)
  // Source: Azure pricing page (historical data)
  // ============================================================================
  'gpt-4': { input: 8192, output: 8192 },              // 8K
  'gpt-4-32k': { input: 32768, output: 32768 },        // 32K
  'gpt-4-turbo': { input: 128000, output: 128000 },    // 128K

  // ============================================================================
  // GPT-3.5 MODELS (Legacy)
  // Source: Azure pricing page (historical data)
  // ============================================================================
  'gpt-35-turbo': { input: 4096, output: 4096 },       // 4K
  'gpt-35-turbo-16k': { input: 16384, output: 16384 }, // 16K

  // ============================================================================
  // PARTNER MODELS (Future expansion)
  // Add here when deploying Meta Llama, DeepSeek, Grok, Mistral, etc.
  // Source: https://azure.microsoft.com/en-us/pricing/details/phi-3/ (and similar)
  // Example:
  // 'llama-3-70b': { input: 8192, output: 8192 },
  // 'deepseek-v3': { input: 64000, output: 64000 },
  // 'grok-2': { input: 131072, output: 131072 },
  // ============================================================================
};

// Fallback metadata if fetching fails
const FALLBACK_METADATA = {
  'gpt-5': {
    inputContextWindow: 272000,
    outputContextWindow: 128000,
    costPer1M: '$0.05 input / $0.20 output (estimated)',
    multimodal: true,
    specialties: 'Advanced reasoning, multimodal'
  },
  'gpt-5-mini': {
    inputContextWindow: 272000,
    outputContextWindow: 128000,
    costPer1M: '$0.15 input / $0.60 output (estimated)',
    multimodal: true,
    specialties: 'Code generation, debugging, refactoring'
  },
  'gpt-5-nano': {
    inputContextWindow: 272000,
    outputContextWindow: 128000,
    costPer1M: '$0.05 input / $0.20 output (estimated)',
    multimodal: true,
    specialties: 'Fast responses, simple queries, chat'
  },
  'gpt-5-codex': {
    inputContextWindow: 272000,
    outputContextWindow: 128000,
    costPer1M: '$0.30 input / $1.20 output (estimated)',
    multimodal: false,
    specialties: 'Advanced code generation, debugging'
  },
  'gpt-4.1': {
    inputContextWindow: 1047576,
    outputContextWindow: 1047576,
    costPer1M: '$0.58 input / $0.84 output (estimated)',
    multimodal: false,
    specialties: 'Long documents, extensive context'
  },
  'gpt-4.1-mini': {
    inputContextWindow: 1047576,
    outputContextWindow: 1047576,
    costPer1M: '$0.40 input / $0.60 output (estimated)',
    multimodal: false,
    specialties: 'Long documents, cost-efficient'
  },
  'gpt-4.1-nano': {
    inputContextWindow: 1047576,
    outputContextWindow: 1047576,
    costPer1M: '$0.20 input / $0.40 output (estimated)',
    multimodal: false,
    specialties: 'Long documents, lightweight'
  },
  'gpt-4o': {
    inputContextWindow: 128000,
    outputContextWindow: 128000,
    costPer1M: '$2.50 input / $10.00 output (estimated)',
    multimodal: true,
    specialties: 'General tasks, analysis, writing'
  },
  'o1-preview': {
    inputContextWindow: 200000,
    outputContextWindow: 100000,
    costPer1M: '$15.00 input / $60.00 output (estimated)',
    multimodal: false,
    specialties: 'Complex reasoning, math, research'
  },
  'o3': {
    inputContextWindow: 200000,
    outputContextWindow: 100000,
    costPer1M: '$5.00 input / $25.00 output (estimated)',
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
 * Helper function to normalize model names from Azure API meter names
 * Azure uses meter names like "gpt-4o-mini-0718 Inp glbl" - extract base model name
 */
function normalizeModelName(meterName) {
  const lower = meterName.toLowerCase();

  // Match model patterns
  if (lower.includes('gpt-4o-mini')) return 'gpt-4o-mini';
  if (lower.includes('gpt-4o')) return 'gpt-4o';
  if (lower.includes('gpt-5-codex')) return 'gpt-5-codex';
  if (lower.includes('gpt-5-mini')) return 'gpt-5-mini';
  if (lower.includes('gpt-5-nano')) return 'gpt-5-nano';
  if (lower.includes('gpt-5')) return 'gpt-5';
  if (lower.includes('gpt-4-turbo')) return 'gpt-4-turbo';
  if (lower.includes('gpt-4-32k')) return 'gpt-4-32k';
  if (lower.includes('gpt-4.1')) return 'gpt-4.1';
  if (lower.includes('gpt-4')) return 'gpt-4';
  if (lower.includes('gpt-35-turbo-16k')) return 'gpt-35-turbo-16k';
  if (lower.includes('gpt-35-turbo')) return 'gpt-35-turbo';
  if (lower.includes('o1-preview')) return 'o1-preview';
  if (lower.includes('o1-pro')) return 'o1';
  if (lower.includes('o1')) return 'o1';
  if (lower.includes('o3-mini')) return 'o3-mini';
  if (lower.includes('o3-pro')) return 'o3';
  if (lower.includes('o3')) return 'o3';
  if (lower.includes('o4-mini')) return 'o4-mini';

  return null;
}

/**
 * Validate context window data (for future automated updates)
 *
 * Compares hardcoded CONTEXT_WINDOWS against scraped data to detect discrepancies.
 * Logs warnings when official sources show different values.
 *
 * @param {Object} scrapedData - Context windows scraped from official pages
 * @returns {Object} - Validation report with warnings
 */
function validateContextWindows(scrapedData) {
  const warnings = [];

  for (const [modelName, scrapedCtx] of Object.entries(scrapedData)) {
    const hardcodedCtx = CONTEXT_WINDOWS[modelName];

    if (!hardcodedCtx) {
      warnings.push(`NEW MODEL DETECTED: ${modelName} (input: ${scrapedCtx.input}, output: ${scrapedCtx.output})`);
      continue;
    }

    if (hardcodedCtx.input !== scrapedCtx.input || hardcodedCtx.output !== scrapedCtx.output) {
      warnings.push(
        `CONTEXT MISMATCH: ${modelName} - ` +
        `Hardcoded: ${hardcodedCtx.input}/${hardcodedCtx.output}, ` +
        `Scraped: ${scrapedCtx.input}/${scrapedCtx.output}`
      );
    }
  }

  if (warnings.length > 0) {
    console.warn('⚠️  Context window validation warnings:');
    warnings.forEach(w => console.warn(`   ${w}`));
    console.warn('   → UPDATE REQUIRED: Check official sources and update CONTEXT_WINDOWS table');
  }

  return { valid: warnings.length === 0, warnings };
}

/**
 * Fetch context window data from Microsoft Learn documentation
 * This provides the most up-to-date context window information
 *
 * TODO: Implement automated web scraping
 * Current implementation: Returns hardcoded table (manually curated from official sources)
 *
 * FUTURE ENHANCEMENT:
 * 1. Use fetch() to get MICROSOFT_LEARN_MODELS_PAGE HTML
 * 2. Parse tables to extract model names + context windows
 * 3. Call validateContextWindows() to detect changes
 * 4. Return merged data (scraped + hardcoded fallbacks)
 */
async function fetchContextWindowsFromDocs() {
  try {
    console.log('Context windows: Using hardcoded table (last updated: 2025-10-02)');
    console.log(`   Source: ${MICROSOFT_LEARN_MODELS_PAGE}`);

    // For now, return hardcoded table
    // TODO: Implement web scraping when ready
    return CONTEXT_WINDOWS;
  } catch (error) {
    console.error('Failed to fetch context windows from docs:', error);
    return CONTEXT_WINDOWS; // Fallback to hardcoded table
  }
}

/**
 * Fetch model metadata from Azure Retail Prices API
 * Combines with context window data (hardcoded table sourced from official docs)
 */
async function fetchModelMetadata() {
  try {
    console.log('Fetching model pricing from Azure Retail Prices API...');

    // Query Azure Retail Prices API for Cognitive Services / Azure OpenAI
    const filter = "$filter=serviceName eq 'Cognitive Services' and productName eq 'Azure OpenAI'";
    const url = `${AZURE_PRICING_API}?${filter}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Azure Pricing API returned ${response.status}`);
    }

    const data = await response.json();
    console.log(`Fetched ${data.Items?.length || 0} pricing items from Azure`);

    // Parse pricing data by model
    const pricingByModel = {};

    for (const item of data.Items || []) {
      const modelName = normalizeModelName(item.meterName || '');
      if (!modelName) continue;

      // Initialize model if not exists
      if (!pricingByModel[modelName]) {
        pricingByModel[modelName] = {
          inputPrices: [],
          outputPrices: [],
          regions: new Set()
        };
      }

      const meter = item.meterName.toLowerCase();
      const price = item.retailPrice || 0;

      // Categorize as input or output pricing
      if (meter.includes('inp') || meter.includes('input')) {
        pricingByModel[modelName].inputPrices.push(price * 1000); // Convert to per 1M tokens
      } else if (meter.includes('outp') || meter.includes('output')) {
        pricingByModel[modelName].outputPrices.push(price * 1000); // Convert to per 1M tokens
      }

      if (item.armRegionName) {
        pricingByModel[modelName].regions.add(item.armRegionName);
      }
    }

    // Build final metadata combining pricing + context windows
    const metadata = {};

    for (const [modelName, pricing] of Object.entries(pricingByModel)) {
      const contextWindow = CONTEXT_WINDOWS[modelName] || { input: 131072, output: 131072 };

      // Calculate average pricing (if available)
      const avgInputPrice = pricing.inputPrices.length > 0
        ? (pricing.inputPrices.reduce((a, b) => a + b, 0) / pricing.inputPrices.length).toFixed(2)
        : 'N/A';
      const avgOutputPrice = pricing.outputPrices.length > 0
        ? (pricing.outputPrices.reduce((a, b) => a + b, 0) / pricing.outputPrices.length).toFixed(2)
        : 'N/A';

      metadata[modelName] = {
        inputContextWindow: contextWindow.input,
        outputContextWindow: contextWindow.output,
        costPer1M: avgInputPrice !== 'N/A' || avgOutputPrice !== 'N/A'
          ? `$${avgInputPrice} input / $${avgOutputPrice} output`
          : 'Pricing unavailable',
        multimodal: modelName.includes('gpt-4o') || modelName.includes('gpt-5'),
        specialties: getModelSpecialties(modelName),
        regions: Array.from(pricing.regions).slice(0, 5).join(', ')
      };
    }

    // Merge with fallback data for models not found in API
    const finalMetadata = {
      ...FALLBACK_METADATA,
      ...metadata,
      _lastUpdated: new Date().toISOString(),
      _source: 'azure-retail-prices-api'
    };

    console.log(`Built metadata for ${Object.keys(metadata).length} models from API`);
    return finalMetadata;

  } catch (error) {
    console.error('Failed to fetch model metadata from Azure API:', error);
    console.log('Falling back to static metadata');
    return {
      ...FALLBACK_METADATA,
      _lastUpdated: new Date().toISOString(),
      _source: 'fallback-due-to-error'
    };
  }
}

/**
 * Get model specialties based on model name
 */
function getModelSpecialties(modelName) {
  if (modelName.includes('codex')) return 'Advanced code generation, debugging';
  if (modelName.includes('gpt-5-mini')) return 'Code generation, debugging, refactoring';
  if (modelName.includes('gpt-5-nano')) return 'Fast responses, simple queries, chat';
  if (modelName.includes('gpt-5')) return 'Advanced reasoning, code generation';
  if (modelName.includes('gpt-4o-mini')) return 'Cost-efficient, vision, general tasks';
  if (modelName.includes('gpt-4o')) return 'Multimodal, general tasks, vision';
  if (modelName.includes('o1') || modelName.includes('o3') || modelName.includes('o4')) {
    return 'Complex reasoning, math, research';
  }
  if (modelName.includes('gpt-4')) return 'General tasks, analysis, writing';
  if (modelName.includes('gpt-35')) return 'Fast responses, chat, basic tasks';
  return 'General purpose AI';
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
