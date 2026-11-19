"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.engineConfig = void 0;
const path_1 = __importDefault(require("path"));
/**
 * Settings of the request engine (mappers + runtime) that differ between hosts.
 * The server keeps the default; the desktop app points uploads at its own data folder.
 */
let uploadDir = path_1.default.resolve(__dirname, '../../../uploads');
exports.engineConfig = {
    get uploadDir() {
        return uploadDir;
    },
    setUploadDir(dir) {
        uploadDir = dir;
    },
};
