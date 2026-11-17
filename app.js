/* ============================================================
   InstaView — app.js
   Front-end completo: busca, abas, demo de resultados.
   SEM anúncios, SEM modais de "instale o app", SEM rastreadores.
   ============================================================ */

/* ---------- CONFIG ----------
   API_URL aponta para o backend (pasta server/).
   Padrão: backend na porta 3000. Em produção, troque para a
   URL do seu backend (ex.: 'https://api.seusite.com').

   GET {API_URL}/api/profile?u=<username>
   {
     "username": "usuario",
     "full_name": "Nome Completo",
     "is_private": false,
     "media_count": 1234,
     "stories":    [{ "url": "...", "type": "image|video" }, ...],
     "highlights": [{ "title": "...", "items": [...] }],
     "posts":      [{ "url": "...", "type": "image|video" }, ...]
   }

   Se o backend não estiver acessível, o site entra em modo
   demonstração automaticamente (resultados ilustrativos).
-------------------------------- */
const API_URL = 'http://localhost:3000';

const $  = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

/* ---------- Navbar ---------- */
const navbar   = $('#navbar');
const navMenu  = $('#navMenu');
const navToggle = $('#navToggle');

window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 8);
});

navToggle.addEventListener('click', () => {
  const open = navMenu.classList.toggle('open');
  navToggle.classList.toggle('active', open);
  navToggle.setAttribute('aria-expanded', open);
});

// fecha o menu mobile ao clicar em um link
$$('#navMenu a').forEach(a =>
  a.addEventListener('click', () => {
    navMenu.classList.remove('open');
    navToggle.classList.remove('active');
  })
);

/* ---------- Dropdowns (mobile usa .open, desktop usa :hover) ---------- */
$$('.drop-btn').forEach(btn => {
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const parent = btn.parentElement;
    // fecha os outros
    $$('.dropdown.open').forEach(d => d !== parent && d.classList.remove('open'));
    parent.classList.toggle('open');
    btn.setAttribute('aria-expanded', parent.classList.contains('open'));
  });
});
document.addEventListener('click', () =>
  $$('.dropdown.open').forEach(d => d.classList.remove('open'))
);

/* ---------- Botão colar ---------- */
$('#pasteBtn').addEventListener('click', async () => {
  const input = $('#usernameInput');
  try {
    const text = await navigator.clipboard.readText();
    input.value = text.trim();
    input.focus();
  } catch {
    input.focus(); // sem permissão de clipboard: só foca o campo
  }
});

/* ---------- Normalização do username ----------
   Aceita: @usuario, usuario, instagram.com/usuario,
   instagram.com/stories/usuario/123 ... → extrai o username */
function extractUsername(raw) {
  let v = raw.trim();
  if (!v) return null;

  // se veio um link, extrai a parte útil
  const m = v.match(/instagram\.com\/(?:stories\/)?([A-Za-z0-9._]+)/i);
  if (m) v = m[1];

  return v.replace(/^@+/, '').replace(/\/+$/, '');
}

/* ---------- Busca ---------- */
const form       = $('#searchForm');
const searchBtn  = $('#searchBtn');
const btnText    = $('.btn-text', searchBtn);
const spinner    = $('.spinner', searchBtn);
const resultCard = $('#resultCard');

function setLoading(on) {
  searchBtn.disabled = on;
  btnText.hidden = on;
  spinner.hidden = !on;
}

form.addEventListener('submit', async e => {
  e.preventDefault();

  const username = extractUsername($('#usernameInput').value);
  if (!username) {
    $('#usernameInput').focus();
    return;
  }

  setLoading(true);
  resultCard.hidden = true;

  try {
    let profile;
    try {
      const res = await fetch(`${API_URL}/api/profile?u=${encodeURIComponent(username)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Erro');
      profile = body;
    } catch (netErr) {
      // backend offline → cai no modo demonstração
      console.warn('[InstaView] backend indisponível, usando modo demo:', netErr.message);
      await new Promise(r => setTimeout(r, 900));
      profile = buildDemoProfile(username);
    }
    if (profile.is_private) {
      $('#searchHint').innerHTML =
        `<span style="color:#d97706">🔒 <strong>@${profile.username}</strong> é um perfil privado — o conteúdo não é exibido.</span>`;
      return;
    }
    renderProfile(profile, profile.demo === true);
  } catch {
    $('#searchHint').innerHTML =
      `<span style="color:#dc2626">Perfil não encontrado ou indisponível. Verifique o nome e tente novamente.</span>`;
  } finally {
    setLoading(false);
  }
});

/* ---------- Renderização ---------- */
function renderProfile(p, wasDemo = false) {
  $('#resultAvatar').textContent = p.username.charAt(0);
  $('#resultName').textContent   = p.full_name ? `${p.full_name} (@${p.username})` : `@${p.username}`;
  $('#resultMeta').textContent   = `${p.media_count ?? '—'} publicações · ${p.posts?.length ?? 0} posts recentes encontrados`;

  // aviso só aparece no modo demo
  $('.demo-note', resultCard).hidden = !wasDemo;

  // tabs: guarda os dados e ativa a aba Stories
  resultCard.dataset.profile = JSON.stringify(p);
  activateTab('stories');
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'stories'));

  $('#searchHint').innerHTML = 'Funciona apenas com perfis <strong>públicos</strong>.';
  resultCard.hidden = false;
  resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderItems(items) {
  const grid = $('#resultGrid');
  grid.innerHTML = '';

  if (!items || items.length === 0) {
    grid.innerHTML =
      '<p style="grid-column:1/-1;text-align:center;color:var(--text-3);padding:26px 0">' +
      'Nada disponível neste momento.</p>';
    return;
  }

  items.forEach((item, i) => {
    const el = document.createElement('div');
    el.className = 'item';
    const isVideo = item.type === 'video';
    // cor de fundo ilustrativa (demo) ou thumbnail real (API)
    el.style.background = item.thumbnail
      ? `center/cover url(${item.thumbnail})`
      : `linear-gradient(${135 + i * 25}deg, #a78bfa, #f472b6)`;
    el.innerHTML = `
      ${item.thumbnail ? '' : `<span class="thumb">${isVideo ? '🎬' : '🖼️'}</span>`}
      <button class="dl" title="Baixar" data-url="${item.url ?? ''}">⬇</button>
      <div class="label">${isVideo ? 'Vídeo' : 'Foto'} · ${(i + 1)}</div>
    `;
    grid.appendChild(el);
  });
}

/* tabs */
$$('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activateTab(tab.dataset.tab);
  });
});

function activateTab(name) {
  const p = JSON.parse(resultCard.dataset.profile || '{}');
  const map = {
    stories:    p.stories,
    highlights: (p.highlights ?? []).flatMap(h => h.items ?? []),
    reels:      p.reels,
  };
  renderItems(map[name]);
}

/* botão baixar — usa o proxy /media do backend p/ contornar o hotlink do CDN */
$('#resultGrid').addEventListener('click', e => {
  const btn = e.target.closest('.dl');
  if (!btn) return;
  const url = btn.dataset.url;
  if (url) {
    const proxied = `${API_URL}/media?url=${encodeURIComponent(url)}`;
    const a = document.createElement('a');
    a.href = proxied;
    a.download = '';
    a.target = '_blank';
    a.rel = 'noopener';
    a.click();
  } else {
    btn.textContent = '✓';
    setTimeout(() => (btn.textContent = '⬇'), 1200);
  }
});

/* cards de ferramentas → foco na busca */
$$('.tool-card').forEach(card =>
  card.addEventListener('click', e => {
    e.preventDefault();
    $('#usernameInput').focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  })
);

/* ---------- PERFIL DEMO ----------
   Apenas para visualizar o layout sem backend. */
function buildDemoProfile(username) {
  const media = n =>
    Array.from({ length: n }, (_, i) => ({
      type: i % 2 ? 'video' : 'image',
      url: '',
    }));

  return {
    demo: true,
    username,
    full_name: username.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    is_private: false,
    media_count: Math.floor(200 + Math.random() * 900),
    posts: 6,
    stories:    media(6),
    highlights: [{ title: 'Demo' }].flatMap(() => media(4)),
    reels:      media(4),
  };
}
