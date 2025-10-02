#!/usr/bin/env node

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000';
let cookies = '';

async function sendMessage(message, model = 'allaround_llm_api') {
  const response = await fetch(`${BASE_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookies
    },
    body: JSON.stringify({
      prompt: message,
      model: model,
      maxTokens: 50
    })
  });

  // Save cookies for session continuity
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    cookies = setCookie.split(';')[0];
  }

  const data = await response.json();
  return data;
}

async function test() {
  console.log('Testing conversation memory with session...\n');

  // Send multiple messages to trigger compression
  for (let i = 1; i <= 15; i++) {
    const message = `Message ${i}: Tell me about the number ${i}`;
    console.log(`Sending: ${message}`);

    const response = await sendMessage(message);

    if (response.memory) {
      console.log(`Memory state: ${JSON.stringify(response.memory)}`);
      if (response.memory.compressed) {
        console.log('🎉 COMPRESSION TRIGGERED!');
      }
    }

    console.log(`Response: ${response.answer?.substring(0, 100) || '(empty)'}...\n`);

    // Small delay between messages
    await new Promise(r => setTimeout(r, 500));
  }
}

test().catch(console.error);