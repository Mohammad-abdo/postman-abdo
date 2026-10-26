import path from 'path';
import { engineConfig } from './engine.config';
import { descriptionText, kvFromV2, kvToV21 } from './kv.mapper';
import { BodyModel, FormDataField, V2Json, emptyBody } from './types';

/** Uploaded files are stored by id; at run time the runtime needs absolute paths. */
function fileSrc(src: string | undefined, forRun?: boolean) {
  if (!src) return null;
  return forRun ? path.join(engineConfig.uploadDir, path.basename(src)) : src;
}

export function bodyToV21(body: BodyModel | undefined | null, forRun?: boolean): V2Json | undefined {
  if (!body || !body.mode || body.mode === 'none') return undefined;
  switch (body.mode) {
    case 'raw':
      return { mode: 'raw', raw: body.raw ?? '', options: { raw: { language: body.rawLanguage || 'text' } } };
    case 'urlencoded':
      return { mode: 'urlencoded', urlencoded: kvToV21(body.urlencoded) };
    case 'formdata':
      return {
        mode: 'formdata',
        formdata: (body.formdata || [])
          .filter((f) => f && (f.key || f.value || f.src))
          .map((f: FormDataField) => {
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

export function bodyFromV2(body: V2Json): BodyModel {
  const out = emptyBody();
  if (!body || !body.mode) return out;
  out.mode = body.mode;
  switch (body.mode) {
    case 'raw':
      out.raw = body.raw || '';
      out.rawLanguage = body.options?.raw?.language || 'text';
      break;
    case 'urlencoded':
      out.urlencoded = kvFromV2(body.urlencoded);
      break;
    case 'formdata':
      out.formdata = (body.formdata || []).map((p: V2Json) => ({
        key: p.key || '',
        value: p.type === 'file' ? '' : p.value ?? '',
        type: p.type === 'file' ? 'file' : 'text',
        src: p.type === 'file' ? (Array.isArray(p.src) ? p.src[0] : p.src) || '' : undefined,
        enabled: !p.disabled,
        description: descriptionText(p.description),
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
