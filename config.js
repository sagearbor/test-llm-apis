/**
 * Model Configuration
 *
 * This file defines the available models and their deployment names.
 * Deployment names can be overridden by environment variables.
 *
 * When deploying to Azure Web App:
 * - Set sensitive values (endpoint, API key, version) as environment variables
 * - Set deployment names as environment variables OR modify this file
 * - Changes to this file will be reflected after redeploying from git
 */

import { getAllModelMetadata } from './model-metadata-fetcher.js';

export const modelConfig = {
  // Model definitions with friendly names and default deployment names
  models: [
    {
      key: 'coding_llm_api',
      displayName: 'Coding LLM',
      description: 'Code generation and programming tasks',
      defaultDeployment: 'gpt-5-mini', // 'gpt-5-codex',
      envVar: 'CODING_LLM_DEPLOYMENT_NAME',
      inputContextWindow: 272000,  // 272K input tokens
      outputContextWindow: 128000, // 128K output tokens
      costPer1M: '$0.15 input / $0.60 output (estimated)',
      multimodal: true,  // gpt-5-mini supports vision
      specialties: 'Code generation, debugging, refactoring'
    },
    {
      key: 'smallest_llm_api',
      displayName: 'Smallest LLM',
      description: 'Lightweight tasks and quick responses',
      defaultDeployment: 'gpt-5-nano',
      envVar: 'SMALLEST_LLM_DEPLOYMENT_NAME',
      inputContextWindow: 272000,  // 272K input tokens
      outputContextWindow: 128000, // 128K output tokens
      costPer1M: '$0.05 input / $0.20 output (estimated)',
      multimodal: true,
      specialties: 'Fast responses, simple queries, chat'
    },
    {
      key: 'allaround_llm_api',
      displayName: 'All-Around LLM',
      description: 'General purpose conversations',
      defaultDeployment: 'gpt-5-mini',
      envVar: 'ALLAROUND_LLM_DEPLOYMENT_NAME',
      inputContextWindow: 272000,  // 272K input tokens
      outputContextWindow: 128000, // 128K output tokens
      costPer1M: '$0.05 input / $0.20 output (estimated)',
      multimodal: true,
      specialties: 'General tasks, analysis, writing'
    },
    {
      key: 'best_llm_api',
      displayName: 'Best LLM',
      description: 'Complex reasoning and advanced tasks',
      defaultDeployment: 'gpt-5',
      envVar: 'BEST_LLM_DEPLOYMENT_NAME',
      inputContextWindow: 272000,  // 272K input tokens
      outputContextWindow: 128000, // 128K output tokens
      costPer1M: '$0.50 input / $2.00 output (estimated)',
      multimodal: true,
      specialties: 'Complex reasoning, math, research'
    },
    {
      key: 'longest_llm_api',
      displayName: 'Longest LLM',
      description: 'Massive context window for long documents',
      defaultDeployment: 'gpt-4.1',
      envVar: 'LONGEST_LLM_DEPLOYMENT_NAME',
      inputContextWindow: 1047576,  // ~1M tokens
      outputContextWindow: 1047576,
      costPer1M: '$0.58 input / $0.84 output (estimated)',
      multimodal: false,
      specialties: 'Long documents, extensive context, analysis'
    }
  ],

  /**
   * Get deployment name for a model, checking environment variable first
   */
  getDeploymentName(modelKey) {
    const model = this.models.find(m => m.key === modelKey);
    if (!model) return null;

    // Check environment variable first, fall back to default
    return process.env[model.envVar] || model.defaultDeployment;
  },

  /**
   * Get all model configs with their deployment names
   * Optionally enrich with latest metadata from cache/API
   */
  async getAllModels(enrichWithLatestMetadata = false) {
    const models = this.models.map(model => ({
      ...model,
      deploymentName: this.getDeploymentName(model.key)
    }));

    // Optionally fetch latest metadata from cache/API
    if (enrichWithLatestMetadata) {
      try {
        const latestMetadata = await getAllModelMetadata();

        return models.map(model => {
          const deploymentName = model.deploymentName;
          const metadata = latestMetadata[deploymentName];

          if (metadata) {
            return {
              ...model,
              // Override with latest metadata if available
              inputContextWindow: metadata.inputContextWindow || model.inputContextWindow,
              outputContextWindow: metadata.outputContextWindow || model.outputContextWindow,
              costPer1M: metadata.costPer1M || model.costPer1M,
              multimodal: metadata.multimodal !== undefined ? metadata.multimodal : model.multimodal,
              specialties: metadata.specialties || model.specialties,
              _lastUpdated: latestMetadata._lastUpdated
            };
          }

          return model;
        });
      } catch (err) {
        console.error('Failed to enrich with latest metadata:', err);
        return models;
      }
    }

    return models;
  },

  /**
   * Get deployment map for server routing
   */
  getDeploymentMap() {
    const map = {};
    this.models.forEach(model => {
      map[model.key] = this.getDeploymentName(model.key);
    });
    return map;
  }
};
