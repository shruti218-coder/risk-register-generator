const https = require("https");

module.exports = async function (context, req) {
  context.log("Function invoked, method:", req.method);

  // CORS headers
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

  // Check API key first — report exactly what's missing
  const apiKey = process.env.ANTHROPIC_API_KEY;
  context.log("API key present:", !!apiKey);
  context.log("API key length:", apiKey ? apiKey.length : 0);

  if (!apiKey) {
    context.log.error("ANTHROPIC_API_KEY is not set");
    context.res.status = 500;
    context.res.body = JSON.stringify({
      error: "API key not configured — ANTHROPIC_API_KEY missing",
    });
    return;
  }

  // Read body
  const body = req.body || {};
  context.log("Request body keys:", Object.keys(body).join(", "));

  const {
    projectName,
    timeline,
    budget,
    teamSize,
    sponsor,
    scope,
    assumptions,
    constraints,
  } = body;

  if (!scope && !projectName) {
    context.res.status = 400;
    context.res.body = JSON.stringify({
      error: "At least project name or scope is required",
    });
    return;
  }

  const userPrompt = `Generate a risk register for the project below. Reply with ONLY valid JSON — no markdown, no backticks, no preamble.

JSON shape:
{"risks":[{"id":"R01","title":"5-8 word title","category":"Internal|External|Technical|Project Management","subcategory":"e.g. Scope Creep","likelihood":1,"impact":1,"score":1,"severity":"Critical|High|Medium|Low","description":"2 sentences.","mitigation_steps":["step1","step2","step3"],"contingency":"1-2 sentences.","owner":"Role"}],"summary":"2-sentence executive summary."}

Category rules:
- Internal = scope creep, unclear requirements, resource availability, stakeholder alignment
- External = vendor risk, regulatory changes, third-party dependencies
- Technical = architecture, integrations, data quality, security
- Project Management = schedule, budget, governance, change management

Severity: 20-25=Critical,12-19=High,6-11=Medium,1-5=Low. Generate 7-9 risks covering all 4 categories. Sort by score descending.

PROJECT DETAILS:
Project name: ${projectName || "Not specified"}
Timeline: ${timeline || "Not specified"}
Budget: ${budget || "Not specified"}
Team size: ${teamSize || "Not specified"}
Sponsor: ${sponsor || "Not specified"}
Scope: ${scope || "Not specified"}
Assumptions: ${assumptions || "Not specified"}
Constraints: ${constraints || "Not specified"}`;

  try {
    context.log("Calling Anthropic API...");
    const claudeResponse = await callAnthropic(apiKey, userPrompt);
    context.log("Anthropic response received, content blocks:", claudeResponse.content.length);

    const text = claudeResponse.content
      .map((b) => b.text || "")
      .join("")
      .replace(/^```json\n?/, "")
      .replace(/^```\n?/, "")
      .replace(/```$/, "")
      .trim();

    context.log("Raw text length:", text.length);
    context.log("First 100 chars:", text.substring(0, 100));

    const parsed = JSON.parse(text);
    context.log("Successfully parsed JSON, risks count:", parsed.risks ? parsed.risks.length : 0);

    context.res.status = 200;
    context.res.body = JSON.stringify(parsed);
  } catch (err) {
    context.log.error("Error details:", err.message);
    context.log.error("Error stack:", err.stack);
    context.res.status = 500;
    context.res.body = JSON.stringify({
      error: "Failed: " + err.message,
    });
  }
};

function callAnthropic(apiKey, userPrompt) {
  const requestBody = JSON.stringify({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    system: "You are a senior program manager and risk analyst. Return ONLY valid JSON with no markdown, backticks, or extra text.",
    messages: [{ role: "user", content: userPrompt }],
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Length": Buffer.byteLength(requestBody),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`Anthropic API error ${res.statusCode}: ${JSON.stringify(parsed.error)}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error("Invalid JSON from Anthropic: " + data.substring(0, 200)));
        }
      });
    });

    req.on("error", (e) => reject(new Error("Network error: " + e.message)));
    req.write(requestBody);
    req.end();
  });
}
