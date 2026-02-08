export async function openaiText({ instructions, input, model, max_output_tokens = 900, temperature = 0.2 }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing env: OPENAI_API_KEY");

  // configurable; default to a commonly-available small model
  const usedModel = model || process.env.OPENAI_MODEL || "gpt-4o-mini";

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: usedModel,
      instructions,
      input,
      temperature,
      max_output_tokens,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI error (${res.status}): ${text.slice(0, 800)}`);
  }
  const data = await res.json();
  return data.output_text || "";
}

export function safeJsonParse(maybeJson) {
  try { return JSON.parse(maybeJson); } catch { return null; }
}
