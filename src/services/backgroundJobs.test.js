import test from "node:test";
import assert from "node:assert/strict";
import { getBackgroundJobProgress } from "./backgroundJobs.js";

test("calculates byte-based background job progress and preserves ETA", () => {
  assert.deepEqual(
    getBackgroundJobProgress({ processedBytes: 40, totalBytes: 100, estimatedRemainingSeconds: 12 }),
    { percentage: 40, processedBytes: 40, totalBytes: 100, etaSeconds: 12 },
  );
});

test("falls back to item progress when byte totals are unavailable", () => {
  assert.equal(getBackgroundJobProgress({ processedItems: 2, totalItems: 5 }).percentage, 40);
});
