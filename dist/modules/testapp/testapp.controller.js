"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testAppController = void 0;
const audit_service_1 = require("../../core/audit/audit.service");
const http_error_1 = require("../../core/errors/http-error");
const auth_middleware_1 = require("../../core/middleware/auth.middleware");
const testapp_service_1 = require("./testapp.service");
const u = auth_middleware_1.currentUserId;
const p = (req, k) => String(req.params[k]);
exports.testAppController = {
    analyze: async (req, res) => res.json(await testapp_service_1.testAppService.analyze(u(req), req.body.collectionId)),
    list: async (req, res) => res.json(await testapp_service_1.testAppService.list(u(req), String(req.query.workspaceId || ''))),
    create: async (req, res) => {
        const out = await testapp_service_1.testAppService.create(u(req), req.body);
        (0, audit_service_1.audit)(req, { action: 'testapp.generate', targetType: 'testapp', targetId: out.app.id, details: { collectionId: req.body.collectionId } });
        res.json(out);
    },
    get: async (req, res) => res.json(await testapp_service_1.testAppService.get(u(req), p(req, 'id'))),
    update: async (req, res) => res.json(await testapp_service_1.testAppService.update(u(req), p(req, 'id'), req.body)),
    remove: async (req, res) => {
        await testapp_service_1.testAppService.remove(u(req), p(req, 'id'));
        (0, audit_service_1.audit)(req, { action: 'testapp.delete', targetType: 'testapp', targetId: p(req, 'id') });
        res.json({ ok: true });
    },
    versions: async (req, res) => res.json(await testapp_service_1.testAppService.versions(u(req), p(req, 'id'))),
    versionPart: async (req, res) => {
        const n = Number(req.params.v);
        if (!Number.isInteger(n))
            throw (0, http_error_1.BadRequest)('Invalid version');
        res.json(await testapp_service_1.testAppService.versionPart(u(req), p(req, 'id'), n, String(req.query.part || 'schema')));
    },
    setOverride: async (req, res) => res.json(await testapp_service_1.testAppService.setOverride(u(req), p(req, 'id'), decodeURIComponent(p(req, 'target')), req.body.decision)),
    removeOverride: async (req, res) => {
        await testapp_service_1.testAppService.removeOverride(u(req), p(req, 'id'), decodeURIComponent(p(req, 'target')));
        res.json({ ok: true });
    },
    regenerate: async (req, res) => {
        const out = await testapp_service_1.testAppService.regenerate(u(req), p(req, 'id'), req.body);
        if (!req.body.preview)
            (0, audit_service_1.audit)(req, { action: 'testapp.regenerate', targetType: 'testapp', targetId: p(req, 'id') });
        res.json(out);
    },
    createSession: async (req, res) => res.json(await testapp_service_1.testAppService.createSession(u(req), p(req, 'id'), req.body)),
    invoke: async (req, res) => res.json(await testapp_service_1.testAppService.invoke(u(req), p(req, 'id'), p(req, 'sid'), req.body)),
    reset: async (req, res) => res.json(await testapp_service_1.testAppService.reset(u(req), p(req, 'id'), p(req, 'sid'), req.body.seed)),
    logs: async (req, res) => res.json(await testapp_service_1.testAppService.logs(u(req), p(req, 'id'), p(req, 'sid'))),
    state: async (req, res) => res.json(await testapp_service_1.testAppService.stateSummary(u(req), p(req, 'id'), p(req, 'sid'))),
    run: async (req, res) => {
        const out = await testapp_service_1.testAppService.run(u(req), p(req, 'id'), req.body);
        if (req.body.mode !== 'mock')
            (0, audit_service_1.audit)(req, { action: 'testapp.real.run', targetType: 'testapp', targetId: p(req, 'id'), details: { mode: req.body.mode, calls: out.calls, hosts: out.hosts, unsafeConfirmed: !!req.body.confirmUnsafe, productionConfirmed: !!req.body.confirmProduction } });
        res.json(out);
    },
    realInvoke: async (req, res) => {
        const out = await testapp_service_1.testAppService.realInvoke(u(req), p(req, 'id'), req.body);
        (0, audit_service_1.audit)(req, { action: 'testapp.real.invoke', targetType: 'testapp', targetId: p(req, 'id'), details: { actionId: req.body.actionId, endpoint: out.endpoint, status: out.response.status } });
        res.json(out);
    },
    rules: async (req, res) => res.json(await testapp_service_1.testAppService.rules(u(req), p(req, 'id'))),
    saveRules: async (req, res) => {
        const out = await testapp_service_1.testAppService.saveRules(u(req), p(req, 'id'), req.body);
        (0, audit_service_1.audit)(req, { action: 'testapp.rules.update', targetType: 'testapp', targetId: p(req, 'id'), details: { custom: req.body.custom.length, disabled: req.body.disabled } });
        res.json(out);
    },
    previewRules: async (req, res) => res.json(await testapp_service_1.testAppService.previewRules(u(req), p(req, 'id'), req.body)),
    runs: async (req, res) => res.json(await testapp_service_1.testAppService.runs(u(req), p(req, 'id'))),
    getRun: async (req, res) => res.json(await testapp_service_1.testAppService.getRun(u(req), p(req, 'id'), p(req, 'rid'))),
    exportRun: async (req, res) => {
        if (req.query.format === 'md') {
            res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="test-report-${p(req, 'rid').slice(0, 8)}.md"`);
            return res.send(await testapp_service_1.testAppService.reportMarkdown(u(req), p(req, 'id'), p(req, 'rid')));
        }
        res.json(await testapp_service_1.testAppService.getRun(u(req), p(req, 'id'), p(req, 'rid')));
    },
    coverage: async (req, res) => res.json(await testapp_service_1.testAppService.coverage(u(req), p(req, 'id'))),
};
