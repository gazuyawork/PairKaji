// src/components/todo/parts/utils/todoTime.ts
export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export const toMinutes = (hhmm?: string | null) => {
  if (!hhmm || typeof hhmm !== 'string') return 0;
  const [hh = '0', mm = '0'] = hhmm.split(':');
  const m = Number(hh) * 60 + Number(mm);
  return Math.max(0, Math.min(24 * 60, isFinite(m) ? m : 0));
};

export const toDayRatio = (hhmm?: string | null) => {
  if (!hhmm || typeof hhmm !== 'string') return 0;
  const [h = '0', m = '0'] = hhmm.split(':');
  const total = Number(h) * 60 + Number(m);
  const ratio = total / (24 * 60);
  return clamp01(ratio);
};

const TIME_COLOR_STOPS = [
  { h: 0, color: '#6D28D9' },  // purple-700
  { h: 6, color: '#3B82F6' },  // blue-500
  { h: 12, color: '#60A5FA' }, // blue-400
  { h: 17, color: '#FB923C' }, // orange-400
  { h: 20, color: '#8B5CF6' }, // purple-500
  { h: 24, color: '#491898' },
];

const hexToRgb = (hex: string) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
};
const rgbToHex = ({ r, g, b }: { r: number; g: number; b: number }) =>
  '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpColor = (c1: string, c2: string, t: number) => {
  const a = hexToRgb(c1);
  const b = hexToRgb(c2);
  return rgbToHex({ r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) });
};

const pickColorAtMinute = (minute: number) => {
  const h = minute / 60;
  for (let i = 0; i < TIME_COLOR_STOPS.length - 1; i++) {
    const a = TIME_COLOR_STOPS[i];
    const b = TIME_COLOR_STOPS[i + 1];
    if (h >= a.h && h <= b.h) {
      const t = (h - a.h) / (b.h - a.h || 1);
      return lerpColor(a.color, b.color, t);
    }
  }
  return TIME_COLOR_STOPS[TIME_COLOR_STOPS.length - 1].color;
};

export const makeTimeRangeGradient = (startHHMM?: string | null, endHHMM?: string | null) => {
  const sMin = toMinutes(startHHMM);
  const eMin = toMinutes(endHHMM);
  if (!(eMin > sMin)) {
    return 'linear-gradient(90deg, #FFA366 0%, #FFCD7D 100%)';
  }

  const boundariesH = [6, 12, 17, 20];
  const inRangeBoundaries = boundariesH
    .map((h) => h * 60)
    .filter((m) => m > sMin && m < eMin);

  const stopsMin = [sMin, ...inRangeBoundaries, eMin];
  const span = eMin - sMin;
  const stops = stopsMin.map((m) => {
    const pct = ((m - sMin) / span) * 100;
    return { pct, color: pickColorAtMinute(m) };
  });

  const pieces = stops.map((s) => `${s.color} ${s.pct.toFixed(2)}%`);
  return `linear-gradient(90deg, ${pieces.join(', ')})`;
};
