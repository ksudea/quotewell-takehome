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

  const body = (await response.json()) as { output?: unknown };
  if (typeof body.output !== "string" || body.output.trim() === "") {
    throw new Error("Extraction response did not include raw model output");
  }

  return body.output;
}
