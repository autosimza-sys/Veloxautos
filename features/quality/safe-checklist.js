import { checklistOptions } from '../../lib/velox-data.js';

// Old/imported rows are untrusted even when new writes are validated by SQL.
// Do not render arbitrary JSON children or invented certification labels.
export function safeChecklistEntries(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(checklistOptions).filter(key => Object.hasOwn(value, key)).map(key => [
    key, typeof value[key] === 'string' && value[key].length <= 120
      ? value[key] : 'No informado',
  ]);
}
