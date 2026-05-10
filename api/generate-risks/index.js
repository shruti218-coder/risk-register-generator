const https = require("https");

module.exports = async function (context, req) {
  // ── CORS headers (allow your frontend domain in production) ──
  context.res = {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  };

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    context.res.status = 204;
    context.res.body = "";
    return;
  }

  // Only allow POST
  if (req.method !== "POST") {
    context.res.status = 405;
    context.res.body = JSON.stringify({ error: "Method not allowed" });
    return;
  }

  // ── Read API key from environment (set in Azure Function App Settings) ──
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    context.res.status = 500;
    context.res.body = JSON.stringify({ error: "API key not configured" });
    return;
  }

  // ── Read project fields from request body ──
  const {
    projectName,
    timeline,
    budget,
    teamSize,
    sponsor,
    scope,
    assumptions,
    constraints,
  } = req.body || {};

  if (!scope && !projectName) {
    context.res.status = 400;
    context.res.body = JSON.stringify({
      error: "At least project name or scope is required",
    });
    return;
  }

  // ── Build the prompt ──
  const userPrompt = `Generate a risk register for the project below. Reply with ONLY valid JSON — no markdown, no backticks, no preamble.

JSON shape:
{"risks":[{"id":"R01","title":"5-8 word title","category":"Internal|External|Technical|Project Management","subcategory":"e.g. Scope Creep","likelihood":1,"impact":1,"score":1,"severity":"Critical|High|Medium|Low","description":"2 sentences explaining the risk.","mitigation_steps":["step1","step2","step3"],"contingency":"1-2 sentences on what to do if it materialises.","owner":"Role"}],"summary":"2-sentence executive summary."}

Category rules:
- Internal = scope creep, unclear requirements, resource availability, team skill gaps, stakeholder alignment
- External = vendor/supplier risk, regulatory changes, market conditions, third-party dependencies
- Technical = architecture, system integrations, data quality, security, technology maturity
- Project Management = schedule, budget, governance, communication, change management

Severity: score 20-25=Critical, 12-19=High, 6-11=Medium, 1-5=Low.
Generate 7-9 risks covering all 4 categories. Sort by score descending.

PROJECT DETAILS:
Project name: ${projectName || "Not specified"}
Timeline: ${timeline || "Not specified"}
Budget: ${budget || "Not specified"}
Team size: ${teamSize || "Not specified"}
Executive sponsor / stakeholders: ${sponsor || "Not specified"}

Scope:
${scope || "Not specified"}

Assumptions:
${assumptions || "Not specified"}

Constraints:
${constraints || "Not specified"}`;

  // ── Call Anthropic API ──
  const requestBody = JSON.stringify({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    system:
      "You are a senior program manager and risk analyst. Return ONLY valid JSON with no markdown, backticks, or extra text.",
    messages: [{ role: "user", content: userPrompt }],
  });

  try {
    const claudeResponse = await callAnthropic(apiKey, requestBody);
    const text = claudeResponse.content
      .map((b) => b.text || "")
      .join("")
      .replace(/^```json\n?/, "")
      .replace(/^```\n?/, "")
      .replace(/```$/, "")
      .trim();

    const parsed = JSON.parse(text);
    context.res.status = 200;
    context.res.body = JSON.stringify(parsed);
  } catch (err) {
    context.log.error("Error calling Anthropic:", err.message);
    context.res.status = 500;
    context.res.body = JSON.stringify({
      error: "Failed to generate risk register: " + err.message,
    });
  }
};

// ── Helper: call Anthropic over raw HTTPS (no SDK needed) ──
function callAnthropic(apiKey, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(
              new Error(parsed.error?.message || `HTTP ${res.statusCode}`)
            );
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error("Invalid JSON from Anthropic"));
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}
