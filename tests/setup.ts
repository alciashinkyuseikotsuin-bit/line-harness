import { afterEach, beforeEach, vi } from "vitest";

// No test may fall through to a real HTTP request, even if an SDK mock is missed.
// The LINE SDK itself is also replaced using vi.mock in send-gate.test.ts.
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => {
    throw new Error("Network calls are forbidden in unit tests");
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
