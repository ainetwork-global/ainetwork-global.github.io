function unauthorized() {
  return new Response("Autenticação necessária.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Global Revenue Brain", charset="UTF-8"',
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });
}

async function secureEqual(left, right) {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right))
  ]);
  const a = new Uint8Array(leftHash);
  const b = new Uint8Array(rightHash);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index % a.length] ?? 0) ^ (b[index % b.length] ?? 0);
  }
  return difference === 0;
}

export async function onRequest(context) {
  const expectedUser = context.env.DASHBOARD_USER;
  const expectedPassword = context.env.DASHBOARD_PASSWORD;

  if (!expectedUser || !expectedPassword) {
    return new Response("Dashboard indisponível: credenciais ainda não configuradas.", {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  }

  const authorization = context.request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Basic ")) {
    return unauthorized();
  }

  let supplied;
  try {
    supplied = atob(authorization.slice(6));
  } catch {
    return unauthorized();
  }

  const separator = supplied.indexOf(":");
  if (separator < 0) {
    return unauthorized();
  }

  const suppliedUser = supplied.slice(0, separator);
  const suppliedPassword = supplied.slice(separator + 1);
  const [userMatches, passwordMatches] = await Promise.all([
    secureEqual(suppliedUser, expectedUser),
    secureEqual(suppliedPassword, expectedPassword)
  ]);

  if (!userMatches || !passwordMatches) {
    return unauthorized();
  }

  const response = await context.env.ASSETS.fetch(context.request);
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Frame-Options", "DENY");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
