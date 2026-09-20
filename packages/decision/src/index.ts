import type {
  InferOutput,
  StandardIssue,
  StandardSchemaV1,
} from "@nifrajs/core/schema";
import { validateStandard } from "@nifrajs/core/schema";

export const DECISION_ERROR_CODES = [
  "input_invalid",
  "provider_unavailable",
  "provider_timeout",
  "provider_rate_limited",
  "provider_unauthorized",
  "provider_bad_request",
  "provider_response_invalid",
  "cancelled",
  "policy_denied",
  "internal",
] as const;

export type DecisionErrorCode = (typeof DECISION_ERROR_CODES)[number];

const ERROR_CODES: ReadonlySet<string> = new Set(DECISION_ERROR_CODES);
const IDENTIFIER = /^[a-z][a-z0-9._-]{0,63}$/;
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;
const MAX_QUESTIONS = 64;
const MAX_INSTRUCTION_LENGTH = 4096;
const MAX_CRITERIA = 255;
const MAX_STATE_BYTES = 256 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const PROBABILITY_EPSILON = 0.001;

export type ChoiceCriteria = Readonly<Record<string, string>>;

export interface ChoiceQuestion<
  Criteria extends ChoiceCriteria = ChoiceCriteria,
> {
  readonly type: "choice";
  readonly instructions: string;
  readonly criteria: Readonly<Criteria>;
}

export interface ScoreQuestion<
  Criteria extends readonly string[] = readonly string[],
> {
  readonly type: "score";
  readonly instructions: string;
  readonly criteria: Criteria;
}

export interface NoulQuestion {
  readonly type: "noul";
  readonly instructions: string;
  readonly criteria?: string;
}

export type DecisionQuestion = ChoiceQuestion | ScoreQuestion | NoulQuestion;
export type DecisionQuestions = Readonly<Record<string, DecisionQuestion>>;

export interface ChoiceAnswer<
  Criteria extends ChoiceCriteria = ChoiceCriteria,
> {
  readonly type: "choice";
  readonly choice: keyof Criteria & string;
  readonly probabilities: Readonly<Record<keyof Criteria & string, number>>;
  readonly confidence: number;
}

type ScoreCriteriaKey<Criteria extends readonly string[]> =
  number extends Criteria["length"]
    ? string
    : Exclude<keyof Criteria, keyof (readonly unknown[])> & string;

export interface ScoreAnswer<
  Criteria extends readonly string[] = readonly string[],
> {
  readonly type: "score";
  readonly score: number;
  readonly legend: Readonly<Record<ScoreCriteriaKey<Criteria>, string>>;
  readonly probabilities: Readonly<Record<ScoreCriteriaKey<Criteria>, number>>;
  readonly confidence: number;
}

export interface NoulAnswer {
  readonly type: "noul";
  readonly noul: number;
}

export type DecisionAnswer<Question> =
  Question extends ChoiceQuestion<infer Criteria>
    ? ChoiceAnswer<Criteria>
    : Question extends ScoreQuestion<infer Criteria>
      ? ScoreAnswer<Criteria>
      : Question extends NoulQuestion
        ? NoulAnswer
        : never;

export type DecisionAnswers<Questions extends DecisionQuestions> = {
  readonly [Key in keyof Questions]: DecisionAnswer<Questions[Key]>;
};

export interface DecisionUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
}

export interface DecisionProviderRequest {
  readonly name: string;
  readonly version: string;
  readonly state: unknown;
  readonly questions: DecisionQuestions;
  readonly signal: AbortSignal;
  readonly maxResponseBytes: number;
}

export interface DecisionProviderSuccess {
  readonly ok: true;
  readonly answers: unknown;
  readonly provider?: string;
  readonly model?: string;
  readonly usage?: DecisionUsage;
}

export interface DecisionProviderFailure {
  readonly ok: false;
  readonly error: { readonly code: DecisionErrorCode };
}

export type DecisionProviderResult =
  | DecisionProviderSuccess
  | DecisionProviderFailure;

export interface DecisionProvider {
  readonly id: string;
  evaluate(
    request: DecisionProviderRequest,
  ): PromiseLike<DecisionProviderResult>;
}

export interface DecisionFailure {
  readonly code: DecisionErrorCode;
  readonly issues?: readonly StandardIssue[];
}

export type DecisionPolicyOutcome = "act" | "review" | "reject";

export interface DecisionPolicyResult {
  readonly outcome: DecisionPolicyOutcome;
  readonly reason:
    | "automatic_action_not_enabled"
    | "confidence_below_threshold"
    | "noul_probability_below_threshold"
    | "custom_policy_review"
    | "custom_policy_reject"
    | "passed"
    | "decision_failed";
  readonly question?: string;
  readonly observed?: number;
  readonly required?: number;
}

export interface DecisionPolicy<Answers = unknown> {
  /** Automatic side effects are opt-in. The default is false. */
  readonly allowAct?: boolean;
  /** Applies to Choice and Score answers. */
  readonly minimumConfidence?: number;
  /** Explicit thresholds for Noul answers. */
  readonly minimumNoulProbability?: Readonly<Record<string, number>>;
  /** Runs after built-in gates have passed. */
  readonly decide?: (answers: Answers) => "act" | "review" | "reject";
}

export interface DecisionMetadata {
  readonly provider: string;
  readonly model?: string;
  readonly usage?: DecisionUsage;
  readonly latencyMs: number;
}

export type DecisionResult<Answers> =
  | {
      readonly ok: true;
      readonly name: string;
      readonly version: string;
      readonly answers: Answers;
      readonly policy: DecisionPolicyResult;
      readonly metadata: DecisionMetadata;
    }
  | {
      readonly ok: false;
      readonly name: string;
      readonly version: string;
      readonly error: DecisionFailure;
      readonly policy: DecisionPolicyResult;
      readonly metadata: DecisionMetadata;
    };

export interface EvaluateOptions<Answers> {
  readonly provider: DecisionProvider;
  readonly policy?: DecisionPolicy<Answers>;
  readonly signal?: AbortSignal;
  readonly maxStateBytes?: number;
  readonly maxResponseBytes?: number;
  readonly now?: () => number;
}

export interface ChoiceOptions<
  Criteria extends ChoiceCriteria = ChoiceCriteria,
> {
  readonly instructions: string;
  readonly criteria: Criteria;
}

export interface ScoreOptions<
  Criteria extends readonly string[] = readonly string[],
> {
  readonly instructions: string;
  readonly criteria: Criteria;
}

export interface NoulOptions {
  readonly instructions: string;
  readonly criteria?: string;
}

export function choice<const Criteria extends ChoiceCriteria>(
  options: ChoiceOptions<Criteria>,
): ChoiceQuestion<Criteria> {
  validateQuestionOptions(options.instructions, options.criteria, "choice");
  return Object.freeze({
    type: "choice",
    instructions: options.instructions,
    criteria: Object.freeze({ ...options.criteria }),
  });
}

export function score<const Criteria extends readonly string[]>(
  options: ScoreOptions<Criteria>,
): ScoreQuestion<Criteria> {
  validateQuestionOptions(options.instructions, options.criteria, "score");
  return Object.freeze({
    type: "score",
    instructions: options.instructions,
    criteria: Object.freeze([...options.criteria]) as Criteria,
  });
}

export function noul(options: NoulOptions): NoulQuestion {
  if (
    typeof options.instructions !== "string" ||
    options.instructions.trim() === ""
  ) {
    throw new TypeError("decision: noul instructions must not be empty");
  }
  if (options.instructions.length > MAX_INSTRUCTION_LENGTH) {
    throw new RangeError("decision: instructions are too long");
  }
  if (
    options.criteria !== undefined &&
    options.criteria.length > MAX_INSTRUCTION_LENGTH
  ) {
    throw new RangeError("decision: noul criteria are too long");
  }
  return Object.freeze({
    type: "noul",
    instructions: options.instructions,
    ...(options.criteria === undefined ? {} : { criteria: options.criteria }),
  });
}

export interface DecisionDefinition<
  StateSchema extends StandardSchemaV1,
  Questions extends DecisionQuestions,
> {
  readonly name: string;
  readonly version: string;
  readonly state: StateSchema;
  readonly questions: Questions;
  evaluate(
    state: unknown,
    options: EvaluateOptions<DecisionAnswers<Questions>>,
  ): Promise<DecisionResult<DecisionAnswers<Questions>>>;
  evaluate(
    state: InferOutput<StateSchema>,
    options: EvaluateOptions<DecisionAnswers<Questions>>,
  ): Promise<DecisionResult<DecisionAnswers<Questions>>>;
}

export function defineDecision<
  StateSchema extends StandardSchemaV1,
  const Questions extends DecisionQuestions,
>(options: {
  readonly name: string;
  readonly version: string;
  readonly state: StateSchema;
  readonly questions: Questions;
}): DecisionDefinition<StateSchema, Questions> {
  validateIdentifier(options.name, "decision name");
  if (!VERSION.test(options.version))
    throw new TypeError("decision: version must be semver-like");
  if (!isStandardSchema(options.state))
    throw new TypeError("decision: state must be Standard Schema");
  const questions = normalizeQuestions(options.questions);
  return Object.freeze({
    name: options.name,
    version: options.version,
    state: options.state,
    questions,
    evaluate: (
      state: unknown,
      evaluateOptions: EvaluateOptions<DecisionAnswers<Questions>>,
    ) =>
      evaluateDecision(
        options.name,
        options.version,
        options.state,
        questions as Questions,
        state,
        evaluateOptions,
      ),
  });
}

export async function evaluateDecision<
  StateSchema extends StandardSchemaV1,
  Questions extends DecisionQuestions,
>(
  name: string,
  version: string,
  stateSchema: StateSchema,
  questions: Questions,
  state: unknown,
  options: EvaluateOptions<DecisionAnswers<Questions>>,
): Promise<DecisionResult<DecisionAnswers<Questions>>> {
  const startedAt = safeNow(options.now);
  const provider = options.provider;
  const maxStateBytes = options.maxStateBytes ?? MAX_STATE_BYTES;
  const maxResponseBytes = options.maxResponseBytes ?? MAX_RESPONSE_BYTES;
  const signal = options.signal ?? new AbortController().signal;
  const baseMetadata = (
    metadata: Omit<DecisionMetadata, "latencyMs">,
  ): DecisionMetadata =>
    Object.freeze({
      ...metadata,
      latencyMs: Math.max(0, safeNow(options.now) - startedAt),
    });
  const failure = (
    error: DecisionFailure,
    metadata: Omit<DecisionMetadata, "latencyMs"> = {
      provider: typeof provider?.id === "string" ? provider.id : "unknown",
    },
  ): DecisionResult<DecisionAnswers<Questions>> => ({
    ok: false,
    name,
    version,
    error: Object.freeze(error),
    policy: Object.freeze({ outcome: "review", reason: "decision_failed" }),
    metadata: baseMetadata(metadata),
  });

  if (
    !isPositiveSafeInteger(maxStateBytes) ||
    !isPositiveSafeInteger(maxResponseBytes)
  ) {
    return failure({ code: "internal" });
  }
  if (
    !provider ||
    typeof provider.id !== "string" ||
    provider.id.length === 0 ||
    provider.id.length > 128 ||
    typeof provider.evaluate !== "function"
  ) {
    return failure({ code: "internal" });
  }
  if (signal.aborted) return failure({ code: "cancelled" });

  const validatedState = await (async () => {
    try {
      return await validateStandard(stateSchema, state);
    } catch {
      return undefined;
    }
  })();
  if (validatedState === undefined) return failure({ code: "input_invalid" });
  if (!validatedState.ok)
    return failure({ code: "input_invalid", issues: validatedState.issues });

  let stateBytes: number;
  try {
    stateBytes = jsonByteLength(validatedState.value);
  } catch {
    return failure({ code: "input_invalid" });
  }
  if (stateBytes > maxStateBytes) return failure({ code: "input_invalid" });

  let providerState: unknown;
  try {
    providerState = cloneJsonValue(validatedState.value);
  } catch {
    return failure({ code: "input_invalid" });
  }

  let providerResult: unknown;
  try {
    providerResult = await provider.evaluate({
      name,
      version,
      state: providerState,
      questions,
      signal,
      maxResponseBytes,
    });
  } catch {
    return failure({
      code: signal.aborted ? "cancelled" : "provider_unavailable",
    });
  }
  if (!isDecisionProviderResult(providerResult)) {
    return failure(
      { code: "provider_response_invalid" },
      { provider: provider.id },
    );
  }

  if (!providerResult.ok)
    return failure(providerResult.error, { provider: provider.id });
  if (signal.aborted)
    return failure(
      { code: "cancelled" },
      providerMetadata(providerResult, provider.id),
    );

  let answers: DecisionAnswers<Questions>;
  try {
    if (jsonByteLength(providerResult.answers) > maxResponseBytes) {
      return failure(
        { code: "provider_response_invalid" },
        providerMetadata(providerResult, provider.id),
      );
    }
    answers = parseAnswers(
      questions,
      providerResult.answers,
    ) as DecisionAnswers<Questions>;
  } catch {
    return failure(
      { code: "provider_response_invalid" },
      providerMetadata(providerResult, provider.id),
    );
  }

  let policy: DecisionPolicyResult;
  try {
    policy = evaluatePolicy(answers, options.policy);
  } catch {
    return failure(
      { code: "internal" },
      providerMetadata(providerResult, provider.id),
    );
  }
  return Object.freeze({
    ok: true,
    name,
    version,
    answers,
    policy,
    metadata: baseMetadata(providerMetadata(providerResult, provider.id)),
  });
}

function evaluatePolicy<Answers>(
  answers: Answers,
  policy: DecisionPolicy<Answers> | undefined,
): DecisionPolicyResult {
  if (policy === undefined || policy.allowAct !== true) {
    return Object.freeze({
      outcome: "review",
      reason: "automatic_action_not_enabled",
    });
  }
  if (policy.minimumConfidence !== undefined) {
    validateThreshold(policy.minimumConfidence, "minimumConfidence");
    for (const [question, answer] of Object.entries(
      answers as Record<string, unknown>,
    )) {
      if (
        !isRecord(answer) ||
        (answer.type !== "choice" && answer.type !== "score")
      )
        continue;
      if (
        typeof answer.confidence !== "number" ||
        answer.confidence < policy.minimumConfidence
      ) {
        return Object.freeze({
          outcome: "review",
          reason: "confidence_below_threshold",
          question,
          observed:
            typeof answer.confidence === "number" ? answer.confidence : 0,
          required: policy.minimumConfidence,
        });
      }
    }
  }
  if (policy.minimumNoulProbability !== undefined) {
    for (const [question, required] of Object.entries(
      policy.minimumNoulProbability,
    )) {
      validateThreshold(required, `minimumNoulProbability.${question}`);
      const answer = (answers as Record<string, unknown>)[question];
      if (
        !isRecord(answer) ||
        answer.type !== "noul" ||
        typeof answer.noul !== "number"
      ) {
        return Object.freeze({
          outcome: "review",
          reason: "noul_probability_below_threshold",
          question,
          observed: 0,
          required,
        });
      }
      if (answer.noul < required) {
        return Object.freeze({
          outcome: "review",
          reason: "noul_probability_below_threshold",
          question,
          observed: answer.noul,
          required,
        });
      }
    }
  }
  const custom = policy.decide?.(answers);
  if (custom === "review")
    return Object.freeze({ outcome: "review", reason: "custom_policy_review" });
  if (custom === "reject")
    return Object.freeze({ outcome: "reject", reason: "custom_policy_reject" });
  if (custom !== undefined && custom !== "act")
    return Object.freeze({ outcome: "review", reason: "custom_policy_review" });
  return Object.freeze({ outcome: "act", reason: "passed" });
}

function parseAnswers(
  questions: DecisionQuestions,
  value: unknown,
): Record<string, unknown> {
  if (!isRecord(value))
    throw new TypeError("decision response must be an object");
  const answersValue = Object.hasOwn(value, "answers") ? value.answers : value;
  if (!isRecord(answersValue))
    throw new TypeError("decision answers must be an object");
  const expected = Object.keys(questions);
  const actual = Object.keys(answersValue);
  if (
    actual.some((key) => !Object.hasOwn(questions, key)) ||
    actual.length !== expected.length
  ) {
    throw new TypeError(
      "decision response answer keys do not match definition",
    );
  }
  const parsed: Record<string, unknown> = {};
  for (const [key, question] of Object.entries(questions)) {
    const raw = answersValue[key];
    if (raw === undefined)
      throw new TypeError("decision response is missing an answer");
    parsed[key] = parseAnswer(question, raw);
  }
  return Object.freeze(parsed);
}

function parseAnswer(question: DecisionQuestion, value: unknown): unknown {
  if (!isRecord(value) || value.type !== question.type)
    throw new TypeError("decision answer type mismatch");
  if (question.type === "choice") {
    if (
      typeof value.choice !== "string" ||
      !Object.hasOwn(question.criteria, value.choice)
    ) {
      throw new TypeError("decision choice is not declared");
    }
    const probabilities = parseProbabilities(
      value.probabilities,
      Object.keys(question.criteria),
    );
    const confidence = parseUnit(value.confidence, "confidence");
    return Object.freeze({
      type: "choice",
      choice: value.choice,
      probabilities,
      confidence,
    });
  }
  if (question.type === "score") {
    if (typeof value.score !== "number" || !Number.isFinite(value.score)) {
      throw new TypeError("decision score is invalid");
    }
    if (value.score < 0 || value.score > question.criteria.length - 1) {
      throw new TypeError("decision score is outside the declared scale");
    }
    const keys = question.criteria.map((_, index) => String(index));
    const probabilities = parseProbabilities(value.probabilities, keys);
    const legend = Object.fromEntries(
      question.criteria.map((entry, index) => [String(index), entry]),
    );
    const confidence = parseUnit(value.confidence, "confidence");
    return Object.freeze({
      type: "score",
      score: value.score,
      legend,
      probabilities,
      confidence,
    });
  }
  const noulValue = parseUnit(value.noul, "noul");
  return Object.freeze({ type: "noul", noul: noulValue });
}

function parseProbabilities(
  value: unknown,
  keys: readonly string[],
): Readonly<Record<string, number>> {
  if (!isRecord(value))
    throw new TypeError("decision probabilities must be an object");
  const actual = Object.keys(value);
  if (
    actual.length !== keys.length ||
    actual.some((key) => !keys.includes(key))
  ) {
    throw new TypeError("decision probability keys do not match criteria");
  }
  const result: Record<string, number> = {};
  let sum = 0;
  for (const key of keys) {
    const probability = value[key];
    if (
      typeof probability !== "number" ||
      !Number.isFinite(probability) ||
      probability < 0 ||
      probability > 1
    ) {
      throw new TypeError("decision probability is invalid");
    }
    result[key] = probability;
    sum += probability;
  }
  if (Math.abs(sum - 1) > PROBABILITY_EPSILON || sum <= 0) {
    throw new TypeError("decision probabilities must sum to one");
  }
  for (const key of keys) {
    const probability = result[key];
    if (probability === undefined)
      throw new TypeError("decision probability is invalid");
    result[key] = probability / sum;
  }
  return Object.freeze(result);
}

function normalizeQuestions<Questions extends DecisionQuestions>(
  questions: Questions,
): Questions {
  if (!isRecord(questions))
    throw new TypeError("decision questions must be an object");
  const entries = Object.entries(questions);
  if (entries.length === 0 || entries.length > MAX_QUESTIONS) {
    throw new RangeError(
      "decision questions must contain between one and 64 questions",
    );
  }
  const normalized: Record<string, DecisionQuestion> = {};
  for (const [id, question] of entries) {
    validateIdentifier(id, "question id");
    if (question.type === "choice") {
      normalized[id] = choice(question);
    } else if (question.type === "score") {
      normalized[id] = score(question);
    } else if (question.type === "noul") {
      normalized[id] = noul(question);
    } else {
      throw new TypeError(`decision question ${id} has an unsupported type`);
    }
  }
  return Object.freeze(normalized) as Questions;
}

function validateQuestionOptions(
  instructions: string,
  criteria: ChoiceCriteria | readonly string[],
  type: "choice" | "score",
): void {
  if (typeof instructions !== "string" || instructions.trim() === "") {
    throw new TypeError(`decision: ${type} instructions must not be empty`);
  }
  if (instructions.length > MAX_INSTRUCTION_LENGTH)
    throw new RangeError("decision: instructions are too long");
  if (type === "choice") {
    const choiceCriteria = criteria as ChoiceCriteria;
    const keys = Object.keys(choiceCriteria);
    if (keys.length === 0 || keys.length > MAX_CRITERIA)
      throw new RangeError("decision: invalid Choice criteria");
    for (const key of keys) {
      validateIdentifier(key, "Choice criterion");
      const description = choiceCriteria[key];
      if (typeof description !== "string" || description.trim() === "") {
        throw new TypeError(
          "decision: Choice criteria descriptions must not be empty",
        );
      }
    }
  } else {
    const scoreCriteria = criteria as readonly string[];
    if (scoreCriteria.length < 2 || scoreCriteria.length > MAX_CRITERIA) {
      throw new RangeError(
        "decision: Score criteria must contain between 2 and 255 levels",
      );
    }
    for (const item of scoreCriteria) {
      if (typeof item !== "string" || item.trim() === "")
        throw new TypeError("decision: Score level is invalid");
    }
  }
}

function validateIdentifier(value: string, label: string): void {
  if (!IDENTIFIER.test(value))
    throw new TypeError(`decision: invalid ${label}`);
}

function validateThreshold(value: number, label: string): void {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new RangeError(`decision: ${label} must be between 0 and 1`);
  }
}

function parseUnit(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new TypeError(`decision: ${label} must be between 0 and 1`);
  }
  return value;
}

function providerMetadata(
  result: DecisionProviderSuccess,
  fallbackProvider: string,
): Omit<DecisionMetadata, "latencyMs"> {
  const usage = normalizeUsage(result.usage);
  return Object.freeze({
    provider: safeMetadataString(
      result.provider ?? fallbackProvider,
      fallbackProvider,
    ),
    ...(result.model === undefined
      ? {}
      : { model: safeMetadataString(result.model, "unknown") }),
    ...(usage === undefined ? {} : { usage }),
  });
}

function normalizeUsage(value: unknown): DecisionUsage | undefined {
  if (!isRecord(value)) return undefined;
  const output: Record<string, number> = {};
  for (const key of ["inputTokens", "outputTokens", "totalTokens"] as const) {
    const item = value[key];
    if (typeof item === "number" && Number.isSafeInteger(item) && item >= 0)
      output[key] = item;
  }
  return Object.keys(output).length === 0 ? undefined : Object.freeze(output);
}

function safeMetadataString(value: string, fallback: string): string {
  return typeof value === "string" && value.length > 0 && value.length <= 128
    ? value
    : fallback;
}

function isDecisionProviderResult(
  value: unknown,
): value is DecisionProviderResult {
  if (!isRecord(value) || typeof value.ok !== "boolean") return false;
  if (value.ok) return Object.hasOwn(value, "answers");
  const error = value.error;
  return isRecord(error) && isDecisionErrorCode(error.code);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function safeNow(now: (() => number) | undefined): number {
  try {
    const value = (now ?? Date.now)();
    return Number.isFinite(value) ? value : Date.now();
  } catch {
    return Date.now();
  }
}

function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  if (!isRecord(value)) return false;
  const standard = value["~standard"];
  return isRecord(standard) && typeof standard.validate === "function";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneJsonValue<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    throw new TypeError("decision value must be structured-cloneable");
  }
}

function jsonByteLength(value: unknown): number {
  const json = JSON.stringify(value);
  if (json === undefined)
    throw new TypeError("decision value must be JSON-serializable");
  return new TextEncoder().encode(json).byteLength;
}

export function isDecisionErrorCode(
  value: unknown,
): value is DecisionErrorCode {
  return typeof value === "string" && ERROR_CODES.has(value);
}
