import { analyzeCollection } from './analyzer';
import { buildContract } from './contract';
import { buildGraph } from './relations';
import { evaluateRules, ruleSetVersion } from './rules';
import { AppSchema, Bundle, GenerateOptions } from './types';

/** Collection (Postman v2.1 JSON) → analysis, contract, relationship graph, rule evaluation, Application Schema. Pure and deterministic. */
export function generateApp(collection: unknown, opts: GenerateOptions & { sourceHash?: string } = {}): Bundle {
  const model = analyzeCollection(collection, { sourceHash: opts.sourceHash });
  const contract = buildContract(model);
  const graph = buildGraph(model);
  const mapped = evaluateRules({ model, contract, graph }, { overrides: opts.overrides, disabledRules: opts.disabledRules });

  const endpoints: AppSchema['endpoints'] = {};
  model.endpoints.forEach((e) => (endpoints[e.key] = { requestId: e.id, method: e.method, path: e.path, role: graph.roles[e.key].role, resource: graph.roles[e.key].resource }));

  const schema: AppSchema = {
    schemaVersion: 1,
    app: { name: `${model.meta.name} — Test App`, sourceHash: model.meta.sourceHash, contractVersion: contract.version, ruleSetVersion: ruleSetVersion(opts.disabledRules), seed: opts.seed ?? 1 },
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
