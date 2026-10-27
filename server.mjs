import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { PartnerUnavailableError, UnconfiguredPartnerProvider } from './src/providers/partner-provider.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(root, 'public');
const port = Number(process.env.PORT || 3000);
const provider = new UnconfiguredPartnerProvider();
const authStorePath = join(root, 'auth-store.json');
const scrypt = promisify(scryptCallback);
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;

async function readAuthStore() {
  try {
    const store = JSON.parse(await readFile(authStorePath, 'utf8'));
    store.users ||= [];
    store.sessions ||= [];
    store.demoData ||= {};
    return store;
  } catch (error) { if (error.code === 'ENOENT') return { users: [], sessions: [], demoData: {} }; throw error; }
}

function validDemoData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (JSON.stringify(value).length > 50_000) return false;
  const validId = (id) => ['visa-demo', 'mastercard-demo', 'rupay-demo'].includes(id)
    || (typeof id === 'string' && /^custom-[a-z0-9]{8,16}$/.test(id));
  if (!Array.isArray(value.cards) || value.cards.length > 13 || !value.cards.every(validId)) return false;
  if (value.selectedCardId !== null && !validId(value.selectedCardId)) return false;
  if (!Array.isArray(value.customCards) || value.customCards.length > 10 || !value.customCards.every((card) =>
    card && validId(card.id) && card.id.startsWith('custom-') && typeof card.name === 'string' && card.name.length <= 32
    && typeof card.issuer === 'string' && card.issuer.length <= 32 && typeof card.holder === 'string' && card.holder.length <= 32
    && ['VISA', 'MASTERCARD', 'RuPay', 'OTHER'].includes(card.network) && /^\d{4}$/.test(card.last4)
    && ['forest', 'midnight', 'plum'].includes(card.theme))) return false;
  if (!Array.isArray(value.transfers) || value.transfers.length > 20 || !value.transfers.every((item) =>
    item && /^DEMO-[A-Z0-9]{6}$/.test(item.id) && Number.isInteger(item.amount) && item.amount >= 500 && item.amount <= 15000
    && Number.isInteger(item.fee) && item.fee === Math.round(item.amount * 0.02)
    && Number.isFinite(new Date(item.createdAt).valueOf()))) return false;
  if (value.savingsAccount !== null && (!value.savingsAccount || ['name', 'bank', 'holder'].some((key) =>
    typeof value.savingsAccount[key] !== 'string' || value.savingsAccount[key].length > 32)
    || !/^\d{4}$/.test(value.savingsAccount.last4))) return false;
  return typeof value.active === 'boolean' && typeof value.accountsLinked === 'boolean';
}

async function writeAuthStore(store) {
  const tempPath = `${authStorePath}.tmp`;
  const { writeFile, rename } = await import('node:fs/promises');
  await writeFile(tempPath, JSON.stringify(store, null, 2), { mode: 0o600 });
  await rename(tempPath, authStorePath);
}

function tokenHash(token) { return createHash('sha256').update(token).digest('hex'); }
function cookieValue(request, key) {
  const pair = (request.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${key}=`));
  return pair ? decodeURIComponent(pair.slice(key.length + 1)) : '';
}
function setSessionCookie(request, response, token) {
  const secure = request.socket.encrypted ? '; Secure' : '';
  response.setHeader('Set-Cookie', `moneta_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionLifetimeMs / 1000}${secure}`);
}
async function currentUser(request) {
  const token = cookieValue(request, 'moneta_session');
  if (!token) return null;
  const store = await readAuthStore();
  const session = store.sessions.find((item) => item.tokenHash === tokenHash(token) && item.expiresAt > Date.now());
  if (!session) return null;
  return store.users.find((user) => user.id === session.userId) || null;
}
async function createSession(request, response, user) {
  const store = await readAuthStore();
  const token = randomBytes(32).toString('base64url');
  store.sessions = store.sessions.filter((item) => item.expiresAt > Date.now());
  store.sessions.push({ tokenHash: tokenHash(token), userId: user.id, expiresAt: Date.now() + sessionLifetimeMs });
  await writeAuthStore(store);
  setSessionCookie(request, response, token);
}

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) throw new Error('Request body too large.');
  }
  if (!body) return {};
  return JSON.parse(body);
}

async function serveStatic(pathname, response) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const safePath = normalize(requested).replace(/^([.][.][/\\])+/, '').replace(/^[/\\]+/, '');
  const filePath = join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('Not a file');
    const content = await readFile(filePath);
    response.writeHead(200, {
      // Keep prototype assets fresh while the UI is changing; stale CSS made
      // browsers show the unstyled document after a server-side update.
      'Cache-Control': 'no-cache',
      'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(content);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}

const server = createServer(async (request, response) => {
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'");
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const method = request.method || 'GET';

  try {
    if (url.pathname.startsWith('/api/auth/') && request.headers.origin) {
      const origin = new URL(request.headers.origin);
      if (origin.host !== request.headers.host) {
        sendJson(response, 403, { error: { code: 'BAD_ORIGIN', message: 'Request origin is not allowed.' } });
        return;
      }
    }

    if (url.pathname === '/api/auth/session' && method === 'GET') {
      const user = await currentUser(request);
      sendJson(response, 200, { authenticated: Boolean(user), user: user ? { email: user.email } : null });
      return;
    }

    if ((url.pathname === '/api/auth/register' || url.pathname === '/api/auth/login') && method === 'POST') {
      const body = await readBody(request);
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 12 || password.length > 128) {
        sendJson(response, 400, { error: { code: 'INVALID_CREDENTIALS', message: 'Enter a valid email and a password between 12 and 128 characters.' } });
        return;
      }
      const store = await readAuthStore();
      let user = store.users.find((item) => item.email === email);
      if (url.pathname.endsWith('/register')) {
        if (user) {
          sendJson(response, 409, { error: { code: 'ACCOUNT_EXISTS', message: 'An account with that email already exists. Sign in instead.' } });
          return;
        }
        const salt = randomBytes(16).toString('hex');
        const passwordHash = (await scrypt(password, salt, 64)).toString('hex');
        user = { id: randomBytes(16).toString('hex'), email, salt, passwordHash, createdAt: new Date().toISOString() };
        store.users.push(user);
        await writeAuthStore(store);
      } else {
        const salt = user?.salt || '00000000000000000000000000000000';
        const expected = user ? Buffer.from(user.passwordHash, 'hex') : Buffer.alloc(64);
        const actual = await scrypt(password, salt, 64);
        if (!user || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
          sendJson(response, 401, { error: { code: 'LOGIN_FAILED', message: 'Email or password is incorrect.' } });
          return;
        }
      }
      await createSession(request, response, user);
      sendJson(response, 200, { authenticated: true, user: { email: user.email } });
      return;
    }

    if (url.pathname === '/api/auth/logout' && method === 'POST') {
      const token = cookieValue(request, 'moneta_session');
      if (token) {
        const store = await readAuthStore();
        store.sessions = store.sessions.filter((item) => item.tokenHash !== tokenHash(token));
        await writeAuthStore(store);
      }
      response.setHeader('Set-Cookie', 'moneta_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
      sendJson(response, 200, { authenticated: false });
      return;
    }

    if (url.pathname === '/api/health' && method === 'GET') {
      sendJson(response, 200, { status: 'ok' });
      return;
    }

    if (url.pathname === '/api/demo-data' && (method === 'GET' || method === 'PUT')) {
      const key = url.searchParams.get('key') || '';
      if (!/^[a-f0-9]{32}$/.test(key)) {
        sendJson(response, 400, { error: { code: 'INVALID_KEY', message: 'The demo workspace key is invalid.' } });
        return;
      }
      const store = await readAuthStore();
      if (method === 'GET') {
        sendJson(response, 200, { data: store.demoData[key] || null });
        return;
      }
      const body = await readBody(request);
      if (!validDemoData(body.data)) {
        sendJson(response, 400, { error: { code: 'INVALID_DEMO_DATA', message: 'The demo data could not be saved.' } });
        return;
      }
      store.demoData[key] = body.data;
      await writeAuthStore(store);
      sendJson(response, 200, { saved: true });
      return;
    }

    if (url.pathname === '/api/config' && method === 'GET') {
      const status = await provider.getStatus();
      sendJson(response, 200, {
        country: 'IN',
        currency: 'INR',
        transfersEnabled: status.ready,
        partnerStatus: status.ready ? 'connected' : 'not_configured',
        message: status.message,
        providerName: status.name,
      });
      return;
    }

    if (url.pathname === '/api/accounts/link' && method === 'POST') {
      await readBody(request);
      const result = await provider.createAccountLink();
      sendJson(response, 200, result);
      return;
    }

    if (url.pathname === '/api/cards' && method === 'GET') {
      const result = await provider.listCards();
      sendJson(response, 200, result);
      return;
    }

    if (url.pathname === '/api/cards/link' && method === 'POST') {
      const result = await provider.createCardLink();
      sendJson(response, 200, result);
      return;
    }

    if (url.pathname === '/api/transfers/quote' && method === 'POST') {
      const body = await readBody(request);
      const result = await provider.quoteTransfer(body);
      sendJson(response, 200, result);
      return;
    }

    const transferMatch = url.pathname.match(/^\/api\/transfers\/([^/]+)$/);
    if (transferMatch && method === 'GET') {
      const result = await provider.getTransfer(decodeURIComponent(transferMatch[1]));
      sendJson(response, 200, result);
      return;
    }

    const reversalMatch = url.pathname.match(/^\/api\/transfers\/([^/]+)\/reversal$/);
    if (reversalMatch && method === 'POST') {
      const body = await readBody(request);
      const result = await provider.reverseTransfer(decodeURIComponent(reversalMatch[1]), body);
      sendJson(response, 200, result);
      return;
    }

    if (url.pathname === '/api/transfers' && method === 'GET') {
      const result = await provider.listTransfers();
      sendJson(response, 200, result);
      return;
    }

    if (url.pathname === '/api/transfers' && method === 'POST') {
      const body = await readBody(request);
      const result = await provider.createTransfer(body);
      sendJson(response, 201, result);
      return;
    }

    if (url.pathname === '/api/webhooks/partner' && method === 'POST') {
      // Partner webhook signature verification must be implemented before this route is enabled.
      const result = await provider.handleWebhook(request);
      sendJson(response, 200, result);
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'API route not found.' } });
      return;
    }

    if (method !== 'GET' && method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end('Method not allowed');
      return;
    }

    await serveStatic(url.pathname, response);
  } catch (error) {
    if (error instanceof PartnerUnavailableError) {
      sendJson(response, error.status, {
        error: { code: error.code, message: error.message },
      });
      return;
    }

    if (error instanceof SyntaxError || error.message === 'Request body too large.') {
      sendJson(response, 400, {
        error: { code: 'INVALID_REQUEST', message: 'The request body is invalid.' },
      });
      return;
    }

    sendJson(response, 500, {
      error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed.' },
    });
  }
});

server.listen(port, () => {
  console.log(`Card-to-savings pilot available at http://localhost:${port}`);
});

server.on('clientError', (_error, socket) => {
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});
