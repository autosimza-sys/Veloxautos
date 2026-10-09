import assert from 'node:assert/strict';
import { test } from 'node:test';
import { promotionState, promotionQuotas } from '../features/credits/promotion-model.js';
test('global campaign has scheduled, live and review states, never automatic payment',()=>{
 const p={revision:1,starts_at:'2026-01-01T00:00:00Z',ends_at:'2026-04-01T00:00:00Z'};
 assert.equal(promotionState(null).phase,'unconfigured');
 assert.equal(promotionState(p,Date.parse('2025-12-31')).phase,'scheduled');
 assert.equal(promotionState(p,Date.parse(p.starts_at)).phase,'free');
 assert.equal(promotionState(p,Date.parse(p.ends_at)).phase,'review');
 assert.equal(promotionState(p,Date.parse(p.ends_at)).billingEnabled,false);
 assert.equal(promotionState({...p,ends_at:'invalid'}).phase,'unconfigured');
});
test('admin must provide integer quotas rather than silently accepting legacy quantities',()=>{
 assert.throws(()=>promotionQuotas({particular:'',reseller:'50',agency:'200'}));
 assert.throws(()=>promotionQuotas({particular:'1.5',reseller:'50',agency:'200'}));
 assert.deepEqual(promotionQuotas({particular:'12',reseller:'60',agency:'250'}),{particular:12,reseller:60,agency:250});
});
