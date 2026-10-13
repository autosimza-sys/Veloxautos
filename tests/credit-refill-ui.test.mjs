import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicationCreditAccess, publicationCreditCost, publicationQuote } from '../features/credits/promotion-model.js';

const now = Date.parse('2026-11-02T00:00:00Z');
const campaign = { revision: 1, starts_at: '2026-11-01T00:00:00Z', ends_at: '2027-01-30T00:00:00Z', publication_cost: 50, auto_refill: true, quotas: { particular: 100, reseller: 100, agency: 100 } };
const balance = { granted: 100, used: 100, expires_at: campaign.ends_at };
test('empty balance can publish with an active free refill for every seller role', () => {
  for (const role of ['particular', 'reseller', 'agency']) {
    const access = publicationCreditAccess(balance, campaign, role, now);
    assert.equal(access.canPublish, true);
    assert.equal(access.cost, 50);
    assert.equal(access.autoRefill, true);
    assert.equal(access.available, 0);
  }
});
test('scheduled, expired, buyer and missing balances cannot publish by refill', () => {
  assert.equal(publicationCreditAccess(balance, campaign, 'particular', Date.parse(campaign.starts_at) - 1).canPublish, false);
  assert.equal(publicationCreditAccess(balance, campaign, 'particular', Date.parse(campaign.ends_at)).canPublish, false);
  assert.equal(publicationCreditAccess(balance, campaign, 'registered', now).canPublish, false);
  assert.equal(publicationCreditAccess(null, campaign, 'particular', now).canPublish, false);
  assert.equal(publicationCreditAccess({ ...balance, expires_at: '2026-10-01' }, campaign, 'particular', now).canPublish, false);
});
test('without refills availability requires the full publication cost', () => {
  const policy = { ...campaign, auto_refill: false };
  assert.equal(publicationCreditAccess({ ...balance, used: 51 }, policy, 'particular', now).canPublish, false);
  assert.equal(publicationCreditAccess({ ...balance, used: 50 }, policy, 'particular', now).canPublish, true);
  assert.equal(publicationCreditAccess(balance, { ...campaign, quotas: { particular: 10 } }, 'particular', now).canPublish, false);
});
test('saving a future policy does not change the existing legacy cost before launch', () => {
  const access = publicationCreditAccess({ ...balance, used: 99 }, { ...campaign, revision: 0, starts_at: null, ends_at: null }, 'particular', now);
  assert.equal(access.cost, 1);
  assert.equal(access.autoRefill, false);
  assert.equal(access.canPublish, true);
});
test('invalid publication cost cannot be silently accepted or treated as a free action', () => {
  for (const invalid of ['', 0, -1, 1.5, '1e2', 1000001]) assert.throws(() => publicationCreditCost(invalid));
  assert.equal(publicationCreditCost('50'), 50);
  assert.equal(publicationCreditAccess(balance, { ...campaign, publication_cost: 0 }, 'particular', now).canPublish, false);
});

test('role prices and the displayed quote agree without activating draft prices early', () => {
  const policy = {...campaign,policy_revision:3,publication_costs:{particular:50,reseller:40,agency:30}};
  for (const [role,cost] of Object.entries(policy.publication_costs)) {
    assert.equal(publicationCreditAccess(balance,policy,role,now).cost,cost);
    assert.deepEqual(publicationQuote(policy,role),{policy_revision:3,campaign_revision:1,cost,role});
    assert.equal(publicationQuote({...policy,revision:0},role).cost,1);
  }
  assert.equal(publicationQuote(policy,'registered'),null);
  assert.equal(publicationQuote(null,'agency'),null);
  assert.equal(publicationQuote({...policy,publication_costs:{agency:0}},'agency'),null);
});
