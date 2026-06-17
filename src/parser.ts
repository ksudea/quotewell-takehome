export function parseModelOutput(output: string): unknown {
  const candidates = collectJsonCandidates(output);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next candidate; model prose often includes non-JSON wrappers.
    }
  }

  throw new Error("Could not find valid JSON in extraction output");
}

function collectJsonCandidates(output: string): string[] {
  const candidates: string[] = [];
  const fencePattern = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;

  while ((match = fencePattern.exec(output)) !== null) {
    const fenced = match[1]?.trim();
    if (fenced) candidates.push(fenced);
  }

  const balanced = extractFirstBalancedObject(output);
  if (balanced) candidates.push(balanced);

  const trimmed = output.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) candidates.push(trimmed);

  return [...new Set(candidates)];
}

function extractFirstBalancedObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = start; index < text.length; index++) {
    const char = text[index];

    if (escaping) {
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") depth++;
    if (char === "}") depth--;

    if (depth === 0) return text.slice(start, index + 1);
  }

  return null;
}
