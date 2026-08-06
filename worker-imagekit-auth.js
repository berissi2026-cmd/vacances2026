// ============================================================
// Cloudflare Worker — génère les paramètres d'authentification
// pour l'upload ImageKit depuis le navigateur (site statique).
//
// À FAIRE dans le dashboard Cloudflare :
// 1. Workers & Pages > Create > Create Worker
// 2. Colle ce code dans l'éditeur, déploie
// 3. Settings > Variables and Secrets > ajoute un secret nommé
//    IMAGEKIT_PRIVATE_KEY avec ta clé privée ImageKit (jamais
//    visible côté navigateur, uniquement utilisée ici)
// 4. Copie l'URL du Worker (ex: https://xxxx.workers.dev) dans
//    imagekit-services.js (AUTH_ENDPOINT)
// ============================================================

const ALLOWED_ORIGINS = ["https://berissi2026-cmd.github.io", "https://vacances2026.pages.dev"];

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const origineAutorisee = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    const corsHeaders = {
      "Access-Control-Allow-Origin": origineAutorisee,
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const token = crypto.randomUUID();
    const expire = Math.floor(Date.now() / 1000) + 30 * 60; // valable 30 min
    const signature = await hmacSha1Hex(token + expire, env.IMAGEKIT_PRIVATE_KEY);

    return new Response(JSON.stringify({ token, expire, signature }), {
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
};

async function hmacSha1Hex(message, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}
