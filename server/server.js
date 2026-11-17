/* ============================================================
   InstaView — server.js
   Backend Express: serve o front-end + API + proxy de mídia.

   Endpoints:
     GET /                  → front-end (index.html)
     GET /api/profile?u=…   → perfil público + stories + highlights
     GET /media?url=…       → proxy p/ CDN do Instagram (download)

   Avisos: veja scraper.js — uso educacional, conteúdo público,
   não é API oficial do Instagram.
   ============================================================ */

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { getProfile } from './scraper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const PORT = process.env.PORT ?? 3000;
const ALLOWED_CDN_HOSTS = /(\.|^)(cdninstagram\.com|fbcdn\.net)$/i;

app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));

/* CORS aberto — útil se você hospedar o front-end em outro domínio */
app.use((req, res, next) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/* limite simples de requisições por IP (proteção básica) */
const hits = new Map();
setInterval(() => hits.clear(), 60_000).unref();

function rateLimit(req, res, next) {
  const key = req.ip ?? 'unknown';
  const n = (hits.get(key) ?? 0) + 1;
  hits.set(key, n);
  if (n > 60) return res.status(429).json({ error: 'Muitas requisições. Aguarde um minuto.' });
  next();
}

/* ---------- front-end estático ---------- */
app.use(express.static(path.join(__dirname, '..'), { extensions: ['html'] }));

/* ---------- API ---------- */
app.get('/api/profile', rateLimit, async (req, res) => {
  try {
    const profile = await getProfile(req.query.u);
    res.json(profile);
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Erro inesperado' });
  }
});

/* ---------- proxy de mídia p/ download funcionar ---------- */
app.get('/media', rateLimit, async (req, res) => {
  const raw = String(req.query.url ?? '');
  let target;
  try {
    target = new URL(raw);
  } catch {
    return res.status(400).json({ error: 'URL inválida' });
  }

  if (!ALLOWED_CDN_HOSTS.test(target.hostname)) {
    return res.status(403).json({ error: 'Domínio não permitido' });
  }

  try {
    const upstream = await fetch(target, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        referer: 'https://www.instagram.com/',
      },
    });

    if (!upstream.ok || !upstream.body) {
      return res.status(upstream.status === 404 ? 404 : 502).json({ error: 'Mídia indisponível' });
    }

    res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/octet-stream');
    const len = upstream.headers.get('content-length');
    if (len) res.setHeader('content-length', len);

    Readable.fromWeb(upstream.body).pipe(res);
  } catch {
    res.status(502).json({ error: 'Falha ao buscar mídia' });
  }
});

/* ---------- 404 JSON para rotas desconhecidas de API ---------- */
app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

app.listen(PORT, () => {
  console.log(`\n✦ InstaView rodando em http://localhost:${PORT}`);
  console.log(`  Front-end:      http://localhost:${PORT}/`);
  console.log(`  API:            http://localhost:${PORT}/api/profile?u=usuario`);
  console.log(`  Sessão IG:      ${process.env.IG_SESSIONID ? 'definida ✓' : 'não definida (opcional)'}`);
  console.log(`  Aviso: uso educacional — apenas conteúdo público.\n`);
});
