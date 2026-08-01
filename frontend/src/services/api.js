const API_BASE = "http://localhost:3001/api/quiz";

async function parseResponse(response) {
  const payload = await response.json();
  if (!response.ok) {
    const message = payload?.error || "Erreur API";
    throw new Error(message);
  }
  return payload;
}

export async function fetchConfig() {
  const response = await fetch(`${API_BASE}/config`);
  return parseResponse(response);
}

export async function fetchQuestion(level, mode) {
  const response = await fetch(`${API_BASE}/question`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level, mode })
  });
  return parseResponse(response);
}

export async function submitAnswer(questionId, answer) {
  const response = await fetch(`${API_BASE}/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questionId, answer })
  });
  return parseResponse(response);
}

export async function fetchProgress(level, history) {
  const response = await fetch(`${API_BASE}/progress`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level, history })
  });
  return parseResponse(response);
}
