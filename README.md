# InstaView 🔍

Visualizador anônimo de conteúdo **público** do Instagram — front-end sem anúncios + backend Node.js + bot de Telegram.

> ⚠️ **Aviso legal / educacional**
> Este projeto não é afiliado ao Instagram (Meta). A técnica de consulta não é uma API oficial,
> pode parar de funcionar a qualquer momento e o uso automatizado pode violar os Termos de Uso
> do Instagram. **Funciona apenas com perfis públicos** — contas privadas nunca são acessadas.
> Use por sua conta e risco.

## Estrutura

```
instaview/
├── index.html        → front-end (sem anúncios, sem trackers)
├── styles.css        → design
├── app.js            → busca, abas, download
├── server/           → backend Node/Express
│   ├── server.js     → API + proxy de mídia + serve o front-end
│   └── scraper.js    → consulta endpoints públicos do Instagram
└── bot/              → bot do Telegram (sem dependências)
    └── bot.js        → /ver @usuario · /canal
```

## Rodar localmente

**1. Backend** (terminal 1)

```bash
cd server
npm install
npm start
```

Acesse http://localhost:3000 — o front-end já é servido pelo backend.

| Variável        | Obrigatória | Descrição                                                       |
| --------------- | ----------- | --------------------------------------------------------------- |
| `PORT`          | não         | Porta do servidor (padrão `3000`)                               |
| `IG_SESSIONID`  | não         | Cookie `sessionid` da SUA conta IG — aumenta muito a confiabilidade |

**2. Bot do Telegram** (terminal 2)

```bash
cd bot
TELEGRAM_BOT_TOKEN=123456:ABC-xyz npm start
```

| Variável             | Obrigatória | Descrição                                          |
| -------------------- | ----------- | -------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN` | sim         | Token do [@BotFather](https://t.me/BotFather)      |
| `API_URL`            | não         | URL do backend (padrão `http://localhost:3000`)    |
| `TELEGRAM_CHANNEL_ID`| não         | `@nomedocanal` ou `-100…` — usado no `/canal`      |
| `ADMIN_ID`           | não         | Seu id (veja em [@userinfobot](https://t.me/userinfobot)) |

### Comandos do bot

- `/start` — instruções
- `/ver @usuario` — perfil público, stories ativos e posts recentes (com links)
- `/canal` — publica a divulgação do InstaView no canal (somente admin)

## API

```http
GET /api/profile?u=usuario
```

```json
{
  "username": "usuario",
  "full_name": "Nome Completo",
  "avatar": "https://…",
  "is_private": false,
  "followers": 1234,
  "media_count": 100,
  "posts":    [{ "type": "image", "url": "…", "thumbnail": "…" }],
  "stories":  [{ "type": "video", "url": "…", "thumbnail": "…" }],
  "highlights": [{ "title": "…", "items": [{ "type": "…", "url": "…" }] }]
}
```

```http
GET /media?url=https://scontent.cdninstagram.com/…
```

Proxy com os headers corretos para o download funcionar (só aceita hosts `*.cdninstagram.com` / `*.fbcdn.net`).

## Deploy

- **Backend**: qualquer host Node (Railway, Render, Fly.io, VPS). Defina `IG_SESSIONID` como variável de ambiente.
- **Front-end**: já servido pelo backend; ou hospede os 3 arquivos na Vercel/Netlify e aponte `API_URL` (em `app.js`) para o backend.
- **Bot**: rode no mesmo servidor do backend (long polling — não precisa de domínio/SSL).

## Limitações conhecidas

- Sem `IG_SESSIONID`, o Instagram pode responder 401/429 após algumas buscas.
- Links de mídia do CDN expiram; por isso o download passa pelo proxy `/media`.
- Stories expirados (24h) ou excluídos não ficam disponíveis.
- Perfis privados: nunca.
