"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transferRoutes = void 0;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const validate_middleware_1 = require("../../core/middleware/validate.middleware");
const transfer_controller_1 = require("./transfer.controller");
const transfer_schema_1 = require("./transfer.schema");
const inMemory = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
exports.transferRoutes = (0, express_1.Router)();
exports.transferRoutes.post('/import', (0, validate_middleware_1.validateBody)(transfer_schema_1.importSchema), transfer_controller_1.transferController.importText);
exports.transferRoutes.post('/import/files', inMemory.array('files'), transfer_controller_1.transferController.importFiles);
exports.transferRoutes.post('/curl', (0, validate_middleware_1.validateBody)(transfer_schema_1.parseCurlSchema), transfer_controller_1.transferController.parseCurl);
exports.transferRoutes.get('/export/:workspaceId', transfer_controller_1.transferController.exportWorkspace);
