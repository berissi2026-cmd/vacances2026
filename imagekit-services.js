// ============================================================
// VACANCES QUEST — Upload photo via ImageKit
// L'upload depuis le navigateur exige une signature générée avec
// la clé privée ImageKit. Comme le site est 100% statique, cette
// signature est produite par un petit Cloudflare Worker gratuit
// (voir worker-imagekit-auth.js) qui garde la clé privée secrète.
// ============================================================

// ⚠️ À REMPLIR :
// - IMAGEKIT_PUBLIC_KEY : ImageKit dashboard > Developer options > Public key
// - AUTH_ENDPOINT : l'URL de ton Cloudflare Worker (ex: https://xxxx.workers.dev)
const IMAGEKIT_PUBLIC_KEY = "public_YxpIbmKQ9kSTFflGa1DK5vUO0eU=";
const AUTH_ENDPOINT = "https://fancy-wave-d762.berissi2026.workers.dev";

// Upload d'une photo de mission vers ImageKit, renvoie l'URL publique
export async function uploaderPhotoMission(profilId, missionId, blob) {
  const authRes = await fetch(AUTH_ENDPOINT);
  if (!authRes.ok) throw new Error("Service d'authentification ImageKit indisponible");
  const { token, expire, signature } = await authRes.json();

  const formData = new FormData();
  formData.append("file", blob, `${missionId}.jpg`);
  formData.append("fileName", `${missionId}_${Date.now()}.jpg`);
  formData.append("publicKey", IMAGEKIT_PUBLIC_KEY);
  formData.append("signature", signature);
  formData.append("expire", expire);
  formData.append("token", token);
  formData.append("folder", `/vacances2026/${profilId}`);

  const res = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
    method: "POST",
    body: formData
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error("Échec upload ImageKit : " + err);
  }
  const data = await res.json();
  return data.url;
}
