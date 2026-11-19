import { analyzeCollection } from './analyzer';
import { buildContract } from './contract';
import { CustomRule, evaluateCustomRules } from './custom-rules';
import { buildGraph } from './relations';
import { evaluateRules, ruleSetVersion } from './rules';
import { AppSchema, Bundle, Endpoint, FieldDef, GenerateOptions } from './types';

export const REQUEST_RULE = 'request-interfaces-v1';

function requestInputs(endpoint: Endpoint): FieldDef[] {
  const fields: FieldDef[] = [...endpoint.pathParams, ...endpoint.query, ...endpoint.headers, ...endpoint.body.fields].map((param) => ({
    name: param.name,
    in: param.in,
    input: param.kind === 'file' ? 'file' : /authorization|cookie|api.key|token/i.test(param.name) && param.in === 'header' ? 'password' : 'text',
    example: param.example,
  }));
  const body = endpoint.body.example;
  if (endpoint.body.mode === 'raw') {
    if (endpoint.body.contentType === 'application/json' && body && typeof body === 'object' && !Array.isArray(body)) {
      for (const [name, value] of Object.entries(body)) {
        fields.push({ name, in: 'body', input: /password|secret|token/i.test(name) ? 'password' : typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'checkbox' : typeof value === 'object' ? 'textarea' : 'text', example: /password|secret|token/i.test(name) ? undefined : typeof value === 'string' ? value : JSON.stringify(value) });
      }
    } else {
      fields.push({ name: 'Raw body', in: 'body', input: 'textarea', rawBody: true, example: endpoint.body.contentType === 'application/json' ? JSON.stringify(body, null, 2) : typeof body === 'string' ? body : '' });
    }
  }
  return fields.map((field, index) => ({ ...field, key: `field:${index}` }));
}

function requestMapping(model: Bundle['model'], overrides: GenerateOptions['overrides']): Pick<AppSchema, 'nav' | 'screens' | 'actions' | 'dispositions' | 'workflows' | 'review' | 'conflicts' | 'trace'> {
  const result: ReturnType<typeof requestMapping> = { nav: [], screens: [], actions: {}, dispositions: {}, workflows: [], review: [], conflicts: [], trace: [] };
  const titles = new Map(overrides?.map((override) => [override.target, override.decision.title]));
  for (const request of model.endpoints) {
    const screen = `request.${request.order}`;
    const id = `send.${request.order}`;
    const title = titles.get(request.key) || titles.get(screen) || request.name;
    const method = request.method;
    const label = method === 'DELETE' ? 'Delete' : method === 'GET' ? `Fetch ${request.name}` : `Send ${method}`;
    result.nav.push({ id: screen, screen, label: title, requiresAuth: false, folderPath: request.folderPath, order: request.order });
    result.screens.push({ id: screen, title, kind: 'page', sources: [request.key], components: [{ id, type: 'actionPanel', action: id }], ruleId: REQUEST_RULE, provenance: 'documented' });
    result.actions[id] = { id, endpoint: request.key, label, kind: 'request', inputs: requestInputs(request), examples: request.examples.map(({ name, code }) => ({ name, code })), confirm: method === 'DELETE' ? 'Send this DELETE request?' : undefined, ruleId: REQUEST_RULE, provenance: 'documented' };
    result.dispositions[request.key] = { state: 'mapped', ruleId: REQUEST_RULE, provenance: 'documented' };
  }
  return result;
}

export function savedResponse(endpoint: Endpoint, value: unknown) {
  const index = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : 0;
  const example = endpoint.examples[index];
  if (!example) return undefined;
  return { status: example.code, headers: example.headers, body: example.body === undefined ? example.raw : example.body };
}

/** Collection (Postman v2.1 JSON) → analysis, contract, relationship graph, rule evaluation, Application Schema. Pure and deterministic. */
export function generateApp(collection: unknown, opts: GenerateOptions & { sourceHash?: string } = {}): Bundle {
  const model = analyzeCollection(collection, { sourceHash: opts.sourceHash });
  const contract = buildContract(model);
  const customRules = (opts.perRequest ? [] : opts.customRules || []) as CustomRule[];
  const pre = customRules.length ? evaluateCustomRules(model, customRules) : null;
  const graph = buildGraph(model, { roleOverrides: pre?.roleOverrides });
  // second pass: facts now reflect role overrides (deterministic), producing the final dispositions
  const custom = customRules.length ? evaluateCustomRules(model, customRules, (e) => graph.roles[e.key]) : undefined;
  const mapped = opts.perRequest ? requestMapping(model, opts.overrides) : evaluateRules({ model, contract, graph }, { overrides: opts.overrides, disabledRules: opts.disabledRules, custom });

  const endpoints: AppSchema['endpoints'] = {};
  model.endpoints.forEach((e) => (endpoints[e.key] = { requestId: e.id, method: e.method, path: e.path, role: graph.roles[e.key].role, resource: graph.roles[e.key].resource }));

  const schema: AppSchema = {
    schemaVersion: 1,
    app: { name: `${model.meta.name} — Test App`, sourceHash: model.meta.sourceHash, contractVersion: contract.version, ruleSetVersion: opts.perRequest ? REQUEST_RULE : ruleSetVersion(opts.disabledRules, customRules), seed: opts.seed ?? 1 },
    nav: mapped.nav,
    screens: mapped.screens,
    actions: mapped.actions,
    endpoints,
    dispositions: mapped.dispositions,
    workflows: mapped.workflows,
    review: mapped.review,
    conflicts: mapped.conflicts,
    trace: mapped.trace,
  };

  const count = (s: string) => Object.values(schema.dispositions).filter((d) => d.state === s).length;
  return {
    model,
    contract,
    graph,
    schema,
    customRules: custom ? { matches: custom.matches, invalid: custom.invalid } : { matches: [], invalid: [] },
    stats: {
      endpoints: model.endpoints.length,
      mapped: count('mapped'),
      explorer: count('explorer'),
      excluded: count('excluded'),
      background: count('background'),
      screens: schema.screens.length,
      actions: Object.keys(schema.actions).length,
      warnings: model.warnings.length,
      conflicts: schema.conflicts.length,
    },
  };
}
