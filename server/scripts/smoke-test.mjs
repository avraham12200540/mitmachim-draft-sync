// Ad-hoc smoke test for the running API. Run: node scripts/smoke-test.mjs [baseUrl]
const base = process.argv[2] || 'http://127.0.0.1:3011';
let token = '';
const log = (...a) => console.log(...a);
const assert = (cond, msg) => {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
  log('ok:', msg);
};

async function call(method, path, body, useAuth = true) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (useAuth && token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const main = async () => {
  let r = await call('GET', '/health', null, false);
  assert(r.status === 200 && r.body.ok, 'health ok');

  r = await call('POST', '/api/auth/create-sync-key', { deviceName: 'test-pc' }, false);
  assert(r.status === 200 && r.body.syncKey && r.body.accessToken, 'create-sync-key');
  const syncKey = r.body.syncKey;
  token = r.body.accessToken;
  log('   syncKey format:', syncKey);
  assert(/^MTD-[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$/.test(syncKey), 'syncKey format');

  // Upsert a draft (server stores opaque ciphertext; we use a dummy envelope).
  const payload = {
    type: 'topic',
    localDraftKey: 'topic:new:category:5',
    encryptedContent: '1.aaaa.bbbb',
    encryptedTitle: '1.cccc.dddd',
    categoryId: '5',
    categoryName: 'עזרה הדדית - מחשבים וטכנולוגיה',
    topicType: 'שיתוף',
    url: 'https://mitmachim.top/category/5/test',
    clientUpdatedAt: new Date().toISOString(),
  };
  r = await call('POST', '/api/drafts', payload);
  assert(r.status === 200 && r.body.ok && r.body.draft.id, 'upsert create');
  assert(r.body.draft.categoryName === 'עזרה הדדית - מחשבים וטכנולוגיה', 'categoryName persisted');
  assert(r.body.draft.topicType === 'שיתוף', 'topicType persisted');
  const id = r.body.draft.id;

  // Upsert same key again -> should update, not duplicate.
  r = await call('POST', '/api/drafts', { ...payload, encryptedContent: '1.eeee.ffff' });
  assert(r.status === 200 && r.body.draft.id === id, 'upsert update (same id)');

  // Match
  r = await call('GET', '/api/drafts/match?type=topic&localDraftKey=topic:new:category:5&categoryId=5');
  assert(r.status === 200 && r.body.draft && r.body.draft.id === id, 'match by category');

  // List
  r = await call('GET', '/api/drafts');
  assert(r.status === 200 && r.body.drafts.length === 1, 'list has 1 draft');
  assert(r.body.drafts[0].deviceName === 'test-pc', 'draft carries device name');

  // Conflict: send stale expectedServerUpdatedAt with older clientUpdatedAt
  const past = new Date(Date.now() - 60000).toISOString();
  r = await call('POST', '/api/drafts', {
    ...payload,
    encryptedContent: '1.gggg.hhhh',
    clientUpdatedAt: past,
    expectedServerUpdatedAt: '2000-01-01T00:00:00.000Z',
  });
  assert(r.status === 409 && r.body.code === 'CONFLICT', 'conflict detected');

  // Second device login with same sync key
  r = await call('POST', '/api/auth/login', { syncKey, deviceName: 'second-pc' }, false);
  assert(r.status === 200 && r.body.accessToken, 'login second device');
  const token2 = r.body.accessToken;
  const r2 = await fetch(base + '/api/drafts', { headers: { Authorization: `Bearer ${token2}` } });
  const b2 = await r2.json();
  assert(r2.status === 200 && b2.drafts.length === 1, 'second device sees same draft');

  // Devices list
  r = await call('GET', '/api/devices');
  assert(r.status === 200 && r.body.devices.length === 2, 'two devices listed');

  // Bad sync key
  r = await call('POST', '/api/auth/login', { syncKey: 'MTD-0000-0000-0000', deviceName: 'x' }, false);
  assert(r.status === 401 && r.body.error === 'INVALID_SYNC_KEY', 'invalid sync key rejected');

  // Validation error (missing content)
  r = await call('POST', '/api/drafts', { type: 'topic', localDraftKey: 'x' });
  assert(r.status === 400 && r.body.error === 'VALIDATION', 'validation rejects missing content');

  // Unauthorized
  r = await fetch(base + '/api/drafts').then((x) => x.status);
  assert(r === 401, 'unauthenticated request rejected');

  // Delete (soft)
  r = await call('DELETE', `/api/drafts/${id}`);
  if (!(r.status === 200 && r.body.ok)) log('   delete response:', r.status, JSON.stringify(r.body));
  assert(r.status === 200 && r.body.ok, 'soft delete');
  r = await call('GET', '/api/drafts');
  assert(r.body.drafts.length === 0, 'deleted draft hidden from list');

  log('\nALL SMOKE TESTS PASSED ✅');
};

main().catch((e) => {
  console.error('ERROR', e);
  process.exit(1);
});
