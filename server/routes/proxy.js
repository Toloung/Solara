/**
 * 代理接口 —— 移植自 functions/proxy.ts
 * GET /proxy
 *
 * 核心缓存逻辑与 Cloudflare 版完全一致：
 *   - Cache HIT  → 直接返回缓存内容，不请求上游
 *   - Cache MISS → 请求上游，成功后写入本地内存缓存（5 分钟 TTL）
 *   - 搜索结果为空 / 包含错误 → 不缓存
 */

const { Router } = require('express');
const cache = require('../cache');
const { handleJ8yProxyRequest } = require('../music-providers/j8y');

const API_BASE_URL = process.env.API_BASE_URL || 'https://music-api.gdstudio.xyz/api.php';
const KUWO_HOST_PATTERN = /(^|\.)kuwo\.cn$/i;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const SAFE_RESPONSE_HEADERS = [
  'content-type', 'cache-control', 'accept-ranges',
  'content-length', 'content-range', 'etag', 'last-modified', 'expires',
];
const IMAGE_EXT_CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
};

function isAllowedKuwoHost(hostname) {
  return hostname && KUWO_HOST_PATTERN.test(hostname);
}

function buildCacheKey(url) {
  // 过滤随机防缓存签名 s 以及 nocache 参数，以便重试成功后能更新同一个缓存项
  const u = new URL(url);
  u.searchParams.delete('s');
  u.searchParams.delete('nocache');
  return u.toString();
}

/** 代理酷我音频流（带 Range 支持） */
async function proxyKuwoAudio(targetUrl, req, res) {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return res.status(400).send('Invalid target');
  }

  if (!isAllowedKuwoHost(parsed.hostname)) {
    return res.status(400).send('Invalid target');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return res.status(400).send('Invalid target');
  }
  parsed.protocol = 'http:';

  const headers = {
    'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
    'Referer': 'https://www.kuwo.cn/',
  };
  if (req.headers['range']) headers['Range'] = req.headers['range'];

  try {
    const upstream = await fetch(parsed.toString(), { method: req.method, headers });
    res.status(upstream.status);

    for (const h of SAFE_RESPONSE_HEADERS) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.send(buf);
  } catch (err) {
    console.error('[Proxy Kuwo]', err);
    return res.status(502).send('Upstream error');
  }
}

/** 代理 music API 请求，带本地缓存 */
function pathExtnameSafe(pathname) {
  const lastSlash = pathname.lastIndexOf('/');
  const filename = lastSlash >= 0 ? pathname.slice(lastSlash + 1) : pathname;
  const lastDot = filename.lastIndexOf('.');
  return lastDot === -1 ? '' : filename.slice(lastDot).toLowerCase();
}

function getImageContentType(target, upstreamContentType) {
  const contentType = (upstreamContentType || '').split(';')[0].trim().toLowerCase();
  if (contentType === 'image/jpg') return 'image/jpeg';
  if (contentType.startsWith('image/')) return upstreamContentType;
  return IMAGE_EXT_CONTENT_TYPES[pathExtnameSafe(target.pathname)] || '';
}

async function proxyRemoteImage(targetUrl, req, res) {
  let target;
  try {
    target = new URL(targetUrl || '');
  } catch {
    return res.status(400).json({ error: 'Invalid image URL' });
  }

  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return res.status(400).json({ error: 'Invalid image URL' });
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Referer': `${target.protocol}//${target.host}/`,
      },
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Image request failed with status ${upstream.status}` });
    }

    const contentLength = Number(upstream.headers.get('content-length') || 0);
    if (contentLength > MAX_IMAGE_BYTES) {
      return res.status(413).json({ error: 'Image too large' });
    }

    const contentType = getImageContentType(target, upstream.headers.get('content-type'));
    if (!contentType) {
      return res.status(415).json({ error: 'Unsupported image type' });
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.length > MAX_IMAGE_BYTES) {
      return res.status(413).json({ error: 'Image too large' });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(buffer);
  } catch (err) {
    console.error('[Proxy image]', err);
    return res.status(502).json({ error: 'Failed to fetch image' });
  }
}

async function proxyApiRequest(reqUrl, req, res) {
  const cacheKey = buildCacheKey(reqUrl);
  const parsedReq = new URL(reqUrl);
  const bypassCache = parsedReq.searchParams.get('nocache') === 'true';
  const provider = (process.env.MUSIC_API_PROVIDER || 'default').toLowerCase();

  // ── Cache HIT ──────────────────────────────────────────────────────────────
  if (!bypassCache) {
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`[Cache HIT] ${reqUrl}`);
      res.setHeader('Content-Type', cached.contentType || 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('X-Cache-Status', 'HIT');
      res.setHeader('Access-Control-Expose-Headers', 'X-Cache-Status');
      return res.send(cached.body);
    }
  }

  // ── Cache MISS：请求上游 ────────────────────────────────────────────────────
  console.log(`[Cache MISS] Fetching from upstream: ${reqUrl}`);

  let responseText;
  let contentType = 'application/json; charset=utf-8';
  let status = 200;

  if (provider === 'j8y') {
    try {
      const providerResponse = await handleJ8yProxyRequest(parsedReq, req);
      responseText = providerResponse.body;
      contentType = providerResponse.contentType || contentType;
      status = providerResponse.status || 200;
    } catch (err) {
      console.error('[Proxy j8y fetch]', err);
      return res.status(502).send('Upstream error');
    }
  } else {
    const apiUrl = new URL(API_BASE_URL);
    parsedReq.searchParams.forEach((value, key) => {
      if (key === 'target' || key === 'callback' || key === 's' || key === 'nocache') return;
      apiUrl.searchParams.set(key, value);
    });

    if (!apiUrl.searchParams.has('types')) {
      return res.status(400).send('Missing types');
    }

    let upstream;
    try {
      upstream = await fetch(apiUrl.toString(), {
        headers: {
          'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
          'Accept': 'application/json',
        },
      });
    } catch (err) {
      console.error('[Proxy API fetch]', err);
      return res.status(502).send('Upstream error');
    }

    responseText = await upstream.text();
    contentType = upstream.headers.get('content-type') || contentType;
    status = upstream.status;
  }

  // ── 判断是否缓存（与 Cloudflare 版本逻辑完全一致）──────────────────────────
  const isSearch = parsedReq.searchParams.get('types') === 'search';
  const isEmptyResult = responseText.trim() === '[]';
  const isError = responseText.includes('"error"') || responseText.includes('"status":0');

  let shouldCache = status === 200 && !isError && !bypassCache;
  if (isSearch && isEmptyResult) shouldCache = false;

  if (shouldCache) {
    cache.set(cacheKey, { body: responseText, contentType }, 300); // 缓存 5 分钟
    console.log(`[Cache PUT] Saved to cache: ${reqUrl}`);
  }

  res.setHeader('Content-Type', contentType);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Cache-Status', 'MISS');
  res.setHeader('Access-Control-Expose-Headers', 'X-Cache-Status');
  res.setHeader('Cache-Control', shouldCache ? 'public, max-age=300' : 'no-store');

  return res.status(status).send(responseText);
}

module.exports = function createProxyRouter() {
  const router = Router();

  router.options('/', (req, res) => {
    res.status(204)
      .set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      })
      .end();
  });

  router.get('/', async (req, res) => {
    const target = req.query.target;
    const type = req.query.types;

    if (type === 'pic-image') {
      return proxyRemoteImage(target || req.query.url, req, res);
    }

    if (target) {
      return proxyKuwoAudio(target, req, res);
    }

    // 重建完整 URL（含查询参数）给缓存 key 使用
    const fullUrl = `http://localhost${req.originalUrl}`;
    return proxyApiRequest(fullUrl, req, res);
  });

  return router;
};
