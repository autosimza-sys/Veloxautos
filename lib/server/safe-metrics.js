const STATES = new Set(['unavailable','unauthorized','invalid','done','processing','limited','skipped','denied']);
export function recordAssistantOutcome(state, logger = console.info) {
  // Fixed dimensions only. No IDs, URL/query, headers, messages, errors or context.
  const metric = { event: 'velox.assistant.outcome', state: STATES.has(state) ? state : 'unknown', count: 1 };
  try { logger(JSON.stringify(metric)); } catch { /* Observability cannot change a user result. */ }
  return metric;
}
