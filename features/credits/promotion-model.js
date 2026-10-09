export function promotionState(promotion, now = Date.now()) {
  const start = Date.parse(promotion?.starts_at);
  const end = Date.parse(promotion?.ends_at);
  const phase = !promotion?.revision || !Number.isFinite(start) || !Number.isFinite(end) || end <= start
    ? 'unconfigured' : now < start ? 'scheduled' : now < end ? 'free' : 'review';
  return { phase, billingEnabled: false };
}
export function promotionQuotas(input) {
  return Object.fromEntries(['particular','reseller','agency'].map(role => {
    const value = String(input[role] ?? '');
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 1000000) throw new Error('Completá créditos enteros positivos para cada tipo de vendedor.');
    return [role, Number(value)];
  }));
}
