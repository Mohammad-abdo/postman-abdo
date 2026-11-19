"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockServeRoutes = exports.mockRoutes = void 0;
const express_1 = __importStar(require("express"));
const validate_middleware_1 = require("../../core/middleware/validate.middleware");
const mock_controller_1 = require("./mock.controller");
const mock_schema_1 = require("./mock.schema");
/** Management API (authenticated). */
exports.mockRoutes = (0, express_1.Router)();
exports.mockRoutes.get('/', mock_controller_1.mockController.list);
exports.mockRoutes.post('/', (0, validate_middleware_1.validateBody)(mock_schema_1.createMockSchema), mock_controller_1.mockController.create);
exports.mockRoutes.put('/:id', (0, validate_middleware_1.validateBody)(mock_schema_1.updateMockSchema), mock_controller_1.mockController.update);
exports.mockRoutes.delete('/:id', mock_controller_1.mockController.remove);
/** Public mock endpoints; accept any body type. */
exports.mockServeRoutes = (0, express_1.Router)();
exports.mockServeRoutes.all('/:mockId*', express_1.default.raw({ type: '*/*', limit: '50mb' }), mock_controller_1.mockController.serve);
