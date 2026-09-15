// Create the live-proof jumpstart once, from the standing test account — the runner
// for scripts/test-jumpstart.mjs (see its header). Idempotent: an existing pack of the
// same NAME in the account is printed and nothing is written.
//
//   CURATOR_HANDLE=… CURATOR_PASSWORD=… MEMBER_HANDLES=a.bsky.social,b.example \
//     node scripts/make-test-jumpstart.mjs
//
// Claim testbed--forage-test-account first (CroftC/.claude/TESTBED.md). Credentials
// come from the environment only; nothing here reads a file or prints a secret.
import { listRecord, itemRecords, packRecord, NAME, LIST_COLLECTION, ITEM_COLLECTION, PACK_COLLECTION } from './test-jumpstart.mjs';

const ENTRYWAY = 'https://bsky.social';
const PUBLIC = 'https://public.api.bsky.app';
const need = (k) => { const v = process.env[k]; if (!v) throw new Error(`${k} is not set`); return v; };
const handle = need('CURATOR_HANDLE');
const password = need('CURATOR_PASSWORD');
const memberHandles = need('MEMBER_HANDLES').split(',').map((s) => s.trim()).filter(Boolean);

async function xrpc(base, method, { params, body, token } = {}) {
  const qs = params ? `?${new URLSearchParams(params)}` : '';
  const res = await fetch(`${base}/xrpc/${method}${qs}`, {
    method: body ? 'POST' : 'GET',
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} → HTTP ${res.status} ${data.error || ''} ${data.message || ''}`.trim());
  return data;
}

const session = await xrpc(ENTRYWAY, 'com.atproto.server.createSession', { body: { identifier: handle, password } });
const { did, accessJwt } = session;
const pds = session.didDoc?.service?.find((s) => s.id === '#atproto_pds')?.serviceEndpoint || ENTRYWAY;
console.log(`signed in as ${handle} (${did}); pds ${pds}`);

// idempotence: one pack of this name per account
const existing = await xrpc(pds, 'com.atproto.repo.listRecords', { params: { repo: did, collection: PACK_COLLECTION, limit: 100 }, token: accessJwt });
const have = (existing.records || []).find((r) => r.value?.name === NAME);
if (have) {
  console.log(`already exists: ${have.uri}\nhttps://bsky.app/starter-pack/${handle}/${have.uri.split('/').pop()}`);
  process.exit(0);
}

const members = [];
for (const h of memberHandles) {
  const r = await xrpc(PUBLIC, 'com.atproto.identity.resolveHandle', { params: { handle: h } });
  members.push(r.did);
  console.log(`member ${h} → ${r.did}`);
}
const now = new Date().toISOString();
const create = (collection, record) => xrpc(pds, 'com.atproto.repo.createRecord', { body: { repo: did, collection, record }, token: accessJwt });

const list = await create(LIST_COLLECTION, listRecord({ now }));
console.log(`list ${list.uri}`);
const items = itemRecords({ listUri: list.uri, members, curatorDid: did, now });
for (const it of items) { const r = await create(ITEM_COLLECTION, it); console.log(`item ${r.uri} → ${it.subject}`); }
const pack = await create(PACK_COLLECTION, packRecord({ listUri: list.uri, now }));
console.log(`pack ${pack.uri}\nhttps://bsky.app/starter-pack/${handle}/${pack.uri.split('/').pop()}`);

// read it back through the public AppView, as Forage will
const view = await xrpc(PUBLIC, 'app.bsky.graph.getStarterPack', { params: { starterPack: pack.uri } });
console.log(`appview: name=${JSON.stringify(view.starterPack?.record?.name)} members=${view.starterPack?.list?.listItemCount} sample=${(view.starterPack?.listItemsSample || []).map((i) => i.subject?.handle).join(',')}`);
