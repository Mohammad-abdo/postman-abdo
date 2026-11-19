"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cookieController = void 0;
const auth_middleware_1 = require("../../core/middleware/auth.middleware");
const cookie_service_1 = require("./cookie.service");
exports.cookieController = {
    list: async (req, res) => res.json(await cookie_service_1.cookieService.getAll((0, auth_middleware_1.currentUserId)(req))),
    upsert: async (req, res) => res.json(await cookie_service_1.cookieService.upsertRaw((0, auth_middleware_1.currentUserId)(req), req.body.domain, req.body.raw)),
    remove: async (req, res) => res.json(await cookie_service_1.cookieService.remove((0, auth_middleware_1.currentUserId)(req), req.body.domain, req.body.name, req.body.path)),
    clear: async (req, res) => {
        await cookie_service_1.cookieService.clear((0, auth_middleware_1.currentUserId)(req));
        res.json([]);
    },
};
