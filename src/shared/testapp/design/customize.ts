/**
 * A design customization: what a person changed in the design studio on top of the generated
 * design (theme, brand, tabs, home sections, extra pages, entity labels, buttons).
 * Stored as data and applied by the renderer; validated strictly because shared links render
 * other people's customizations.
 */
import { z } from 'zod';
import { FONTS } from './look';

const MAX_BYTES = 192 * 1024;
const CODE_MAX = 30_000;

/**
 * Custom CSS is scoped to the app by the renderer (native nesting under `.na-phone`). It may not
 * pull in other resources except https images, and may not break out of its <style> element.
 */
const UNSAFE_CSS = /@import|expression\s*\(|javascript:|vbscript:|behavior\s*:|-moz-binding|<\/?\s*style|<\/?\s*script|url\(\s*['"]?\s*(?!https:)/i;
const css = z.string().max(CODE_MAX).refine((v) => !UNSAFE_CSS.test(v), 'CSS may not use @import, scripts or non-https url()');

const color = z.string().regex(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i, 'Use a hex colour like #1E40AF');
const text = (max: number) => z.string().max(max);
const httpsUrl = z.string().max(2000).regex(/^https:\/\/[^\s"'<>]+$/i, 'Images must be https:// links');
const icon = z.string().regex(/^[a-z0-9_]{1,40}$/);
const id = z.string().regex(/^[\w.:#\- ]{1,160}$/);
const roles = z.record(text(30), text(120));
const values = z.record(text(60), text(200));

const SECTION_TYPES = ['greeting', 'search', 'hero', 'chips', 'grid', 'rail', 'list', 'stats', 'map', 'status', 'balance', 'shortcuts', 'feed', 'text', 'image', 'button', 'banner', 'spacer', 'code', 'form', 'divider', 'video'] as const;
const CARDS = ['product', 'venue', 'course', 'order', 'person', 'post', 'trip', 'transaction', 'article', 'event', 'banner', 'chip', 'tile'] as const;
const STYLES = ['soft', 'bold', 'minimal', 'playful', 'glass', 'elegant', 'brutal', 'neon', 'classic'] as const;

const section = z
  .object({
    id,
    type: z.enum(SECTION_TYPES),
    title: text(80).optional(),
    entity: id.optional(),
    action: id.optional(),
    dataPath: z.array(text(80)).max(8).optional(),
    roles: roles.optional(),
    card: z.enum(CARDS).optional(),
    limit: z.number().int().min(1).max(50).optional(),
    seeAll: text(160).optional(),
    columns: z.number().int().min(1).max(3).optional(),
    body: text(1000).optional(),
    image: httpsUrl.optional(),
    target: z.object({ entity: id.optional(), action: id.optional(), page: id.optional(), values: values.optional() }).strict().optional(),
    items: z.array(z.object({ label: text(40), icon, entity: id.optional(), action: id.optional(), values: values.optional() }).strict()).max(16).optional(),
    /** Per-section look. */
    style: z
      .object({
        background: color,
        color,
        padding: z.number().min(0).max(48),
        radius: z.number().min(0).max(40),
        align: z.enum(['start', 'center', 'end']),
        shadow: z.boolean(),
        fullBleed: z.boolean(),
        hideTitle: z.boolean(),
      })
      .partial()
      .strict()
      .optional(),
    /** `code` sections: HTML/CSS/JS run in a sandboxed frame (no access to the page, cookies or storage). */
    code: z.object({ html: z.string().max(CODE_MAX), css: z.string().max(CODE_MAX), js: z.string().max(CODE_MAX), height: z.number().int().min(40).max(2000) }).partial().strict().optional(),
    /** `video` sections: an https video file. */
    video: httpsUrl.optional(),
  })
  .strict();

export const customizationSchema = z
  .object({
    v: z.literal(1),
    theme: z
      .object({
        mode: z.enum(['light', 'dark']),
        primary: color,
        accent: color,
        background: color,
        surface: color,
        text: color,
        muted: color,
        radius: z.number().min(0).max(40),
        style: z.enum(STYLES),
        font: z.enum(FONTS),
        headingFont: z.enum(FONTS),
        density: z.enum(['compact', 'comfortable', 'spacious']),
        tabStyle: z.enum(['floating', 'docked', 'minimal']),
        headerStyle: z.enum(['large', 'centered', 'compact']),
        cardStyle: z.enum(['shadow', 'outline', 'flat', 'glass']),
        scale: z.number().min(0.8).max(1.3),
        iconStyle: z.enum(['filled', 'outlined', 'rounded', 'sharp', 'twotone']),
        template: text(60),
      })
      .partial()
      .strict()
      .optional(),
    brand: z.object({ name: text(60), tagline: text(120), icon, logo: z.union([httpsUrl, z.literal('')]) }).partial().strict().optional(),
    dir: z.enum(['ltr', 'rtl']).optional(),
    /** Custom CSS for the whole app (scoped to it). */
    css: css.optional(),
    /** The phone the design is presented on (viewers can still switch). */
    device: z
      .object({
        model: z.enum(['iphone16pm', 'iphone15', 'iphonese', 'pixel8', 'galaxy', 'fold', 'ipadmini', 'tablet', 'custom']),
        frame: color,
        orientation: z.enum(['portrait', 'landscape']),
        cutout: z.enum(['auto', 'island', 'notch', 'punch', 'none']),
        frameless: z.boolean(),
        width: z.number().int().min(280).max(1400),
        height: z.number().int().min(400).max(1600),
      })
      .partial()
      .strict()
      .optional(),
    tabs: z.array(z.object({ id, label: text(30), icon, screen: text(160), hidden: z.boolean().optional() }).strict()).max(8).optional(),
    home: z.array(section).max(40).optional(),
    pages: z.array(z.object({ id, title: text(60), icon, sections: z.array(section).max(40) }).strict()).max(10).optional(),
    entities: z.record(id, z.object({ label: text(40), plural: text(40), icon, card: z.enum(CARDS), roles }).partial().strict()).optional(),
    ctas: z.record(id, z.object({ label: text(40), hidden: z.boolean() }).partial().strict()).optional(),
  })
  .strict()
  .refine((v) => Buffer.byteLength(JSON.stringify(v)) <= MAX_BYTES, `A design can be at most ${MAX_BYTES / 1024} KB`);

export type Customization = z.infer<typeof customizationSchema>;

export const saveDesignSchema = z.object({ customization: customizationSchema.nullable() });
export const publishRemixSchema = z.object({
  name: z.string().trim().min(1).max(80),
  author: z.string().trim().max(60).optional(),
  customization: customizationSchema,
});
