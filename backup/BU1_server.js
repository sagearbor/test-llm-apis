import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static('.')); // serve index.html

app.post('/chat', async (req, res) => {
  const { prompt, model } = req.body;

  // Map model selection to deployment names
  const deploymentMap = {
    'coding_llm_api': process.env.CODING_LLM_DEPLOYMENT_NAME,
    'smallest_llm_api': process.env.SMALLEST_LLM_DEPLOYMENT_NAME,
    'allaround_llm_api': process.env.ALLAROUND_LLM_DEPLOYMENT_NAME,
    'best_llm_api': process.env.BEST_LLM_DEPLOYMENT_NAME
  };

  const deploymentName = deploymentMap[model];
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-02-01';

  if (!deploymentName || !endpoint || !apiKey) {
    return res.status(500).json({
      answer: `Configuration error: Missing deployment name, endpoint, or API key for model ${model}`
    });
  }

  // All GPT-5 models use chat completions API
  const url = `${endpoint.replace(/\/$/, '')}/openai/deployments/${deploymentName}/chat/completions?api-version=${apiVersion}`;

  console.log('Request URL:', url);
  console.log('Deployment:', deploymentName);
  console.log('Model:', model);

  // Build request body - GPT-5 models need special handling
  const isGPT5 = deploymentName.startsWith('gpt-5');
  const requestBody = {
    messages: [{ role: 'user', content: prompt }]
  };

  // GPT-5 models need special handling
  if (isGPT5) {
    requestBody.max_completion_tokens = 800;  // Total tokens for reasoning + output
    // GPT-5 only supports default temperature (1.0)
    // response_format not needed for basic text
  } else {
    requestBody.max_completion_tokens = 500;
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
      console.error('Azure OpenAI Error:', data);
      return res.status(500).json({
        answer: `Azure OpenAI Error: ${data.error?.message || JSON.stringify(data)}`
      });
    }

    // Extract response from chat completions API
    const answer = data.choices?.[0]?.message?.content || '(no response)';
    console.log('Extracted answer:', answer);
    res.json({ answer });
  } catch (error) {
    console.error('Fetch error:', error);
    res.status(500).json({ answer: `Error: ${error.message}` });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
