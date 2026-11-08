/**
 * Planilla Digital Árbitro de Fútbol - Frontend Mobile
 * Torneo de Fútbol SaaS Multi-Tenant (PRD v2.0 - RF-10, RF-11, RF-12, RF-13)
 */

// --- CONFIG & STATE ---
const API_BASE_URL = 'http://localhost:5000/api';

// Extract match_id from URL query param or fallback to seed match ID
const urlParams = new URLSearchParams(window.location.search);
const MATCH_ID = urlParams.get('match_id') || 'd1111111-1111-1111-1111-111111111111';

const state = {
  isOnline: false,
  match: {
    id: MATCH_ID,
    competition: 'Copa de Verano 2026 • Primera A (Libre)',
    venue: 'Cancha Principal Estadio Olaya • Bogotá',
    status: 'SCHEDULED', // SCHEDULED, IN_PROGRESS, PLAYED
    sheet_status: 'DRAFT',
    home_score: 0,
    away_score: 0,
    homeTeam: {
      id: 'e1111111-1111-1111-1111-111111111111',
      name: 'Los Halcones',
      short: 'HAL',
      badgeColor: 'border-blue-500 bg-blue-900/40',
      textColor: 'text-blue-400',
    },
    awayTeam: {
      id: 'e2222222-2222-2222-2222-222222222222',
      name: 'San Martín',
      short: 'ASM',
      badgeColor: 'border-red-500 bg-red-900/40',
      textColor: 'text-red-400',
    },
  },
  // Stopwatch
  timer: {
    intervalId: null,
    seconds: 0,
    isRunning: false,
    period: 'FIRST_HALF', // FIRST_HALF (1T), SECOND_HALF (2T), EXTRA_FIRST, EXTRA_SECOND, PENALTIES
    addedMinutes: 0,
  },
  // Players
  players: {
    home: [
      { id: 'c1111111-1111-1111-1111-111111111111', name: 'Mateo Gómez Giraldo', number: 10, pos: 'DEL', isStarter: true, isCaptain: true, cards: [] },
      { id: 'c2222222-2222-2222-2222-222222222222', name: 'Sebastián Pérez Morales', number: 8, pos: 'VOL', isStarter: true, isCaptain: false, cards: [] },
      { id: 'hp-3', name: 'Juan Carlos Arquero', number: 1, pos: 'POR', isStarter: true, isCaptain: false, cards: [] },
      { id: 'hp-4', name: 'David Murillo', number: 4, pos: 'DEF', isStarter: true, isCaptain: false, cards: [] },
      { id: 'hp-5', name: 'Andrés Balanta', number: 6, pos: 'VOL', isStarter: true, isCaptain: false, cards: [] },
      { id: 'hp-6', name: 'Carlos Bacca Jr', number: 9, pos: 'DEL', isStarter: false, isCaptain: false, cards: [] },
      { id: 'hp-7', name: 'Luis Mosquera', number: 14, pos: 'DEF', isStarter: false, isCaptain: false, cards: [] },
    ],
    away: [
      { id: 'c3333333-3333-3333-3333-333333333333', name: 'Camilo Zapata Restrepo', number: 9, pos: 'DEL', isStarter: true, isCaptain: true, cards: [] },
      { id: 'ap-2', name: 'Cristian Bonilla', number: 1, pos: 'POR', isStarter: true, isCaptain: false, cards: [] },
      { id: 'ap-3', name: 'Pedro Franco', number: 3, pos: 'DEF', isStarter: true, isCaptain: false, cards: [] },
      { id: 'ap-4', name: 'Alexander Mejía', number: 5, pos: 'VOL', isStarter: true, isCaptain: false, cards: [] },
      { id: 'ap-5', name: 'Jhon Córdoba', number: 11, pos: 'DEL', isStarter: true, isCaptain: false, cards: [] },
      { id: 'ap-6', name: 'Felipe Jaramillo', number: 17, pos: 'VOL', isStarter: false, isCaptain: false, cards: [] },
      { id: 'ap-7', name: 'Daniel Bocanegra', number: 22, pos: 'DEF', isStarter: false, isCaptain: false, cards: [] },
    ],
  },
  // Match events
  events: [],
};

// --- AUDIO EFFECTS (Web Audio API Synthesizer - No External Files) ---
class SoundManager {
  constructor() {
    this.ctx = null;
  }
  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
  }
  whistle(type = 'normal') {
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';

      const now = this.ctx.currentTime;
      if (type === 'long') {
        // Long whistle for end of half/match
        osc.frequency.setValueAtTime(2600, now);
        osc.frequency.exponentialRampToValueAtTime(2900, now + 0.15);
        osc.frequency.exponentialRampToValueAtTime(2700, now + 0.7);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.8);
      } else {
        // Short whistle
        osc.frequency.setValueAtTime(2800, now);
        osc.frequency.exponentialRampToValueAtTime(3200, now + 0.08);
        osc.frequency.exponentialRampToValueAtTime(2800, now + 0.25);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
      }
    } catch (e) {
      // Audio context might be restricted before user gesture
    }
  }
  beep() {
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.setValueAtTime(880, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.15);
    } catch (e) {}
  }
}
const sound = new SoundManager();

// Haptic feedback helper
const haptic = (pattern = 60) => {
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch (e) {}
  }
};

// --- DOM ELEMENTS ---
const elements = {
  backendBadge: document.getElementById('backendBadge'),
  whistleBtn: document.getElementById('whistleBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  homeScore: document.getElementById('homeScore'),
  awayScore: document.getElementById('awayScore'),
  homeTeamName: document.getElementById('homeTeamName'),
  awayTeamName: document.getElementById('awayTeamName'),
  matchStatusBadge: document.getElementById('matchStatusBadge'),
  stopwatchDisplay: document.getElementById('stopwatchDisplay'),
  timerDisplayBox: document.getElementById('timerDisplayBox'),
  currentPeriodLabel: document.getElementById('currentPeriodLabel'),
  currentMinuteCounter: document.getElementById('currentMinuteCounter'),
  addedTimeLabel: document.getElementById('addedTimeLabel'),
  toggleTimerBtn: document.getElementById('toggleTimerBtn'),
  toggleTimerText: document.getElementById('toggleTimerText'),
  toggleTimerIcon: document.getElementById('toggleTimerIcon'),
  nextPeriodBtn: document.getElementById('nextPeriodBtn'),
  nextPeriodText: document.getElementById('nextPeriodText'),
  liveEventsList: document.getElementById('liveEventsList'),
  eventsCountBadge: document.getElementById('eventsCountBadge'),
  lineupContainer: document.getElementById('lineupContainer'),
  fullTimelineList: document.getElementById('fullTimelineList'),
  tabTeamHome: document.getElementById('tabTeamHome'),
  tabTeamAway: document.getElementById('tabTeamAway'),
  finalScoreDisplay: document.getElementById('finalScoreDisplay'),
  finalHomeName: document.getElementById('finalHomeName'),
  finalAwayName: document.getElementById('finalAwayName'),
  refereeNotesInput: document.getElementById('refereeNotesInput'),
  btnSubmitSheet: document.getElementById('btnSubmitSheet'),
  // Action Buttons
  btnActionGoal: document.getElementById('btnActionGoal'),
  btnActionYellow: document.getElementById('btnActionYellow'),
  btnActionRed: document.getElementById('btnActionRed'),
  btnActionSub: document.getElementById('btnActionSub'),
  btnActionIncident: document.getElementById('btnActionIncident'),
  // Modals
  modalGoal: document.getElementById('modalGoal'),
  modalCard: document.getElementById('modalCard'),
  modalSub: document.getElementById('modalSub'),
  modalIncident: document.getElementById('modalIncident'),
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  setupNavigation();
  setupStopwatch();
  setupActionModals();
  setupWhistle();
  renderLineup('home');
  checkBackendConnection();
  loadLocalState();
  updateUI();
});

// --- NAVIGATION TABS ---
function setupNavigation() {
  const tabs = document.querySelectorAll('.nav-tab');
  const views = ['viewLive', 'viewLineups', 'viewTimeline', 'viewFinalize'];

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      haptic(30);
      const targetView = tab.getAttribute('data-view');

      // Update tab active classes
      tabs.forEach((t) => {
        t.classList.remove('active', 'text-emerald-400');
        t.classList.add('text-slate-400');
        t.querySelector('span').classList.remove('font-extrabold');
      });
      tab.classList.add('active', 'text-emerald-400');
      tab.classList.remove('text-slate-400');
      tab.querySelector('span').classList.add('font-extrabold');

      // Show view
      views.forEach((v) => {
        const el = document.getElementById(v);
        if (v === targetView) {
          el.classList.remove('hidden');
        } else {
          el.classList.add('hidden');
        }
      });

      if (targetView === 'viewTimeline') {
        renderFullTimeline();
      } else if (targetView === 'viewFinalize') {
        elements.finalScoreDisplay.textContent = `${state.match.home_score} - ${state.match.away_score}`;
        elements.finalHomeName.textContent = state.match.homeTeam.name;
        elements.finalAwayName.textContent = state.match.awayTeam.name;
      }
    });
  });

  // Lineup team tabs
  elements.tabTeamHome.addEventListener('click', () => {
    elements.tabTeamHome.className = 'px-3 py-1 text-xs font-bold rounded-md bg-blue-600 text-white transition-all';
    elements.tabTeamAway.className = 'px-3 py-1 text-xs font-bold rounded-md text-slate-400 hover:text-white transition-all';
    renderLineup('home');
  });

  elements.tabTeamAway.addEventListener('click', () => {
    elements.tabTeamAway.className = 'px-3 py-1 text-xs font-bold rounded-md bg-red-600 text-white transition-all';
    elements.tabTeamHome.className = 'px-3 py-1 text-xs font-bold rounded-md text-slate-400 hover:text-white transition-all';
    renderLineup('away');
  });
}

// --- STOPWATCH / CRONÓMETRO ENGINE ---
function setupStopwatch() {
  elements.toggleTimerBtn.addEventListener('click', () => {
    toggleTimer();
  });

  elements.nextPeriodBtn.addEventListener('click', () => {
    advancePeriod();
  });

  // Quick added time buttons
  document.querySelectorAll('.add-time-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mins = parseInt(btn.getAttribute('data-minutes'), 10);
      state.timer.addedMinutes += mins;
      elements.addedTimeLabel.textContent = `+${state.timer.addedMinutes} min añadido`;
      elements.addedTimeLabel.classList.remove('hidden');
      showToast(`+${mins} min de adición al tiempo reglamentario`, 'info');
      haptic(50);
    });
  });
}

function toggleTimer() {
  sound.whistle(state.timer.isRunning ? 'normal' : 'long');
  haptic([80, 50, 80]);

  if (state.timer.isRunning) {
    // Pause timer
    clearInterval(state.timer.intervalId);
    state.timer.isRunning = false;
    elements.timerDisplayBox.classList.remove('timer-active');
    elements.toggleTimerBtn.className = 'touch-btn col-span-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30 transition-all';
    elements.toggleTimerText.textContent = 'REANUDAR JUEGO';
    elements.toggleTimerIcon.setAttribute('data-lucide', 'play');
    elements.matchStatusBadge.textContent = 'PAUSADO';
    elements.matchStatusBadge.className = 'mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30';
  } else {
    // Start / Resume timer
    state.timer.isRunning = true;
    state.match.status = 'IN_PROGRESS';
    elements.timerDisplayBox.classList.add('timer-active');
    elements.toggleTimerBtn.className = 'touch-btn col-span-2 py-3 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-lg shadow-amber-900/30 transition-all';
    elements.toggleTimerText.textContent = 'PAUSAR TIEMPO';
    elements.toggleTimerIcon.setAttribute('data-lucide', 'pause');
    elements.matchStatusBadge.textContent = 'EN VIVO';
    elements.matchStatusBadge.className = 'mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';

    state.timer.intervalId = setInterval(() => {
      state.timer.seconds++;
      updateStopwatchDisplay();
      if (state.timer.seconds % 10 === 0) {
        saveLocalState();
      }
    }, 1000);
  }
  lucide.createIcons();
}

function updateStopwatchDisplay() {
  const mins = Math.floor(state.timer.seconds / 60);
  const secs = state.timer.seconds % 60;
  elements.stopwatchDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  
  // Game minute (1-indexed for football)
  const currentMinute = Math.min(130, Math.floor(state.timer.seconds / 60) + 1);
  elements.currentMinuteCounter.textContent = `${currentMinute}'`;
}

function advancePeriod() {
  sound.whistle('long');
  haptic([100, 100, 100]);

  if (state.timer.period === 'FIRST_HALF') {
    // End of 1st half
    clearInterval(state.timer.intervalId);
    state.timer.isRunning = false;
    state.timer.period = 'SECOND_HALF';
    state.timer.seconds = 45 * 60; // 45:00
    state.timer.addedMinutes = 0;
    elements.addedTimeLabel.classList.add('hidden');
    elements.currentPeriodLabel.textContent = '2T (Segundo Tiempo)';
    elements.nextPeriodText.textContent = 'FIN PARTIDO';
    elements.toggleTimerText.textContent = 'INICIAR 2T';
    elements.timerDisplayBox.classList.remove('timer-active');
    elements.matchStatusBadge.textContent = 'ENTRETIEMPO';
    elements.matchStatusBadge.className = 'mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30';
    updateStopwatchDisplay();
    showToast('Primer tiempo finalizado (45:00). Listo para iniciar 2T.', 'success');
  } else if (state.timer.period === 'SECOND_HALF') {
    // End of match
    clearInterval(state.timer.intervalId);
    state.timer.isRunning = false;
    state.match.status = 'PLAYED';
    elements.timerDisplayBox.classList.remove('timer-active');
    elements.toggleTimerBtn.disabled = true;
    elements.toggleTimerBtn.classList.add('opacity-50');
    elements.toggleTimerText.textContent = 'PARTIDO FINALIZADO';
    elements.matchStatusBadge.textContent = 'FINALIZADO';
    elements.matchStatusBadge.className = 'mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30';
    showToast('¡Silbatazo final! Partido concluido. Pasa a Finalizar Planilla.', 'warning');
  }
  lucide.createIcons();
}

function getCurrentMinute() {
  return Math.min(130, Math.floor(state.timer.seconds / 60) + 1);
}

// --- WHISTLE TEST BUTTON ---
function setupWhistle() {
  elements.whistleBtn.addEventListener('click', () => {
    sound.whistle('normal');
    haptic(100);
    showToast('Silbato arbitral activado', 'info');
  });

  elements.refreshBtn.addEventListener('click', () => {
    haptic(40);
    checkBackendConnection(true);
  });
}

// --- ACTION BUTTONS & MODALS ---
let activeTeamModal = 'home';
let currentCardType = 'YELLOW_CARD';

function setupActionModals() {
  // 1. GOL BUTTON
  elements.btnActionGoal.addEventListener('click', () => {
    haptic(80);
    sound.beep();
    document.getElementById('goalMinuteInput').value = getCurrentMinute();
    selectGoalTeam('home');
    openModal(elements.modalGoal);
  });

  document.getElementById('goalTeamHome').addEventListener('click', () => selectGoalTeam('home'));
  document.getElementById('goalTeamAway').addEventListener('click', () => selectGoalTeam('away'));

  document.getElementById('btnConfirmGoal').addEventListener('click', () => {
    confirmGoal();
  });

  // 2. TARJETA AMARILLA BUTTON
  elements.btnActionYellow.addEventListener('click', () => {
    haptic(80);
    sound.beep();
    currentCardType = 'YELLOW_CARD';
    document.getElementById('modalCardTitle').innerHTML = '<span class="text-2xl">🟨</span> Tarjeta Amarilla (Amonestación)';
    document.getElementById('btnConfirmCardText').textContent = 'APLICAR AMONESTACIÓN';
    document.getElementById('btnConfirmCard').className = 'touch-btn w-full py-3.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg';
    document.getElementById('cardMinuteInput').value = getCurrentMinute();
    selectCardTeam('home');
    openModal(elements.modalCard);
  });

  // 3. TARJETA ROJA BUTTON
  elements.btnActionRed.addEventListener('click', () => {
    haptic(120);
    sound.beep();
    currentCardType = 'RED_CARD';
    document.getElementById('modalCardTitle').innerHTML = '<span class="text-2xl">🟥</span> Tarjeta Roja (Expulsión Directa)';
    document.getElementById('btnConfirmCardText').textContent = 'EXPULSAR JUGADOR (ROJA DIRECTA)';
    document.getElementById('btnConfirmCard').className = 'touch-btn w-full py-3.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg';
    document.getElementById('cardMinuteInput').value = getCurrentMinute();
    selectCardTeam('home');
    openModal(elements.modalCard);
  });

  document.getElementById('cardTeamHome').addEventListener('click', () => selectCardTeam('home'));
  document.getElementById('cardTeamAway').addEventListener('click', () => selectCardTeam('away'));

  document.getElementById('btnConfirmCard').addEventListener('click', () => {
    confirmCard();
  });

  // 4. SUSTITUCIÓN BUTTON
  elements.btnActionSub.addEventListener('click', () => {
    haptic(50);
    document.getElementById('subMinuteInput').value = getCurrentMinute();
    selectSubTeam('home');
    openModal(elements.modalSub);
  });

  document.getElementById('subTeamHome').addEventListener('click', () => selectSubTeam('home'));
  document.getElementById('subTeamAway').addEventListener('click', () => selectSubTeam('away'));

  document.getElementById('btnConfirmSub').addEventListener('click', () => {
    confirmSub();
  });

  // 5. INCIDENCIA BUTTON
  elements.btnActionIncident.addEventListener('click', () => {
    haptic(50);
    openModal(elements.modalIncident);
  });

  document.getElementById('btnConfirmIncident').addEventListener('click', () => {
    confirmIncident();
  });

  // Close modals on click outside or close button
  document.querySelectorAll('.close-modal').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeAllModals();
    });
  });

  // Submit match sheet button
  elements.btnSubmitSheet.addEventListener('click', () => {
    submitMatchSheet();
  });
}

function openModal(modal) {
  modal.classList.remove('hidden');
  lucide.createIcons();
}

function closeAllModals() {
  document.querySelectorAll('#modalGoal, #modalCard, #modalSub, #modalIncident').forEach((m) => {
    m.classList.add('hidden');
  });
}

function selectGoalTeam(teamKey) {
  activeTeamModal = teamKey;
  const homeBtn = document.getElementById('goalTeamHome');
  const awayBtn = document.getElementById('goalTeamAway');

  if (teamKey === 'home') {
    homeBtn.className = 'team-select-btn active py-2.5 px-3 rounded-xl bg-blue-600 text-white font-bold text-xs border-2 border-blue-400 text-center';
    awayBtn.className = 'team-select-btn py-2.5 px-3 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs border-2 border-transparent text-center';
  } else {
    awayBtn.className = 'team-select-btn active py-2.5 px-3 rounded-xl bg-red-600 text-white font-bold text-xs border-2 border-red-400 text-center';
    homeBtn.className = 'team-select-btn py-2.5 px-3 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs border-2 border-transparent text-center';
  }

  // Populate players select
  const select = document.getElementById('goalPlayerSelect');
  select.innerHTML = '';
  state.players[teamKey].forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `#${p.number} - ${p.name} (${p.pos})`;
    select.appendChild(opt);
  });
}

function selectCardTeam(teamKey) {
  activeTeamModal = teamKey;
  const homeBtn = document.getElementById('cardTeamHome');
  const awayBtn = document.getElementById('cardTeamAway');

  if (teamKey === 'home') {
    homeBtn.className = 'card-team-btn active py-2.5 px-3 rounded-xl bg-blue-600 text-white font-bold text-xs border-2 border-blue-400 text-center';
    awayBtn.className = 'card-team-btn py-2.5 px-3 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs border-2 border-transparent text-center';
  } else {
    awayBtn.className = 'card-team-btn active py-2.5 px-3 rounded-xl bg-red-600 text-white font-bold text-xs border-2 border-red-400 text-center';
    homeBtn.className = 'card-team-btn py-2.5 px-3 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs border-2 border-transparent text-center';
  }

  const select = document.getElementById('cardPlayerSelect');
  select.innerHTML = '';
  state.players[teamKey].forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    const cardStatus = p.cards.includes('YELLOW') ? ' [⚠️ YA TIENE 1 AMARILLA]' : '';
    opt.textContent = `#${p.number} - ${p.name} ${cardStatus}`;
    select.appendChild(opt);
  });
}

function selectSubTeam(teamKey) {
  activeTeamModal = teamKey;
  const homeBtn = document.getElementById('subTeamHome');
  const awayBtn = document.getElementById('subTeamAway');

  if (teamKey === 'home') {
    homeBtn.className = 'sub-team-btn active py-2 px-3 rounded-xl bg-blue-600 text-white font-bold text-xs border border-blue-400 text-center';
    awayBtn.className = 'sub-team-btn py-2 px-3 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs border border-transparent text-center';
  } else {
    awayBtn.className = 'sub-team-btn active py-2 px-3 rounded-xl bg-red-600 text-white font-bold text-xs border border-red-400 text-center';
    homeBtn.className = 'sub-team-btn py-2 px-3 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs border border-transparent text-center';
  }

  const outSelect = document.getElementById('subPlayerOutSelect');
  const inSelect = document.getElementById('subPlayerInSelect');
  outSelect.innerHTML = '';
  inSelect.innerHTML = '';

  state.players[teamKey].filter((p) => p.isStarter).forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `#${p.number} - ${p.name}`;
    outSelect.appendChild(opt);
  });

  state.players[teamKey].filter((p) => !p.isStarter).forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `#${p.number} - ${p.name}`;
    inSelect.appendChild(opt);
  });
}

// --- EVENT CONFIRMATION HANDLERS ---
async function confirmGoal() {
  const teamKey = activeTeamModal;
  const playerId = document.getElementById('goalPlayerSelect').value;
  const goalType = document.getElementById('goalTypeSelect').value;
  const minute = parseInt(document.getElementById('goalMinuteInput').value, 10);

  const team = teamKey === 'home' ? state.match.homeTeam : state.match.awayTeam;
  const player = state.players[teamKey].find((p) => p.id === playerId) || { name: 'Jugador', number: 0 };

  // Update Score
  if (goalType === 'OWN_GOAL') {
    // Autogol suma al rival
    if (teamKey === 'home') state.match.away_score++;
    else state.match.home_score++;
  } else {
    if (teamKey === 'home') state.match.home_score++;
    else state.match.away_score++;
  }

  const newEvent = {
    id: 'evt-' + Date.now(),
    type: goalType === 'OWN_GOAL' ? 'OWN_GOAL' : 'GOAL',
    team_entry_id: team.id,
    teamName: team.name,
    teamKey,
    player_id: playerId,
    playerName: player.name,
    playerJersey: player.number,
    minute,
    period: state.timer.period,
    description: goalType === 'OWN_GOAL' ? 'Autogol en propia puerta' : `Gol (${goalType})`,
    timeString: `${minute}'`,
  };

  state.events.unshift(newEvent);
  closeAllModals();
  updateUI();
  sound.whistle('long');
  haptic([100, 50, 150]);
  showToast(`⚽ ¡GOL de ${team.name}! #${player.number} ${player.name} (${minute}')`, 'goal');

  // Push to backend
  await syncEventToBackend(newEvent);
}

async function confirmCard() {
  const teamKey = activeTeamModal;
  const playerId = document.getElementById('cardPlayerSelect').value;
  const reason = document.getElementById('cardReasonSelect').value;
  const minute = parseInt(document.getElementById('cardMinuteInput').value, 10);

  const team = teamKey === 'home' ? state.match.homeTeam : state.match.awayTeam;
  const player = state.players[teamKey].find((p) => p.id === playerId);

  let finalEventType = currentCardType;

  // Check if player already has a yellow card -> convert to 2nd yellow (red)
  if (currentCardType === 'YELLOW_CARD') {
    if (player && player.cards.includes('YELLOW')) {
      finalEventType = 'SECOND_YELLOW_CARD';
      player.cards.push('RED');
      showToast(`🟥 SEGUNDA AMARILLA: Jugador #${player.number} ${player.name} queda EXPULSADO.`, 'warning');
    } else if (player) {
      player.cards.push('YELLOW');
    }
  } else if (currentCardType === 'RED_CARD' && player) {
    player.cards.push('RED');
  }

  const newEvent = {
    id: 'evt-' + Date.now(),
    type: finalEventType,
    team_entry_id: team.id,
    teamName: team.name,
    teamKey,
    player_id: playerId,
    playerName: player ? player.name : 'Jugador',
    playerJersey: player ? player.number : 0,
    minute,
    period: state.timer.period,
    description: reason,
    timeString: `${minute}'`,
  };

  state.events.unshift(newEvent);
  closeAllModals();
  updateUI();
  sound.whistle('normal');
  haptic([80, 40, 80]);

  if (finalEventType === 'YELLOW_CARD') {
    showToast(`🟨 Amarilla para #${player.number} ${player.name} (${minute}')`, 'info');
  } else {
    showToast(`🟥 Expulsión (Roja) para #${player.number} ${player.name} (${minute}')`, 'warning');
  }

  await syncEventToBackend(newEvent);
}

async function confirmSub() {
  const teamKey = activeTeamModal;
  const outId = document.getElementById('subPlayerOutSelect').value;
  const inId = document.getElementById('subPlayerInSelect').value;
  const minute = parseInt(document.getElementById('subMinuteInput').value, 10);

  const team = teamKey === 'home' ? state.match.homeTeam : state.match.awayTeam;
  const playerOut = state.players[teamKey].find((p) => p.id === outId);
  const playerIn = state.players[teamKey].find((p) => p.id === inId);

  if (playerOut) playerOut.isStarter = false;
  if (playerIn) playerIn.isStarter = true;

  const newEvent = {
    id: 'evt-' + Date.now(),
    type: 'SUBSTITUTION',
    team_entry_id: team.id,
    teamName: team.name,
    teamKey,
    minute,
    description: `Sale #${playerOut?.number} ${playerOut?.name} 🔻 | Entra #${playerIn?.number} ${playerIn?.name} 🔺`,
    timeString: `${minute}'`,
  };

  state.events.unshift(newEvent);
  closeAllModals();
  updateUI();
  sound.beep();
  showToast(`🔄 Cambio en ${team.name} (${minute}')`, 'info');

  await syncEventToBackend(newEvent);
}

async function confirmIncident() {
  const incidentType = document.getElementById('incidentTypeSelect').value;
  const incidentTeam = document.getElementById('incidentTeamSelect').value;
  const description = document.getElementById('incidentDescInput').value.trim() || 'Incidencia de partido';
  const minute = getCurrentMinute();

  const newEvent = {
    id: 'evt-' + Date.now(),
    type: incidentType,
    minute,
    description: `[${incidentTeam}] ${description}`,
    timeString: `${minute}'`,
  };

  state.events.unshift(newEvent);
  closeAllModals();
  updateUI();
  showToast(`⚠️ Incidencia registrada para informe disciplinario`, 'warning');

  await syncEventToBackend(newEvent);
}

// --- SYNC WITH EXPRESS POSTGRES BACKEND ---
async function checkBackendConnection(forceAlert = false) {
  try {
    const res = await fetch(`${API_BASE_URL}/health`);
    if (res.ok) {
      state.isOnline = true;
      elements.backendBadge.textContent = 'API ONLINE';
      elements.backendBadge.className = 'text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono border border-emerald-500/30';
      if (forceAlert) showToast('Conexión con PostgreSQL verificada', 'success');
      // Fetch match from DB if possible
      fetchMatchFromBackend();
    } else {
      throw new Error();
    }
  } catch (e) {
    state.isOnline = false;
    elements.backendBadge.textContent = 'MODO LOCAL';
    elements.backendBadge.className = 'text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono border border-amber-500/30';
    if (forceAlert) showToast('Modo sin conexión. Guardando localmente en el dispositivo.', 'info');
  }
}

async function fetchMatchFromBackend() {
  try {
    const res = await fetch(`${API_BASE_URL}/matches/${MATCH_ID}`);
    const data = await res.json();
    if (data.success && data.data) {
      const m = data.data;
      state.match.home_score = m.home_score || 0;
      state.match.away_score = m.away_score || 0;
      state.match.status = m.status || state.match.status;
      if (m.home_team_name) state.match.homeTeam.name = m.home_team_name;
      if (m.away_team_name) state.match.awayTeam.name = m.away_team_name;
      updateUI();
    }
  } catch (e) {
    // Keep local state
  }
}

async function syncEventToBackend(eventData) {
  saveLocalState();
  if (!state.isOnline) return;

  try {
    await fetch(`${API_BASE_URL}/matches/${MATCH_ID}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        team_entry_id: eventData.team_entry_id,
        player_registration_id: eventData.player_id,
        event_type: eventData.type,
        minute: eventData.minute,
        period: eventData.period || 'FIRST_HALF',
        description: eventData.description,
      }),
    });
  } catch (err) {
    console.warn('Failed to sync event to server:', err.message);
  }
}

async function submitMatchSheet() {
  const notes = elements.refereeNotesInput.value.trim();
  haptic([80, 80, 150]);

  if (state.isOnline) {
    try {
      const res = await fetch(`${API_BASE_URL}/matches/${MATCH_ID}/sheet-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sheet_status: 'SUBMITTED',
          notes: notes || 'Planilla enviada por el árbitro central sin objeciones.',
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast('✅ ¡Planilla enviada exitosamente para revisión administrativa!', 'success');
      }
    } catch (e) {
      showToast('Guardado localmente. Se enviará al reconectar con el servidor.', 'info');
    }
  } else {
    showToast('✅ Planilla guardada localmente (Estado: ENVIADA A REVISIÓN)', 'success');
  }

  state.match.sheet_status = 'SUBMITTED';
  elements.btnSubmitSheet.disabled = true;
  elements.btnSubmitSheet.innerHTML = '<i data-lucide="check-circle" class="w-5 h-5"></i><span>PLANILLA ENVIADA</span>';
  elements.btnSubmitSheet.className = 'touch-btn w-full py-4 px-4 rounded-xl bg-slate-800 text-emerald-400 font-black text-base flex items-center justify-center gap-2 border border-emerald-500/30';
  lucide.createIcons();
}

// --- RENDERING UI ---
function updateUI() {
  elements.homeScore.textContent = state.match.home_score;
  elements.awayScore.textContent = state.match.away_score;
  elements.homeTeamName.textContent = state.match.homeTeam.name;
  elements.awayTeamName.textContent = state.match.awayTeam.name;

  // Live events list in Pitch View
  elements.eventsCountBadge.textContent = `${state.events.length} evento${state.events.length === 1 ? '' : 's'}`;
  if (state.events.length === 0) {
    elements.liveEventsList.innerHTML = `
      <div class="text-center py-6 text-slate-400 text-xs">
        Sin acontecimientos registrados aún.<br>Usa los botones superiores al pitar una falta, gol o tarjeta.
      </div>
    `;
  } else {
    elements.liveEventsList.innerHTML = state.events.slice(0, 8).map((evt) => renderEventItem(evt)).join('');
  }
  lucide.createIcons();
}

function renderEventItem(evt) {
  let icon = '⚽';
  let badgeColor = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';

  if (evt.type === 'YELLOW_CARD') {
    icon = '🟨';
    badgeColor = 'bg-amber-500/20 text-amber-400 border-amber-500/30';
  } else if (evt.type === 'RED_CARD' || evt.type === 'SECOND_YELLOW_CARD') {
    icon = '🟥';
    badgeColor = 'bg-rose-500/20 text-rose-400 border-rose-500/30';
  } else if (evt.type === 'SUBSTITUTION') {
    icon = '🔄';
    badgeColor = 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
  } else if (evt.type === 'OWN_GOAL') {
    icon = '⚠️⚽';
    badgeColor = 'bg-rose-500/20 text-rose-400 border-rose-500/30';
  } else if (evt.type === 'FIGHT' || evt.type === 'FIELD_ABANDONMENT') {
    icon = '⚠️';
    badgeColor = 'bg-orange-500/20 text-orange-400 border-orange-500/30';
  }

  return `
    <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs">
      <div class="flex items-center gap-2.5">
        <span class="w-8 h-8 rounded-lg ${badgeColor} border flex items-center justify-center font-bold text-sm">
          ${icon}
        </span>
        <div>
          <div class="font-extrabold text-white flex items-center gap-1.5">
            <span>${evt.playerName ? `#${evt.playerJersey} ${evt.playerName}` : evt.teamName || 'Incidencia'}</span>
            <span class="text-[10px] text-slate-400">(${evt.teamName || 'General'})</span>
          </div>
          <div class="text-[11px] text-slate-400">${evt.description}</div>
        </div>
      </div>
      <div class="text-right">
        <span class="font-mono font-black text-emerald-400 text-xs">${evt.timeString}</span>
      </div>
    </div>
  `;
}

function renderFullTimeline() {
  if (state.events.length === 0) {
    elements.fullTimelineList.innerHTML = `<div class="text-center py-8 text-slate-400 text-xs">Aún no hay eventos registrados en este partido.</div>`;
    return;
  }
  elements.fullTimelineList.innerHTML = state.events.map((evt) => renderEventItem(evt)).join('');
  lucide.createIcons();
}

function renderLineup(teamKey) {
  const team = teamKey === 'home' ? state.match.homeTeam : state.match.awayTeam;
  const players = state.players[teamKey];

  elements.lineupContainer.innerHTML = `
    <div>
      <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
        <span>Titulares (${players.filter(p => p.isStarter).length})</span>
        <span class="${team.textColor} font-extrabold">${team.name}</span>
      </h4>
      <div class="space-y-1.5">
        ${players.filter(p => p.isStarter).map(p => `
          <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
            <div class="flex items-center gap-2.5">
              <span class="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 font-mono font-black text-white flex items-center justify-center">
                ${p.number}
              </span>
              <div>
                <span class="font-bold text-white">${p.name}</span>
                ${p.isCaptain ? '<span class="ml-1 text-[10px] text-amber-400 font-black px-1 rounded bg-amber-500/20 border border-amber-500/30">CAP</span>' : ''}
              </div>
            </div>
            <div class="flex items-center gap-2">
              ${p.cards.includes('YELLOW') ? '<span class="text-xs">🟨</span>' : ''}
              ${p.cards.includes('RED') ? '<span class="text-xs">🟥</span>' : ''}
              <span class="font-mono text-[10px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-800">${p.pos}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="pt-2">
      <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Suplentes en Banca (${players.filter(p => !p.isStarter).length})</h4>
      <div class="space-y-1.5">
        ${players.filter(p => !p.isStarter).map(p => `
          <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-850 text-xs text-slate-400">
            <div class="flex items-center gap-2.5">
              <span class="w-7 h-7 rounded-lg bg-slate-800/60 font-mono font-bold text-slate-300 flex items-center justify-center">
                ${p.number}
              </span>
              <span class="font-medium text-slate-300">${p.name}</span>
            </div>
            <span class="font-mono text-[10px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-800">${p.pos}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// --- LOCAL STORAGE CACHE (Offline resilience) ---
function saveLocalState() {
  try {
    const backup = {
      score: { home: state.match.home_score, away: state.match.away_score },
      timer: { seconds: state.timer.seconds, period: state.timer.period },
      events: state.events,
      cards: {
        home: state.players.home.map(p => ({ id: p.id, cards: p.cards })),
        away: state.players.away.map(p => ({ id: p.id, cards: p.cards })),
      }
    };
    localStorage.setItem(`referee_match_${MATCH_ID}`, JSON.stringify(backup));
  } catch (e) {}
}

function loadLocalState() {
  try {
    const raw = localStorage.getItem(`referee_match_${MATCH_ID}`);
    if (raw) {
      const data = JSON.parse(raw);
      state.match.home_score = data.score.home || 0;
      state.match.away_score = data.score.away || 0;
      state.timer.seconds = data.timer.seconds || 0;
      state.timer.period = data.timer.period || 'FIRST_HALF';
      state.events = data.events || [];
      updateStopwatchDisplay();
      if (state.timer.period === 'SECOND_HALF') {
        elements.currentPeriodLabel.textContent = '2T (Segundo Tiempo)';
        elements.nextPeriodText.textContent = 'FIN PARTIDO';
      }
    }
  } catch (e) {}
}

// --- TOAST NOTIFICATIONS ---
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');

  let bg = 'bg-slate-900 border-slate-700 text-white';
  if (type === 'goal') bg = 'bg-emerald-950 border-emerald-500 text-emerald-200';
  if (type === 'warning') bg = 'bg-rose-950 border-rose-500 text-rose-200';
  if (type === 'success') bg = 'bg-teal-950 border-teal-500 text-teal-200';

  toast.className = `pointer-events-auto px-4 py-2.5 rounded-xl border text-xs font-bold shadow-2xl flex items-center gap-2 transform transition-all duration-300 translate-y-2 opacity-0 ${bg}`;
  toast.innerHTML = `<span>${message}</span>`;

  container.appendChild(toast);

  // Animate in
  setTimeout(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  }, 10);

  // Auto remove
  setTimeout(() => {
    toast.classList.add('opacity-0', '-translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

