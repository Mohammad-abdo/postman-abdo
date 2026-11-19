import { z } from 'zod';
import { CustomTest, TestResult } from './testing';
import { Bundle } from './types';
import { isObj } from './util';

/* Optional AI assistant helpers. Pure: prompt building, redaction and strict validation of model output.
   The model only SUGGESTS; nothing it returns is trusted, executed or merged without validation and user acceptance. */

const SECRET_KEY = /(pass(word)?|passwd|secret|token|authorization|api[-_]?key|cookie|session|credential|private|signature|bearer)/i;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{5,}\b/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const LONG_DIGITS = /\b\d{12,}\b/g;
const KEYLIKE = /\b(?:sk|pk|rk|AKIA|ghp|xox[a-z])[-_A-Za-z0-9]{12,}\b/g;

/** Removes anything credential-like before data can leave the server. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[TRUNCATED]';
  if (typeof value === 'string') {
    const s = value.replace(JWT, '[JWT]').replace(BEARER, '$1 [REDACTED]').replace(KEYLIKE, '[KEY]').replace(EMAIL, 'user@example.test').replace(LONG_DIGITS, '[NUMBER]');
    return s.length > 200 ? `${s.slice(0, 200)}…` : s;
  }
  if (Array.isArray(value)) return value.slice(0, 5).map((v) => redact(v, depth + 1));
  if (isObj(value)) return Object.fromEntries(Object.entries(value).slice(0, 40).map(([k, v]) => [k, SECRET_KEY.test(k) ? '[REDACTED]' : redact(v, depth + 1)]));
  return value;
}

const fieldNames = (n: any, depth = 0): unknown => (n?.type === 'object' && n.properties && depth < 3 ? Object.fromEntries(Object.entries(n.properties).map(([k, v]: [string, any]) => [k, fieldNames(v, depth + 1)])) : n?.type === 'array' ? [fieldNames(n.items, depth + 1)] : n?.type ?? 'unknown');

/** Structure only (names and types, never values). */
export function contractDigest(bundle: Bundle) {
  return bundle.model.endpoints.slice(0, 120).map((e) => ({
    endpoint: e.key,
    role: bundle.graph.roles[e.key]?.role,
    disposition: bundle.schema.dispositions[e.key]?.state,
    auth: e.auth.type,
    query: e.query.map((q) => q.name),
    bodyFields: Object.keys(isObj(e.body.example) ? (e.body.example as object) : {}),
    statuses: [...new Set(e.examples.map((x) => x.code))],
    response: fieldNames(bundle.contract.endpoints[e.key]?.responses[String(e.examples.find((x) => x.code < 300)?.code ?? 200)]?.schema),
  }));
}

export const SUGGEST_SYSTEM = [
  'You help QA engineers design API tests from a contract that was INFERRED from saved examples.',
  'Rules: suggest only tests for endpoints listed in the digest. Never invent endpoints, fields or behaviour you cannot see in the digest.',
  'Each test runs against a MOCK of the API and must have a clear expected HTTP status.',
  'Reply with ONLY a JSON array (max 12 items). Each item: {"name": string, "endpoint": "<exact endpoint key>", "pathParams"?: {}, "query"?: {}, "body"?: {}, "scenario"?: "success|empty|validation|unauthorized|notFound|serverError", "noAuth"?: boolean, "expectStatus": number, "expectBodyKeys"?: string[], "reason": string}.',
  'Prefer negative cases, edge cases, missing auth, unknown ids and workflow gaps. Do not repeat the obvious happy path.',
].join('\n');

export function suggestPrompt(bundle: Bundle) {
  return { system: SUGGEST_SYSTEM, user: `Contract digest (structure only, values removed):\n${JSON.stringify(contractDigest(bundle))}\n\nExisting automatic tests already cover: contract replay per endpoint, auth rejection, unknown ids, documented error examples, empty lists, CRUD state.` };
}

const scenario = z.enum(['success', 'empty', 'validation', 'unauthorized', 'notFound', 'serverError']);
const suggestionSchema = z.object({
  name: z.string().trim().min(3).max(200),
  endpoint: z.string().min(1).max(500),
  pathParams: z.record(z.string().max(200)).optional(),
  query: z.record(z.string().max(300)).optional(),
  body: z.record(z.any()).optional(),
  scenario: scenario.optional(),
  noAuth: z.boolean().optional(),
  expectStatus: z.number().int().min(100).max(599),
  expectBodyKeys: z.array(z.string().max(120)).max(10).optional(),
  reason: z.string().max(400).optional(),
});

export interface Suggestion extends CustomTest {
  reason?: string;
  origin: 'ai';
}

/** Extracts and validates model output. Unknown endpoints, bad shapes, oversize bodies and duplicates are rejected with a reason. */
export function parseSuggestions(text: string, bundle: Bundle): { accepted: Suggestion[]; rejected: { item: unknown; reason: string }[] } {
  const rejected: { item: unknown; reason: string }[] = [];
  let raw: unknown;
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return { accepted: [], rejected: [{ item: text.slice(0, 200), reason: 'The reply was not valid JSON' }] };
  }
  if (!Array.isArray(raw)) return { accepted: [], rejected: [{ item: text.slice(0, 200), reason: 'The reply was not a JSON array' }] };
  const known = new Set(bundle.model.endpoints.map((e) => e.key));
  const seen = new Set<string>();
  const accepted: Suggestion[] = [];
  for (const item of raw.slice(0, 30)) {
    const parsed = suggestionSchema.safeParse(item);
    if (!parsed.success) {
      rejected.push({ item, reason: parsed.error.issues[0]?.message || 'invalid shape' });
      continue;
    }
    const t = parsed.data;
    if (!known.has(t.endpoint)) rejected.push({ item, reason: `Unknown endpoint ${t.endpoint}` });
    else if (JSON.stringify(t.body ?? {}).length > 5000) rejected.push({ item, reason: 'Body too large' });
    else if (seen.has(`${t.endpoint}|${t.name}`)) rejected.push({ item, reason: 'Duplicate' });
    else {
      seen.add(`${t.endpoint}|${t.name}`);
      accepted.push({ ...t, origin: 'ai' });
    }
    if (accepted.length >= 12) break;
  }
  return { accepted, rejected };
}

export function explainPrompt(result: TestResult) {
  return {
    system: 'You explain a failed API test to a developer in at most 120 words. Use ONLY the evidence given. If the evidence is insufficient, say so. Distinguish facts (documented) from guesses (inferred). Do not claim to know backend internals.',
    user: JSON.stringify(redact({ name: result.name, type: result.type, status: result.status, expected: result.expected, actual: result.actual, certainty: result.certainty, error: result.error, evidence: result.evidence })),
  };
}

export interface AiCompletion {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export type AiProvider = (args: { system: string; user: string; maxTokens: number }) => Promise<AiCompletion>;

/** Anthropic Messages API. `fetchImpl` is injectable for tests. */
export function anthropicProvider(cfg: { apiKey: string; model: string }, fetchImpl: typeof fetch = fetch): AiProvider {
  return async ({ system, user, maxTokens }) => {
    const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: cfg.model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`AI provider returned ${res.status}`);
    const data = (await res.json()) as { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
    return { text: (data.content || []).filter((c) => c.type === 'text').map((c) => c.text || '').join(''), inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 };
  };
}
