"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bodyToV21 = bodyToV21;
exports.bodyFromV2 = bodyFromV2;
const path_1 = __importDefault(require("path"));
const engine_config_1 = require("./engine.config");
const kv_mapper_1 = require("./kv.mapper");
const types_1 = require("./types");
/** Uploaded files are stored by id; at run time the runtime needs absolute paths. */
function fileSrc(src, forRun) {
    if (!src)
        return null;
    return forRun ? path_1.default.join(engine_config_1.engineConfig.uploadDir, path_1.default.basename(src)) : src;
}
function bodyToV21(body, forRun) {
    if (!body || !body.mode || body.mode === 'none')
        return undefined;
    switch (body.mode) {
        case 'raw':
            return { mode: 'raw', raw: body.raw ?? '', options: { raw: { language: body.rawLanguage || 'text' } } };
        case 'urlencoded':
            return { mode: 'urlencoded', urlencoded: (0, kv_mapper_1.kvToV21)(body.urlencoded) };
        case 'formdata':
            return {
                mode: 'formdata',
                formdata: (body.formdata || [])
                    .filter((f) => f && (f.key || f.value || f.src))
                    .map((f) => {
                    const base = {
                        key: f.key,
                        ...(f.enabled === false ? { disabled: true } : {}),
                        ...(f.description ? { description: f.description } : {}),
                        ...(f.contentType ? { contentType: f.contentType } : {}),
                    };
                    return f.type === 'file'
                        ? { ...base, type: 'file', src: fileSrc(f.src, forRun) }
                        : { ...base, type: 'text', value: f.value ?? '' };
                }),
            };
        case 'file':
            return { mode: 'file', file: { src: fileSrc(body.file?.src, forRun) } };
        case 'graphql':
            return { mode: 'graphql', graphql: { query: body.graphql?.query || '', variables: body.graphql?.variables || '' } };
        default:
            return undefined;
    }
}
function bodyFromV2(body) {
    const out = (0, types_1.emptyBody)();
    if (!body || !body.mode)
        return out;
    out.mode = body.mode;
    switch (body.mode) {
        case 'raw':
            out.raw = body.raw || '';
            out.rawLanguage = body.options?.raw?.language || 'text';
            break;
        case 'urlencoded':
            out.urlencoded = (0, kv_mapper_1.kvFromV2)(body.urlencoded);
            break;
        case 'formdata':
            out.formdata = (body.formdata || []).map((p) => ({
                key: p.key || '',
                value: p.type === 'file' ? '' : p.value ?? '',
                type: p.type === 'file' ? 'file' : 'text',
                src: p.type === 'file' ? (Array.isArray(p.src) ? p.src[0] : p.src) || '' : undefined,
                enabled: !p.disabled,
                description: (0, kv_mapper_1.descriptionText)(p.description),
                contentType: p.contentType || '',
            }));
            break;
        case 'file':
            out.file = { src: body.file?.src || '' };
            break;
        case 'graphql': {
            const vars = body.graphql?.variables;
            out.graphql = {
                query: body.graphql?.query || '',
                variables: typeof vars === 'string' ? vars : JSON.stringify(vars || {}, null, 2),
            };
            break;
        }
    }
    return out;
}
