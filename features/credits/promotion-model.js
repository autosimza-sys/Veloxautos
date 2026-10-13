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

export function publicationCreditCost(input) {
  const value = String(input ?? '');
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 1000000) {
    throw new Error('Indicá un costo entero entre 1 y 1.000.000 créditos por publicación.');
  }
  return Number(value);
}

// The database repeats these checks under locks; this only explains availability.
export function publicationCreditAccess(balance, promotion, role, now = Date.now()) {
  const { phase } = promotionState(promotion, now);
  const cost = phase === 'unconfigured' ? 1 : Number(promotion?.publication_cost ?? 1);
  const validCost = Number.isInteger(cost) && cost > 0 && cost <= 1000000;
  const quota = Number(promotion?.quotas?.[role]);
  const autoRefill = phase === 'free' && promotion?.auto_refill === true
    && Number.isInteger(quota) && quota >= cost;
  const unexpired = Date.parse(balance?.expires_at) > now;
  const available = unexpired ? Math.max(0, Number(balance?.granted) - Number(balance?.used)) : 0;
  const eligible = ['particular', 'reseller', 'agency'].includes(role);
  const canPublish = eligible && Boolean(balance) && validCost
    && ['free', 'unconfigured'].includes(phase) && unexpired
    && (available >= cost || autoRefill);
  return { canPublish, autoRefill, cost, available, phase };
}
