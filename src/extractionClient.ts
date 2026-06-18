export async function extractEmail(
  email: string,
  options: { baseUrl: string; fetchFn?: typeof fetch }
): Promise<string> {
  const fetchFn = options.fetchFn ?? fetch;
  const response = await fetchFn(`${options.baseUrl}/api/v1/extract`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email })
  });

  if (!response.ok) {
    throw new Error(`Extraction failed with HTTP ${response.status}: ${await response.text()}`);
  }

  const body: unknown = await response.json();
  if (!isObject(body) || typeof body["output"] !== "string" || body["output"].trim() === "") {
    throw new Error("Extraction response did not include raw model output");
  }

  return body["output"];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
