"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonitorScheduler = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
/** Keeps one cron task per enabled monitor. */
class MonitorScheduler {
    onTick;
    tasks = new Map();
    constructor(onTick) {
        this.onTick = onTick;
    }
    schedule(monitor) {
        this.unschedule(monitor.id);
        if (!monitor.enabled || !node_cron_1.default.validate(monitor.cron))
            return;
        this.tasks.set(monitor.id, node_cron_1.default.schedule(monitor.cron, () => {
            this.onTick(monitor.id).catch((e) => console.error(`Monitor ${monitor.id} failed`, e));
        }));
    }
    unschedule(monitorId) {
        this.tasks.get(monitorId)?.stop();
        this.tasks.delete(monitorId);
    }
}
exports.MonitorScheduler = MonitorScheduler;
