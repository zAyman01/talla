export interface Lab {
  readonly L: number;
  readonly a: number;
  readonly b: number;
}
const rad = Math.PI / 180;
const cos = (degrees: number): number => Math.cos(degrees * rad);
const sin = (degrees: number): number => Math.sin(degrees * rad);

/** CIEDE2000, kL=kC=kH=1. Sharma, Wu, Dalal (2005), equations 2–22. */
export function deltaE00(first: Lab, second: Lab): number {
  for (const c of [first, second]) {
    if (
      ![c.L, c.a, c.b].every(Number.isFinite) ||
      c.L < 0 ||
      c.L > 100 ||
      c.a < -128 ||
      c.a > 127 ||
      c.b < -128 ||
      c.b > 127
    )
      throw new Error('Invalid CIELAB measurement');
  }
  const c1 = Math.hypot(first.a, first.b);
  const c2 = Math.hypot(second.a, second.b);
  const meanC7 = ((c1 + c2) / 2) ** 7;
  const g = 0.5 * (1 - Math.sqrt(meanC7 / (meanC7 + 25 ** 7)));
  const a1 = (1 + g) * first.a;
  const a2 = (1 + g) * second.a;
  const cp1 = Math.hypot(a1, first.b);
  const cp2 = Math.hypot(a2, second.b);
  const hue = (a: number, b: number): number => (Math.atan2(b, a) / rad + 360) % 360;
  const h1 = hue(a1, first.b);
  const h2 = hue(a2, second.b);
  const dl = second.L - first.L;
  const dc = cp2 - cp1;
  let dh = h2 - h1;
  if (cp1 * cp2 === 0) dh = 0;
  else if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(cp1 * cp2) * sin(dh / 2);
  const meanL = (first.L + second.L) / 2;
  const meanC = (cp1 + cp2) / 2;
  let meanH = (h1 + h2) / 2;
  if (cp1 * cp2 === 0) meanH = h1 + h2;
  else if (Math.abs(h1 - h2) > 180) meanH += h1 + h2 < 360 ? 180 : -180;
  const t =
    1 -
    0.17 * cos(meanH - 30) +
    0.24 * cos(2 * meanH) +
    0.32 * cos(3 * meanH + 6) -
    0.2 * cos(4 * meanH - 63);
  const sl = 1 + (0.015 * (meanL - 50) ** 2) / Math.sqrt(20 + (meanL - 50) ** 2);
  const sc = 1 + 0.045 * meanC;
  const sh = 1 + 0.015 * meanC * t;
  const rt =
    -2 *
    Math.sqrt(meanC ** 7 / (meanC ** 7 + 25 ** 7)) *
    sin(60 * Math.exp(-(((meanH - 275) / 25) ** 2)));
  return Math.sqrt(
    (dl / sl) ** 2 + (dc / sc) ** 2 + (dH / sh) ** 2 + rt * (dc / sc) * (dH / sh),
  );
}
