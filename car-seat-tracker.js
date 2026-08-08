/* ============================================================
   CAR SEAT TRACKER — "Qui est derrière ?"
   Module ES — utilise le même Firestore modulaire (v10) que
   firebase-services.js.
   ============================================================ */

import { db } from './firebase-services.js';
import {
  doc, getDoc, setDoc, onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

const CHILDREN = [
  { id: 'p_elior',     fr: 'Elior',       he: 'אליאור' },
  { id: 'p_shaitsion', fr: 'Shai Tsion',  he: 'שי ציון' },
  { id: 'p_nava',      fr: 'Nava',        he: 'נאוה' }
];
const STILL_THRESHOLD_METERS = 30;
const STILL_DURATION_MS = 60 * 1000;
const TRAFFIC_RECHECK_MS = 10 * 60 * 1000;

const ref = doc(db, 'carSeatTracking', 'current');

let langue = 'fr';
let myProfilId = null;
let myRole = null;

let watchId = null;
let lastMovingPos = null;
let stillSince = null;
let stillDetectedAt = null;
let confirmModalOpen = false;
let trafficRecheckTimer = null;

let state = { activeTrip: null, totals: {} };

function childLabel(c) {
  return langue === 'he' ? c.he : c.fr;
}

// ---------------- FIRESTORE ----------------

async function ensureDoc() {
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const totals = Object.fromEntries(CHILDREN.map(c => [c.id, 0]));
    await setDoc(ref, { activeTrip: null, totals });
  }
}

async function saveState() {
  try { await setDoc(ref, state, { merge: true }); }
  catch (e) { console.error('CarSeatTracker: erreur sauvegarde', e); }
}

function listen() {
  onSnapshot(ref, snap => {
    if (!snap.exists()) return;
    const data = snap.data();
    const hadTrip = !!state.activeTrip;
    state.activeTrip = data.activeTrip || null;
    state.totals = data.totals || {};
    updateTripUI();
    updateCounters();
    if (state.activeTrip && !hadTrip) startGeoTracking();
    if (!state.activeTrip && hadTrip) stopGeoTracking();
  });
}

// ---------------- GÉOLOCALISATION ----------------

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function startGeoTracking() {
  if (!navigator.geolocation || watchId !== null) return;
  lastMovingPos = null;
  stillSince = null;
  watchId = navigator.geolocation.watchPosition(onPosition, err => {
    console.warn('CarSeatTracker: géoloc indisponible', err);
  }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
}

function stopGeoTracking() {
  if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
  lastMovingPos = null;
  stillSince = null;
  stillDetectedAt = null;
  if (trafficRecheckTimer) { clearTimeout(trafficRecheckTimer); trafficRecheckTimer = null; }
}

function onPosition(pos) {
  if (!state.activeTrip) return;
  const { latitude, longitude } = pos.coords;
  const now = Date.now();

  if (!lastMovingPos) { lastMovingPos = { lat: latitude, lon: longitude }; return; }

  const dist = haversineMeters(lastMovingPos.lat, lastMovingPos.lon, latitude, longitude);

  if (dist > STILL_THRESHOLD_METERS) {
    lastMovingPos = { lat: latitude, lon: longitude };
    stillSince = null;
    stillDetectedAt = null;
    if (trafficRecheckTimer) { clearTimeout(trafficRecheckTimer); trafficRecheckTimer = null; }
    return;
  }

  if (!stillSince) { stillSince = now; return; }

  if (!stillDetectedAt && !confirmModalOpen && (now - stillSince) >= STILL_DURATION_MS) {
    stillDetectedAt = now - STILL_DURATION_MS;
    showConfirmModal();
  }
}

// ---------------- TRAJET ----------------

function startTrip(childId) {
  state.activeTrip = { child: childId, startTimeMs: Date.now() };
  saveState();
  startGeoTracking();
  updateTripUI();
}

function finalizeTrip(stopTimeMs) {
  const trip = state.activeTrip;
  if (!trip) return;
  const minutes = Math.max(0, Math.round((stopTimeMs - trip.startTimeMs) / 60000));
  state.totals[trip.child] = (state.totals[trip.child] || 0) + minutes;
  state.activeTrip = null;
  saveState();
  stopGeoTracking();
  updateCounters();
  updateTripUI();
}

// ---------------- UI ----------------

function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .cst-overlay { position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:9999;
      display:flex; align-items:center; justify-content:center; }
    .cst-modal { background:#fff; border-radius:14px; padding:20px; max-width:340px;
      width:90%; text-align:center; font-family:inherit; }
    .cst-modal h3 { margin:0 0 14px; font-size:17px; }
    .cst-modal button { display:block; width:100%; margin:8px 0; padding:12px;
      border-radius:10px; border:none; font-size:15px; cursor:pointer; background:#f0f2f5; }
    .cst-modal button.cst-primary { background:#2c7be5; color:#fff; }
    .cst-modal input[type=datetime-local] { width:100%; padding:8px; margin:8px 0;
      border-radius:8px; border:1px solid #ccc; }
    #btn-changer-siege.active { background:#e04b4b !important; }
    #compteur-voiture { color:#fff; opacity:0.85; font-size:11px; margin-top:2px; }
    #compteur-voiture .cv-ligne { white-space:nowrap; }
  `;
  document.head.appendChild(style);
}

function injectButton() {
  const langBtn = document.getElementById('btn-changer-langue');
  const btn = document.createElement('button');
  btn.className = 'outil-icone-mini';
  btn.id = 'btn-changer-siege';
  btn.title = langue === 'he' ? 'מי יושב מאחור?' : 'Qui derrière ?';
  btn.textContent = '🚗';
  btn.onclick = onMainButtonClick;
  if (langBtn && langBtn.parentNode) {
    langBtn.parentNode.insertBefore(btn, langBtn.nextSibling);
  }
}

function injectCounterZone() {
  const roleEl = document.getElementById('mon-role');
  if (!roleEl || !roleEl.parentNode) return;
  const div = document.createElement('div');
  div.id = 'compteur-voiture';
  roleEl.parentNode.insertBefore(div, roleEl.nextSibling);
}

function updateTripUI() {
  const btn = document.getElementById('btn-changer-siege');
  if (btn) {
    if (state.activeTrip) {
      btn.classList.add('active');
      const c = CHILDREN.find(c => c.id === state.activeTrip.child);
      btn.title = (langue === 'he' ? 'עצור — ' : 'Arrêt — ') + (c ? childLabel(c) : '');
    } else {
      btn.classList.remove('active');
      btn.title = langue === 'he' ? 'מי יושב מאחור?' : 'Qui derrière ?';
    }
  }

  document.querySelectorAll('.switch-profil-btn[data-profil-id]').forEach(el => {
    const estDerriere = state.activeTrip && el.dataset.profilId === state.activeTrip.child;
    el.classList.toggle('en-voiture-derriere', !!estDerriere);
  });
}

function onMainButtonClick() {
  if (state.activeTrip) {
    finalizeTrip(Date.now());
  } else {
    openChildSelector();
  }
}

function openModal(innerHtml) {
  const overlay = document.createElement('div');
  overlay.className = 'cst-overlay';
  overlay.innerHTML = `<div class="cst-modal">${innerHtml}</div>`;
  document.body.appendChild(overlay);
  return overlay;
}
function closeModal(overlay) { if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); }

function openChildSelector() {
  const titre = langue === 'he' ? 'מי יושב מאחור?' : 'Qui est derrière ?';
  const annuler = langue === 'he' ? 'ביטול' : 'Annuler';
  const overlay = openModal(`
    <h3>${titre}</h3>
    ${CHILDREN.map(c => `<button data-child="${c.id}">${childLabel(c)}</button>`).join('')}
    <button data-child="__cancel">${annuler}</button>
  `);
  overlay.querySelectorAll('button[data-child]').forEach(b => {
    b.onclick = () => {
      const childId = b.getAttribute('data-child');
      closeModal(overlay);
      if (childId !== '__cancel') startTrip(childId);
    };
  });
}

function showConfirmModal() {
  confirmModalOpen = true;
  const fr = langue !== 'he';
  const overlay = openModal(`
    <h3>${fr ? 'On dirait que vous êtes arrêtés' : 'נראה שעצרתם'}</h3>
    <button id="cst-arrived" class="cst-primary">${fr ? 'On est arrivé' : 'הגענו'}</button>
    <button id="cst-traffic">${fr ? 'Embouteillage / pas encore arrivé' : 'פקק / עוד לא הגענו'}</button>
  `);
  overlay.querySelector('#cst-arrived').onclick = () => {
    confirmModalOpen = false; closeModal(overlay); askWhichTime();
  };
  overlay.querySelector('#cst-traffic').onclick = () => {
    confirmModalOpen = false; closeModal(overlay); askTrafficReminder();
  };
}

function askTrafficReminder() {
  const fr = langue !== 'he';
  const overlay = openModal(`
    <h3>${fr ? 'Rappel dans 10 min ?' : "תזכורת בעוד 10 דק'?"}</h3>
    <button id="cst-yes" class="cst-primary">${fr ? 'Oui, rappelle-moi' : 'כן, תזכיר לי'}</button>
    <button id="cst-no">${fr ? 'Non, laisse tourner' : 'לא, המשך'}</button>
  `);
  overlay.querySelector('#cst-yes').onclick = () => {
    closeModal(overlay);
    trafficRecheckTimer = setTimeout(() => {
      trafficRecheckTimer = null;
      if (state.activeTrip && !confirmModalOpen) { confirmModalOpen = true; recheckModal(); }
    }, TRAFFIC_RECHECK_MS);
  };
  overlay.querySelector('#cst-no').onclick = () => closeModal(overlay);
}

function recheckModal() {
  const fr = langue !== 'he';
  const o2 = openModal(`
    <h3>${fr ? 'Toujours arrêtés ?' : 'עדיין עוצרים?'}</h3>
    <button id="cst-arrived2" class="cst-primary">${fr ? 'On est arrivé' : 'הגענו'}</button>
    <button id="cst-traffic2">${fr ? 'Encore en embouteillage' : 'עדיין בפקק'}</button>
  `);
  o2.querySelector('#cst-arrived2').onclick = () => { confirmModalOpen = false; closeModal(o2); askWhichTime(); };
  o2.querySelector('#cst-traffic2').onclick = () => { confirmModalOpen = false; closeModal(o2); askTrafficReminder(); };
}

function formatTime(ms) {
  return new Date(ms).toLocaleTimeString(langue === 'he' ? 'he-IL' : 'fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function askWhichTime() {
  const fr = langue !== 'he';
  const detected = stillDetectedAt || Date.now();
  const now = Date.now();
  const overlay = openModal(`
    <h3>${fr ? "Quelle heure d'arrivée ?" : 'איזו שעת הגעה?'}</h3>
    <button id="cst-t-detected" class="cst-primary">${fr ? 'Heure détectée' : 'שעה שזוהתה'} (${formatTime(detected)})</button>
    <button id="cst-t-now">${fr ? 'Heure actuelle' : 'עכשיו'} (${formatTime(now)})</button>
    <button id="cst-t-custom">${fr ? 'Personnalisée' : 'מותאם אישית'}</button>
    <div id="cst-custom-wrap" style="display:none">
      <input type="datetime-local" id="cst-custom-input">
      <button id="cst-t-custom-confirm" class="cst-primary">${fr ? 'Valider' : 'אישור'}</button>
    </div>
  `);
  overlay.querySelector('#cst-t-detected').onclick = () => { closeModal(overlay); finalizeTrip(detected); };
  overlay.querySelector('#cst-t-now').onclick = () => { closeModal(overlay); finalizeTrip(now); };
  overlay.querySelector('#cst-t-custom').onclick = () => {
    overlay.querySelector('#cst-custom-wrap').style.display = 'block';
  };
  overlay.querySelector('#cst-t-custom-confirm').onclick = () => {
    const val = overlay.querySelector('#cst-custom-input').value;
    const ms = val ? new Date(val).getTime() : now;
    closeModal(overlay);
    finalizeTrip(ms);
  };
}

function minutesToStr(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return langue === 'he' ? `${h} ש' ${m} דק'` : `${h}h${String(m).padStart(2, '0')}`;
}

function updateCounters() {
  const zone = document.getElementById('compteur-voiture');
  if (!zone) return;

  if (myRole === 'parent') {
    // vue parent : les 3 totaux, pour décider qui va derrière ensuite
    zone.innerHTML = CHILDREN.map(c => {
      const label = childLabel(c);
      const val = minutesToStr(state.totals[c.id] || 0);
      return `<div class="cv-ligne">🚗 ${label}: ${val}</div>`;
    }).join('');
  } else if (CHILDREN.some(c => c.id === myProfilId)) {
    const val = minutesToStr(state.totals[myProfilId] || 0);
    zone.innerHTML = `<div class="cv-ligne">🚗 ${langue === 'he' ? 'מאחור השבוע' : 'derrière cette semaine'}: ${val}</div>`;
  } else {
    zone.innerHTML = '';
  }
}

// ---------------- INIT PUBLIC ----------------

export async function initCarSeatTracker({ profilId, role, langue: l }) {
  myProfilId = profilId;
  myRole = role;
  langue = l || 'fr';
  injectStyles();
  injectButton();
  injectCounterZone();
  await ensureDoc();
  listen();
}

// À appeler après que le sélecteur d'avatars (switch-profil-row) a été construit,
// pour que le surlignage "en voiture derrière" s'applique bien dessus.
export function refreshCarSeatUI() {
  updateTripUI();
  updateCounters();
}
