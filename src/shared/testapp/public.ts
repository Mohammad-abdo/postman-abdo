import { AppSchema } from './types';

/** What a public share visitor may see: no source ids, hashes, rule traces, conflicts, dispositions or review queue. */
export function publicSchema(schema: AppSchema) {
  return {
    schemaVersion: schema.schemaVersion,
    app: { name: schema.app.name, seed: schema.app.seed },
    nav: schema.nav,
    screens: schema.screens.map((s) => ({ ...s, sources: [] as string[] })),
    actions: Object.fromEntries(Object.entries(schema.actions).map(([k, a]) => [k, { id: a.id, label: a.label, kind: a.kind, confirm: a.confirm, inputs: a.inputs, endpoint: a.endpoint, ruleId: a.ruleId }])),
    workflows: schema.workflows,
  };
}
