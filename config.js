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
      contextWindow: '128K tokens',
      costPer1M: '$0.15 input / $0.60 output',
      multimodal: false,
      specialties: 'Code generation, debugging, refactoring'
    },
    {
      key: 'smallest_llm_api',
      displayName: 'Smallest LLM',
      description: 'Lightweight tasks and quick responses',
      defaultDeployment: 'gpt-5-nano',
      envVar: 'SMALLEST_LLM_DEPLOYMENT_NAME',
      contextWindow: '128K tokens',
      costPer1M: '$0.075 input / $0.30 output',
      multimodal: true,
      specialties: 'Fast responses, simple queries, chat'
    },
    {
      key: 'allaround_llm_api',
      displayName: 'All-Around LLM',
      description: 'General purpose conversations',
      defaultDeployment: 'gpt-5-nano',
      envVar: 'ALLAROUND_LLM_DEPLOYMENT_NAME',
      contextWindow: '128K tokens',
      costPer1M: '$0.50 input / $1.50 output',
      multimodal: true,
      specialties: 'General tasks, analysis, writing'
    },
    {
      key: 'best_llm_api',
      displayName: 'Best LLM',
      description: 'Complex reasoning and advanced tasks',
      defaultDeployment: 'gpt-5-nano',
      envVar: 'BEST_LLM_DEPLOYMENT_NAME',
      contextWindow: '200K tokens',
      costPer1M: '$3.00 input / $15.00 output',
      multimodal: false,
      specialties: 'Complex reasoning, math, research'
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
              contextWindow: metadata.contextWindow || model.contextWindow,
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
