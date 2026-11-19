"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRedisReady = void 0;
exports.getRedis = getRedis;
const ioredis_1 = __importDefault(require("ioredis"));
const env_1 = require("../../config/env");
let client = null;
let ready = false;
/** Shared Redis connection, or null when REDIS_URL is not configured / unreachable. */
function getRedis() {
    if (!env_1.env.redisUrl)
        return null;
    if (!client) {
        client = new ioredis_1.default(env_1.env.redisUrl, { lazyConnect: false, maxRetriesPerRequest: 2, enableOfflineQueue: false });
        client.on('ready', () => {
            ready = true;
            console.log('Redis connected');
        });
        client.on('error', (e) => {
            if (ready)
                console.error('Redis error:', e.message);
            ready = false;
        });
        client.on('end', () => (ready = false));
    }
    return client;
}
const isRedisReady = () => ready;
exports.isRedisReady = isRedisReady;
