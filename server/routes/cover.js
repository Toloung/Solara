const { Router } = require('express');

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_EXT_CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
};

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
    console.error('[Cover proxy]', err);
    return res.status(502).json({ error: 'Failed to fetch image' });
  }
}

module.exports = function createCoverRouter() {
  const router = Router();

  router.get('/', (req, res) => proxyRemoteImage(req.query.url, req, res));

  return router;
};
