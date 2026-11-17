/* ============================================================
   InstaView — bot.js (Telegram)
   Bot SEM dependências externas (usa fetch nativo do Node 18+).

   Comandos:
     /start            → instruções
     /ver @usuario     → mostra perfil público + stories + link
     /canal <texto>    → publica divulgação no canal (admin)

   Variáveis de ambiente (.env ou export):
     TELEGRAM_BOT_TOKEN  → token do @BotFather  (obrigatório)
     API_URL             → backend do InstaView (padrão http://localhost:3000)
     TELEGRAM_CHANNEL_ID → @nomedocanal ou -100… (para /canal)
     ADMIN_ID            → seu id do Telegram (libera /canal)

   Como obter o token:
     1. Fale com @BotFather no Telegram
     2. /newbot → escolha nome e username
     3. Copie o token para TELEGRAM_BOT_TOKEN

   Como descobrir seu ADMIN_ID:
     1. Fale com @userinfobot → ele mostra seu "Id"
   ============================================================ */

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const CHANNEL = process.env.TELEGRAM_CHANNEL_ID ?? null;
const ADMIN_ID = process.env.ADMIN_ID ?? null;

if (!TOKEN) {
  console.error(
    '✖ Defina TELEGRAM_BOT_TOKEN.\n' +
      '  Ex.: TELEGRAM_BOT_TOKEN=123:abc node bot.js'
  );
  process.exit(1);
}

const API = `https://api.telegram.org/bot${TOKEN}`;

/* ---------- wrapper da API do Telegram ---------- */
async function tg(method, body = {}) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) {
    console.error(`tg ${method} falhou:`, data.description);
  }
  return data;
}

const reply = (chatId, text, extra = {}) =>
  tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });

/* ---------- comandos ---------- */
const HELP =
  '👋 <b>InstaView Bot</b>\n\n' +
  'Veja conteúdo <b>público</b> do Instagram de forma anônima:\n\n' +
  '🔎 <code>/ver @usuario</code> — perfil, stories e posts recentes\n\n' +
  '⚠️ Funciona apenas com perfis <b>públicos</b>. ' +
  'Perfis privados permanecem privados.\n' +
  '🌐 Versão web: sem anúncios, direto no navegador.';

async function cmdVer(chatId, raw) {
  const username = (raw ?? '')
    .trim()
    .replace(/^@+/, '')
    .replace(/^https?:\/\/(www\.)?instagram\.com\/(stories\/)?/i, '')
    .split('/')[0]
    .split('?')[0];

  if (!username) {
    return reply(chatId, 'Use assim: <code>/ver @usuario</code>');
  }

  const wait = await reply(chatId, `🔎 Buscando <b>@${username}</b>…`);

  let p;
  try {
    const res = await fetch(`${API_URL}/api/profile?u=${encodeURIComponent(username)}`);
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? 'Erro');
    p = body;
  } catch (err) {
    return tg('editMessageText', {
      chat_id: chatId,
      message_id: wait.result?.message_id,
      text: `❌ ${err.message}`,
    });
  }

  if (p.is_private) {
    return tg('editMessageText', {
      chat_id: chatId,
      message_id: wait.result?.message_id,
      text: `🔒 <b>@${p.username}</b> é um perfil <b>privado</b>.\nO InstaView respeita a privacidade e não exibe conteúdo privado.`,
      parse_mode: 'HTML',
    });
  }

  const stories = p.stories ?? [];
  const posts = (p.posts ?? []).slice(0, 5);

  const lines = [
    `👤 <b>${p.full_name || p.username}</b> ${p.is_verified ? '✔️' : ''} (@${p.username})`,
    `📊 ${p.followers ?? '—'} seguidores · ${p.media_count ?? '—'} publicações\n`,
  ];

  if (stories.length) {
    lines.push(`🟢 <b>Stories ativos (${stories.length}):</b>`);
    stories.slice(0, 8).forEach((s, i) =>
      lines.push(`   ${i + 1}. ${s.type === 'video' ? '🎬' : '🖼️'} ${s.url}`)
    );
    lines.push('');
  } else {
    lines.push('⚪ Sem stories ativos agora.\n');
  }

  if (posts.length) {
    lines.push(`<b>Posts recentes:</b>`);
    posts.forEach((m, i) =>
      lines.push(`   ${i + 1}. ${m.type === 'video' ? '🎬' : '🖼️'} ${m.url}`)
    );
  }

  lines.push(`\n🌐 Veja tudo com download em: ${API_URL}/?u=${p.username}`);

  // se houver avatar, anexa a foto
  const canSendPhoto = p.avatar?.startsWith('http');
  if (canSendPhoto) {
    const ok = await tg('sendPhoto', {
      chat_id: chatId,
      photo: p.avatar,
      caption: lines.join('\n'),
      parse_mode: 'HTML',
    });
    if (ok.ok) {
      await tg('deleteMessage', { chat_id: chatId, message_id: wait.result?.message_id });
      return;
    }
  }

  return tg('editMessageText', {
    chat_id: chatId,
    message_id: wait.result?.message_id,
    text: lines.join('\n'),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

/* divulga o site no canal — só admins */
async function cmdCanal(chatId, from, text) {
  if (!CHANNEL) return reply(chatId, '⚠️ Defina TELEGRAM_CHANNEL_ID no ambiente.');
  if (!ADMIN_ID || String(from.id) !== String(ADMIN_ID)) {
    return reply(chatId, '⛔ Apenas o administrador pode publicar no canal.');
  }

  const custom = text?.trim();
  const message =
    custom ??
    [
      '📸 <b>InstaView — Visualizador anônimo do Instagram</b>',
      '',
      'Veja stories, highlights, reels e fotos de perfis públicos:',
      '✅ 100% anônimo',
      '✅ Sem login',
      '✅ Sem anúncios',
      `🌐 ${API_URL}`,
    ].join('\n');

  const ok = await tg('sendMessage', { chat_id: CHANNEL, text: message, parse_mode: 'HTML' });
  return reply(chatId, ok.ok ? '✅ Publicado no canal!' : '❌ Falhou — o bot é admin do canal?');
}

/* ---------- roteamento de updates ---------- */
async function handle(update) {
  const msg = update.message ?? update.edited_message;
  if (!msg?.text) return;

  const chatId = msg.chat.id;
  const from = msg.from ?? {};
  const [rawCmd, ...rest] = msg.text.trim().split(/\s+/);
  const cmd = rawCmd.toLowerCase().replace(/@\w+$/, ''); // remove @MeuBot
  const arg = rest.join(' ');

  if (cmd === '/start' || cmd === '/help') return reply(chatId, HELP);
  if (cmd === '/ver') return cmdVer(chatId, arg);
  if (cmd === '/canal') return cmdCanal(chatId, from, arg);
}

/* ---------- long polling ---------- */
async function poll(offset = 0) {
  try {
    const res = await fetch(`${API}/getUpdates?timeout=30&offset=${offset}`);
    const data = await res.json();

    for (const update of data.result ?? []) {
      await handle(update).catch(e => console.error('handle:', e));
      offset = update.update_id + 1;
    }
  } catch (e) {
    console.error('poll:', e.message);
    await new Promise(r => setTimeout(r, 3000));
  }
  poll(offset);
}

console.log('✦ InstaView Bot iniciado (long polling)…');
if (CHANNEL) console.log(`  Canal de divulgação: ${CHANNEL}`);
poll();
