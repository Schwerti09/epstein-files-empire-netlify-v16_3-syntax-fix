export function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}
export function ok(body, headers = {}) { return json(200, body, headers); }
export function bad(body, code = 400) { return json(code, body); }
export function isOptions(event) { return event.httpMethod === "OPTIONS"; }
