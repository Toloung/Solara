const DEFAULT_J8Y_API_BASE = 'https://api.j8y.cn/api/gateway.php';
const DEFAULT_J8Y_API_PATHS = ['wy_music', 'znnu_music'];
const DEFAULT_J8Y_LEVEL = 'standard';

const AUDIO_URL_FIELDS = ['url', 'play_url', 'playUrl', 'music_url', 'musicUrl', 'src'];
const SONG_NAME_FIELDS = ['name', 'title', 'songName'];
const ARTIST_FIELDS = ['artist', 'author', 'artists', 'ar', 'singer'];
const SONG_ID_FIELDS = ['id', 'songId', 'songid'];
const COVER_FIELDS = ['pic', 'cover', 'albumPic', 'picUrl', 'image'];
const IMAGE_URL_FIELDS = [
  ...COVER_FIELDS,
  'album_img',
  'albumImage',
  'img',
  'imgUrl',
  'coverUrl',
  'cover_url',
  'album_pic',
  'albumPicUrl',
  'thumbnail',
  'thumb',
  'poster',
  'artwork',
];
const LYRIC_FIELDS = ['lyric', 'lyrics', 'lrc', 'text', 'content', 'lyricText', 'lrcContent', 'words', 'word', 'yrc'];

function splitList(value, fallback) {
  if (typeof value !== 'string') return fallback.slice();
  const values = value.split(',').map((item) => item.trim()).filter(Boolean);
  return values.length > 0 ? values : fallback.slice();
}

function getConfig(env = process.env) {
  return {
    appKey: env.J8Y_APP_KEY || '',
    apiBase: env.J8Y_API_BASE || DEFAULT_J8Y_API_BASE,
    apiPaths: splitList(env.J8Y_API_PATHS, DEFAULT_J8Y_API_PATHS),
    level: env.J8Y_LEVEL || DEFAULT_J8Y_LEVEL,
  };
}

function getFirstValue(item, fields) {
  for (const field of fields) {
    if (item && item[field] !== undefined && item[field] !== null && item[field] !== '') {
      return item[field];
    }
  }
  return '';
}

function objectName(value) {
  if (!value || typeof value !== 'object') return '';
  return value.name || value.title || value.nickname || '';
}

function normalizeArtist(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === 'string') return entry;
        return objectName(entry);
      })
      .filter(Boolean)
      .join(' / ');
  }
  if (typeof value === 'object') {
    return objectName(value) || JSON.stringify(value);
  }
  return String(value);
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, '').toLowerCase();
}

function collectObjects(value, result = [], seen = new Set()) {
  if (!value) return result;

  if (Array.isArray(value)) {
    for (const item of value) collectObjects(item, result, seen);
    return result;
  }

  if (typeof value === 'object') {
    if (seen.has(value)) return result;
    seen.add(value);
    result.push(value);
    for (const item of Object.values(value)) collectObjects(item, result, seen);
  }

  return result;
}

function findAudioUrl(payload) {
  const urls = collectObjects(payload)
    .flatMap((item) => AUDIO_URL_FIELDS.map((field) => item[field]))
    .filter(Boolean)
    .map(String);

  return urls.find((url) => /^https?:\/\//i.test(url) && /\.(mp3|flac|m4a|aac|wav)(\?|$)/i.test(url))
    || urls.find((url) => /^https?:\/\//i.test(url))
    || '';
}

function extractUrlsFromString(value) {
  return String(value || '').match(/https?:\/\/[^\s"'<>\\]+/gi) || [];
}

function findImageUrl(payload) {
  const urls = collectObjects(payload)
    .flatMap((item) => IMAGE_URL_FIELDS.map((field) => item[field]))
    .flatMap((value) => {
      if (!value) return [];
      if (typeof value === 'string') return extractUrlsFromString(value);
      if (typeof value === 'object') return [findImageUrl(value)].filter(Boolean);
      return extractUrlsFromString(value);
    });

  return urls.find((url) => /\.(jpe?g|png|webp|gif|bmp|avif)(\?|$)/i.test(url))
    || urls.find((url) => /^https?:\/\//i.test(url) && !/\.(mp3|flac|m4a|aac|wav)(\?|$)/i.test(url))
    || '';
}

function extractLyric(payload) {
  const objects = collectObjects(payload);
  for (const item of objects) {
    for (const field of LYRIC_FIELDS) {
      const lyric = item[field];
      if (typeof lyric === 'string' && lyric.trim()) return lyric;
      if (lyric && typeof lyric === 'object') {
        const nestedLyric = extractLyric(lyric);
        if (nestedLyric) return nestedLyric;
      }
    }
  }
  return '';
}

function getAlbumName(item) {
  const album = item.album || item.al || item.albumName;
  if (typeof album === 'string') return album;
  if (album && typeof album === 'object') return album.name || album.title || '';
  return '';
}

function normalizeCoverValue(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    return extractUrlsFromString(value)[0] || value;
  }
  if (typeof value === 'object') return findImageUrl(value);
  return String(value);
}

function buildProxiedImageUrl(imageUrl) {
  if (!imageUrl) return '';
  const params = new URLSearchParams({
    url: imageUrl,
  });
  return `/api/cover?${params.toString()}`;
}

function normalizeSong(item, apiPath) {
  const id = getFirstValue(item, SONG_ID_FIELDS);
  const name = getFirstValue(item, SONG_NAME_FIELDS);
  const artist = getFirstValue(item, ARTIST_FIELDS);
  const cover = normalizeCoverValue(getFirstValue(item, COVER_FIELDS)) || findImageUrl(item);

  if (!name || id === '') return null;

  return {
    id: String(id),
    name: String(name),
    artist: normalizeArtist(artist) || 'Unknown artist',
    album: getAlbumName(item),
    pic_id: cover || String(id),
    pic_url: cover,
    coverUrl: cover,
    url_id: String(id),
    lyric_id: String(id),
    source: 'j8y',
    api_path: apiPath,
    j8y_api_path: apiPath,
  };
}

function normalizeSearchResults(payload, apiPath) {
  const seen = new Set();
  const songs = [];

  for (const item of collectObjects(payload)) {
    const song = normalizeSong(item, apiPath);
    if (!song) continue;

    const key = `${song.source}:${song.id}:${normalizeText(song.name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    songs.push(song);
  }

  return songs;
}

function buildJ8yUrl(apiPath, params, config) {
  const url = new URL(config.apiBase);
  url.searchParams.set('api_path', apiPath);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function fetchJ8yApi(apiPath, params, config, req) {
  const url = buildJ8yUrl(apiPath, params, config);
  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
      'Accept': 'application/json',
      'X-App-Key': config.appKey,
    },
  });

  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  let payload = text;

  if (contentType.includes('json') || /^[\[{]/.test(text.trim())) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const message = typeof payload === 'string' ? payload : (payload.message || payload.msg || payload.error);
    throw new Error(message || `j8y request failed with status ${response.status}`);
  }

  return payload;
}

function getRequestedLimit(url) {
  const count = Number(url.searchParams.get('count') || url.searchParams.get('limit') || 20);
  return Math.max(1, Math.min(100, Math.trunc(count) || 20));
}

function getRequestedOffset(url, limit) {
  const explicitOffset = url.searchParams.get('offset');
  if (explicitOffset !== null) {
    return Math.max(0, Math.trunc(Number(explicitOffset)) || 0);
  }
  const page = Math.max(1, Math.trunc(Number(url.searchParams.get('pages') || url.searchParams.get('page') || 1)) || 1);
  return (page - 1) * limit;
}

async function searchJ8y(url, config, req) {
  const keyword = url.searchParams.get('name') || url.searchParams.get('keyword') || '';
  if (!keyword.trim()) {
    return { status: 400, body: JSON.stringify({ error: 'Missing keyword' }) };
  }

  const limit = getRequestedLimit(url);
  const offset = getRequestedOffset(url, limit);
  let lastError = null;

  for (const apiPath of config.apiPaths) {
    try {
      const payload = await fetchJ8yApi(apiPath, {
        action: 'search',
        keyword,
        limit,
        offset,
        level: config.level,
      }, config, req);

      const songs = normalizeSearchResults(payload, apiPath);
      if (songs.length > 0) {
        return { status: 200, body: JSON.stringify(songs.slice(0, limit)) };
      }
      lastError = new Error(`No usable search results from ${apiPath}`);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    console.warn('[j8y search fallback exhausted]', lastError.message);
  }
  return { status: 200, body: '[]' };
}

function getCandidateApiPaths(url, config) {
  const preferred = url.searchParams.get('api_path') || url.searchParams.get('j8y_api_path') || '';
  const paths = [];
  if (preferred) paths.push(preferred);
  for (const path of config.apiPaths) {
    if (!paths.includes(path)) paths.push(path);
  }
  return paths;
}

async function resolveJ8ySongUrl(url, config, req) {
  const id = url.searchParams.get('id') || url.searchParams.get('url_id') || '';
  if (!id) {
    return { status: 400, body: JSON.stringify({ error: 'Missing id' }) };
  }
  if (/^https?:\/\//i.test(id)) {
    return { status: 200, body: JSON.stringify({ url: id, source: 'j8y' }) };
  }

  let lastError = null;
  for (const apiPath of getCandidateApiPaths(url, config)) {
    try {
      const payload = await fetchJ8yApi(apiPath, {
        action: 'song',
        id,
        level: config.level,
      }, config, req);
      const audioUrl = findAudioUrl(payload);
      if (audioUrl) {
        return {
          status: 200,
          body: JSON.stringify({ url: audioUrl, source: 'j8y', api_path: apiPath, j8y_api_path: apiPath }),
        };
      }
      lastError = new Error(`No audio URL from ${apiPath}`);
    } catch (error) {
      lastError = error;
    }
  }

  const message = lastError ? lastError.message : 'No audio URL found';
  return { status: 502, body: JSON.stringify({ error: message }) };
}

async function resolveJ8yPicUrl(url, config, req) {
  const id = url.searchParams.get('id') || url.searchParams.get('pic_id') || '';
  if (!id) return { status: 200, body: JSON.stringify({ url: '' }) };
  if (/^https?:\/\//i.test(id)) {
    return {
      status: 200,
      body: JSON.stringify({ url: buildProxiedImageUrl(id), raw_url: id, source: 'j8y' }),
    };
  }

  for (const apiPath of getCandidateApiPaths(url, config)) {
    try {
      const payload = await fetchJ8yApi(apiPath, {
        action: 'song',
        id,
        level: config.level,
      }, config, req);
      const imageUrl = findImageUrl(payload);
      if (imageUrl) {
        return {
          status: 200,
          body: JSON.stringify({
            url: buildProxiedImageUrl(imageUrl),
            raw_url: imageUrl,
            source: 'j8y',
            api_path: apiPath,
            j8y_api_path: apiPath,
          }),
        };
      }
    } catch {
      // Cover art is optional; fall through to the next path.
    }
  }

  return { status: 200, body: JSON.stringify({ url: '' }) };
}

async function getJ8yLyric(url, config, req) {
  const id = url.searchParams.get('id') || '';
  if (!id) return { status: 200, body: JSON.stringify({ lyric: '' }) };

  for (const apiPath of getCandidateApiPaths(url, config)) {
    for (const action of ['lyric', 'song']) {
      try {
        const payload = await fetchJ8yApi(apiPath, {
          action,
          id,
          level: config.level,
        }, config, req);
        const lyric = extractLyric(payload);
        if (lyric) return { status: 200, body: JSON.stringify({ lyric }) };
      } catch {
        // Some j8y paths may not expose lyrics. Keep the UI quiet.
      }
    }
  }

  return { status: 200, body: JSON.stringify({ lyric: '' }) };
}

async function handleJ8yProxyRequest(url, req, env = process.env) {
  const config = getConfig(env);
  if (!config.appKey) {
    return {
      status: 500,
      body: JSON.stringify({ error: 'J8Y_APP_KEY is required when MUSIC_API_PROVIDER=j8y' }),
      contentType: 'application/json; charset=utf-8',
    };
  }

  const type = url.searchParams.get('types') || '';
  let response;

  if (type === 'search') {
    response = await searchJ8y(url, config, req);
  } else if (type === 'url') {
    response = await resolveJ8ySongUrl(url, config, req);
  } else if (type === 'pic') {
    response = await resolveJ8yPicUrl(url, config, req);
  } else if (type === 'lyric') {
    response = await getJ8yLyric(url, config, req);
  } else {
    response = { status: 400, body: JSON.stringify({ error: `Unsupported j8y proxy type: ${type}` }) };
  }

  return {
    status: response.status,
    body: response.body,
    contentType: 'application/json; charset=utf-8',
  };
}

module.exports = {
  handleJ8yProxyRequest,
  collectObjects,
  findAudioUrl,
  findImageUrl,
  normalizeSearchResults,
};
