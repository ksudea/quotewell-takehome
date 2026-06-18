import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer, type Server } from "node:http";

test("pipeline routes unparseable extraction output to needs review", async () => {
  const inboxDir = mkdtempSync(path.join(tmpdir(), "qw-pipeline-"));
  writeFileSync(path.join(inboxDir, "bad.txt"), "Please quote this risk.");
  const server = await startExtractionServer("not valid json");

  try {
    const result = await runPipeline({
      AMS_BASE_URL: server.baseUrl,
      INBOX_DIR: inboxDir
    });

    assert.equal(result.code, 1);
    assert.match(result.stdout, /bad\.txt/);
    assert.match(result.stdout, /status: failed_needs_review/);
    assert.match(result.stdout, /Could not find valid JSON in extraction output/);
  } finally {
    await server.close();
    rmSync(inboxDir, { recursive: true, force: true });
  }
});

test("pipeline reports unreadable inbox files without aborting the batch", async () => {
  const inboxDir = mkdtempSync(path.join(tmpdir(), "qw-pipeline-"));
  mkdirSync(path.join(inboxDir, "unreadable.txt"));

  try {
    const result = await runPipeline({
      AMS_BASE_URL: "http://127.0.0.1:1",
      INBOX_DIR: inboxDir
    });

    assert.equal(result.code, 1);
    assert.match(result.stdout, /Final intake audit/);
    assert.match(result.stdout, /unreadable\.txt/);
    assert.match(result.stdout, /status: failed_needs_review/);
  } finally {
    rmSync(inboxDir, { recursive: true, force: true });
  }
});

async function runPipeline(env: Record<string, string>): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/pipeline.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function startExtractionServer(output: string): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    if (request.method === "POST" && request.url === "/api/v1/extract") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ output }));
      return;
    }

    response.writeHead(404);
    response.end("not found");
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  assertAddressInfo(address);

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      })
  };
}

function assertAddressInfo(address: ReturnType<Server["address"]>): asserts address is AddressInfo {
  if (typeof address !== "object" || address === null || !("port" in address) || typeof address.port !== "number") {
    assert.fail("Expected HTTP server to listen on a TCP port");
  }
}
