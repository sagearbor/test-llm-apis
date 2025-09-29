# Azure OpenAI Chatbox Test

A super‑simple test app for Azure OpenAI chat endpoints.

## Prerequisites

* [Node.js](https://nodejs.org/) (v18+ recommended)
* An Azure OpenAI resource with deployed models
* Your Azure API key and endpoint

## Setup

1. Clone this repository.
2. Install dependencies:

   ```bash
   npm init -y
   npm install express node-fetch dotenv
   ```
3. Copy the provided `.env.example` to a `.env` file and fill in your credentials:

   ```bash
   cp .env.example .env
   ```
4. Update the `.env` file with your **endpoint**, **API key**, **API version**, and each **deployment name**.

## Running Locally

1. Start the server:

   ```bash
   node server.js
   ```
2. Open your browser to [http://localhost:3000](http://localhost:3000).
3. Choose a model from the dropdown and start chatting.

## Files

* `index.html` – The front‑end chat UI
* `server.js` – The Node.js Express backend calling Azure OpenAI
* `.env.example` – Environment variables template
* `.gitignore` – Prevents committing secrets and unnecessary files
* `README.md` – This guide

## Notes

* This app is for testing only and not production‑ready.
* Do **not** commit your real `.env` file to GitHub.
