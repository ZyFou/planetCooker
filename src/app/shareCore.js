import { API_BASE_URL } from "./config.js";

export function encodeShare(payload) {
  const json = JSON.stringify(payload);
  const base64 = btoa(json)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return base64;
}

export function padBase64(str) {
  const pad = str.length % 4;
  if (pad === 0) return str;
  return `${str}${"=".repeat(4 - pad)}`;
}

export function decodeShare(code) {
  const padded = padBase64(code.replace(/-/g, "+").replace(/_/g, "/"));
  const json = atob(padded);
  return JSON.parse(json);
}

export async function saveConfigurationToAPI(configData, metadata = {}) {
  const response = await fetch(`${API_BASE_URL}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: configData,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString()
      }
    })
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

export async function loadConfigurationFromAPI(id) {
  const response = await fetch(`${API_BASE_URL}/share/${id}`);
  if (!response.ok) {
    if (response.status === 404) throw new Error('Configuration not found');
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}


