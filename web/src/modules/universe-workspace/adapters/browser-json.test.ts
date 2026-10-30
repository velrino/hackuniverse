import assert from "node:assert/strict";
import test from "node:test";
import { readWorkspaceJsonFile } from "./browser-json";
import { TransferValidationError, workspaceLimits } from "../domain";

test("oversized JSON files are refused before their contents are read", async () => {
  let reads = 0;
  await assert.rejects(readWorkspaceJsonFile({ size: workspaceLimits.bytes + 1, arrayBuffer: async () => { reads++; return new ArrayBuffer(0); } }), (error) => error instanceof TransferValidationError && error.code === "size");
  assert.equal(reads, 0);
});

test("JSON files require valid UTF-8 and recheck the actual buffer size", async () => {
  const bytes = new TextEncoder().encode('{"name":"Órbita"}');
  assert.equal(await readWorkspaceJsonFile({ size: bytes.byteLength, arrayBuffer: async () => bytes.buffer }), '{"name":"Órbita"}');
  await assert.rejects(readWorkspaceJsonFile({ size: 1, arrayBuffer: async () => new Uint8Array([0xff]).buffer }), (error) => error instanceof TransferValidationError && error.code === "syntax");
  await assert.rejects(readWorkspaceJsonFile({ size: 1, arrayBuffer: async () => new ArrayBuffer(workspaceLimits.bytes + 1) }), (error) => error instanceof TransferValidationError && error.code === "size");
});
