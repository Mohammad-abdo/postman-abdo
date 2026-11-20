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

/** The look for a collection: one of its business type's looks, picked by the collection's name. */
export function pickLook(domain: DomainId, seed: string, rtl: boolean): DesignTheme {
  const looks = LOOKS[domain] || LOOKS.generic;
  const look = looks[hash(seed) % looks.length];
  const mode = look.mode || 'light';
  const surfaces = { ...SURFACES[mode], ...(mode === 'light' ? STYLE_SURFACES[look.style] : {}) };
  const preset = PRESETS[look.style];
  return {
    mode,
    primary: look.primary,
    accent: look.accent,
    ...surfaces,
    radius: preset.radius ?? 16,
    style: look.style,
    font: rtl ? 'Cairo' : look.font,
    headingFont: rtl ? 'Cairo' : look.headingFont,
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
