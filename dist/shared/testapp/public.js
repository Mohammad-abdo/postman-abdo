"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicSchema = publicSchema;
/** What a public share visitor may see: no source ids, hashes, rule traces, conflicts, dispositions or review queue. */
function publicSchema(schema) {
    return {
        schemaVersion: schema.schemaVersion,
        app: { name: schema.app.name, seed: schema.app.seed },
        nav: schema.nav,
        screens: schema.screens.map((s) => ({ ...s, sources: [] })),
        actions: Object.fromEntries(Object.entries(schema.actions).map(([k, a]) => [k, { id: a.id, label: a.label, kind: a.kind, confirm: a.confirm, inputs: a.kind === 'request' ? a.inputs.map(({ example, ...field }) => field) : a.inputs, examples: a.examples, mobile: a.mobile, endpoint: a.endpoint, ruleId: a.ruleId }])),
        workflows: schema.workflows,
    };
}
