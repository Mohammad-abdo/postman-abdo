"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.codegenController = void 0;
const auth_middleware_1 = require("../../core/middleware/auth.middleware");
const codegen_service_1 = require("./codegen.service");
exports.codegenController = {
    languages: (_req, res) => res.json(codegen_service_1.codegenService.languages()),
    generate: async (req, res) => res.json({ snippet: await codegen_service_1.codegenService.generate((0, auth_middleware_1.currentUserId)(req), req.body) }),
};
