// ============================================================
// VACANCES QUEST — Safari Edition
// Services Firebase (remplace l'ancien Code.gs Apps Script)
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc,
  updateDoc, deleteDoc, onSnapshot, increment, query, where
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// ------------------------------------------------------------
// ⚠️ À REMPLIR : colle ici la config de TON projet Firebase
// (Console Firebase > Paramètres du projet > Tes applications > Config)
// ------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyBmV7Ba4EC9puU07zn0N39U6LRRSwLPWEM",
  authDomain: "vacances2026data.firebaseapp.com",
  projectId: "vacances2026data",
  storageBucket: "vacances2026data.firebasestorage.app",
  messagingSenderId: "782996150411",
  appId: "1:782996150411:web:e0aa4bc94e045216339c8e"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// ============================================================
// PROFILS
// ============================================================

export async function getProfils() {
  const snap = await getDocs(collection(db, "profils"));
  return snap.docs.map(d => ({ ProfilID: d.id, ...d.data() }));
}

export async function getProfil(profilId) {
  const snap = await getDoc(doc(db, "profils", profilId));
  return snap.exists() ? { ProfilID: snap.id, ...snap.data() } : null;
}

export async function updateProfilPreferences(profilId, avatar, langue) {
  await updateDoc(doc(db, "profils", profilId), { Avatar: avatar, Langue: langue });
  return { success: true };
}

export async function ajouterScoreProfil(profilId, points) {
  await updateDoc(doc(db, "profils", profilId), { ScorePerso: increment(points) });
  return { success: true };
}

// Écoute en temps réel du score famille (somme de tous les scores perso)
export function ecouterScoreFamille(callback) {
  return onSnapshot(collection(db, "profils"), snap => {
    let total = 0;
    snap.forEach(d => total += Number(d.data().ScorePerso) || 0);
    callback(total);
  });
}

// Écoute en temps réel d'un profil précis (pour voir son score live sur son téléphone)
export function ecouterProfil(profilId, callback) {
  return onSnapshot(doc(db, "profils", profilId), d => {
    if (d.exists()) callback({ ProfilID: d.id, ...d.data() });
  });
}

// ============================================================
// LIEUX
// ============================================================

export async function getLieux() {
  const snap = await getDocs(collection(db, "lieux"));
  const lieux = snap.docs.map(d => ({ LieuID: d.id, ...d.data() }));
  return lieux.sort((a, b) => (Number(a.Ordre) || 0) - (Number(b.Ordre) || 0));
}

// Écoute en temps réel (utile pour que la carte se mette à jour dès que Papa ajoute un lieu)
export function ecouterLieux(callback) {
  return onSnapshot(collection(db, "lieux"), snap => {
    const lieux = snap.docs.map(d => ({ LieuID: d.id, ...d.data() }));
    callback(lieux.sort((a, b) => (Number(a.Ordre) || 0) - (Number(b.Ordre) || 0)));
  });
}

export async function ajouterLieu(data) {
  const tousLieux = await getLieux();
  const ref = await addDoc(collection(db, "lieux"), {
    Nom_FR: data.nomFr, Nom_HE: data.nomHe, Type: data.type,
    Jour: data.jour, Heure: data.heure || "",
    Lat: data.lat || "", Lng: data.lng || "",
    PhotoURL: data.photoUrl || "",
    TorahTexte_FR: data.torahFr || "", TorahTexte_HE: data.torahHe || "",
    FaitGeo_FR: data.faitGeoFr || "", FaitGeo_HE: data.faitGeoHe || "",
    Ordre: tousLieux.length + 1
  });
  return { success: true, lieuId: ref.id };
}

export async function supprimerLieu(lieuId) {
  await deleteDoc(doc(db, "lieux", lieuId));
  return { success: true };
}

// ============================================================
// MISSIONS
// ============================================================

export async function getMissionsParLieu(lieuId) {
  const q = query(collection(db, "missions"), where("LieuID", "==", lieuId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ MissionID: d.id, ...d.data() }));
}

export async function ajouterMission(data) {
  const ref = await addDoc(collection(db, "missions"), {
    LieuID: data.lieuId, Type: data.type,
    Titre_FR: data.titreFr, Titre_HE: data.titreHe,
    Contenu: data.contenu || {}, Difficulte: data.difficulte || "moyen",
    Points: data.points || 10,
    BadgeNom_FR: data.badgeNomFr || "", BadgeNom_HE: data.badgeNomHe || "",
    BadgeVisuel: data.badgeVisuel || ""
  });
  return { success: true, missionId: ref.id };
}

export async function supprimerMission(missionId) {
  await deleteDoc(doc(db, "missions", missionId));
  return { success: true };
}

// ============================================================
// RESULTATS (progression)
// ============================================================

export async function enregistrerResultat(data) {
  const ref = await addDoc(collection(db, "resultats"), {
    ProfilID: data.profilId, MissionID: data.missionId,
    Statut: data.statut || "fait", MediaURL: data.mediaUrl || "",
    Reponse: data.reponse || "", Note: data.note || "",
    Date: new Date().toISOString()
  });
  if (data.statut === "fait" && data.points) {
    await ajouterScoreProfil(data.profilId, data.points);
  }
  return { success: true, resultId: ref.id };
}

export async function getResultatsProfil(profilId) {
  const q = query(collection(db, "resultats"), where("ProfilID", "==", profilId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ResultID: d.id, ...d.data() }));
}

// ============================================================
// DEFIS ROUTE (bingo / roue / énigmes)
// ============================================================

export async function getDefisRoute(type) {
  const ref = collection(db, "defisRoute");
  const snap = await getDocs(type ? query(ref, where("Type", "==", type)) : ref);
  return snap.docs.map(d => ({ DefiID: d.id, ...d.data() }));
}

export async function ajouterDefiRoute(data) {
  const ref = await addDoc(collection(db, "defisRoute"), {
    Type: data.type, Contenu_FR: data.contenuFr, Contenu_HE: data.contenuHe,
    Reponse: data.reponse || ""
  });
  return { success: true, defiId: ref.id };
}

// ============================================================
// SETTINGS
// ============================================================

export async function getSettings() {
  const snap = await getDoc(doc(db, "settings", "config"));
  return snap.exists() ? snap.data() : {};
}

export async function verifierMotDePasseAdmin(motDePasse) {
  const settings = await getSettings();
  return motDePasse === (settings.motDePasseAdmin || "safari2026");
}

// ============================================================
// PLAYLISTS
// ============================================================

export async function getPlaylistPourLieu(lieuId) {
  const q = query(collection(db, "playlists"), where("LieuID", "==", lieuId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ PlaylistID: d.id, ...d.data() }));
}

export async function ajouterVideoPlaylist(data) {
  await addDoc(collection(db, "playlists"), {
    LieuID: data.lieuId || "route", YoutubeVideoID: data.videoId, Titre: data.titre || ""
  });
  return { success: true };
}

// ============================================================
// INITIALISATION DES DONNÉES DE DÉMARRAGE
// (à appeler une seule fois — un bouton dans l'admin s'en charge)
// ============================================================

export async function initialiserDonneesSiVide() {
  const profils = await getDocs(collection(db, "profils"));
  if (!profils.empty) return { success: true, deja: true };

  const famille = [
    ["p_eliro",      "Éliro",       13, "enfant"],
    ["p_shaitsion",  "Shai Tsion",  10, "enfant"],
    ["p_nava",       "Nava",        7,  "enfant"],
    ["p_benaya",     "Benaya",      3,  "enfant"],
    ["p_papa",       "Papa",        0,  "parent"],
    ["p_maman",      "Maman",       0,  "parent"]
  ];
  for (const [id, nom, age, role] of famille) {
    await setDoc(doc(db, "profils", id), {
      Nom: nom, Age: age, Role: role, Avatar: "", Langue: "", ScorePerso: 0, Badges: []
    });
  }

  const defis = [
    ["bingo_item", "Un tracteur", "טרקטור"],
    ["bingo_item", "Une vache", "פרה"],
    ["bingo_item", "Un pont", "גשר"],
    ["bingo_item", "Une voiture rouge", "מכונית אדומה"],
    ["bingo_item", "Un panneau bleu", "שלט כחול"],
    ["bingo_item", "Un arbre immense", "עץ ענק"],
    ["bingo_item", "Un camion", "משאית"],
    ["bingo_item", "Une station essence", "תחנת דלק"],
    ["bingo_item", "Un chien", "כלב"],
    ["roue", "Chante ta chanson préférée !", "שירו את השיר האהוב עליכם!"],
    ["roue", "Fais deviner un animal en mimant", "חקו בעלי חיים וכולם מנחשים"],
    ["enigme", "Je suis dans le ciel le jour, on ne me voit pas la nuit, qui suis-je ?", "אני בשמיים ביום, לא רואים אותי בלילה, מי אני?"]
  ];
  for (const [type, fr, he] of defis) {
    await addDoc(collection(db, "defisRoute"), { Type: type, Contenu_FR: fr, Contenu_HE: he, Reponse: "" });
  }

  await setDoc(doc(db, "settings", "config"), {
    motDePasseAdmin: "safari2026",
    seuilVitesseKmh: 20,
    nomVoyage: "Explorateur du Nord"
  });

  return { success: true, deja: false };
}
