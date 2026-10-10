// Compatibility entrypoints are rules-only. A key must never bypass the
// authenticated API route and its persistent spending limits.
import { generateRuleBasedAnswer } from './assistant-rules.js';
export { generateRuleBasedAnswer } from './assistant-rules.js';
export async function generateClaudeAnswer(question, vehicle) {
  return generateRuleBasedAnswer(question, vehicle);
}
export async function getAssistantAnswer(question, vehicle) {
  return generateRuleBasedAnswer(question, vehicle);
}
