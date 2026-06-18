const DEFAULT_API_BASE_URL = "https://music-api.gdstudio.xyz/api.php";
const DEFAULT_J8Y_API_BASE = "https://api.j8y.cn/api/gateway.php";
const DEFAULT_J8Y_API_PATHS = ["wy_music", "znnu_music"];
const DEFAULT_J8Y_LEVEL = "standard";
const KUWO_HOST_PATTERN = /(^|\.)kuwo\.cn$/i;
const SAFE_RESPONSE_HEADERS = ["content-type", "cache-control", "accept-ranges", "content-length", "content-range", "etag", "last-modified", "expires"];
const AUDIO_URL_FIELDS = ["url", "play_url", "playUrl", "music_url", "musicUrl", "src"];
const SONG_NAME_FIELDS = ["name", "title", "songName"];
const ARTIST_FIELDS = ["artist", "author", "artists", "ar", "singer"];
const SONG_ID_FIELDS = ["id", "songId", "songid"];
const COVER_FIELDS = ["pic", "cover", "albumPic", "picUrl", "image"];

function splitList(value: unknown, fallback: string[]): string[] {
  if (typeof value !== "string") return fallback.slice();
  const values = value.split(",").map((item) => item.trim()).filter(Boolean);
  return values.length > 0 ? values : fallback.slice();
}

function getJ8yConfig(env: any) {
  return {
    appKey: typeof env?.J8Y_APP_KEY === "string" ? env.J8Y_APP_KEY : "",
    apiBase: typeof env?.J8Y_API_BASE === "string" && env.J8Y_API_BASE ? env.J8Y_API_BASE : DEFAULT_J8Y_API_BASE,
    apiPaths: splitList(env?.J8Y_API_PATHS, DEFAULT_J8Y_API_PATHS),
    level: typeof env?.J8Y_LEVEL === "string" && env.J8Y_LEVEL ? env.J8Y_LEVEL : DEFAULT_J8Y_LEVEL,
  };
}

function getFirstValue(item: any, fields: string[]): any {
  for (const field of fields) {
    if (item && item[field] !== undefined && item[field] !== null && item[field] !== "") {
      return item[field];
    }
  }
  return "";
}

function objectName(value: any): string {
  if (!value || typeof value !== "object") return "";
  return value.name || value.title || value.nickname || "";
}

function normalizeArtist(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((entry) => typeof entry === "string" ? entry : objectName(entry))
      .filter(Boolean)
      .join(" / ");
  }
  if (typeof value === "object") {
    return objectName(value) || JSON.stringify(value);
  }
  return String(value);
}

function normalizeText(value: any): string {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}

function collectObjects(value: any, result: any[] = [], seen: Set<any> = new Set()): any[] {
  if (!value) return result;
  if (Array.isArray(value)) {
    value.forEach((item) => collectObjects(item, result, seen));
    return result;
  }
  if (typeof value === "object") {
    if (seen.has(value)) return result;
    seen.add(value);
    result.push(value);
    Object.values(value).forEach((item) => collectObjects(item, result, seen));
  }
  return result;
}

function findAudioUrl(payload: any): string {
  const urls = collectObjects(payload)
    .flatMap((item) => AUDIO_URL_FIELDS.map((field) => item[field]))
    .filter(Boolean)
    .map(String);

  return urls.find((url) => /^https?:\/\//i.test(url) && /\.(mp3|flac|m4a|aac|wav)(\?|$)/i.test(url))
    || urls.find((url) => /^https?:\/\//i.test(url))
    || "";
}

function extractLyric(payload: any): string {
  for (const item of collectObjects(payload)) {
    const lyric = item.lyric || item.lyrics || item.lrc || item.text;
    if (typeof lyric === "string" && lyric.trim()) return lyric;
  }
  return "";
}

function getAlbumName(item: any): string {
  const album = item.album || item.al || item.albumName;
  if (typeof album === "string") return album;
  if (album && typeof album === "object") return album.name || album.title || "";
  return "";
}

function normalizeJ8ySong(item: any, apiPath: string): any | null {
  const id = getFirstValue(item, SONG_ID_FIELDS);
  const name = getFirstValue(item, SONG_NAME_FIELDS);
  const artist = getFirstValue(item, ARTIST_FIELDS);
  const cover = getFirstValue(item, COVER_FIELDS);

  if (!name || id === "") return null;

  return {
    id: String(id),
    name: String(name),
    artist: normalizeArtist(artist) || "Unknown artist",
    album: getAlbumName(item),
    pic_id: cover ? String(cover) : "",
    url_id: String(id),
    lyric_id: String(id),
    source: "j8y",
    api_path: apiPath,
    j8y_api_path: apiPath,
  };
}

function normalizeJ8ySearchResults(payload: any, apiPath: string): any[] {
  const seen = new Set<string>();
  const songs: any[] = [];

  for (const item of collectObjects(payload)) {
    const song = normalizeJ8ySong(item, apiPath);
    if (!song) continue;
    const key = `${song.source}:${song.id}:${normalizeText(song.name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    songs.push(song);
  }

  return songs;
}

function buildJ8yUrl(apiPath: string, params: Record<string, any>, config: any): URL {
  const url = new URL(config.apiBase);
  url.searchParams.set("api_path", apiPath);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url;
}

async function fetchJ8yApi(apiPath: string, params: Record<string, any>, config: any, request: Request): Promise<any> {
  const url = buildJ8yUrl(apiPath, params, config);
  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": request.headers.get("User-Agent") ?? "Mozilla/5.0",
      "Accept": "application/json",
      "X-App-Key": config.appKey,
    },
  });

  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  let payload: any = text;
  if (contentType.includes("json") || /^[\[{]/.test(text.trim())) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const message = typeof payload === "string" ? payload : (payload.message || payload.msg || payload.error);
    throw new Error(message || `j8y request failed with status ${response.status}`);
  }

  return payload;
}

function getRequestedLimit(url: URL): number {
  const count = Number(url.searchParams.get("count") || url.searchParams.get("limit") || 20);
  return Math.max(1, Math.min(100, Math.trunc(count) || 20));
}

function getRequestedOffset(url: URL, limit: number): number {
  const explicitOffset = url.searchParams.get("offset");
  if (explicitOffset !== null) {
    return Math.max(0, Math.trunc(Number(explicitOffset)) || 0);
  }
  const page = Math.max(1, Math.trunc(Number(url.searchParams.get("pages") || url.searchParams.get("page") || 1)) || 1);
  return (page - 1) * limit;
}

async function searchJ8y(url: URL, config: any, request: Request): Promise<{ status: number, body: string }> {
  const keyword = url.searchParams.get("name") || url.searchParams.get("keyword") || "";
  if (!keyword.trim()) {
    return { status: 400, body: JSON.stringify({ error: "Missing keyword" }) };
  }

  const limit = getRequestedLimit(url);
  const offset = getRequestedOffset(url, limit);
  let lastError: Error | null = null;

  for (const apiPath of config.apiPaths) {
    try {
      const payload = await fetchJ8yApi(apiPath, {
        action: "search",
        keyword,
        limit,
        offset,
        level: config.level,
      }, config, request);

      const songs = normalizeJ8ySearchResults(payload, apiPath);
      if (songs.length > 0) {
        return { status: 200, body: JSON.stringify(songs.slice(0, limit)) };
      }
      lastError = new Error(`No usable search results from ${apiPath}`);
    } catch (error: any) {
      lastError = error;
    }
  }

  if (lastError) {
    console.warn("[j8y search fallback exhausted]", lastError.message);
  }
  return { status: 200, body: "[]" };
}

function getCandidateApiPaths(url: URL, config: any): string[] {
  const preferred = url.searchParams.get("api_path") || url.searchParams.get("j8y_api_path") || "";
  const paths: string[] = [];
  if (preferred) paths.push(preferred);
  config.apiPaths.forEach((path: string) => {
    if (!paths.includes(path)) paths.push(path);
  });
  return paths;
}

async function resolveJ8ySongUrl(url: URL, config: any, request: Request): Promise<{ status: number, body: string }> {
  const id = url.searchParams.get("id") || url.searchParams.get("url_id") || "";
  if (!id) {
    return { status: 400, body: JSON.stringify({ error: "Missing id" }) };
  }
  if (/^https?:\/\//i.test(id)) {
    return { status: 200, body: JSON.stringify({ url: id, source: "j8y" }) };
  }

  let lastError: Error | null = null;
  for (const apiPath of getCandidateApiPaths(url, config)) {
    try {
      const payload = await fetchJ8yApi(apiPath, {
        action: "song",
        id,
        level: config.level,
      }, config, request);
      const audioUrl = findAudioUrl(payload);
      if (audioUrl) {
        return {
          status: 200,
          body: JSON.stringify({ url: audioUrl, source: "j8y", api_path: apiPath, j8y_api_path: apiPath }),
        };
      }
      lastError = new Error(`No audio URL from ${apiPath}`);
    } catch (error: any) {
      lastError = error;
    }
  }

  return { status: 502, body: JSON.stringify({ error: lastError?.message || "No audio URL found" }) };
}

async function getJ8yLyric(url: URL, config: any, request: Request): Promise<{ status: number, body: string }> {
  const id = url.searchParams.get("id") || "";
  if (!id) return { status: 200, body: JSON.stringify({ lyric: "" }) };

  for (const apiPath of getCandidateApiPaths(url, config)) {
    try {
      const payload = await fetchJ8yApi(apiPath, {
        action: "lyric",
        id,
        level: config.level,
      }, config, request);
      const lyric = extractLyric(payload);
      if (lyric) return { status: 200, body: JSON.stringify({ lyric }) };
    } catch {
      // Some j8y paths may not expose lyrics. Keep the UI quiet.
    }
  }

  return { status: 200, body: JSON.stringify({ lyric: "" }) };
}

async function handleJ8yProxyRequest(url: URL, request: Request, env: any): Promise<{ status: number, body: string, contentType: string }> {
  const config = getJ8yConfig(env);
  if (!config.appKey) {
    return {
      status: 500,
      body: JSON.stringify({ error: "J8Y_APP_KEY is required when MUSIC_API_PROVIDER=j8y" }),
      contentType: "application/json; charset=utf-8",
    };
  }

  const type = url.searchParams.get("types") || "";
  let response: { status: number, body: string };
  if (type === "search") {
    response = await searchJ8y(url, config, request);
  } else if (type === "url") {
    response = await resolveJ8ySongUrl(url, config, request);
  } else if (type === "lyric") {
    response = await getJ8yLyric(url, config, request);
  } else {
    response = { status: 400, body: JSON.stringify({ error: `Unsupported j8y proxy type: ${type}` }) };
  }

  return { ...response, contentType: "application/json; charset=utf-8" };
}

function createCorsHeaders(init?: Headers): Headers {
  const headers = new Headers();
  if (init) {
    for (const [key, value] of init.entries()) {
      if (SAFE_RESPONSE_HEADERS.includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    }
  }
  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", "no-store");
  }
  headers.set("Access-Control-Allow-Origin", "*");
  return headers;
}

function handleOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    },
  });
}

function isAllowedKuwoHost(hostname: string): boolean {
  if (!hostname) return false;
  return KUWO_HOST_PATTERN.test(hostname);
}

function normalizeKuwoUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl);
    if (!isAllowedKuwoHost(parsed.hostname)) {
      return null;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    parsed.protocol = "http:";
    return parsed;
  } catch {
    return null;
  }
}

async function proxyKuwoAudio(targetUrl: string, request: Request): Promise<Response> {
  const normalized = normalizeKuwoUrl(targetUrl);
  if (!normalized) {
    return new Response("Invalid target", { status: 400 });
  }

  const init: RequestInit = {
    method: request.method,
    headers: {
      "User-Agent": request.headers.get("User-Agent") ?? "Mozilla/5.0",
      "Referer": "https://www.kuwo.cn/",
    },
  };

  const rangeHeader = request.headers.get("Range");
  if (rangeHeader) {
    (init.headers as Record<string, string>)["Range"] = rangeHeader;
  }

  const upstream = await fetch(normalized.toString(), init);
  const headers = createCorsHeaders(upstream.headers);
  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", "public, max-age=3600");
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

async function proxyApiRequest(url: URL, request: Request, waitUntil?: (promise: Promise<any>) => void, apiBaseUrl: string = DEFAULT_API_BASE_URL, env?: any): Promise<Response> {
  const cache = (caches as CacheStorage & { default: Cache }).default;
  
  // 构建缓存 Key（过滤掉随机签名 s 以及强制刷新标记 nocache，以便重试成功后能更新同一个缓存项）
  const cacheUrl = new URL(url.toString());
  cacheUrl.searchParams.delete("s");
  cacheUrl.searchParams.delete("nocache");
  
  const cacheKey = new Request(cacheUrl.toString(), {
    method: request.method,
    headers: request.headers
  });

  // 如果是 GET 请求且未指定 nocache 强制刷新，尝试命中缓存
  const bypassCache = url.searchParams.get("nocache") === "true";
  if (request.method === "GET" && !bypassCache) {
    try {
      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        console.log(`[Cache HIT] ${url.toString()}`);
        const response = new Response(cachedResponse.body, cachedResponse);
        response.headers.set("X-Cache-Status", "HIT");
        response.headers.set("Access-Control-Expose-Headers", "X-Cache-Status");
        return response;
      }
    } catch (err) {
      console.warn(`[Cache ERROR] ${url.toString()}`, err);
    }
  }

  console.log(`[Cache MISS] Fetching from upstream: ${url.toString()}`);

  const provider = (typeof env?.MUSIC_API_PROVIDER === "string" ? env.MUSIC_API_PROVIDER : "default").toLowerCase();
  let responseText = "";
  let status = 200;
  let statusText = "OK";
  let headers = createCorsHeaders();

  if (provider === "j8y") {
    const providerResponse = await handleJ8yProxyRequest(url, request, env);
    responseText = providerResponse.body;
    status = providerResponse.status;
    headers.set("Content-Type", providerResponse.contentType);
  } else {
    const apiUrl = new URL(apiBaseUrl);
    url.searchParams.forEach((value, key) => {
      if (key === "target" || key === "callback" || key === "s" || key === "nocache") {
        return;
      }
      apiUrl.searchParams.set(key, value);
    });

    if (!apiUrl.searchParams.has("types")) {
      return new Response("Missing types", { status: 400 });
    }

    const upstream = await fetch(apiUrl.toString(), {
      headers: {
        "User-Agent": request.headers.get("User-Agent") ?? "Mozilla/5.0",
        "Accept": "application/json",
      },
    });

    responseText = await upstream.text();
    status = upstream.status;
    statusText = upstream.statusText;
    headers = createCorsHeaders(upstream.headers);
  }

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }

  headers.set("X-Cache-Status", "MISS");
  headers.set("Access-Control-Expose-Headers", "X-Cache-Status");

  // 判断是否应该缓存：必须是 200 状态，且内容不能是空数组或包含错误标识，且未指定强制刷新
  const isSearch = url.searchParams.get("types") === "search";
  const isEmptyResult = responseText.trim() === "[]";
  const isError = responseText.includes('"error"') || responseText.includes('"status":0');
  
  let shouldCache = status === 200 && request.method === "GET" && !isError && !bypassCache;
  
  // 如果是搜索请求且结果为空，通常是 API 繁忙或异常，不建议长缓存
  if (isSearch && isEmptyResult) {
    shouldCache = false;
  }

  if (shouldCache) {
    headers.set("Cache-Control", "public, s-maxage=300, max-age=300");
  } else {
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  }

  const response = new Response(responseText, {
    status,
    statusText,
    headers,
  });

  // 写入缓存（不阻塞主流程）
  if (shouldCache && waitUntil) {
    waitUntil(cache.put(cacheKey, response.clone()));
    console.log(`[Cache PUT] Saved to cache: ${url.toString()}`);
  }

  return response;
}

export async function onRequest({ request, waitUntil, env }: { request: Request, waitUntil: (promise: Promise<any>) => void, env: any }): Promise<Response> {
  // 优先使用环境变量中配置的 API 地址，CF 部署未设置时 fallback 到默认节点
  const apiBaseUrl = (typeof env?.API_BASE_URL === "string" && env.API_BASE_URL) ? env.API_BASE_URL : DEFAULT_API_BASE_URL;
  if (request.method === "OPTIONS") {
    return handleOptions();
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(request.url);
  const target = url.searchParams.get("target");

  if (target) {
    return proxyKuwoAudio(target, request);
  }

  return proxyApiRequest(url, request, waitUntil, apiBaseUrl, env);
}
