const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_EXT_CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".avif": "image/avif",
};

function createCorsHeaders(): Headers {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Cache-Control", "public, max-age=86400");
  return headers;
}

function pathExtnameSafe(pathname: string): string {
  const lastSlash = pathname.lastIndexOf("/");
  const filename = lastSlash >= 0 ? pathname.slice(lastSlash + 1) : pathname;
  const lastDot = filename.lastIndexOf(".");
  return lastDot === -1 ? "" : filename.slice(lastDot).toLowerCase();
}

function getImageContentType(target: URL, upstreamContentType: string | null): string {
  const contentType = (upstreamContentType || "").split(";")[0].trim().toLowerCase();
  if (contentType === "image/jpg") return "image/jpeg";
  if (contentType.startsWith("image/")) return upstreamContentType || contentType;
  return IMAGE_EXT_CONTENT_TYPES[pathExtnameSafe(target.pathname)] || "";
}

export async function onRequestGet({ request }: { request: Request }): Promise<Response> {
  const requestUrl = new URL(request.url);
  const imageUrl = requestUrl.searchParams.get("url") || "";
  let target: URL;
  try {
    target = new URL(imageUrl);
  } catch {
    return Response.json({ error: "Invalid image URL" }, { status: 400, headers: createCorsHeaders() });
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return Response.json({ error: "Invalid image URL" }, { status: 400, headers: createCorsHeaders() });
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        "User-Agent": request.headers.get("User-Agent") ?? "Mozilla/5.0",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Referer": `${target.protocol}//${target.host}/`,
      },
    });

    if (!upstream.ok) {
      return Response.json({ error: `Image request failed with status ${upstream.status}` }, {
        status: upstream.status,
        headers: createCorsHeaders(),
      });
    }

    const contentLength = Number(upstream.headers.get("content-length") || 0);
    if (contentLength > MAX_IMAGE_BYTES) {
      return Response.json({ error: "Image too large" }, { status: 413, headers: createCorsHeaders() });
    }

    const contentType = getImageContentType(target, upstream.headers.get("content-type"));
    if (!contentType) {
      return Response.json({ error: "Unsupported image type" }, { status: 415, headers: createCorsHeaders() });
    }

    const buffer = await upstream.arrayBuffer();
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      return Response.json({ error: "Image too large" }, { status: 413, headers: createCorsHeaders() });
    }

    const headers = createCorsHeaders();
    headers.set("Content-Type", contentType);
    headers.set("Content-Length", String(buffer.byteLength));
    return new Response(buffer, { status: 200, headers });
  } catch {
    return Response.json({ error: "Failed to fetch image" }, { status: 502, headers: createCorsHeaders() });
  }
}
