"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authController = void 0;
const auth_middleware_1 = require("../../core/middleware/auth.middleware");
const auth_service_1 = require("./auth.service");
exports.authController = {
    register: async (req, res) => res.json(await auth_service_1.authService.register(req.body)),
    login: async (req, res) => res.json(await auth_service_1.authService.login(req.body)),
    me: async (req, res) => res.json(await auth_service_1.authService.me((0, auth_middleware_1.currentUserId)(req))),
    updateProfile: async (req, res) => res.json(await auth_service_1.authService.updateProfile((0, auth_middleware_1.currentUserId)(req), req.body)),
};
