"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isOpenApi = void 0;
exports.openApiToCollection = openApiToCollection;
exports.upgradeV1Collection = upgradeV1Collection;
const http_error_1 = require("../../core/errors/http-error");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Converter = require('openapi-to-postmanv2');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const transformer = require('postman-collection-transformer');
const isOpenApi = (json) => Boolean(json && (json.openapi || json.swagger));
exports.isOpenApi = isOpenApi;
/** OpenAPI 3 / Swagger 2 → Postman Collection v2.1 (Postman's own converter). */
function openApiToCollection(spec) {
    return new Promise((resolve, reject) => {
        Converter.convert({ type: 'json', data: spec }, { folderStrategy: 'Tags', requestParametersResolution: 'Example' }, (err, result) => {
            if (err)
                return reject(err);
            if (!result.result)
                return reject((0, http_error_1.BadRequest)(result.reason || 'Invalid OpenAPI document'));
            resolve(result.output[0].data);
        });
    });
}
/** Collection v1 has top-level `requests` + `order`; upgrade it to v2.1. */
function upgradeV1Collection(json) {
    return new Promise((resolve, reject) => transformer.convert(json, { inputVersion: '1.0.0', outputVersion: '2.1.0', retainIds: false }, (err, out) => err ? reject(err) : resolve(out)));
}
