const https = require("https");

exports.handler = async function (event, context) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "API key not configured" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const { projectName, timeline, budget, teamSize, sponsor, scope, assumptions, constraints } = body;

  if (!scope && !projectName) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Project name or scope required" }) };
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
    const result = await callAnthropic(apiKey, userPrompt);
    const text = result.content
      .map((b) => b.text || "")
      .join("")
      .replace(/^```json\n?/, "")
      .replace(/^```\n?/, "")
      .replace(/```$/, "")
      .trim();

    const parsed = JSON.parse(text);
    return { statusCode: 200, headers, body: JSON.stringify(parsed) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed: " + err.message }) };
  }
};

function callAnthropic(apiKey, userPrompt) {
  const requestBody = JSON.stringify({
    model: "claude-sonnet-4-5",
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
            reject(new Error(`Anthropic error ${res.statusCode}: ${JSON.stringify(parsed.error)}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error("Invalid response from Anthropic"));
        }
      });
    });

    req.on("error", (e) => reject(new Error("Network error: " + e.message)));
    req.write(requestBody);
    req.end();
  });
}
