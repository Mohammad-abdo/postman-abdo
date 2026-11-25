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

export const SECTION_TYPES = ['auto', 'greeting', 'search', 'hero', 'chips', 'grid', 'rail', 'list', 'stats', 'map', 'status', 'balance', 'shortcuts', 'feed', 'text', 'image', 'button', 'banner', 'spacer', 'code', 'form', 'divider', 'video', 'insights', 'faq', 'gallery', 'countdown', 'metrics'] as const;
export const CARDS = ['product', 'venue', 'course', 'order', 'person', 'post', 'trip', 'transaction', 'article', 'event', 'banner', 'chip', 'tile'] as const;
export const STYLES = ['soft', 'bold', 'minimal', 'playful', 'glass', 'elegant', 'brutal', 'neon', 'classic'] as const;

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
    /** Who sees the section: everyone, signed-in people or guests. */
    visibility: z.enum(['all', 'signedIn', 'guest']).optional(),
    /** Entrance animation of the section. */
    animate: z.enum(['none', 'fade', 'slide', 'pop']).optional(),
    /** How an `auto` list is drawn; `auto` lets the data decide. */
    present: z.enum(['auto', 'cards', 'chart', 'board', 'timeline', 'agenda', 'table', 'masonry', 'chat', 'ranking']).optional(),
    /** Shown only when the rule holds: `field` is `count`, `me.<field>` or a field of the section's first row. */
    showIf: z.object({ field: text(80), op: z.enum(['eq', 'neq', 'contains', 'gt', 'lt', 'empty', 'notEmpty']), value: text(100).optional() }).strict().optional(),
    /** A written rule such as `count > 0 && me.role == "vip"` (names: count, me.<field>, fields of the first row). */
    showExpr: text(300).optional(),
    /** A/B experiment: only visitors in this bucket see the section. */
    variant: z.enum(['A', 'B']).optional(),
    /** Which screens show it: phones, or wide screens (tablets, foldables). */
    device: z.enum(['all', 'phone', 'wide']).optional(),
    /** Hidden from the running app (still editable in the studio). */
    hidden: z.boolean().optional(),
    /** Fixed request values (query/path inputs) sent when the section loads its endpoint. */
    values: values.optional(),
    /** Only rows that match, sorted this way (applied on the device, on whatever the endpoint returns). */
    where: z.array(z.object({ field: text(60), op: z.enum(['eq', 'neq', 'contains', 'gt', 'lt']), value: text(100) }).strict()).max(3).optional(),
    sort: z.object({ by: text(60), dir: z.enum(['asc', 'desc']) }).strict().optional(),
    /** How a list's items are laid out and drawn: circles in a row, a stacked list, a wrapped grid… */
    look: z
      .object({
        layout: z.enum(['scroll', 'stack', 'grid', 'wrap']),
        shape: z.enum(['default', 'circle', 'square', 'pill', 'card', 'banner']),
        size: z.enum(['sm', 'md', 'lg']),
        columns: z.number().int().min(1).max(4),
        gap: z.number().min(0).max(32),
        aspect: z.enum(['1:1', '4:3', '16:9', '3:4']),
        fit: z.enum(['cover', 'contain']),
        hide: z.array(z.enum(['image', 'title', 'subtitle', 'price', 'rating', 'status', 'date'])).max(7),
      })
      .partial()
      .strict()
      .optional(),
    columns: z.number().int().min(1).max(3).optional(),
    body: text(1000).optional(),
    image: httpsUrl.optional(),
    target: z.object({ entity: id.optional(), action: id.optional(), page: id.optional(), values: values.optional() }).strict().optional(),
    items: z.array(z.object({ label: text(40), icon, entity: id.optional(), action: id.optional(), values: values.optional() }).strict()).max(16).optional(),
    /** Per-section look. */
    style: z
      .object({
        background: color,
        /** Second colour: the background becomes a gradient from `background` to this. */
        background2: color,
        color,
        border: z.boolean(),
        padding: z.number().min(0).max(48),
        marginTop: z.number().min(0).max(80),
        marginBottom: z.number().min(0).max(80),
        opacity: z.number().min(0.1).max(1),
        minHeight: z.number().min(0).max(600),
        titleSize: z.number().min(10).max(34),
        borderColor: color,
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
    /** `faq`: questions and answers. */
    qa: z.array(z.object({ q: text(200), a: text(1000) }).strict()).max(20).optional(),
    /** `gallery`: https images. */
    images: z.array(httpsUrl).max(12).optional(),
    /** `countdown`: the moment it counts down to (ISO date-time). */
    until: text(40).optional(),
    /** `metrics`: key numbers typed by hand. */
    metrics: z.array(z.object({ label: text(40), value: text(40) }).strict()).max(8).optional(),
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
        transition: z.enum(['slide', 'fade', 'zoom', 'none']),
        buttonStyle: z.enum(['rounded', 'pill', 'square']),
        motion: z.enum(['none', 'subtle', 'lively']),
        pattern: z.enum(['none', 'dots', 'grid', 'waves']),
        gradient: z.enum(['none', 'soft', 'vivid']),
        iconStyle: z.enum(['filled', 'outlined', 'rounded', 'sharp', 'twotone']),
        template: text(60),
      })
      .partial()
      .strict()
      .optional(),
    brand: z.object({ name: text(60), tagline: text(120), icon, logo: z.union([httpsUrl, z.literal('')]) }).partial().strict().optional(),
    dir: z.enum(['ltr', 'rtl']).optional(),
    /** A/B experiment: the share of visitors (percent) who land in variant A. */
    ab: z.object({ name: text(40), split: z.number().int().min(5).max(95) }).partial().strict().optional(),
    /** The screen shown while the app opens. `duration` in ms (0 skips it). */
    splash: z.object({ style: z.enum(['brand', 'gradient', 'minimal']), duration: z.number().int().min(0).max(4000) }).partial().strict().optional(),
    /** The sign-in screen. */
    login: z
      .object({
        title: text(60),
        subtitle: text(120),
        hint: text(160),
        image: httpsUrl,
        style: z.enum(['split', 'plain', 'cover']),
        guest: z.boolean(),
      })
      .partial()
      .strict()
      .optional(),
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
    tabs: z
      .array(
        z
          .object({
            id,
            label: text(30),
            icon,
            screen: text(160),
            hidden: z.boolean().optional(),
            /** A badge on the tab: a dot, a fixed text, or the number of rows an endpoint returns. */
            badge: z.object({ mode: z.enum(['count', 'dot', 'text']), action: id.optional(), text: text(6).optional(), hideZero: z.boolean().optional() }).strict().optional(),
          })
          .strict()
      )
      .max(8)
      .optional(),
    home: z.array(section).max(40).optional(),
    pages: z.array(z.object({ id, title: text(60), icon, background: color.optional(), hideHeader: z.boolean().optional(), sections: z.array(section).max(40) }).strict()).max(10).optional(),
    entities: z.record(id, z.object({ label: text(40), plural: text(40), icon, card: z.enum(CARDS), roles,
          hiddenFields: z.array(text(60)).max(80),
          fieldLabels: z.record(text(60), text(40)),
          /** Item page: order and visibility of its parts, picture and button style. */
          detail: z
            .object({
              order: z.array(z.enum(['image', 'head', 'address', 'description', 'lines', 'info', 'related'])).max(7),
              hide: z.array(z.enum(['image', 'head', 'address', 'description', 'lines', 'info', 'related'])).max(7),
              image: z.enum(['full', 'inset']),
              cta: z.enum(['bar', 'inline']),
            })
            .partial()
            .strict(),
          /** Browse screen: layout and which tools show. */
          list: z.object({ layout: z.enum(['grid', 'row']), columns: z.number().int().min(1).max(4), search: z.boolean(), filters: z.boolean(), segments: z.boolean(), fab: z.boolean() }).partial().strict(),
        })
        .partial()
        .strict()
    )
    .optional(),
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
