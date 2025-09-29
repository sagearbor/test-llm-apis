import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static('.')); // serve index.html

app.post('/chat', async (req, res) => {
  const { prompt, model } = req.body;

  const endpoint = process.env[model]; // picks right endpoint from .env
  const apiKey = process.env.AZURE_OPENAI_KEY;

  try {
    const response = await fetch(`${endpoint}/chat/completions?api-version=2024-02-01`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200
      })
    });

    const data = await response.json();
    res.json({ answer: data.choices?.[0]?.message?.content || '(no response)' });
  } catch (error) {
    res.status(500).json({ answer: `Error: ${error.message}` });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
