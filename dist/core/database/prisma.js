"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.json = exports.prisma = void 0;
const client_1 = require("@prisma/client");
exports.prisma = new client_1.PrismaClient();
/** Typed escape hatch for writing our JSON column models (bodies, auth, variables...). */
const json = (value) => value;
exports.json = json;
