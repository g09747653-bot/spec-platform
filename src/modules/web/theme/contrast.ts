/**
 * Colour maths for the token contrast gate (task 124).
 *
 * The palette is authored in OKLCH because that is what ships in `src/app/brand.css`; WCAG is
 * defined over sRGB relative luminance. This module is the bridge, and it exists so the contrast
 * assertion can be made against the values the browser actually paints rather than against a
 * hand-kept table of "what we think these colours look like".
 *
 * Out-of-gamut OKLCH is clamped the way a browser clamps it: convert, gamma-encode, clip each
 * channel to [0, 1], then linearise the clipped value back. Skipping the round trip would score a
 * colour the display cannot show.
 */

export interface Oklch {
  /** Perceptual lightness, 0–1. */
  readonly l: number;
  /** Chroma, 0–0.4-ish. */
  readonly c: number;
  /** Hue angle in degrees. */
  readonly h: number;
}

/** Parses the `oklch(62.3% 0.14 252)` spelling used in the brand file. */
export function parseOklch(value: string): Oklch | null {
  const match = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(value.trim());
  if (!match) return null;

  return { l: Number(match[1]) / 100, c: Number(match[2]), h: Number(match[3]) };
}

/** OKLCH → linear-light sRGB, clipped to the displayable cube. */
function toLinearSrgb({ l, c, h }: Oklch): [number, number, number] {
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const lCone = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mCone = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sCone = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const linear: [number, number, number] = [
    4.0767416621 * lCone - 3.3077115913 * mCone + 0.2309699292 * sCone,
    -1.2684380046 * lCone + 2.6097574011 * mCone - 0.3413193965 * sCone,
    -0.0041960863 * lCone - 0.7034186147 * mCone + 1.707614701 * sCone,
  ];

  // Clip through the encoded space, as a display does.
  return linear.map((channel) => decode(clamp(encode(channel)))) as [number, number, number];
}

function encode(channel: number): number {
  return channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;
}

function decode(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function clamp(channel: number): number {
  return Math.min(1, Math.max(0, channel));
}

/** WCAG 2.1 relative luminance. */
export function relativeLuminance(colour: Oklch): number {
  const [r, g, b] = toLinearSrgb(colour);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio, 1–21. */
export function contrastRatio(foreground: Oklch, background: Oklch): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [lighter, darker] = a > b ? [a, b] : [b, a];

  return (lighter + 0.05) / (darker + 0.05);
}

/** The two thresholds this project asserts: body text and large text / UI boundaries. */
export const WCAG_AA_TEXT = 4.5;
export const WCAG_AA_LARGE = 3;
