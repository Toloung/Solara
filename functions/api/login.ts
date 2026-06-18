const MAX_AGE_SECONDS = 48 * 60 * 60;

function applyForwardedProto(request: Request, url: URL): URL {
  const forwardedProto = request.headers.get("X-Forwarded-Proto")?.split(",")[0]?.trim();
  if (forwardedProto === "http" || forwardedProto === "https") {
    url.protocol = `${forwardedProto}:`;
  }
  return url;
}

export async function onRequestPost(context: any) {
  const { request, env } = context;
  const passwordEnv = env.PASSWORD;
  const url = applyForwardedProto(request, new URL(request.url));

  const body = await request.json().catch(() => ({ password: "" }));
  const providedPassword = typeof body.password === "string" ? body.password : "";

  if (typeof passwordEnv !== "string") {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (providedPassword === passwordEnv) {
    const cookieSegments = [
      `auth=${btoa(passwordEnv)}`,
      `Max-Age=${MAX_AGE_SECONDS}`,
      "Path=/",
      "SameSite=Lax",
      "HttpOnly",
    ];
    if (url.protocol === "https:") {
      cookieSegments.push("Secure");
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": cookieSegments.join("; "),
      },
    });
  }

  return new Response(JSON.stringify({ success: false }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
