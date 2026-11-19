"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.accountController = void 0;
const auth_middleware_1 = require("../../core/middleware/auth.middleware");
const account_service_1 = require("./account.service");
exports.accountController = {
    overview: async (req, res) => res.json(await account_service_1.accountService.overview((0, auth_middleware_1.currentUserId)(req))),
    updateProfile: async (req, res) => res.json(await account_service_1.accountService.updateProfile((0, auth_middleware_1.currentUserId)(req), req.body)),
    setAvatar: async (req, res) => res.json(await account_service_1.accountService.setAvatar((0, auth_middleware_1.currentUserId)(req), req.body.dataUrl)),
    changePassword: async (req, res) => res.json(await account_service_1.accountService.changePassword(req, (0, auth_middleware_1.currentUserId)(req), req.body)),
    logoutEverywhere: async (req, res) => res.json(await account_service_1.accountService.logoutEverywhere(req, (0, auth_middleware_1.currentUserId)(req))),
    activity: async (req, res) => res.json(await account_service_1.accountService.activity((0, auth_middleware_1.currentUserId)(req), Math.min(Number(req.query.days) || 30, 90))),
    updatePreferences: async (req, res) => res.json(await account_service_1.accountService.updatePreferences((0, auth_middleware_1.currentUserId)(req), req.body.settings)),
};
