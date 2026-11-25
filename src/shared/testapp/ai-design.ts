import { z } from 'zod';
import { AiTool, contractDigest } from './ai';
import { CARDS, Customization, SECTION_TYPES, STYLES, customizationSchema } from './design/customize';
import { FONTS } from './design/look';
import { Bundle } from './types';
import { isObj } from './util';

/* AI design helpers. Pure: prompt building, patch merging and strict validation.
   The model only PROPOSES a patch; it is merged onto the current design, validated by customizationSchema and shown as a diff. */

export const MODES = ['design', 'edit', 'redesign', 'text'] as const;
export type DesignMode = (typeof MODES)[number];

/** Objects merge, arrays and scalars replace, null removes a key. */
export function mergePatch(base: unknown, patch: unknown): unknown {
  if (!isObj(patch)) return patch;
  const out: Record<string, unknown> = isObj(base) ? { ...base } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k];
    else out[k] = mergePatch(out[k], v);
  }
  return out;
}

export interface Change {
  path: string;
  from?: unknown;
  to?: unknown;
}

const short = (v: unknown) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s && s.length > 80 ? `${s.slice(0, 80)}…` : s;
};

/** Human-readable list of what differs between two designs (arrays are compared as a whole). */
export function diffDesign(a: unknown, b: unknown, path = '', out: Change[] = []): Change[] {
  if (out.length >= 60) return out;
  if (isObj(a) && isObj(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diffDesign(a[k], b[k], path ? `${path}.${k}` : k, out);
  } else if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ path, from: a === undefined ? undefined : short(a), to: b === undefined ? undefined : short(b) });
  return out;
}

export const DESIGN_SYSTEM = [
  'You are a mobile app designer inside a design studio. You change a "customization" JSON that is applied on top of an app generated from an API collection.',
  'You may ONLY return changes through the tool. Return a PATCH: only the keys that change. Objects merge, arrays are replaced whole (so repeat the full array when you change one item), null removes a key.',
  'Never invent endpoints, entities or fields: use only the ids listed in the context. Colours are hex like #1E40AF. Keep text short and natural; match the language and direction (dir ltr/rtl) of the app.',
  `Top-level keys: v (always 1), theme, brand, dir, ab, splash, login, css, device, tabs (max 8), home (sections, max 40), pages (max 10), entities, ctas.`,
  `theme: mode light|dark, primary, accent, background, surface, text, muted, radius 0-40, style ${STYLES.join('|')}, font and headingFont (${FONTS.join(', ')}), density compact|comfortable|spacious, tabStyle floating|docked|minimal, headerStyle large|centered|compact, cardStyle shadow|outline|flat|glass, scale 0.8-1.3, transition slide|fade|zoom|none, buttonStyle rounded|pill|square, motion none|subtle|lively, pattern none|dots|grid|waves, gradient none|soft|vivid, iconStyle filled|outlined|rounded|sharp|twotone.`,
  'brand: {name, tagline, icon (material icon name in snake_case), logo (https url)}. tabs item: {id, label, icon, screen, hidden?, badge?}.',
  `section: {id, type (${SECTION_TYPES.join('|')}), title?, entity?, action?, card? (${CARDS.join('|')}), limit?, visibility? all|signedIn|guest, animate? none|fade|slide|pop, hidden?, showExpr?, variant? A|B, device? all|phone|wide}. Every section needs a unique id.`,
  'entities: map of entity id to {label, plural, icon, card, hiddenFields, fieldLabels, detail, list}. pages item: {id, title, icon, sections}.',
  'When you change theme.mode, also set background, surface, text and muted so they match the new mode and keep text readable (contrast at least 4.5:1).',
  'The result must pass strict validation: unknown keys are rejected. Prefer a small, coherent change over rewriting everything, unless the user asks for a full redesign.',
].join('\n');

const optionSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Short name of this direction (max 5 words)' },
    summary: { type: 'string', description: 'One or two sentences on what changed and why' },
    patch: { type: 'object', description: 'Customization patch (only changed keys)' },
  },
  required: ['summary', 'patch'],
};

export const designTool = (count: number): AiTool => ({
  name: 'propose_designs',
  description: `Propose exactly ${count} design change${count > 1 ? 's' : ''} as customization patches.`,
  schema: { type: 'object', properties: { options: { type: 'array', minItems: 1, maxItems: count, items: optionSchema } }, required: ['options'] },
});

export const reviewTool: AiTool = {
  name: 'report_review',
  description: 'Report design problems found by reviewing the design.',
  schema: {
    type: 'object',
    properties: {
      score: { type: 'integer', minimum: 0, maximum: 100 },
      findings: {
        type: 'array',
        maxItems: 12,
        items: {
          type: 'object',
          properties: {
            severity: { type: 'string', enum: ['error', 'warn', 'tip'] },
            title: { type: 'string' },
            detail: { type: 'string' },
            fix: { type: 'string', description: 'An instruction another designer could follow to fix it, in one sentence' },
          },
          required: ['severity', 'title', 'fix'],
        },
      },
    },
    required: ['score', 'findings'],
  },
};

/** What the model sees: structure of the API (no values), the endpoints it may use, and the current design. */
export function designContext(bundle: Bundle, current: Customization | null) {
  const digest = contractDigest(bundle).map((d) => ({ endpoint: d.endpoint, role: d.role, response: d.response }));
  return JSON.stringify({ app: bundle.model.meta?.name, endpoints: digest, currentCustomization: current ?? {} });
}

const MODE_HINT: Record<DesignMode, string> = {
  design: 'Build or modify the design to satisfy the request. Return exactly 1 option.',
  edit: 'Make only the targeted change that was asked; leave everything else as it is. Return exactly 1 option.',
  text: 'Rewrite or translate ONLY visible text: brand name/tagline, tab labels, section titles, entity label/plural, fieldLabels, login texts and faq questions/answers. Do not touch colours, layout, ids, icons, entity/action references or structure. Keep the tone natural for the business. Return exactly 1 option.',
  redesign: 'Return 3 clearly different design directions (different palette, style, layout and fonts), each a complete coherent patch.',
};

export const REFERENCE_HINT = 'A reference image is attached. Take its colour palette, typography feel, corner radius, density and overall mood as inspiration for the theme and layout choices, but do not copy text or logos from it.';

/** Splits a data: URL into media type and base64, or null when it is not a png/jpeg/webp. */
export function parseImage(dataUrl?: string) {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  return m ? { mediaType: m[1] as 'image/png' | 'image/jpeg' | 'image/webp', data: m[2] } : null;
}

export function designPrompt(bundle: Bundle, current: Customization | null, mode: DesignMode, request: string, focus?: string, hasImage = false) {
  return {
    system: DESIGN_SYSTEM,
    user: `${MODE_HINT[mode]}\n${hasImage ? `${REFERENCE_HINT}\n` : ''}${focus ? `Focus on: ${focus}\n` : ''}Request: ${request || 'Make it more distinctive and polished.'}\n\nContext (JSON):\n${designContext(bundle, current)}`,
  };
}

export function reviewPrompt(bundle: Bundle, current: Customization | null) {
  return {
    system: `${DESIGN_SYSTEM}\nNow you REVIEW instead of editing: find real problems (readability, empty or unreachable screens, missing navigation, inconsistent naming, accessibility, weak hierarchy). Be specific and do not pad the list. Score 0-100.`,
    user: `Review this design.\n\nContext (JSON):\n${designContext(bundle, current)}`,
  };
}

export interface Proposal {
  name: string;
  summary: string;
  customization: Customization;
  changes: Change[];
}

const replySchema = z.object({
  options: z
    .array(z.object({ name: z.string().max(60).optional(), summary: z.string().max(600), patch: z.record(z.any()) }))
    .min(1)
    .max(3),
});

/** Merges each proposed patch onto the current design and validates it. Invalid options come back with the reason, so the model can repair them. */
export function parseProposals(toolInput: unknown, current: Customization | null): { proposals: Proposal[]; errors: string[] } {
  const parsed = replySchema.safeParse(toolInput);
  if (!parsed.success) return { proposals: [], errors: [`The reply did not match the tool schema: ${parsed.error.issues[0]?.message}`] };
  const base = current ?? { v: 1 as const };
  const proposals: Proposal[] = [];
  const errors: string[] = [];
  parsed.data.options.forEach((o, i) => {
    const merged = mergePatch(base, { ...o.patch, v: 1 });
    const ok = customizationSchema.safeParse(merged);
    if (!ok.success) {
      const issue = ok.error.issues[0];
      errors.push(`Option ${i + 1}: ${issue?.path.join('.') || 'design'}: ${issue?.message}`);
      return;
    }
    const changes = diffDesign(base, ok.data);
    if (!changes.length) {
      errors.push(`Option ${i + 1}: the patch changes nothing`);
      return;
    }
    proposals.push({ name: o.name?.trim() || `Option ${i + 1}`, summary: o.summary, customization: ok.data, changes });
  });
  return { proposals, errors };
}

const reviewSchema = z.object({
  score: z.number().int().min(0).max(100),
  findings: z.array(z.object({ severity: z.enum(['error', 'warn', 'tip']), title: z.string().max(200), detail: z.string().max(500).optional(), fix: z.string().max(300) })).max(12),
});

export function parseReview(toolInput: unknown) {
  const r = reviewSchema.safeParse(toolInput);
  return r.success ? r.data : null;
}
