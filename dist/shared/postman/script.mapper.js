"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scriptsToEvents = scriptsToEvents;
exports.scriptsFromEvents = scriptsFromEvents;
const toLines = (s) => (s ? String(s).split(/\r?\n/) : []);
function scriptsToEvents(pre, test) {
    const events = [];
    if (pre?.trim())
        events.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: toLines(pre) } });
    if (test?.trim())
        events.push({ listen: 'test', script: { type: 'text/javascript', exec: toLines(test) } });
    return events;
}
function scriptsFromEvents(events) {
    const out = { pre: '', test: '' };
    (Array.isArray(events) ? events : []).forEach((e) => {
        const exec = e?.script?.exec;
        const code = Array.isArray(exec) ? exec.join('\n') : exec || '';
        if (e.listen === 'prerequest')
            out.pre = code;
        if (e.listen === 'test')
            out.test = code;
    });
    return out;
}
