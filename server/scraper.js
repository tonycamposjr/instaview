/* ============================================================
   InstaView — scraper.js
   Consulta APENAS conteúdo PUBLICO do Instagram, pela API web
   usada pelo próprio site do Instagram.

   AVISOS IMPORTANTES:
   - Esta técnica NÃO é uma API oficial e pode parar de funcionar
     quando o Instagram mudar seus endpoints.
   - Automatizar acesso viola os Termos de Uso do Instagram.
     Use para fins educacionais, por sua conta e risco.
   - Perfis privados NUNCA são acessados — o endpoint respeita
     a privacidade e simplesmente não retorna dados privados.
   - Para maior confiabilidade, defina IG_SESSIONID no .env com
     o cookie de sessão de uma conta sua (opcional).
   ============================================================ */

const IG_APP_ID = '936619743392459'; // app id público usado pelo instagram.com
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/* ---------- fetch base com headers de navegador ---------- */
async function igFetch(url) {
  const headers = {
    'user-agent': UA,
    'x-ig-app-id': IG_APP_ID,
    accept: '*/*',
    'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
    referer: 'https://www.instagram.com/',
  };

  // cookie opcional — aumenta muito a taxa de sucesso
  if (process.env.IG_SESSIONID) {
    headers.cookie = `sessionid=${process.env.IG_SESSIONID}`;
  }

  const res = await fetch(url, { headers, redirect: 'follow' });

  // IG devolve HTML (página de login/404) quando a sessão não é aceita
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('json')) {
    if (process.env.IG_SESSIONID) {
      throw Object.assign(
        new Error('Sessão do Instagram rejeitada — gere um novo sessionid'),
        { status: 401 }
      );
    }
    throw Object.assign(
      new Error(
        'Instagram exige sessão autenticada: defina IG_SESSIONID no .env (veja README)'
      ),
      { status: 401 }
    );
  }

  if (res.status === 404) {
    throw Object.assign(new Error('Perfil não encontrado'), { status: 404 });
  }
  if (res.status === 429) {
    throw Object.assign(new Error('Muitas requisições — tente novamente em instantes'), { status: 429 });
  }
  if (!res.ok) {
    throw Object.assign(new Error(`Instagram respondeu ${res.status}`), { status: 502 });
  }
  return res.json();
}

/* ---------- mapeia o formato do grafo do IG p/ nosso formato ---------- */
function mapMedia(edge) {
  return (edge?.edges ?? [])
    .filter(({ node }) => node && (node.display_url || node.thumbnail_src))
    .map(({ node }) => ({
      type: node.is_video ? 'video' : 'image',
      url: node.is_video ? (node.video_url ?? node.display_url) : node.display_url,
      thumbnail: node.thumbnail_src ?? node.display_url,
      shortcode: node.shortcode ?? null,
      taken_at: node.taken_at_timestamp ?? null,
    }));
}

/* ---------- perfil público + stories ativos ---------- */
export async function getProfile(username) {
  const clean = String(username || '')
    .trim()
    .replace(/^@+/, '');

  if (!/^[A-Za-z0-9._]{1,30}$/.test(clean)) {
    throw Object.assign(new Error('Nome de usuário inválido'), { status: 400 });
  }

  const data = await igFetch(
    `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(clean)}`
  );

  const user = data?.data?.user;
  if (!user) {
    throw Object.assign(new Error('Perfil não encontrado'), { status: 404 });
  }

  const profile = {
    username: user.username,
    full_name: user.full_name,
    avatar: user.profile_pic_url_hd ?? user.profile_pic_url,
    is_private: !!user.is_private,
    is_verified: !!user.is_verified,
    followers: user.edge_followed_by?.count ?? null,
    media_count: user.edge_owner_to_timeline_media?.count ?? null,
    posts: mapMedia(user.edge_owner_to_timeline_media),
    stories: mapMedia(user.story?.edge_owner_to_timeline_media),
    highlights: [],
  };

  // highlights são best-effort: se falhar, segue sem eles
  if (!profile.is_private && user.id) {
    try {
      profile.highlights = await getHighlights(user.id);
    } catch {
      profile.highlights = [];
    }
  }

  return profile;
}

/* ---------- highlights (best-effort) ---------- */
export async function getHighlights(userId) {
  const tray = await igFetch(
    `https://www.instagram.com/api/v1/highlights/${userId}/highlights_tray/`
  );

  const trays = (tray?.tray ?? []).slice(0, 6);
  if (trays.length === 0) return [];

  // busca o conteúdo de até 6 highlights de uma vez
  const reelIds = trays.map(h => h.id).join('&reel_ids=');
  const media = await igFetch(
    `https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=${encodeURIComponent(reelIds)}`
  );

  const byId = media?.reels_media ?? media?.reels ?? {};

  return trays.map(h => {
    const itemsEdge = byId[h.id]?.items ?? [];
    return {
      title: h.title,
      cover: h.cover_media?.cropped_image?.url ?? h.cover_media?.image?.url ?? null,
      items: itemsEdge.map(item => ({
        type: item.is_video ? 'video' : 'image',
        url: item.is_video ? (item.video_url ?? item.display_url) : item.display_url,
        thumbnail: item.thumbnail_src ?? item.display_url,
      })),
    };
  });
}
