export const toCents = (v: string) => Math.round(Number(v) * 100);
export const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
export const cartCents = (lines: { unitAmount: string; quantity: number }[]) => lines.reduce((s, l) => s + toCents(l.unitAmount) * l.quantity, 0);
