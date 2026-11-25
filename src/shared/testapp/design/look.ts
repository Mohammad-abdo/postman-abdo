/**
 * Visual identity of a generated app: a style preset (shape, shadows, navigation), a palette and
 * fonts. Every business type has several looks; the collection picks one deterministically, so
 * two shops do not look identical but the same collection always looks the same.
 */
import type { DesignTheme, DomainId, ThemeStyle } from './design.types';

/** Fonts the renderer can load (Google Fonts). Arabic-capable families are listed last. */
export const FONTS = ['Inter', 'Poppins', 'DM Sans', 'Manrope', 'Nunito', 'Lexend', 'Figtree', 'Space Grotesk', 'Outfit', 'Plus Jakarta Sans', 'Rubik', 'Barlow', 'Sora', 'Urbanist', 'Playfair Display', 'Merriweather', 'Cairo', 'Tajawal', 'IBM Plex Sans Arabic', 'Almarai'] as const;

/** What each preset sets besides colours. */
export const PRESETS: Record<ThemeStyle, Partial<DesignTheme>> = {
  soft: { radius: 18, cardStyle: 'shadow', tabStyle: 'floating', headerStyle: 'large', density: 'comfortable' },
  bold: { radius: 14, cardStyle: 'shadow', tabStyle: 'docked', headerStyle: 'large', density: 'comfortable' },
  minimal: { radius: 10, cardStyle: 'outline', tabStyle: 'docked', headerStyle: 'compact', density: 'comfortable' },
  playful: { radius: 24, cardStyle: 'shadow', tabStyle: 'floating', headerStyle: 'large', density: 'spacious' },
  glass: { radius: 22, cardStyle: 'glass', tabStyle: 'floating', headerStyle: 'large', density: 'comfortable' },
  elegant: { radius: 4, cardStyle: 'flat', tabStyle: 'minimal', headerStyle: 'centered', density: 'spacious' },
  brutal: { radius: 6, cardStyle: 'outline', tabStyle: 'docked', headerStyle: 'compact', density: 'comfortable' },
  neon: { radius: 16, cardStyle: 'glass', tabStyle: 'floating', headerStyle: 'large', density: 'comfortable' },
  classic: { radius: 12, cardStyle: 'shadow', tabStyle: 'docked', headerStyle: 'compact', density: 'compact' },
};

interface Look {
  style: ThemeStyle;
  primary: string;
  accent: string;
  font: string;
  headingFont?: string;
  mode?: 'light' | 'dark';
}

const LOOKS: Record<DomainId, Look[]> = {
  commerce: [
    { style: 'soft', primary: '#F2542D', accent: '#0E9F6E', font: 'Poppins' },
    { style: 'minimal', primary: '#111827', accent: '#E11D48', font: 'DM Sans' },
    { style: 'glass', primary: '#7C3AED', accent: '#F59E0B', font: 'Outfit' },
  ],
  food: [
    { style: 'playful', primary: '#E23744', accent: '#F59E0B', font: 'Nunito' },
    { style: 'soft', primary: '#FF5A00', accent: '#16A34A', font: 'Rubik' },
    { style: 'bold', primary: '#00A082', accent: '#FFC244', font: 'Plus Jakarta Sans' },
  ],
  delivery: [
    { style: 'bold', primary: '#22C55E', accent: '#FACC15', font: 'Manrope', mode: 'dark' },
    { style: 'neon', primary: '#38BDF8', accent: '#F472B6', font: 'Sora', mode: 'dark' },
    { style: 'classic', primary: '#F97316', accent: '#0EA5E9', font: 'Barlow' },
  ],
  ride: [
    { style: 'minimal', primary: '#111111', accent: '#276EF1', font: 'Inter' },
    { style: 'bold', primary: '#00B14F', accent: '#111827', font: 'Manrope' },
    { style: 'neon', primary: '#A3E635', accent: '#22D3EE', font: 'Space Grotesk', mode: 'dark' },
  ],
  education: [
    { style: 'playful', primary: '#4F46E5', accent: '#F59E0B', font: 'Lexend' },
    { style: 'soft', primary: '#0EA5E9', accent: '#F43F5E', font: 'Nunito' },
    { style: 'classic', primary: '#7C3AED', accent: '#10B981', font: 'Figtree' },
  ],
  social: [
    { style: 'playful', primary: '#E1306C', accent: '#833AB4', font: 'Figtree' },
    { style: 'glass', primary: '#6366F1', accent: '#EC4899', font: 'Outfit' },
    { style: 'neon', primary: '#F472B6', accent: '#A78BFA', font: 'Sora', mode: 'dark' },
  ],
  booking: [
    { style: 'soft', primary: '#E11D48', accent: '#0EA5E9', font: 'Plus Jakarta Sans' },
    { style: 'elegant', primary: '#0F766E', accent: '#B45309', font: 'DM Sans', headingFont: 'Playfair Display' },
    { style: 'glass', primary: '#0284C7', accent: '#F59E0B', font: 'Urbanist' },
  ],
  finance: [
    { style: 'minimal', primary: '#1D4ED8', accent: '#10B981', font: 'Inter' },
    { style: 'glass', primary: '#6D28D9', accent: '#22D3EE', font: 'Sora' },
    { style: 'neon', primary: '#10B981', accent: '#A3E635', font: 'Space Grotesk', mode: 'dark' },
  ],
  health: [
    { style: 'soft', primary: '#0D9488', accent: '#6366F1', font: 'Figtree' },
    { style: 'minimal', primary: '#2563EB', accent: '#14B8A6', font: 'Inter' },
    { style: 'playful', primary: '#EC4899', accent: '#06B6D4', font: 'Nunito' },
  ],
  realestate: [
    { style: 'elegant', primary: '#0F766E', accent: '#B45309', font: 'DM Sans', headingFont: 'Playfair Display' },
    { style: 'soft', primary: '#1E3A8A', accent: '#F59E0B', font: 'Manrope' },
    { style: 'minimal', primary: '#111827', accent: '#059669', font: 'Urbanist' },
  ],
  news: [
    { style: 'elegant', primary: '#111827', accent: '#DC2626', font: 'Inter', headingFont: 'Merriweather' },
    { style: 'minimal', primary: '#B91C1C', accent: '#111827', font: 'DM Sans' },
    { style: 'classic', primary: '#0F172A', accent: '#2563EB', font: 'Figtree', headingFont: 'Playfair Display' },
  ],
  tasks: [
    { style: 'minimal', primary: '#2563EB', accent: '#7C3AED', font: 'Inter' },
    { style: 'brutal', primary: '#111111', accent: '#FDE047', font: 'Space Grotesk' },
    { style: 'soft', primary: '#7C3AED', accent: '#F97316', font: 'Plus Jakarta Sans' },
  ],
  events: [
    { style: 'playful', primary: '#7C3AED', accent: '#F43F5E', font: 'Outfit' },
    { style: 'neon', primary: '#F472B6', accent: '#FACC15', font: 'Sora', mode: 'dark' },
    { style: 'brutal', primary: '#111111', accent: '#FF4D00', font: 'Space Grotesk' },
  ],
  automotive: [
    { style: 'bold', primary: '#1E40AF', accent: '#F59E0B', font: 'Barlow' },
    { style: 'neon', primary: '#FACC15', accent: '#38BDF8', font: 'Space Grotesk', mode: 'dark' },
    { style: 'classic', primary: '#B91C1C', accent: '#111827', font: 'Manrope' },
  ],
  fitness: [
    { style: 'neon', primary: '#A3E635', accent: '#F97316', font: 'Space Grotesk', mode: 'dark' },
    { style: 'bold', primary: '#F97316', accent: '#111827', font: 'Barlow' },
    { style: 'playful', primary: '#06B6D4', accent: '#F43F5E', font: 'Outfit' },
  ],
  beauty: [
    { style: 'elegant', primary: '#9D174D', accent: '#B45309', font: 'DM Sans', headingFont: 'Playfair Display' },
    { style: 'soft', primary: '#DB2777', accent: '#8B5CF6', font: 'Figtree' },
    { style: 'glass', primary: '#C026D3', accent: '#F59E0B', font: 'Urbanist' },
  ],
  travel: [
    { style: 'glass', primary: '#0284C7', accent: '#F97316', font: 'Plus Jakarta Sans' },
    { style: 'soft', primary: '#0E7490', accent: '#EAB308', font: 'Outfit' },
    { style: 'elegant', primary: '#1E3A8A', accent: '#B45309', font: 'DM Sans', headingFont: 'Playfair Display' },
  ],
  jobs: [
    { style: 'minimal', primary: '#0A66C2', accent: '#16A34A', font: 'Inter' },
    { style: 'soft', primary: '#4F46E5', accent: '#F59E0B', font: 'Manrope' },
    { style: 'brutal', primary: '#111111', accent: '#22C55E', font: 'Space Grotesk' },
  ],
  media: [
    { style: 'neon', primary: '#1DB954', accent: '#A78BFA', font: 'Figtree', mode: 'dark' },
    { style: 'bold', primary: '#E50914', accent: '#F59E0B', font: 'Outfit', mode: 'dark' },
    { style: 'glass', primary: '#8B5CF6', accent: '#EC4899', font: 'Sora' },
  ],
  business: [
    { style: 'minimal', primary: '#2563EB', accent: '#0EA5E9', font: 'Inter' },
    { style: 'classic', primary: '#0F766E', accent: '#7C3AED', font: 'IBM Plex Sans Arabic' },
    { style: 'soft', primary: '#4338CA', accent: '#F59E0B', font: 'Plus Jakarta Sans' },
  ],
  generic: [
    { style: 'soft', primary: '#FF6C37', accent: '#0EA5E9', font: 'Inter' },
    { style: 'minimal', primary: '#2563EB', accent: '#F59E0B', font: 'DM Sans' },
    { style: 'glass', primary: '#7C3AED', accent: '#14B8A6', font: 'Outfit' },
  ],
};

const SURFACES = {
  light: { background: '#F5F6F8', surface: '#FFFFFF', text: '#111827', muted: '#6B7280' },
  dark: { background: '#0B0F14', surface: '#161C25', text: '#F3F4F6', muted: '#94A3B8' },
};
const STYLE_SURFACES: Partial<Record<ThemeStyle, Partial<typeof SURFACES.light>>> = {
  elegant: { background: '#FAF8F5', surface: '#FFFFFF', text: '#1C1917', muted: '#78716C' },
  brutal: { background: '#FFFDF5', surface: '#FFFFFF', text: '#111111', muted: '#52525B' },
  minimal: { background: '#FFFFFF', surface: '#F7F7F8' },
};

function hash(text: string) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/* Every collection gets its own variation of its business type's look: hue, saturation, style, fonts and surface tint all move with
   a seed taken from the collection's name and content, so two shops (or two unknown APIs) no longer share one design. */

const SERIOUS: DomainId[] = ['finance', 'news', 'business', 'realestate', 'health', 'jobs', 'tasks', 'education'];
const STYLE_POOL: Record<'light' | 'dark' | 'serious', ThemeStyle[]> = {
  light: ['soft', 'bold', 'minimal', 'playful', 'glass', 'elegant', 'classic', 'brutal'],
  dark: ['bold', 'neon', 'glass', 'classic', 'minimal'],
  serious: ['soft', 'minimal', 'classic', 'elegant', 'bold', 'glass'],
};
const FONT_POOL: Record<ThemeStyle, string[]> = {
  soft: ['Poppins', 'Nunito', 'Figtree', 'Plus Jakarta Sans', 'DM Sans'],
  bold: ['Manrope', 'Barlow', 'Outfit', 'Sora', 'Rubik'],
  minimal: ['Inter', 'DM Sans', 'Urbanist', 'Figtree', 'Manrope'],
  playful: ['Nunito', 'Outfit', 'Lexend', 'Rubik', 'Poppins'],
  glass: ['Outfit', 'Urbanist', 'Sora', 'Plus Jakarta Sans', 'Manrope'],
  elegant: ['DM Sans', 'Inter', 'Figtree', 'Manrope'],
  brutal: ['Space Grotesk', 'Barlow', 'Sora', 'Rubik'],
  neon: ['Space Grotesk', 'Sora', 'Outfit', 'Lexend'],
  classic: ['Figtree', 'Manrope', 'Barlow', 'Inter', 'Rubik'],
};
const HEADING_SERIF = ['Playfair Display', 'Merriweather'];

const clampN = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
function hslOf(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return [0, 0, l];
  const sat = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, sat, l];
}
function fromHsl(h: number, sat: number, l: number) {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * sat;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x] : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x];
  return toHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}
/** Lightens a colour until dark button text reads on it (used for dark-mode looks). */
const readableOnDark = (hex: string) => {
  const [h, sat, l0] = hslOf(hex);
  let l = l0;
  let out = hex;
  for (let i = 0; i < 20 && ratio('#04120A', out) < 3; i++) out = fromHsl(h, sat, (l = Math.min(0.9, l + 0.04)));
  return out;
};

/** The look for a collection: its business type's look, varied by a seed from the collection so each one is its own design. */
export function pickLook(domain: DomainId, seed: string, rtl: boolean): DesignTheme {
  const looks = LOOKS[domain] || LOOKS.generic;
  const h = hash(seed);
  const base = looks[h % looks.length];
  const bits = (shift: number, mod: number) => (h >>> shift) % mod;

  // style: usually a different one from the domain's pool; the domain's own favourite stays likely
  const mode = base.mode || 'light';
  const pool = STYLE_POOL[mode === 'dark' ? 'dark' : SERIOUS.includes(domain) ? 'serious' : 'light'];
  const style: ThemeStyle = bits(3, 4) === 0 ? base.style : pool[bits(6, pool.length)];

  // colours: keep the domain's mood but move the hue, saturation and depth
  const [ph, ps, pl] = hslOf(base.primary);
  const [ah, as, al] = hslOf(base.accent);
  const shift = bits(9, 91) - 45;
  const primaryHue = ph + shift;
  const sat = clampN(ps + (bits(14, 21) - 10) / 100, 0.35, 0.92);
  const lit = clampN(pl + (bits(18, 17) - 8) / 100, mode === 'dark' ? 0.5 : 0.3, mode === 'dark' ? 0.72 : 0.52);
  let primary = fromHsl(primaryHue, sat, lit);
  primary = mode === 'dark' ? readableOnDark(primary) : readableOnWhite(primary);
  const accent = fromHsl(primaryHue + (((ah - ph + 540) % 360) - 180) + (bits(22, 31) - 15), clampN(as + (bits(26, 15) - 7) / 100, 0.4, 0.92), clampN(al, 0.4, 0.62));

  // surfaces: a faint tint of the primary hue so light apps are not all the same grey
  const [tintHue] = hslOf(primary);
  const surfaces = { ...SURFACES[mode], ...(mode === 'light' ? STYLE_SURFACES[style] : {}) };
  if (mode === 'light' && !STYLE_SURFACES[style]?.background) surfaces.background = fromHsl(tintHue, 0.28, 0.965);
  if (mode === 'dark') surfaces.background = fromHsl(tintHue, 0.22, 0.065);
  if (mode === 'dark') surfaces.surface = fromHsl(tintHue, 0.2, 0.105);

  // fonts: one family per collection from the style's pool, a serif heading for the elegant look sometimes
  const fonts = FONT_POOL[style];
  const font = fonts[bits(2, fonts.length)];
  const headingFont = style === 'elegant' && bits(12, 2) === 0 ? HEADING_SERIF[bits(13, 2)] : bits(5, 5) === 0 ? fonts[bits(8, fonts.length)] : undefined;

  const preset = PRESETS[style];
  const radius = clampN((preset.radius ?? 16) + (bits(20, 9) - 4), 0, 28);
  return {
    mode,
    primary,
    accent,
    ...surfaces,
    radius,
    style,
    font: rtl ? 'Cairo' : font,
    headingFont: rtl ? 'Cairo' : headingFont,
    density: preset.density,
    tabStyle: preset.tabStyle,
    headerStyle: preset.headerStyle,
    cardStyle: preset.cardStyle,
    scale: 1,
  };
}

/** Collections whose request and folder names are mostly Arabic get a right-to-left app. */
export function isRtl(texts: string[]) {
  const all = texts.join(' ');
  const arabic = (all.match(/[؀-ۿ]/g) || []).length;
  const latin = (all.match(/[A-Za-z]/g) || []).length;
  return arabic > 20 && arabic > latin * 0.6;
}

/* ------------------------------------ brand colours from the collection ------------------------------------ */

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const BRAND_KEY = /(brand|primary|accent|theme|main|secondary|app)[-_ ]?colou?r|^(brand|primary|accent|theme)$/i;
const PLAIN_COLOR_KEY = /^colou?r$/i;
const CONFIG_PATH = /(theme|brand|config|setting|appearance|style|branding|app-?info|about)/i;

const full = (h: string) => (h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h).toUpperCase();
const rgbOf = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (h: string) => {
  const [r, g, b] = rgbOf(h).map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const toHex = (rgb: number[]) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
/** Darkens a colour step by step until white text reads on it (contrast 3:1 or better). */
const readableOnWhite = (hex: string) => {
  let rgb = rgbOf(hex);
  for (let i = 0; i < 20 && ratio('#FFFFFF', toHex(rgb)) < 3; i++) rgb = rgb.map((v) => v * 0.9);
  return toHex(rgb);
};
const rotate = (hex: string, deg: number) => {
  const [r, g, b] = rgbOf(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return hex;
  const s = d / (1 - Math.abs(2 * l - 1));
  const h0 = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const h = (h0 * 60 + deg + 720) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [rr, gg, bb] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return toHex([(rr + m) * 255, (gg + m) * 255, (bb + m) * 255]);
};

/**
 * Colours the collection itself declares (a brand/theme/config response with `primaryColor`, `brand_color`, `accent`…).
 * Plain `color` fields only count on theme/brand/config-like endpoints, so a product's colour never becomes the app's.
 */
export function brandColorsOf(model: { endpoints: { path: string; name: string; examples: { body?: unknown }[]; body: { example?: unknown } }[] }): { primary: string; accent: string } | null {
  const found = new Map<string, number>();
  const accents: string[] = [];
  const walk = (v: unknown, configLike: boolean, depth = 0) => {
    if (depth > 6 || v == null) return;
    if (Array.isArray(v)) return v.slice(0, 5).forEach((x) => walk(x, configLike, depth + 1));
    if (typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (typeof x === 'string' && HEX.test(x.trim()) && (BRAND_KEY.test(k) || (configLike && PLAIN_COLOR_KEY.test(k)))) {
        const hex = full(x.trim());
        if (/accent|secondary/i.test(k)) accents.push(hex);
        else found.set(hex, (found.get(hex) || 0) + 1);
      } else walk(x, configLike, depth + 1);
    }
  };
  for (const e of model.endpoints) {
    const configLike = CONFIG_PATH.test(`${e.path} ${e.name}`);
    e.examples.forEach((x) => walk(x.body, configLike));
    walk(e.body.example, configLike);
  }
  const primaryRaw = [...found.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!primaryRaw) return null;
  // skip near-white and near-black "brand" colours: they cannot carry buttons
  if (lum(primaryRaw) > 0.85 || lum(primaryRaw) < 0.005) return null;
  const primary = readableOnWhite(primaryRaw);
  return { primary, accent: accents[0] || rotate(primary, 35) };
}
