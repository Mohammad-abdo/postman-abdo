import { BadRequest } from '../../core/errors/http-error';
import { V2Json } from '../../shared/postman/types';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Converter = require('openapi-to-postmanv2');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const transformer = require('postman-collection-transformer');

export const isOpenApi = (json: V2Json) => Boolean(json && (json.openapi || json.swagger));

/** OpenAPI 3 / Swagger 2 → Postman Collection v2.1 (Postman's own converter). */
export function openApiToCollection(spec: V2Json): Promise<V2Json> {
  return new Promise((resolve, reject) => {
    Converter.convert(
      { type: 'json', data: spec },
      { folderStrategy: 'Tags', requestParametersResolution: 'Example' },
      (err: Error | null, result: V2Json) => {
        if (err) return reject(err);
        if (!result.result) return reject(BadRequest(result.reason || 'Invalid OpenAPI document'));
        resolve(result.output[0].data);
      },
    );
  });
}

/** Collection v1 has top-level `requests` + `order`; upgrade it to v2.1. */
export function upgradeV1Collection(json: V2Json): Promise<V2Json> {
  return new Promise((resolve, reject) =>
    transformer.convert(json, { inputVersion: '1.0.0', outputVersion: '2.1.0', retainIds: false }, (err: Error | null, out: V2Json) =>
      err ? reject(err) : resolve(out),
    ),
  );
}
