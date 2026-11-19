"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executionController = void 0;
const auth_middleware_1 = require("../../core/middleware/auth.middleware");
const execution_service_1 = require("./execution.service");
const run_service_1 = require("./run.service");
/** Opens a Server-Sent Events stream and returns a writer for it. */
function openEventStream(res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    return (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
exports.executionController = {
    send: async (req, res) => res.json(await execution_service_1.executionService.send((0, auth_middleware_1.currentUserId)(req), req.body)),
    run: async (req, res) => {
        const write = openEventStream(res);
        let abort = null;
        res.on('close', () => !res.writableEnded && abort?.());
        try {
            const summary = await execution_service_1.executionService.run((0, auth_middleware_1.currentUserId)(req), req.body, {
                onEvent: (event, payload) => write(event, payload),
                registerAbort: (fn) => (abort = fn),
            });
            write('done', summary);
        }
        catch (e) {
            write('error', { message: e.message });
        }
        res.end();
    },
    listRuns: async (req, res) => res.json(await run_service_1.runService.list((0, auth_middleware_1.currentUserId)(req), String(req.query.workspaceId || ''), req.query.collectionId ? String(req.query.collectionId) : undefined)),
    getRun: async (req, res) => res.json(await run_service_1.runService.get((0, auth_middleware_1.currentUserId)(req), req.params.id)),
    removeRun: async (req, res) => {
        await run_service_1.runService.remove((0, auth_middleware_1.currentUserId)(req), req.params.id);
        res.json({ ok: true });
    },
};
