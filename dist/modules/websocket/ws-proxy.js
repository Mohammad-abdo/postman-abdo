"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachWsProxy = attachWsProxy;
const ws_1 = __importStar(require("ws"));
const auth_middleware_1 = require("../../core/middleware/auth.middleware");
const PROXY_PATH = '/ws-proxy';
/**
 * Browsers cannot set custom headers on WebSocket handshakes, so the client talks to this proxy,
 * which opens the real connection on its behalf (like Postman's desktop agent).
 */
class ProxySession {
    client;
    target = null;
    constructor(client) {
        this.client = client;
        client.on('message', (raw) => this.handle(raw.toString()));
        client.on('close', () => this.target?.terminate());
    }
    emit(message) {
        if (this.client.readyState === ws_1.default.OPEN)
            this.client.send(JSON.stringify({ ...message, time: Date.now() }));
    }
    handle(raw) {
        let message;
        try {
            message = JSON.parse(raw);
        }
        catch {
            return;
        }
        if (message.type === 'connect')
            this.connect(message);
        else if (message.type === 'send')
            this.send(message);
        else if (message.type === 'close')
            this.target?.close(message.code || 1000, message.reason || '');
    }
    connect(message) {
        try {
            const headers = Object.fromEntries((message.headers || []).filter((h) => h.key).map((h) => [h.key, h.value]));
            const protocols = (message.protocols || []).filter(Boolean);
            const target = new ws_1.default(message.url, protocols.length ? protocols : undefined, {
                headers,
                rejectUnauthorized: message.strictSSL !== false,
                maxPayload: (message.maxMessageSize || 10) * 1024 * 1024,
            });
            this.target = target;
            target.on('upgrade', (res) => this.emit({
                type: 'handshake',
                status: res.statusCode,
                headers: Object.entries(res.headers).map(([key, value]) => ({ key, value: Array.isArray(value) ? value.join(', ') : String(value) })),
            }));
            target.on('open', () => this.emit({ type: 'open', url: message.url }));
            target.on('message', (data, isBinary) => {
                const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
                this.emit({ type: 'message', data: buf.toString(isBinary ? 'base64' : 'utf8'), isBinary, size: buf.length });
            });
            target.on('close', (code, reason) => {
                this.emit({ type: 'close', code, reason: reason.toString() });
                this.target = null;
            });
            target.on('unexpected-response', (_req, res) => this.emit({ type: 'error', message: `Unexpected server response: ${res.statusCode}` }));
            target.on('error', (err) => this.emit({ type: 'error', message: err.message }));
        }
        catch (e) {
            this.emit({ type: 'error', message: e.message });
        }
    }
    send(message) {
        if (this.target?.readyState !== ws_1.default.OPEN)
            return this.emit({ type: 'error', message: 'Not connected' });
        const payload = message.isBinary ? Buffer.from(message.data, 'base64') : message.data;
        this.target.send(payload, { binary: !!message.isBinary }, (err) => this.emit(err ? { type: 'error', message: err.message } : { type: 'sent', id: message.id }));
    }
}
function attachWsProxy(server) {
    const wss = new ws_1.WebSocketServer({ noServer: true });
    server.on('upgrade', (req, socket, head) => {
        const url = new URL(req.url || '', 'http://localhost');
        if (url.pathname !== PROXY_PATH)
            return;
        if (!(0, auth_middleware_1.verifyToken)(url.searchParams.get('token') || ''))
            return socket.destroy();
        wss.handleUpgrade(req, socket, head, (ws) => new ProxySession(ws));
    });
}
