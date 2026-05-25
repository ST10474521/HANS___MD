const axios = require("axios");

const BASE = "https://gen.pollinations.ai/v1";
const API_KEY = "sk_6Sw0SCL4tTsKywMkxmkYsT0ppJLNfQ6m";

const MODELS = {
  openai: "openai",
  fast: "openai-fast",
  large: "openai-large",
  mistral: "mistral",
  qwen: "qwen-coder",
  gemini: "gemini-fast"
};

/**
 * Call Pollinations AI chat completions
 * @param {string} message - User message
 * @param {string} model - Model name (openai, openai-fast, openai-large, mistral, qwen-coder, gemini-fast)
 * @param {string} systemPrompt - Optional system prompt
 * @param {number} maxTokens - Max tokens (default 1000)
 * @param {number} temperature - Temperature (default 1)
 * @returns {Promise<string>} - AI response text
 */
async function callPollinationsAI(message, model = "openai", systemPrompt = null, maxTokens = 1000, temperature = 1) {
  try {
    const messages = [];
    
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    
    messages.push({ role: "user", content: message });

    const response = await axios.post(`${BASE}/chat/completions`, {
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      top_p: 1,
      stream: false,
      seed: -1,
      response_format: { type: "text" }
    }, {
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.data?.choices?.[0]?.message?.content) {
      throw new Error("No response content");
    }

    return response.data.choices[0].message.content;
  } catch (err) {
    console.error("Pollinations AI Error:", err.response?.data || err.message);
    throw err;
  }
}

/**
 * Quick text generation via GET endpoint
 * @param {string} prompt - Input prompt
 * @param {string} model - Model name
 * @returns {Promise<string>} - Response text
 */
async function quickText(prompt, model = "openai") {
  try {
    const response = await axios.get(
      `${BASE.replace("/v1", "")}/text/${encodeURIComponent(prompt)}`,
      {
        params: { model, key: API_KEY }
      }
    );
    return response.data;
  } catch (err) {
    console.error("Pollinations Quick Text Error:", err.message);
    throw err;
  }
}

/**
 * Get available models
 * @returns {Promise<Array>} - List of available models
 */
async function listModels() {
  try {
    const response = await axios.get(`${BASE}/models`);
    return response.data?.data || [];
  } catch (err) {
    console.error("Pollinations Models Error:", err.message);
    throw err;
  }
}

module.exports = {
  callPollinationsAI,
  quickText,
  listModels,
  MODELS,
  API_KEY,
  BASE
};
