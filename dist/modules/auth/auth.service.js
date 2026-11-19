"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authService = exports.toPublicUser = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = require("../../core/database/prisma");
const http_error_1 = require("../../core/errors/http-error");
const auth_middleware_1 = require("../../core/middleware/auth.middleware");
const workspace_service_1 = require("../workspaces/workspace.service");
const platform_service_1 = require("../platform/platform.service");
const auth_middleware_2 = require("../../core/middleware/auth.middleware");
const toPublicUser = (u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status,
    avatarUrl: u.avatarUrl,
    bio: u.bio,
    company: u.company,
    jobTitle: u.jobTitle,
    location: u.location,
    website: u.website,
    createdAt: u.createdAt,
    settings: u.settings || {},
});
exports.toPublicUser = toPublicUser;
exports.authService = {
    async register(input) {
        if (!(await platform_service_1.platformService.settings()).registrationOpen)
            throw (0, http_error_1.Forbidden)('Registration is currently closed');
        if (await prisma_1.prisma.user.findUnique({ where: { email: input.email } })) {
            throw (0, http_error_1.Conflict)('An account with this email already exists');
        }
        // The very first account becomes the platform super admin.
        const isFirstUser = (await prisma_1.prisma.user.count()) === 0;
        const user = await prisma_1.prisma.user.create({
            data: {
                role: isFirstUser ? 'admin' : 'user',
                lastLoginAt: new Date(),
                name: input.name || input.email.split('@')[0],
                email: input.email,
                passwordHash: await bcryptjs_1.default.hash(input.password, 10),
                settings: {},
            },
        });
        await workspace_service_1.workspaceService.createPersonal(user.id);
        return { token: (0, auth_middleware_1.signToken)(user.id, user.tokenVersion), user: (0, exports.toPublicUser)(user) };
    },
    async login(input) {
        const user = await prisma_1.prisma.user.findUnique({ where: { email: input.email } });
        if (!user || !(await bcryptjs_1.default.compare(input.password, user.passwordHash))) {
            throw (0, http_error_1.Unauthorized)('Invalid email or password');
        }
        if (user.status === 'suspended')
            throw (0, http_error_1.Forbidden)('Your account has been suspended. Contact support.');
        await prisma_1.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        return { token: (0, auth_middleware_1.signToken)(user.id, user.tokenVersion), user: (0, exports.toPublicUser)(user) };
    },
    async me(userId) {
        const user = await prisma_1.prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            throw (0, http_error_1.Unauthorized)();
        const auth = await (0, auth_middleware_2.loadAuthUser)(userId);
        return { ...(0, exports.toPublicUser)(user), permissions: auth?.permissions || [], platform: await platform_service_1.platformService.publicSettings() };
    },
    async updateProfile(userId, input) {
        const user = await prisma_1.prisma.user.update({
            where: { id: userId },
            data: { ...(input.name ? { name: input.name } : {}), ...(input.settings ? { settings: (0, prisma_1.json)(input.settings) } : {}) },
        });
        return (0, exports.toPublicUser)(user);
    },
    async settings(userId) {
        const user = await prisma_1.prisma.user.findUnique({ where: { id: userId }, select: { settings: true } });
        return user?.settings || {};
    },
};
