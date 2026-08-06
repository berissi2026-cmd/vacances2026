// ============================================================
// VACANCES QUEST — Upload photo via Cloudinary (unsigned upload)
// Pas de backend nécessaire : le "upload preset" non signé
// autorise l'envoi direct depuis le navigateur en toute sécurité.
// ============================================================

// ⚠️ À REMPLIR : va sur cloudinary.com > Dashboard pour "Cloud name",
// et Settings > Upload > Upload presets pour le nom du preset non signé.
const CLOUD_NAME = "COLLE_TON_CLOUD_NAME_ICI";
const UPLOAD_PRESET = "COLLE_TON_UPLOAD_PRESET_ICI";

// Upload d'une photo de mission vers Cloudinary, renvoie l'URL publique
export async function uploaderPhotoMission(profilId, missionId, blob) {
  const formData = new FormData();
  formData.append("file", blob, `${missionId}.jpg`);
  formData.append("upload_preset", UPLOAD_PRESET);
  formData.append("folder", `vacances2026/${profilId}`);
  formData.append("public_id", `${missionId}_${Date.now()}`);

  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
  const res = await fetch(url, { method: "POST", body: formData });
  if (!res.ok) {
    const err = await res.text();
    throw new Error("Échec upload Cloudinary : " + err);
  }
  const data = await res.json();
  return data.secure_url;
}
