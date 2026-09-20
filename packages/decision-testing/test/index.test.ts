import { expect, test } from "bun:test";
import { createFakeProvider, createReplayProvider } from "../src/index.ts";

const request = {
  name: "support.triage",
  version: "1.0.0",
  state: { message: "hello" },
  questions: {},
  signal: new AbortController().signal,
  maxResponseBytes: 1024,
} as const;

test("fake provider counts calls and supports dynamic responses", async () => {
  const provider = createFakeProvider((value) => ({
    ok: true,
    answers: { echoed: value.state },
  }));
  const result = await provider.evaluate(request);
  expect(result.ok).toBe(true);
  expect(provider.calls).toBe(1);
});

test("replay provider selects fixtures by decision contract version", async () => {
  const provider = createReplayProvider([
    {
      name: "support.triage",
      version: "1.0.0",
      result: { ok: true, answers: { value: 1 } },
    },
  ]);
  expect(await provider.evaluate(request)).toEqual({
    ok: true,
    answers: { value: 1 },
  });
  expect(await provider.evaluate({ ...request, version: "2.0.0" })).toEqual({
    ok: false,
    error: { code: "provider_response_invalid" },
  });
});
