import type {
  DecisionProvider,
  DecisionProviderRequest,
  DecisionProviderResult,
} from "@nifrajs/decision";

export type FakeDecisionResolver = (
  request: DecisionProviderRequest,
) => DecisionProviderResult | PromiseLike<DecisionProviderResult>;

export interface FakeDecisionProvider extends DecisionProvider {
  readonly calls: number;
}

export function createFakeProvider(
  response: DecisionProviderResult | FakeDecisionResolver,
  id = "fake",
): FakeDecisionProvider {
  if (typeof id !== "string" || id.length === 0 || id.length > 128) {
    throw new TypeError("fake decision provider: id is invalid");
  }
  let calls = 0;
  const provider: FakeDecisionProvider = {
    id,
    get calls() {
      return calls;
    },
    evaluate: async (request) => {
      calls += 1;
      return typeof response === "function" ? response(request) : response;
    },
  };
  return Object.freeze(provider);
}

export interface ReplayFixture {
  readonly name: string;
  readonly version: string;
  readonly result: DecisionProviderResult;
}

export function createReplayProvider(
  fixtures: readonly ReplayFixture[],
  id = "replay",
): DecisionProvider {
  const values = new Map<string, DecisionProviderResult>();
  for (const fixture of fixtures) {
    const key = `${fixture.name}@${fixture.version}`;
    if (values.has(key))
      throw new TypeError(`replay provider: duplicate fixture ${key}`);
    values.set(key, freezeProviderResult(fixture.result));
  }
  return Object.freeze({
    id,
    evaluate: async (
      request: DecisionProviderRequest,
    ): Promise<DecisionProviderResult> => {
      const result = values.get(`${request.name}@${request.version}`);
      return (
        result ?? { ok: false, error: { code: "provider_response_invalid" } }
      );
    },
  });
}

function freezeProviderResult(
  result: DecisionProviderResult,
): DecisionProviderResult {
  if (!result.ok)
    return Object.freeze({
      ok: false,
      error: Object.freeze({ ...result.error }),
    });
  return Object.freeze({
    ok: true,
    answers: structuredClone(result.answers),
    ...(result.provider === undefined ? {} : { provider: result.provider }),
    ...(result.model === undefined ? {} : { model: result.model }),
    ...(result.usage === undefined
      ? {}
      : { usage: Object.freeze({ ...result.usage }) }),
  });
}
