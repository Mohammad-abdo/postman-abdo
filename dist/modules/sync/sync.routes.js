"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncRoutes = void 0;
const express_1 = require("express");
const validate_middleware_1 = require("../../core/middleware/validate.middleware");
const sync_controller_1 = require("./sync.controller");
const sync_schema_1 = require("./sync.schema");
/** Offline sync support: device heartbeats and uploads of work done on a device. */
exports.syncRoutes = (0, express_1.Router)();
exports.syncRoutes.post('/heartbeat', (0, validate_middleware_1.validateBody)(sync_schema_1.heartbeatSchema), sync_controller_1.syncController.heartbeat);
exports.syncRoutes.get('/devices', sync_controller_1.syncController.devices);
exports.syncRoutes.post('/history', (0, validate_middleware_1.validateBody)(sync_schema_1.historyEntrySchema), sync_controller_1.syncController.recordHistory);
