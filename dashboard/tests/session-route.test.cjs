const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function route(claim) {
  let stored;
  const source = fs.readFileSync('app/api/auth/session/route.ts', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, Request, Response,
    process: { env: { NEXT_PUBLIC_PRIVY_APP_ID: 'test-app', PRIVY_APP_SECRET: 'test-only' } },
    require(name) {
      if (name === '@privy-io/node') return { PrivyClient: class {
        utils() { return { auth: () => ({ verifyAuthToken: async () => claim }) }; }
      }};
      if (name === '@/app/sentinel-auth') return { sentinelSessionCookie: 'sentinel-session', createSessionValue: async user => { stored = user; return 'test-session'; } };
      if (name === '@/lib/cloud-api') return { json: (body, status = 200) => Response.json(body, { status }) };
      if (name === '@/db') return { getDb: () => ({ prepare: () => ({ run: async () => ({}), bind() { return this; } }) }) };
      throw new Error(name);
    },
  });
  return { POST: exports.POST, stored: () => stored };
}

test('Privy snake_case subject becomes the dashboard session identity', async () => {
  const handler = route({ user_id: 'did:privy:test-hunter' });
  const response = await handler.POST(new Request('https://sentinel.test/api/auth/session', {
    method: 'POST', headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' }, body: '{}',
  }));
  assert.equal(response.status, 200);
  assert.equal(handler.stored().userId, 'did:privy:test-hunter');
  assert.match(response.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Lax/);
});

test('an identity-free claim cannot create a dashboard session', async () => {
  const handler = route({});
  const response = await handler.POST(new Request('https://sentinel.test/api/auth/session', {
    method: 'POST', headers: { authorization: 'Bearer test-token' }, body: '{}',
  }));
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(handler.stored(), undefined);
});
