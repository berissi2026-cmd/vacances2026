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

// Fonction générique d'upload vers ImageKit, renvoie l'URL publique
function extensionDepuisType(blob) {
  const type = (blob && blob.type) || '';
  if (type.includes('mp4')) return 'mp4';
  if (type.includes('quicktime') || type.includes('mov')) return 'mov';
  if (type.includes('webm')) return 'webm';
  if (type.startsWith('video/')) return 'mp4';
  if (type.includes('png')) return 'png';
  return 'jpg';
}

async function uploaderVersImageKit(dossier, nomFichier, blob) {
  const authRes = await fetch(AUTH_ENDPOINT);
  if (!authRes.ok) throw new Error("Service d'authentification ImageKit indisponible");
  const { token, expire, signature } = await authRes.json();

  const ext = extensionDepuisType(blob);
  const formData = new FormData();
  formData.append("file", blob, `${nomFichier}.${ext}`);
  formData.append("fileName", `${nomFichier}_${Date.now()}.${ext}`);
  formData.append("publicKey", IMAGEKIT_PUBLIC_KEY);
  formData.append("signature", signature);
  formData.append("expire", expire);
  formData.append("token", token);
  formData.append("folder", dossier);

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

// Upload d'une photo de mission vers ImageKit, renvoie l'URL publique
export async function uploaderPhotoMission(profilId, missionId, blob) {
  return uploaderVersImageKit(`/vacances2026/${profilId}`, missionId, blob);
}

// Upload d'une photo de profil (selfie) vers ImageKit, renvoie l'URL publique
export async function uploaderPhotoProfil(profilId, blob) {
  return uploaderVersImageKit(`/vacances2026/profils`, profilId, blob);
}

// Upload d'un fichier audio (histoire racontée) pour un lieu, renvoie l'URL publique
export async function uploaderAudioLieu(lieuId, fichier) {
  return uploaderFichierAudioGenerique(lieuId, fichier, '/vacances2026/audio');
}

export async function uploaderMusiqueVictoire(fichier) {
  return uploaderFichierAudioGenerique('victoire_1000', fichier, '/vacances2026/audio');
}

// Upload d'une image de template "carte souvenir" ajoutée depuis l'admin
export async function uploaderImageSouvenir(id, blob) {
  return uploaderVersImageKit('/vacances2026/souvenirs', id, blob);
}

async function uploaderFichierAudioGenerique(id, fichier, dossier) {
  const authRes = await fetch(AUTH_ENDPOINT);
  if (!authRes.ok) throw new Error("Service d'authentification ImageKit indisponible");
  const { token, expire, signature } = await authRes.json();

  const formData = new FormData();
  const extension = (fichier.name.split('.').pop() || 'mp3').toLowerCase();
  formData.append("file", fichier, `${id}.${extension}`);
  formData.append("fileName", `${id}_${Date.now()}.${extension}`);
  formData.append("publicKey", IMAGEKIT_PUBLIC_KEY);
  formData.append("signature", signature);
  formData.append("expire", expire);
  formData.append("token", token);
  formData.append("folder", dossier);

  const res = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
    method: "POST",
    body: formData
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error("Échec upload audio : " + err);
  }
  const data = await res.json();
  return data.url;
}
