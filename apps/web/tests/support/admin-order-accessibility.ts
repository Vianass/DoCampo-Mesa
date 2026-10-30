import { expect, type Page } from '@playwright/test';
/** Verificação calculada no Chrome; não substitui avaliação audível ou certificação WCAG. */
export async function inspectOrderContrast(page: Page) {
  const samples = await page.locator('.admin-orders').evaluate((root) => {
    const rgba = (s: string) => {
      const a = s.match(/[\d.]+/g)?.map(Number) ?? [];
      return a.length >= 3 ? [...a.slice(0, 3), a[3] ?? 1] : [0, 0, 0, 0];
    };
    const over = (a: number[], b: number[]) =>
      [0, 1, 2].map((i) => a[i]! * a[3]! + b[i]! * (1 - a[3]!));
    const lum = (c: number[]) =>
      c
        .map((v) => v / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i]!, 0);
    return [
      ...root.querySelectorAll('h1,h2,h3,p,label,dt,dd,button,a,small,strong,time,.status-badge'),
    ]
      .filter(
        (el) => el.getClientRects().length && el.textContent?.trim() && !el.matches(':disabled'),
      )
      .map((el) => {
        const style = getComputedStyle(el),
          chain: number[][] = [];
        let parent: Element | null = el;
        while (parent) {
          chain.unshift(rgba(getComputedStyle(parent).backgroundColor));
          parent = parent.parentElement;
        }
        let bg = [255, 255, 255];
        for (const color of chain) bg = over(color, bg);
        const a = lum(over(rgba(style.color), bg)),
          b = lum(bg),
          ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        const size = parseFloat(style.fontSize),
          weight = parseInt(style.fontWeight);
        return {
          text: el.textContent!.trim().slice(0, 80),
          ratio,
          threshold: size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5,
        };
      });
  });
  expect(samples.filter((s) => s.ratio < s.threshold)).toEqual([]);
  return { samples: samples.length, minimum: Math.min(...samples.map((s) => s.ratio)) };
}
