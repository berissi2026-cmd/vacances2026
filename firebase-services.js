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

export async function updateProfilAvatar(profilId, avatar) {
  await updateDoc(doc(db, "profils", profilId), { Avatar: avatar });
  return { success: true };
}

export async function updateProfilPhoto(profilId, photoUrl) {
  await updateDoc(doc(db, "profils", profilId), { PhotoURL: photoUrl });
  return { success: true };
}

// Migration : corrige les profils déjà créés avec l'ancienne orthographe / structure
export async function corrigerProfilsFamille() {
  const corrections = {
    p_eliro: null, // sera supprimé si présent, remplacé par p_elior
  };
  const famille = [
    ["p_elior",      "Elior",       "אליאור", 13, "enfant"],
    ["p_shaitsion",  "Shai Tsion",  "שי ציון", 10, "enfant"],
    ["p_nava",       "Nava",        "נאוה",    7,  "enfant"],
    ["p_benaya",     "Benaya",      "בניה",    3,  "enfant"],
    ["p_papa",       "Papa",        "אבא",     0,  "parent"],
    ["p_maman",      "Maman",       "אמא",     0,  "parent"]
  ];

  // Récupère l'ancien score/avatar de p_eliro si il existe, pour ne pas perdre la progression
  const ancien = await getDoc(doc(db, "profils", "p_eliro"));
  const ancienneDonnee = ancien.exists() ? ancien.data() : null;

  for (const [id, nomFr, nomHe, age, role] of famille) {
    const existant = await getDoc(doc(db, "profils", id));
    const base = existant.exists() ? existant.data() : {};
    let scorePerso = base.ScorePerso || 0;
    let avatar = base.Avatar || "";
    if (id === "p_elior" && ancienneDonnee) {
      scorePerso = ancienneDonnee.ScorePerso || scorePerso;
      avatar = ancienneDonnee.Avatar || avatar;
    }
    await setDoc(doc(db, "profils", id), {
      Nom_FR: nomFr, Nom_HE: nomHe, Age: age, Role: role,
      Avatar: avatar, ScorePerso: scorePerso, Badges: base.Badges || []
    });
  }

  if (ancien.exists()) {
    await deleteDoc(doc(db, "profils", "p_eliro"));
  }

  return { success: true };
}

export async function ajouterScoreProfil(profilId, points) {
  await updateDoc(doc(db, "profils", profilId), { ScorePerso: increment(points) });
  await addDoc(collection(db, "pointsLog"), {
    ProfilID: profilId, Points: points, Date: new Date().toISOString()
  });
  return { success: true };
}

export function ecouterPointsLog(callback) {
  return onSnapshot(collection(db, "pointsLog"), snap => {
    callback(snap.docs.map(d => ({ LogID: d.id, ...d.data() })));
  });
}

// Remet tous les scores à 0 (profils + résultats + journal de points) — pour les tests
export async function reinitialiserTousLesPoints() {
  const profils = await getProfils();
  for (const p of profils) {
    await updateDoc(doc(db, "profils", p.ProfilID), { ScorePerso: 0, Badges: [] });
  }
  const resultatsSnap = await getDocs(collection(db, "resultats"));
  for (const d of resultatsSnap.docs) {
    await deleteDoc(doc(db, "resultats", d.id));
  }
  const logSnap = await getDocs(collection(db, "pointsLog"));
  for (const d of logSnap.docs) {
    await deleteDoc(doc(db, "pointsLog", d.id));
  }
  const defisFaitsSnap = await getDocs(collection(db, "defisFaits"));
  for (const d of defisFaitsSnap.docs) {
    await deleteDoc(doc(db, "defisFaits", d.id));
  }
  await setDoc(doc(db, "carSeatTracking", "current"), { activeTrip: null, totals: {} });
  return { success: true };
}

// Ajoute un badge au profil (une seule fois par mission, même en cas de double-clic)
export async function ajouterBadgeProfil(profilId, badge) {
  const snap = await getDoc(doc(db, "profils", profilId));
  if (!snap.exists()) return { success: false };
  const badges = snap.data().Badges || [];
  if (badges.some(b => b.missionId === badge.missionId)) return { success: true, deja: true };
  badges.push(badge);
  await updateDoc(doc(db, "profils", profilId), { Badges: badges });
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
    PhotoURL: data.photoUrl || "", AudioURL: data.audioUrl || "",
    TorahTexte_FR: data.torahFr || "", TorahTexte_HE: data.torahHe || "",
    FaitGeo_FR: data.faitGeoFr || "", FaitGeo_HE: data.faitGeoHe || "",
    ProfilsCibles: data.profilsCibles || [],
    Ordre: tousLieux.length + 1
  });
  return { success: true, lieuId: ref.id };
}

export async function updateLieuAudio(lieuId, audioUrl) {
  await updateDoc(doc(db, "lieux", lieuId), { AudioURL: audioUrl });
  return { success: true };
}

export async function modifierLieu(lieuId, data) {
  const maj = {
    Nom_FR: data.nomFr, Nom_HE: data.nomHe, Type: data.type,
    Jour: data.jour, Heure: data.heure || "",
    Lat: data.lat || "", Lng: data.lng || ""
  };
  if (data.profilsCibles !== undefined) maj.ProfilsCibles = data.profilsCibles;
  // Ces champs ne sont pas tous présents dans le formulaire rapide de l'admin :
  // on ne les touche que si explicitement fournis, pour ne pas écraser le texte existant.
  if (data.torahFr !== undefined) maj.TorahTexte_FR = data.torahFr;
  if (data.torahHe !== undefined) maj.TorahTexte_HE = data.torahHe;
  if (data.faitGeoFr !== undefined) maj.FaitGeo_FR = data.faitGeoFr;
  if (data.faitGeoHe !== undefined) maj.FaitGeo_HE = data.faitGeoHe;
  await updateDoc(doc(db, "lieux", lieuId), maj);
  return { success: true };
}

export async function supprimerLieu(lieuId) {
  await deleteDoc(doc(db, "lieux", lieuId));
  return { success: true };
}

// ============================================================
// TYPES D'EXCURSION (personnalisables)
// ============================================================

export async function getTypesExcursion() {
  const snap = await getDocs(collection(db, "typesExcursion"));
  return snap.docs.map(d => ({ TypeID: d.id, ...d.data() }));
}

export async function ajouterTypeExcursion(data) {
  const ref = await addDoc(collection(db, "typesExcursion"), {
    LabelFR: data.labelFr, LabelHE: data.labelHe, Icone: data.icone || "📍"
  });
  return { success: true, typeId: ref.id };
}

export async function seedTypesExcursionSiVide() {
  const snap = await getDocs(collection(db, "typesExcursion"));
  if (!snap.empty) return { success: true, deja: true };
  const defauts = [
    ["Mayan / source", "מעיין", "💧"],
    ["Parc / nature", "פארק", "🌳"],
    ["Visite / musée", "סיור/מוזיאון", "🏛️"],
    ["Site historique", "אתר היסטורי", "🏺"],
    ["Plage / mer", "חוף ים", "🏖️"],
    ["Randonnée", "טיול רגלי", "🥾"],
    ["Autre", "אחר", "⭐"]
  ];
  for (const [labelFr, labelHe, icone] of defauts) {
    await addDoc(collection(db, "typesExcursion"), { LabelFR: labelFr, LabelHE: labelHe, Icone: icone });
  }
  return { success: true, deja: false };
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

export async function getToutesMissions() {
  const snap = await getDocs(collection(db, "missions"));
  return snap.docs.map(d => ({ MissionID: d.id, ...d.data() }));
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
    Commentaire: data.commentaire || "",
    Lieu: data.lieu || "", Lat: data.lat || "", Lng: data.lng || "",
    TailleOctets: data.tailleOctets || 0,
    Type: data.type || 'photo',
    Date: new Date().toISOString()
  });
  if (data.statut === "fait" && data.points) {
    await ajouterScoreProfil(data.profilId, data.points);
  }
  return { success: true, resultId: ref.id };
}

export async function modifierResultat(resultId, data) {
  const maj = {};
  if (data.note !== undefined) maj.Note = data.note;
  if (data.commentaire !== undefined) maj.Commentaire = data.commentaire;
  if (data.debutSec !== undefined) maj.DebutSec = data.debutSec;
  if (data.finSec !== undefined) maj.FinSec = data.finSec;
  await updateDoc(doc(db, "resultats", resultId), maj);
  return { success: true };
}

export async function getResultatsProfil(profilId) {
  const q = query(collection(db, "resultats"), where("ProfilID", "==", profilId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ResultID: d.id, ...d.data() }));
}

// Écoute en temps réel de TOUS les résultats (utilisé par l'album photo,
// pour voir apparaître les nouvelles photos sans recharger la page)
export function ecouterTousResultats(callback) {
  return onSnapshot(collection(db, "resultats"), snap => {
    const resultats = snap.docs.map(d => ({ ResultID: d.id, ...d.data() }));
    callback(resultats);
  });
}

export async function supprimerResultat(resultId) {
  await deleteDoc(doc(db, "resultats", resultId));
  return { success: true };
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
    Reponse: data.reponse || "",
    OptionsFR: data.optionsFr || [], OptionsHE: data.optionsHe || [],
    ReponseIndex: (data.reponseIndex !== undefined && data.reponseIndex !== null) ? data.reponseIndex : -1,
    Points: data.points || 10,
    Jour: data.jour || ""
  });
  return { success: true, defiId: ref.id };
}

export async function supprimerDefiRoute(defiId) {
  await deleteDoc(doc(db, "defisRoute", defiId));
  return { success: true };
}

// Marque un défi de route comme fait par un profil (pour savoir ce qu'il reste à faire)
export async function marquerDefiFait(defiId, profilId, correct) {
  await addDoc(collection(db, "defisFaits"), {
    DefiID: defiId, ProfilID: profilId, Date: new Date().toISOString(),
    Correct: correct === undefined ? null : !!correct
  });
  return { success: true };
}

export function ecouterDefisFaits(callback) {
  return onSnapshot(collection(db, "defisFaits"), snap => {
    callback(snap.docs.map(d => d.data()));
  });
}

export async function getDefisFaits() {
  const snap = await getDocs(collection(db, "defisFaits"));
  return snap.docs.map(d => ({ LogID: d.id, ...d.data() }));
}

export async function supprimerDefiFait(logId) {
  await deleteDoc(doc(db, "defisFaits", logId));
  return { success: true };
}

// ============================================================
// SETTINGS
// ============================================================

export async function getSettings() {
  const snap = await getDoc(doc(db, "settings", "config"));
  return snap.exists() ? snap.data() : {};
}

export function ecouterSettings(callback) {
  return onSnapshot(doc(db, "settings", "config"), snap => {
    callback(snap.exists() ? snap.data() : {});
  });
}

export async function verifierMotDePasseAdmin(motDePasse) {
  const settings = await getSettings();
  return motDePasse === (settings.motDePasseAdmin || "2612");
}

export async function updateSettings(data) {
  await setDoc(doc(db, "settings", "config"), data, { merge: true });
  return { success: true };
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

export async function supprimerVideoPlaylist(playlistId) {
  await deleteDoc(doc(db, "playlists", playlistId));
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
    ["p_elior",      "Elior",       "אליאור", 13, "enfant"],
    ["p_shaitsion",  "Shai Tsion",  "שי ציון", 10, "enfant"],
    ["p_nava",       "Nava",        "נאוה",    7,  "enfant"],
    ["p_benaya",     "Benaya",      "בניה",    3,  "enfant"],
    ["p_papa",       "Papa",        "אבא",     0,  "parent"],
    ["p_maman",      "Maman",       "אמא",     0,  "parent"]
  ];
  for (const [id, nomFr, nomHe, age, role] of famille) {
    await setDoc(doc(db, "profils", id), {
      Nom_FR: nomFr, Nom_HE: nomHe, Age: age, Role: role, Avatar: "", ScorePerso: 0, Badges: []
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

  await seedTypesExcursionSiVide();

  return { success: true, deja: false };
}

// ============================================================
// SUIVI "QUI EST DERRIÈRE ?" (siège voiture)
// ============================================================

export async function getCarSeatTracking() {
  const snap = await getDoc(doc(db, "carSeatTracking", "current"));
  if (!snap.exists()) return { activeTrip: null, totals: {} };
  return snap.data();
}

export function ecouterCarSeatTracking(callback) {
  return onSnapshot(doc(db, "carSeatTracking", "current"), snap => {
    callback(snap.exists() ? snap.data() : { activeTrip: null, totals: {} });
  });
}

export async function setCarSeatTracking(data) {
  await setDoc(doc(db, "carSeatTracking", "current"), data, { merge: true });
}

// ============================================================
// TEMPLATES "CARTE SOUVENIR" AJOUTÉS DEPUIS L'ADMIN
// ============================================================

export async function getSouvenirTemplates() {
  const snap = await getDocs(collection(db, "souvenirTemplates"));
  return snap.docs.map(d => ({ TemplateID: d.id, ...d.data() }));
}

export function ecouterSouvenirTemplates(callback) {
  return onSnapshot(collection(db, "souvenirTemplates"), snap => {
    callback(snap.docs.map(d => ({ TemplateID: d.id, ...d.data() })));
  });
}

export async function ajouterSouvenirTemplate(data) {
  const ref = await addDoc(collection(db, "souvenirTemplates"), {
    Nom_FR: data.nomFr, Nom_HE: data.nomHe || "", ImageURL: data.imageUrl
  });
  return { success: true, templateId: ref.id };
}

export async function supprimerSouvenirTemplate(templateId) {
  await deleteDoc(doc(db, "souvenirTemplates", templateId));
  return { success: true };
}

// ============================================================
// HISTORIQUE DES TRAJETS VOITURE (chaque étape "qui est derrière")
// ============================================================

export async function ajouterTrajetVoiture(data) {
  const ref = await addDoc(collection(db, "carSeatTrips"), {
    ProfilID: data.profilId, Minutes: data.minutes,
    StartTimeMs: data.startTimeMs, EndTimeMs: data.endTimeMs,
    Date: new Date(data.startTimeMs).toISOString()
  });
  return { success: true, trajetId: ref.id };
}

export async function getTrajetsVoiture() {
  const snap = await getDocs(collection(db, "carSeatTrips"));
  return snap.docs.map(d => ({ TrajetID: d.id, ...d.data() }));
}

export function ecouterTrajetsVoiture(callback) {
  return onSnapshot(collection(db, "carSeatTrips"), snap => {
    callback(snap.docs.map(d => ({ TrajetID: d.id, ...d.data() })));
  });
}

export async function modifierTrajetVoiture(trajetId, minutes) {
  await updateDoc(doc(db, "carSeatTrips", trajetId), { Minutes: minutes });
  return { success: true };
}

export async function supprimerTrajetVoiture(trajetId) {
  await deleteDoc(doc(db, "carSeatTrips", trajetId));
  return { success: true };
}

