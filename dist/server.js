"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const app_1 = require("./app");
const bootstrap_1 = require("./bootstrap");
const env_1 = require("./config/env");
const redis_1 = require("./core/cache/redis");
const ws_proxy_1 = require("./modules/websocket/ws-proxy");
const realtime_hub_1 = require("./modules/realtime/realtime.hub");
require("./modules/chat/chat.service");
const monitor_service_1 = require("./modules/monitors/monitor.service");
(0, redis_1.getRedis)();
const server = http_1.default.createServer((0, app_1.createApp)());
(0, ws_proxy_1.attachWsProxy)(server);
(0, realtime_hub_1.attachRealtime)(server);
server.listen(env_1.env.port, async () => {
    console.log(`Fack Postman API listening on http://localhost:${env_1.env.port} (${env_1.env.nodeEnv})`);
    try {
        await (0, bootstrap_1.bootstrap)();
        await monitor_service_1.monitorService.startAll();
    }
    catch (e) {
        console.error('Startup tasks failed', e);
    }
});
