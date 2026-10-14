// Browser entry: renders the battle state, collects commands and plays back resolver events.
// All combat results come from src/battle.js; this file only presents them.
import {
  PARTY, SKILLS, ENEMIES, PLAYER_ATTRIBUTES, ENEMY_EMOTIONS, POSITIONS, STATUSES, TUNING, YUT_NAMES,
  MATCHUP_TABLE, MATCHUP_LEVELS, JOB_EFFECTS,
} from './src/data.js';
import { Battle, PHASES } from './src/battle.js';
import { createRng } from './src/rng.js';
import { getMatchup } from './src/rules.js';
import { validateContent } from './src/validate.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NUMS = ['①', '②', '③', '④', '⑤', '⑥'];
const PREFS_KEY = 'shaman-p5-prefs';
const SAVE_KEY = 'shaman-p5-best';
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// Generated sprites face different ways; flip so players face right and enemies face left.
const SPRITE_FLIP = {
  'assets/raw2/player-hando-idle.png': true, 'assets/raw2/player-hando-attack.png': true,
  'assets/raw2/player-mugyeom-idle.png': true, 'assets/raw2/player-mugyeom-attack.png': true,
};

const MATCHUP_COLORS = { overwhelming: '#f3d58c', effective: '#6fcf97', neutral: '#c9bfa9', weak: '#ff8a7a' };
const CANCEL_REASONS = {
  'dead-target': '대상이 이미 쓰러짐', 'dead-actor': '시전자 사망', 'dead-before-clash': '경합 전에 쓰러짐',
  'missing-target': '대상 없음', duplicate: '중복 명령', 'skill-not-exposed': '공개되지 않은 스킬', 'missing-actor': '알 수 없는 시전자',
};

// ------------------------------------------------------------------ preferences & storage
function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) ?? {}; } catch { return {}; }
}
function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify({ muted: sound.muted, speed: ui.speed })); } catch { /* per-viewer convenience only */ }
}
const browserStorage = {
  load() { const raw = localStorage.getItem(SAVE_KEY); return raw ? JSON.parse(raw) : null; },
  save(data) { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); return true; },
};

// ------------------------------------------------------------------ sound (generated Web Audio cues)
const sound = {
  ctx: null,
  muted: false,
  master: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
    } catch { this.ctx = null; }
  },
  tone(freq, { type = 'sine', dur = 0.2, vol = 0.3, at = 0, to = null, attack = 0.005 } = {}) {
    const c = this.ctx; const t = c.currentTime + at;
    const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },
  noise({ dur = 0.15, vol = 0.25, at = 0, freq = 1800, q = 1, type = 'bandpass' } = {}) {
    const c = this.ctx; const t = c.currentTime + at;
    const buffer = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = c.createBufferSource(); src.buffer = buffer;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  },
  play(name) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const s = this;
    const cues = {
      select() { s.tone(660, { type: 'triangle', dur: 0.08, vol: 0.12 }); },
      yut() {
        for (let i = 0; i < 4; i += 1) {
          s.tone(850 + Math.random() * 400, { type: 'triangle', dur: 0.06, vol: 0.18, at: 0.05 + i * 0.045 });
          s.noise({ dur: 0.04, vol: 0.12, at: 0.05 + i * 0.045, freq: 2500, q: 3 });
        }
      },
      clash() {
        [1250, 1870, 2630].forEach((f, i) => s.tone(f, { type: i ? 'sine' : 'square', dur: 0.45, vol: i ? 0.12 : 0.06 }));
        s.noise({ dur: 0.12, vol: 0.3, freq: 4000, q: 0.8 });
      },
      tie() { s.tone(520, { dur: 0.25, vol: 0.14 }); s.tone(520, { dur: 0.25, vol: 0.12, at: 0.14 }); },
      roundWin() { s.tone(880, { type: 'triangle', dur: 0.3, vol: 0.16 }); s.tone(1320, { dur: 0.35, vol: 0.08, at: 0.03 }); },
      roundLose() { s.tone(300, { type: 'sawtooth', dur: 0.25, vol: 0.07, to: 220 }); },
      hit() { s.tone(140, { type: 'sine', dur: 0.28, vol: 0.4, to: 55 }); s.noise({ dur: 0.18, vol: 0.35, freq: 900, q: 0.7 }); },
      bigHit() { s.tone(90, { dur: 0.7, vol: 0.5, to: 35 }); s.noise({ dur: 0.45, vol: 0.4, freq: 600, q: 0.5 }); s.tone(1760, { dur: 0.6, vol: 0.08, at: 0.05 }); },
      stagger() { s.tone(420, { type: 'sawtooth', dur: 0.32, vol: 0.08, to: 140 }); },
      whoosh() { s.noise({ dur: 0.35, vol: 0.3, freq: 700, q: 0.6, type: 'lowpass' }); },
      heal() { [784, 988, 1175].forEach((f, i) => s.tone(f, { dur: 0.5, vol: 0.09, at: i * 0.07 })); },
      fusion() {
        s.tone(55, { dur: 2.2, vol: 0.35, attack: 0.4 }); s.tone(82.5, { dur: 2.0, vol: 0.2, attack: 0.5 });
        [523, 659, 784, 1047].forEach((f, i) => s.tone(f, { type: 'triangle', dur: 1.2, vol: 0.07, at: 0.5 + i * 0.12 }));
        s.noise({ dur: 1.2, vol: 0.12, freq: 3000, q: 0.4, at: 0.3 });
      },
      gong() { s.tone(110, { dur: 1.8, vol: 0.32, attack: 0.01 }); s.tone(165, { dur: 1.4, vol: 0.12 }); s.tone(233, { dur: 1.0, vol: 0.06 }); },
      clear() { [392, 440, 523, 587, 784].forEach((f, i) => s.tone(f, { type: 'triangle', dur: 0.5, vol: 0.12, at: i * 0.11 })); },
      defeat() { s.tone(196, { dur: 1.6, vol: 0.25, to: 98 }); s.tone(147, { dur: 1.8, vol: 0.18, at: 0.2, to: 73 }); },
      death() { s.tone(180, { type: 'triangle', dur: 0.6, vol: 0.2, to: 60 }); },
    };
    try { cues[name]?.(); } catch { /* audio is optional */ }
  },
};

// ------------------------------------------------------------------ particles
const fx = {
  canvas: null, ctx: null, parts: [], running: false, dpr: 1,
  init() {
    this.canvas = $('#fx');
    this.ctx = this.canvas.getContext('2d');
    const resize = () => {
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = innerWidth * this.dpr; this.canvas.height = innerHeight * this.dpr;
    };
    resize();
    addEventListener('resize', resize);
  },
  burstAt(el, opts) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    this.burst(r.left + r.width / 2, r.top + r.height * (opts.yRatio ?? 0.45), opts);
  },
  burst(x, y, { color = '#f3d58c', count = 18, speed = 4, life = 40, kind = 'spark', size = 3 } = {}) {
    if (reducedMotion) count = Math.ceil(count / 4);
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random());
      this.parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (kind === 'ink' ? 0.6 : 0), life, max: life, color, kind,
        size: size * (0.6 + Math.random()),
      });
    }
    if (!this.running) { this.running = true; requestAnimationFrame(() => this.step()); }
  },
  step() {
    const { ctx, dpr } = this;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const p of this.parts) {
      p.life -= 1 * ui.speed; p.x += p.vx * ui.speed; p.y += p.vy * ui.speed;
      p.vx *= 0.94; p.vy = p.vy * 0.94 + (p.kind === 'spark' ? 0.12 : p.kind === 'petal' ? 0.03 : -0.04);
      const alpha = Math.max(0, p.life / p.max);
      ctx.globalAlpha = p.kind === 'ink' ? alpha * 0.28 : alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      const s = p.kind === 'ink' ? p.size * (2.4 - alpha) * 2.2 : p.size;
      ctx.arc(p.x * dpr, p.y * dpr, s * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (this.parts.length) requestAnimationFrame(() => this.step());
    else { this.running = false; ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); }
  },
};

// ------------------------------------------------------------------ state
const params = new URLSearchParams(location.search);
const devMode = params.has('dev');
const seedParam = params.get('seed');
const prefs = loadPrefs();
const ui = {
  pending: null, // { playerId, slotIndex }
  playing: false,
  skip: false,
  speed: [1, 2, 4].includes(prefs.speed) ? prefs.speed : 1,
  hold: null,
};
sound.muted = Boolean(prefs.muted);

let battle = null;

function newBattle() {
  const seed = seedParam !== null ? Number(seedParam) : Date.now() % 1e9;
  battle = new Battle({ rng: createRng(seed), storage: browserStorage, options: { revealAllSkills: false } });
  battle.seed = seed;
  return battle.newRun();
}

// ------------------------------------------------------------------ helpers for display
const playerDef = (id) => PARTY.find((p) => p.id === id);
const unitName = (id) => battle.player(id)?.name ?? battle.enemy(id)?.name ?? id;
const attrBadge = (attrId) => {
  const a = PLAYER_ATTRIBUTES[attrId];
  return `<span class="attr-badge" style="--c:${a.color}" title="스킬 속성">${a.icon} ${a.label}</span>`;
};
const emotionBadge = (emotionId) => {
  const e = ENEMY_EMOTIONS[emotionId];
  return `<span class="emotion-badge" style="--c:${e.color}" title="적 감정 속성">${e.icon} ${e.label}</span>`;
};
const pct = (v, max) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;

function statusChips(unit) {
  return Object.entries(unit.statuses).map(([id, st]) => {
    const def = STATUSES[id];
    const amount = st.turns ? `${st.turns}턴` : st.charges > 1 ? `×${st.charges}` : '';
    const title = `${def.label}: ${def.desc}${st.power ? ` (${st.power})` : ''}`;
    return `<span class="status ${def.debuff ? '' : 'buff'}" title="${esc(title)}">${def.icon} ${def.label}${amount ? ` ${amount}` : ''}</span>`;
  }).join('');
}

function sortedCommands() {
  return [...battle.state.commands].sort((a, b) => a.seq - b.seq);
}

function nextBossActionIn() {
  const every = TUNING.bossActionEvery;
  const r = battle.state.turn % every;
  return r === 0 ? 0 : every - r;
}

// ------------------------------------------------------------------ layout of units on the field
// Units spread evenly across their half, front row nearest the centre; depth rows sit higher and smaller.
const DEPTH = { front: { b: 3, s: 1, order: 0 }, middle: { b: 8, s: 0.95, order: 1 }, back: { b: 13, s: 0.9, order: 2 } };
function layoutUnits(units, side) {
  const list = [...units].sort((a, b) => DEPTH[a.position].order - DEPTH[b.position].order);
  const n = list.length;
  const center = side === 'player' ? 27 : 73;
  const step = n > 1 ? Math.min(12, 36 / (n - 1)) : 0;
  const dir = side === 'player' ? 1 : -1;
  const out = {};
  list.forEach((u, i) => {
    const depth = DEPTH[u.position];
    out[u.id ?? u.uid] = {
      x: center + dir * ((n - 1) / 2 - i) * step,
      b: depth.b + (i % 2) * 2,
      s: depth.s,
      z: 30 - depth.order * 5 - i,
    };
  });
  return out;
}

// ------------------------------------------------------------------ rendering
function render() {
  renderHeader();
  renderUnits();
  renderParty();
  renderPanel();
}

function renderHeader() {
  const s = battle.state;
  $('#field').classList.toggle('boss-stage', s.stageType === 'boss');
  const boss = s.enemies.find((e) => e.boss);
  const parts = [`<span class="stage-num">STAGE ${s.runStage}</span>`];
  if (s.stageType === 'boss' && boss) {
    const e = ENEMY_EMOTIONS[boss.emotion];
    parts.push(`<span class="chip boss">보스 전투 · ${esc(ENEMIES[boss.templateId].name)} ${e.icon} ${e.label}</span>`);
    parts.push(`<span class="chip boss" title="보스 전용 행동 주기">전용 행동: ${TUNING.bossActionEvery}턴마다 · 비경합 ×${TUNING.unopposedMultiplier.boss.toFixed(2)}</span>`);
  } else {
    parts.push(`<span class="chip normal">일반 전투 · 비경합 ×${TUNING.unopposedMultiplier.normal.toFixed(2)}</span>`);
  }
  parts.push(`<span class="chip">${s.turn}턴</span>`);
  parts.push(`<span class="chip" title="${battle.storageOk ? '브라우저에 저장됨' : '저장소를 사용할 수 없어 이번 세션에만 기록됩니다'}">최고 기록 ${battle.bestStage}스테이지${battle.storageOk ? '' : ' (세션)'}</span>`);
  $('#stageInfo').innerHTML = parts.join('');
}

function renderUnits() {
  const s = battle.state;
  const playerPos = layoutUnits(s.players, 'player');
  const enemyPos = layoutUnits(s.enemies, 'enemy');
  const cmds = sortedCommands();
  const roles = battle.commandRoles();
  const threats = Object.fromEntries(battle.previewThreats().map((t) => [t.uid, t]));
  const pending = ui.pending;
  const html = [];

  for (const p of s.players) {
    const def = playerDef(p.id);
    const pos = playerPos[p.id];
    const cmdIndex = cmds.findIndex((c) => c.actorId === p.id);
    const chip = cmdIndex >= 0
      ? `<div class="target-chips"><span class="order-chip ${roles[p.id]}">${NUMS[cmdIndex]} ${roles[p.id] === 'clash' ? '경합' : '일방'}</span></div>` : '';
    html.push(`
      <div class="unit player ${p.alive ? '' : 'dead'}" data-unit="${p.id}" style="--x:${pos.x}%;--b:${pos.b}%;--z:${pos.z};--s:${pos.s}">
        ${chip}
        <div class="sprite-wrap"><img class="sprite ${SPRITE_FLIP[def.sprite] ? 'flip' : ''}" src="${def.sprite}" alt="${esc(p.name)}"></div>
        <div class="plate">
          <div class="pname"><span>${esc(p.name)}</span><small>${POSITIONS[p.position].label}</small></div>
          <div class="bar hp player" data-bar="hp:${p.id}"><i style="--pct:${pct(p.hp, p.maxHp)}"></i></div>
          <div class="bar-label"><span>HP</span><span data-num="hp:${p.id}">${p.hp}/${p.maxHp}</span></div>
          <div class="statuses" data-statuses="${p.id}">${statusChips(p)}</div>
        </div>
      </div>`);
  }

  for (const e of s.enemies) {
    const t = ENEMIES[e.templateId];
    const pos = enemyPos[e.uid];
    const targeting = cmds.filter((c) => c.targetId === e.uid);
    const chips = targeting.map((c) => {
      const role = roles[c.actorId];
      return `<span class="order-chip ${role}" title="${role === 'clash' ? '경합 담당' : '일방 공격'}">${NUMS[cmds.indexOf(c)]} ${esc(unitName(c.actorId).slice(1))}${role === 'clash' ? ' 경합' : ''}</span>`;
    }).join('');
    const targetable = pending && e.alive;
    let matchupTag = '';
    if (targetable) {
      const prev = battle.previewCommand(pending.playerId, pending.slotIndex, e.uid);
      matchupTag = `<div class="matchup-tag" style="--mc:${MATCHUP_COLORS[prev.matchup.level]}">${prev.matchup.icon} ${prev.matchup.label} · 예상 ${prev.damage}</div>`;
    }
    const action = battle.enemyAction(e);
    let intent;
    if (e.boss) {
      const inTurns = nextBossActionIn();
      intent = action.special
        ? `<div class="intent special">⚠ 전용 행동 <b>${esc(action.name)}</b> · ${esc(action.text)}</div>`
        : `<div class="intent">행동 <b>${esc(action.name)}</b> · 전용 행동 ${inTurns}턴 후 (${esc(t.bossAction.name)})</div>`;
    } else {
      intent = `<div class="intent">행동 <b>${esc(action.name)}</b> · ${esc(action.text)}</div>`;
    }
    const threat = threats[e.uid];
    const threatTag = e.alive && threat && !threat.engaged && s.phase === PHASES.PLAYER_COMMANDS
      ? `<span class="threat-tag" title="아무도 선택하지 않으면 비경합 공격">비경합 위협 ${threat.unopposedDamage}</span>` : '';
    html.push(`
      <div class="unit enemy ${e.boss ? 'boss' : ''} ${e.alive ? '' : 'dead'} ${targetable ? 'targetable' : ''}" data-unit="${e.uid}"
        style="--x:${pos.x}%;--b:${pos.b}%;--z:${pos.z};--s:${pos.s}" ${targetable ? `role="button" tabindex="0" aria-label="${esc(e.name)} 선택"` : ''}>
        <div class="target-chips">${chips}</div>
        ${matchupTag}
        <div class="sprite-wrap"><img class="sprite ${SPRITE_FLIP[t.sprite] ? 'flip' : ''}" src="${t.sprite}" alt="${esc(e.name)}"></div>
        <div class="plate">
          <div class="pname"><span>${esc(e.name)}</span></div>
          <div class="pmeta">${emotionBadge(e.emotion)}<small>경합 ${e.clashPower} · 정신 ${e.mental}</small></div>
          <div class="bar hp" data-bar="hp:${e.uid}"><i style="--pct:${pct(e.hp, e.maxHp)}"></i></div>
          <div class="bar-label"><span>HP</span><span data-num="hp:${e.uid}">${e.hp}/${e.maxHp}</span></div>
          <div class="statuses" data-statuses="${e.uid}">${statusChips(e)}</div>
          ${intent}${threatTag}
        </div>
      </div>`);
  }
  $('#units').innerHTML = html.join('');
}

function skillButton(p, option, { chosen, active, interactive }) {
  const skill = option.skill;
  const attr = PLAYER_ATTRIBUTES[skill.attribute];
  const heal = skill.effects.some((e) => e.type === 'heal');
  let healPreview = '';
  if (heal && interactive) {
    const preview = battle.previewHeal(skill.id).filter((h) => h.hp > 0 || h.mental > 0);
    healPreview = preview.length
      ? `<span class="skill-effect">예상 회복: ${preview.map((h) => `${esc(h.name)} +${h.hp}${h.mental ? `/정신 +${h.mental}` : ''}`).join(', ')}</span>`
      : '<span class="skill-effect">예상 회복: 없음 (공명 없음)</span>';
  }
  const tags = [
    skill.fusionOnly ? '<span class="tag fusion">강신합일 · 확정 승리</span>' : '',
    heal && !skill.fusionOnly ? `<span class="tag heal">적중 회복 · 공명 +${skill.resonance}</span>` : '',
  ].join('');
  return `
    <button type="button" class="skill-btn ${skill.fusionOnly ? 'fusion' : ''} ${active ? 'active' : ''} ${chosen ? 'chosen' : ''}"
      style="--c:${attr.color}" data-skill="${p.id}:${option.slotIndex}" ${option.disabled || !interactive ? 'disabled' : ''}
      aria-pressed="${active}" title="${esc(option.reason ?? skill.effectText)}">
      <span class="skill-top"><span class="skill-name">${esc(skill.name)}</span><span class="tier">${skill.fusionOnly ? '강신' : `${skill.tier}스`}</span></span>
      <span class="skill-stats">${attrBadge(skill.attribute)} 경합 ${skill.clashPower} · 피해 ${skill.damage}</span>
      <span class="skill-effect">${tags}${esc(skill.effectText)}${option.disabled ? ` · ${esc(option.reason)}` : ''}</span>
      ${healPreview}
    </button>`;
}

// Target list inside the selecting card: works for touch, keyboard and crowded narrow screens.
function targetPicker(playerId) {
  const cmds = sortedCommands();
  const buttons = battle.aliveEnemies().map((e) => {
    const prev = battle.previewCommand(playerId, ui.pending.slotIndex, e.uid);
    const others = cmds.filter((c) => c.targetId === e.uid && c.actorId !== playerId);
    const note = others.length
      ? `${others.map((c) => esc(unitName(c.actorId))).join('·')} 지정 → 이번 선택이 경합 담당, 앞선 지정은 일방 공격`
      : '경합 상대';
    return `<button type="button" class="target-btn" data-target="${e.uid}" style="--mc:${MATCHUP_COLORS[prev.matchup.level]}">
      <span class="tb-name">${esc(e.name)} ${emotionBadge(e.emotion)}</span>
      <span class="tb-stats"><b>${prev.matchup.icon} ${prev.matchup.label}</b> · 예상 ${prev.damage} · HP ${e.hp}/${e.maxHp}</span>
      <span class="tb-note">${note}</span>
    </button>`;
  }).join('');
  return `<div class="target-picker" role="group" aria-label="대상 적 선택"><div class="tp-title">대상 선택 <small>(전장에서 적을 눌러도 됩니다 · Esc 취소)</small></div>${buttons}</div>`;
}

function renderParty() {
  const s = battle.state;
  const roles = battle.commandRoles();
  const interactive = s.phase === PHASES.PLAYER_COMMANDS && !ui.playing;
  const html = s.players.map((p) => {
    const def = playerDef(p.id);
    const cmd = battle.commandFor(p.id);
    const canFuse = interactive && battle.canFuse(p.id);
    const options = battle.slotOptions(p.id);
    const skills = p.alive
      ? options.map((o) => skillButton(p, o, {
        chosen: cmd?.slotIndex === o.slotIndex,
        active: ui.pending?.playerId === p.id && ui.pending.slotIndex === o.slotIndex,
        interactive,
      })).join('')
      : '<p class="skill-effect">쓰러짐 — 보스 스테이지를 정화하면 HP 30%로 부활합니다.</p>';
    const cmdLine = cmd
      ? `→ ${esc(unitName(cmd.targetId))} <span class="role ${roles[p.id]}">${roles[p.id] === 'clash' ? '경합 담당' : '일방 공격'}</span>
         ${interactive ? `<button type="button" class="link-btn" data-clear="${p.id}">취소</button>` : ''}`
      : p.alive ? '<span>명령 대기</span>' : '';
    const rerollChance = p.statuses.agitation ? '정신 동요: 추가 굴림 불가' : `추가 굴림 ${p.mental}%`;
    return `
      <article class="pcard ${p.alive ? '' : 'dead'} ${cmd ? 'has-command' : ''} ${ui.pending?.playerId === p.id ? 'selecting' : ''}" data-card="${p.id}">
        <div class="pcard-head">
          <button type="button" class="portrait ${canFuse ? 'ready' : ''}" data-portrait="${p.id}" style="--hold:${TUNING.fusionHoldMs}ms"
            aria-label="${esc(p.name)} 프로필${canFuse ? ' — 신명 100: 길게 눌러 강신합일' : ''}">
            <img src="${def.sprite}" alt="">
            <svg class="hold-ring" viewBox="0 0 68 68" aria-hidden="true"><circle cx="34" cy="34" r="32"></circle></svg>
          </button>
          <div class="pcard-title">
            <strong>${esc(p.name)}</strong>
            <small>${POSITIONS[p.position].label} · ${esc(def.jobLabel)} (${esc(def.role)})</small>
            <small>수호령 ${esc(def.guardian)}</small>
          </div>
        </div>
        <div class="meters">
          <div class="bar hp player" data-bar="hp:${p.id}"><i style="--pct:${pct(p.hp, p.maxHp)}"></i></div>
          <div class="bar-label"><span>HP</span><span data-num="hp:${p.id}">${p.hp}/${p.maxHp}</span></div>
          <div class="bar mental" data-bar="mental:${p.id}"><i style="--pct:${p.mental}%"></i></div>
          <div class="bar-label"><span>정신력 <span data-num="mental:${p.id}">${p.mental}</span></span><span>${rerollChance}</span></div>
          <div class="bar shin ${p.shinmyeong >= 100 ? 'full' : ''}" data-bar="shin:${p.id}"><i style="--pct:${p.shinmyeong}%"></i></div>
          <div class="bar-label"><span>신명 <span data-num="shin:${p.id}">${p.shinmyeong}</span>/100</span><span>${p.pendingFusion ? '강신합일 대기' : ''}</span></div>
        </div>
        <div class="statuses" data-statuses="${p.id}">${statusChips(p)}</div>
        ${canFuse ? `<div class="fusion-cta"><span>신명 충만 · 프로필을 길게 눌러 강신합일</span><button type="button" data-fuse="${p.id}">강신합일</button></div>` : ''}
        <div class="skills">${skills}</div>
        ${ui.pending?.playerId === p.id && interactive ? targetPicker(p.id) : ''}
        <div class="cmd-line">${cmdLine}</div>
      </article>`;
  });
  $('#partyCommands').innerHTML = html.join('');
}

function renderPanel() {
  const s = battle.state;
  const cmds = sortedCommands();
  const roles = battle.commandRoles();
  $('#commandLog').innerHTML = cmds.length
    ? cmds.map((c, i) => {
      const skill = SKILLS[c.skillId];
      return `<li><span class="num">${i + 1}</span><span>${esc(unitName(c.actorId))} · ${esc(skill.name)} → ${esc(unitName(c.targetId))}
        <span class="role ${roles[c.actorId]}">${roles[c.actorId] === 'clash' ? '경합 담당' : '일방 공격'}</span></span></li>`;
    }).join('')
    : '<li class="empty-row">아직 명령이 없습니다. 스킬을 고른 뒤 적을 선택하세요.</li>';

  const threats = battle.previewThreats().filter((t) => !t.engaged);
  const aggro = battle.aggroPreview().map((a) => `${esc(unitName(a.id))} ${Math.round(a.chance * 100)}%`).join(' · ');
  $('#threats').innerHTML = s.phase === PHASES.PLAYER_COMMANDS && threats.length
    ? `<h3>⚠ 비경합 위협 (선택하지 않은 적)</h3>
       ${threats.map((t) => {
    const e = battle.enemy(t.uid);
    return `<div class="threat-row"><b>${esc(e.name)}</b> — ${esc(t.action.name)}: 예상 ${t.unopposedDamage} 피해 (×${t.multiplier.toFixed(2)})${t.action.effects.length ? ` + ${esc(t.action.text)}` : ''}, 정신력 -10</div>`;
  }).join('')}
       <div class="aggro-row">대상 확률: ${aggro}</div>`
    : '';

  const confirm = $('#confirmBtn');
  confirm.disabled = ui.playing || !battle.canConfirm();
  $('#skipBtn').hidden = !ui.playing;
  setHint();
}

function setHint(text) {
  if (text !== undefined) { $('#hint').textContent = text; return; }
  const s = battle.state;
  let hint = '';
  if (ui.playing) hint = '해결 중… (연출 건너뛰기 가능)';
  else if (s.phase === PHASES.PLAYER_COMMANDS) {
    if (ui.pending) {
      const p = battle.player(ui.pending.playerId);
      hint = `${p.name} · ${SKILLS[p.exposed[ui.pending.slotIndex]].name}: 대상 적을 선택하세요 (Esc 취소)`;
    } else {
      const missing = battle.alivePlayers().filter((p) => !battle.commandFor(p.id)).map((p) => p.name);
      hint = missing.length ? `명령 대기: ${missing.join(', ')}` : '모든 명령 완료 — 턴을 확정하세요.';
    }
  }
  $('#hint').textContent = hint;
}

// ------------------------------------------------------------------ input
function selectSkill(playerId, slotIndex) {
  if (ui.playing || battle.state.phase !== PHASES.PLAYER_COMMANDS) return;
  sound.play('select');
  if (ui.pending && ui.pending.playerId === playerId && ui.pending.slotIndex === slotIndex) ui.pending = null;
  else ui.pending = { playerId, slotIndex };
  render();
  if (ui.pending) $('.target-picker .target-btn')?.focus({ preventScroll: true });
}

function selectTarget(enemyUid) {
  if (!ui.pending) return;
  const res = battle.setCommand(ui.pending.playerId, ui.pending.slotIndex, enemyUid);
  if (!res.ok) { setHint(res.reason); return; }
  sound.play('select');
  ui.pending = null;
  render();
}

function bindInput() {
  document.addEventListener('pointerdown', () => sound.init(), { capture: true });
  document.addEventListener('keydown', (e) => {
    sound.init();
    if (e.key === 'Escape') {
      if (!$('#modalLayer').hidden && $('#modalLayer').dataset.dismissable === 'true') closeModal();
      else if (ui.pending) { ui.pending = null; render(); }
    }
  }, { capture: true });

  $('#partyCommands').addEventListener('click', (e) => {
    const skillBtn = e.target.closest('[data-skill]');
    if (skillBtn) {
      const [pid, slot] = skillBtn.dataset.skill.split(':');
      selectSkill(pid, Number(slot));
      return;
    }
    const clear = e.target.closest('[data-clear]');
    if (clear) { battle.clearCommand(clear.dataset.clear); render(); return; }
    const fuse = e.target.closest('[data-fuse]');
    if (fuse) { openFusionChooser(fuse.dataset.fuse); return; }
    const target = e.target.closest('[data-target]');
    if (target) selectTarget(target.dataset.target);
  });

  // Long-press on the profile (0.8 s) opens the fusion slot chooser.
  const partyEl = $('#partyCommands');
  partyEl.addEventListener('pointerdown', (e) => {
    const portrait = e.target.closest('[data-portrait]');
    if (!portrait || ui.playing) return;
    const pid = portrait.dataset.portrait;
    if (!battle.canFuse(pid)) return;
    e.preventDefault();
    portrait.classList.add('holding');
    ui.hold = { pid, portrait, timer: setTimeout(() => { cancelHold(); openFusionChooser(pid); }, TUNING.fusionHoldMs) };
  });
  const cancelHold = () => {
    if (!ui.hold) return;
    clearTimeout(ui.hold.timer);
    ui.hold.portrait.classList.remove('holding');
    ui.hold = null;
  };
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((type) => partyEl.addEventListener(type, cancelHold));
  partyEl.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-portrait]')) e.preventDefault(); });
  partyEl.addEventListener('click', (e) => {
    const portrait = e.target.closest('[data-portrait]');
    if (portrait && e.detail === 0 && battle.canFuse(portrait.dataset.portrait)) openFusionChooser(portrait.dataset.portrait); // keyboard Enter/Space
  });

  $('#units').addEventListener('click', (e) => {
    const unit = e.target.closest('.unit.enemy.targetable');
    if (unit) selectTarget(unit.dataset.unit);
  });
  $('#units').addEventListener('keydown', (e) => {
    const unit = e.target.closest('.unit.enemy.targetable');
    if (unit && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectTarget(unit.dataset.unit); }
  });

  $('#confirmBtn').addEventListener('click', confirmTurn);
  $('#skipBtn').addEventListener('click', () => { ui.skip = true; });
  $('#helpBtn').addEventListener('click', openHelp);
  $('#muteBtn').addEventListener('click', () => {
    sound.muted = !sound.muted;
    sound.init();
    updateTopButtons();
    savePrefs();
  });
  $('#speedBtn').addEventListener('click', () => {
    ui.speed = ui.speed === 1 ? 2 : ui.speed === 2 ? 4 : 1;
    updateTopButtons();
    savePrefs();
  });
}

function updateTopButtons() {
  $('#muteBtn').textContent = sound.muted ? '소리 끔' : '소리 켬';
  $('#muteBtn').setAttribute('aria-pressed', String(sound.muted));
  $('#speedBtn').textContent = `연출 ×${ui.speed}`;
  document.documentElement.style.setProperty('--speed', String(ui.speed));
}

async function confirmTurn() {
  if (ui.playing || !battle.canConfirm()) return;
  ui.pending = null;
  const events = battle.resolveTurn();
  await playEvents(events);
}

// ------------------------------------------------------------------ fusion chooser
function openFusionChooser(playerId) {
  if (!battle.canFuse(playerId)) return;
  const p = battle.player(playerId);
  const def = playerDef(playerId);
  const fusion = SKILLS[def.fusionSkill];
  let choice = null;
  const options = battle.slotOptions(playerId);
  openModal(`
    <h2>강신합일 · ${esc(def.guardian)}</h2>
    <p>${esc(p.name)}의 신명이 가득 찼습니다. 공개된 스킬 한 칸을 <b>${esc(fusion.name)}</b>(으)로 교체합니다.
      강신합일 스킬은 사용할 때까지 그 칸에 남고, 다른 칸만 매 턴 새로 뽑힙니다.</p>
    <p>${attrBadge(fusion.attribute)} 경합 확정 승리 · 피해 ${fusion.damage} · ${esc(fusion.effectText)}</p>
    <h3>교체할 칸 선택</h3>
    <div class="slot-choices">
      ${options.map((o) => `<button type="button" class="skill-btn" style="--c:${PLAYER_ATTRIBUTES[o.skill.attribute].color}" data-slot="${o.slotIndex}" aria-pressed="false">
        <span class="skill-top"><span class="skill-name">${o.slotIndex + 1}번 칸 · ${esc(o.skill.name)}</span><span class="tier">${o.skill.tier}스</span></span>
        <span class="skill-stats">${attrBadge(o.skill.attribute)} 경합 ${o.skill.clashPower} · 피해 ${o.skill.damage}</span>
      </button>`).join('')}
    </div>
    <div class="actions">
      <button type="button" class="ghost-btn" data-close>취소</button>
      <button type="button" class="primary-btn" data-confirm disabled>강신합일 확정</button>
    </div>`, { dismissable: true });
  const layer = $('#modalLayer');
  layer.querySelectorAll('[data-slot]').forEach((btn) => btn.addEventListener('click', () => {
    choice = Number(btn.dataset.slot);
    layer.querySelectorAll('[data-slot]').forEach((b) => { b.classList.toggle('active', b === btn); b.setAttribute('aria-pressed', String(b === btn)); });
    layer.querySelector('[data-confirm]').disabled = false;
  }));
  layer.querySelector('[data-close]').addEventListener('click', closeModal);
  layer.querySelector('[data-confirm]').addEventListener('click', async () => {
    const res = battle.equipFusion(playerId, choice);
    closeModal();
    if (!res.ok) { setHint(res.reason); return; }
    if (ui.pending?.playerId === playerId) ui.pending = null;
    await playEvents([res.event], { keepPhase: true });
  });
  layer.querySelector('[data-slot]')?.focus();
}

// ------------------------------------------------------------------ modals
function openModal(html, { dismissable = false } = {}) {
  const layer = $('#modalLayer');
  layer.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  layer.dataset.dismissable = String(dismissable);
  layer.hidden = false;
  layer.onclick = (e) => { if (dismissable && e.target === layer) closeModal(); };
}
function closeModal() {
  const layer = $('#modalLayer');
  layer.hidden = true;
  layer.innerHTML = '';
}

function openHelp() {
  const emotions = Object.values(ENEMY_EMOTIONS);
  const rows = Object.values(PLAYER_ATTRIBUTES).map((a) => `<tr><th style="color:${a.color}">${a.icon} ${a.label}</th>${emotions.map((e) => {
    const m = MATCHUP_LEVELS[MATCHUP_TABLE[a.id][e.id]];
    return `<td style="color:${MATCHUP_COLORS[m.id]}">${m.icon} ${m.label}<br><small>×${m.damage} / 경합 ×${m.clash.toFixed(2)}</small></td>`;
  }).join('')}</tr>`).join('');
  openModal(`
    <h2>굿판의 규칙</h2>
    <p>이승과 저승의 경계가 벌어졌습니다. 네 무당이 끝없이 몰려오는 감정의 망령을 잠재우세요. 5스테이지마다 보스가 나타납니다.</p>
    <h3>한 턴의 흐름</h3>
    <ul>
      <li>무당마다 공개된 스킬 2개 중 하나를 고르고 <b>적을 선택</b>하면 명령이 됩니다. (1스+2스 65% · 1스+3스 25% · 2스+3스 10%)</li>
      <li>같은 적을 여럿이 고르면 <b>마지막으로 고른 무당만 경합</b>하고, 앞선 무당은 <b>일방 공격</b>합니다.</li>
      <li>경합은 윷(도1·개2·걸3·윷4·모5) 선 3승제입니다. 경합값 = (경합위력 + 윷값) × 경합 상성. 동률은 다시 던집니다.</li>
      <li>정신력은 추가 윷 굴림 확률입니다. 추가로 굴리면 높은 값을 씁니다.</li>
      <li>아무도 고르지 않은 적은 <b>비경합 공격</b>(×1.25, 보스 ×1.50)을 하며 디버프를 반드시 겁니다. 전열 50 · 중열 35 · 후열 15 가중치로 대상을 고릅니다.</li>
      <li>경합 승리: 정신력 +3, 신명 +20, 직업 효과. 패배: 정신력 -8, 신명 +8, 흐트러짐. 일방 공격 적중: 신명 +5.</li>
      <li>윤초희의 스킬도 적을 공격하며, 적중하면 아군을 회복하고 실제 회복 시 <b>살풀이 공명</b>으로 신명을 얻습니다.</li>
      <li>신명 100이면 프로필을 <b>길게 눌러</b>(또는 강신합일 버튼) 스킬 한 칸을 강신합일 스킬로 바꿉니다. 경합에서 반드시 승리합니다.</li>
      <li>스테이지를 정화하면 생존자는 HP·정신력이 가득 찹니다. 보스 정화 시 쓰러진 무당이 HP 30%로 부활합니다.</li>
    </ul>
    <h3>상성표 (스킬 속성 → 적 감정)</h3>
    <table class="matchup-table"><thead><tr><th></th>${emotions.map((e) => `<th style="color:${e.color}">${e.icon} ${e.label}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
    <h3>직업 효과 (최종 경합 승리 시)</h3>
    <ul>${PARTY.map((p) => `<li>${esc(p.name)} (${esc(p.jobLabel)}): ${esc(JOB_EFFECTS[p.job].label)}</li>`).join('')}</ul>
    <div class="actions"><button type="button" class="primary-btn" data-close>닫기</button></div>`, { dismissable: true });
  $('#modalLayer [data-close]').addEventListener('click', closeModal);
}

function showStageClear(ev) {
  const wasBoss = ev.stageType === 'boss';
  const dead = battle.state.players.filter((p) => !p.alive).map((p) => p.name);
  openModal(`
    <h2>${ev.stage}스테이지 정화</h2>
    <p>${wasBoss ? '보스의 감정이 잠들었습니다.' : '망령들이 잠잠해졌습니다.'} 다음 굿판으로 나아갑니다.</p>
    <ul>
      <li>생존한 무당의 HP와 정신력이 가득 찹니다.</li>
      ${wasBoss && dead.length ? `<li class="record">부활: ${esc(dead.join(', '))} (HP 30%, 정신력 50)</li>` : ''}
      ${!wasBoss && dead.length ? `<li>쓰러진 무당(${esc(dead.join(', '))})은 다음 보스를 정화해야 부활합니다.</li>` : ''}
      <li>액막이·디버프 등 전투 상태는 사라지고, 대기 중인 강신합일 칸은 유지됩니다.</li>
    </ul>
    <div class="stat-grid">
      <div class="stat"><b>${ev.reached}</b><span>다음 스테이지</span></div>
      <div class="stat"><b>${ev.best}</b><span>최고 기록${ev.saved ? '' : ' (세션)'}</span></div>
      <div class="stat"><b>${battle.state.stats.kills}</b><span>정화한 망령</span></div>
    </div>
    <div class="actions"><button type="button" class="primary-btn" data-next>다음 스테이지</button></div>`);
  const btn = $('#modalLayer [data-next]');
  btn.focus();
  btn.addEventListener('click', async () => {
    closeModal();
    const events = battle.advanceStage();
    await playEvents(events);
  });
}

function showRunOver(ev) {
  const st = ev.stats;
  openModal(`
    <h2>굿판이 끝났다</h2>
    <p>네 무당이 모두 쓰러졌습니다. ${ev.newRecord ? '<span class="record">새 최고 기록!</span>' : ''}</p>
    <div class="stat-grid">
      <div class="stat"><b>${ev.stage}</b><span>이번 도달 스테이지</span></div>
      <div class="stat"><b>${ev.best}</b><span>최고 기록${ev.saved ? '' : ' (세션)'}</span></div>
      <div class="stat"><b>${st.turns}</b><span>진행한 턴</span></div>
      <div class="stat"><b>${st.clashWins}/${st.clashWins + st.clashLosses}</b><span>경합 승리</span></div>
      <div class="stat"><b>${st.fusions}</b><span>강신합일</span></div>
      <div class="stat"><b>${st.kills}</b><span>정화한 망령</span></div>
    </div>
    <div class="actions"><button type="button" class="primary-btn" data-restart>1스테이지부터 다시</button></div>`);
  const btn = $('#modalLayer [data-restart]');
  btn.focus();
  btn.addEventListener('click', async () => {
    closeModal();
    const events = newBattle();
    render();
    await playEvents(events);
  });
}

// ------------------------------------------------------------------ playback
const wait = (ms) => (ui.skip ? Promise.resolve() : new Promise((r) => setTimeout(r, ms / ui.speed)));
const unitEl = (id) => $(`.unit[data-unit="${CSS.escape(id)}"]`);

function retrigger(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 1200 / ui.speed);
}
function floatText(id, text, cls = '') {
  const el = unitEl(id);
  if (!el || ui.skip) return;
  const span = document.createElement('span');
  span.className = `float-num ${cls}`;
  span.textContent = text;
  el.querySelector('.sprite-wrap').appendChild(span);
  setTimeout(() => span.remove(), 1300 / ui.speed);
}
function setBar(kind, id, value, max) {
  $$(`[data-bar="${kind}:${id}"] > i`).forEach((i) => i.style.setProperty('--pct', pct(value, max)));
  $$(`[data-num="${kind}:${id}"]`).forEach((n) => { n.textContent = kind === 'hp' ? `${value}/${max}` : String(value); });
  if (kind === 'shin') $$(`[data-bar="shin:${id}"]`).forEach((b) => b.classList.toggle('full', value >= 100));
}
let bannerTimer = null;
function banner(text, tone = '') {
  const el = $('#banner');
  el.className = `banner show ${tone}`;
  el.textContent = text;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.remove('show'), 1400 / ui.speed);
}
function shakeField(big = false) {
  if (reducedMotion || ui.skip) return;
  retrigger($('#field'), big ? 'big-shake' : 'shake');
}

// Clash overlay -----------------------------------------------------
function yutSticks(value) {
  // 도~윷: that many flat sides up; 모: all four round sides up.
  const up = value === 5 ? 0 : value;
  return Array.from({ length: 4 }, (_, i) => `<span class="stick ${i < up ? 'up' : ''}"></span>`).join('');
}
function yutBoard(roll, label) {
  if (!roll) return `<div class="sticks">${yutSticks(0)}</div><div class="yut-label"><small>${label}</small>–</div>`;
  const rerollText = roll.rerolled ? `추가 굴림 ${YUT_NAMES[roll.first]}·${YUT_NAMES[roll.second]} → 높은 값` : '추가 굴림 없음';
  return `<div class="sticks">${yutSticks(roll.value)}</div>
    <div class="yut-label">${YUT_NAMES[roll.value]} (${roll.value})<small>${label} · ${rerollText}</small></div>`;
}
function openClash(ev) {
  const p = battle.player(ev.actorId);
  const e = battle.enemy(ev.enemyId);
  const def = playerDef(p.id);
  const t = ENEMIES[e.templateId];
  const skill = SKILLS[ev.skillId];
  const card = $('#clashOverlay .clash-card');
  card.classList.toggle('fusion', ev.fusion);
  const playerNotes = [ev.playerPenalty ? `흐트러짐 -${ev.playerPenalty}` : '', ev.noReroll ? '정신 동요: 추가 굴림 불가' : ''].filter(Boolean).join(' · ');
  const enemyNotes = [ev.sealed ? '봉인: 경합위력 -2, 피해 ×0.5' : '', ev.enemyPenalty ? `흐트러짐 -${ev.enemyPenalty}` : '', ev.special ? '전용 행동' : ''].filter(Boolean).join(' · ');
  $('#clashPlayer').className = 'clash-side player';
  $('#clashEnemy').className = 'clash-side enemy';
  $('#clashPlayer').innerHTML = `<img class="${SPRITE_FLIP[def.sprite] ? 'flip' : ''}" src="${def.sprite}" alt=""><div class="cname">${esc(p.name)}</div>
    <div class="cskill">${attrBadge(skill.attribute)} ${esc(skill.name)} · 경합위력 ${ev.playerPower}</div><div class="cnotes">${esc(playerNotes)}</div>`;
  $('#clashEnemy').innerHTML = `<img class="${SPRITE_FLIP[t.sprite] ? 'flip' : ''}" src="${t.sprite}" alt=""><div class="cname">${esc(e.name)}</div>
    <div class="cskill">${emotionBadge(e.emotion)} ${esc(ev.actionName)} · 경합위력 ${ev.enemyPower}</div><div class="cnotes">${esc(enemyNotes)}</div>`;
  const m = $('#clashMatchup');
  m.style.setProperty('--mc', MATCHUP_COLORS[ev.matchup]);
  m.textContent = ev.fusion
    ? `강신합일 — 경합 확정 승리 · 피해 상성 ${ev.matchupLabel} ×${ev.damageMultiplier}`
    : `${ev.matchupLabel} · 경합 ×${ev.clashMultiplier.toFixed(2)} · 피해 ×${ev.damageMultiplier}`;
  const pips = '<span class="pip"></span>'.repeat(TUNING.clashWinsNeeded);
  $('#pipsPlayer').innerHTML = pips;
  $('#pipsEnemy').innerHTML = pips;
  $('#yutPlayer').innerHTML = yutBoard(null, '무당');
  $('#yutEnemy').innerHTML = yutBoard(null, '망령');
  $('#cvPlayer').textContent = '–';
  $('#cvEnemy').textContent = '–';
  $('#clashMessage').textContent = ev.fusion ? '' : '윷을 던진다!';
  $('#clashOverlay').hidden = false;
}
function closeClash() { $('#clashOverlay').hidden = true; }

async function showFusion(actorId, skillId, phase) {
  const def = playerDef(actorId);
  const skill = SKILLS[skillId];
  const overlay = $('#fusionOverlay');
  overlay.innerHTML = `<div class="fusion-inner">
    <div class="fusion-ring"></div>
    <img src="${def.guardianSprite}" alt="${esc(def.guardian)}">
    <div class="fusion-title">${esc(skill.name)}</div>
    <div class="fusion-sub">${esc(def.name)} × ${esc(def.guardian)} — ${phase === 'equip' ? '강신합일' : '수호령 강림'}</div>
  </div>`;
  overlay.hidden = false;
  sound.play('fusion');
  const cx = innerWidth / 2; const cy = innerHeight / 2;
  fx.burst(cx, cy, { color: '#f3d58c', count: 50, speed: 7, life: 70 });
  fx.burst(cx, cy, { color: '#2a2440', count: 26, speed: 4, life: 90, kind: 'ink', size: 7 });
  await wait(phase === 'equip' ? 1500 : 1300);
  overlay.hidden = true;
}

const handlers = {
  async 'stage-start'(ev) {
    sound.play('gong');
    banner(ev.stageType === 'boss' ? `STAGE ${ev.stage} · 보스 강림!` : `STAGE ${ev.stage}`, ev.stageType === 'boss' ? 'danger' : 'gold');
    await wait(1000);
  },
  async 'turn-start'(ev) {
    if (ev.bossAction) { banner('⚠ 보스 전용 행동 예고', 'danger'); await wait(800); }
  },
  async 'command-canceled'(ev) {
    if (['duplicate', 'skill-not-exposed', 'missing-actor'].includes(ev.reason)) return;
    banner(`${unitName(ev.actorId)}: 명령 취소 (${CANCEL_REASONS[ev.reason] ?? ev.reason})`);
    await wait(650);
  },
  async 'clash-start'(ev) { openClash(ev); sound.play('select'); await wait(ev.fusion ? 250 : 550); },
  async 'guardian-fusion'(ev) {
    const wasOpen = !$('#clashOverlay').hidden;
    if (wasOpen) $('#clashOverlay').hidden = true;
    await showFusion(ev.actorId, ev.skillId, ev.phase);
    if (wasOpen) $('#clashOverlay').hidden = false;
  },
  async 'yut-roll'(ev) {
    $('#yutPlayer').innerHTML = yutBoard(ev.player, '무당');
    $('#yutEnemy').innerHTML = yutBoard(ev.enemy, '망령');
    $$('#clashOverlay .sticks').forEach((s) => retrigger(s, 'tossing'));
    $('#clashMessage').textContent = `${ev.round}라운드`;
    $('#cvPlayer').textContent = '…'; $('#cvEnemy').textContent = '…';
    sound.play('yut');
    await wait(480);
  },
  async 'clash-value'(ev) {
    $('#cvPlayer').textContent = ev.playerValue.toFixed(1);
    $('#cvEnemy').textContent = ev.enemyValue.toFixed(1);
    $('#cvPlayer').classList.toggle('lead', ev.result === 'player');
    $('#cvEnemy').classList.toggle('lead', ev.result === 'enemy');
    await wait(380);
  },
  async 'clash-tie'() { $('#clashMessage').textContent = '동률! 다시 던진다'; sound.play('tie'); await wait(600); },
  async 'clash-round-win'(ev) {
    const pips = (sel, n) => $$(`${sel} .pip`).forEach((p, i) => p.classList.toggle('on', i < n));
    pips('#pipsPlayer', ev.playerWins); pips('#pipsEnemy', ev.enemyWins);
    $('#clashMessage').textContent = ev.fusion ? `강신합일 — ${ev.playerWins}승 확정` : ev.winner === 'player' ? '무당 1승' : '망령 1승';
    sound.play('clash');
    sound.play(ev.winner === 'player' ? 'roundWin' : 'roundLose');
    fx.burstAt($('#clashOverlay .clash-center'), { color: ev.winner === 'player' ? '#bff0d3' : '#ffb4a3', count: 14, speed: 5, life: 30 });
    await wait(ev.fusion ? 300 : 520);
  },
  async 'clash-final-win'(ev) {
    const playerWon = ev.winner === 'player';
    $('#clashPlayer').classList.add(playerWon ? 'win' : 'lose');
    $('#clashEnemy').classList.add(playerWon ? 'lose' : 'win');
    $('#clashMessage').textContent = playerWon ? `경합 승리 ${ev.playerWins}:${ev.enemyWins} — 적 공격 취소` : `경합 패배 ${ev.playerWins}:${ev.enemyWins} — 공격 취소`;
    await wait(800);
    closeClash();
  },
  async stagger(ev) {
    retrigger(unitEl(ev.unitId), 'stagger');
    floatText(ev.unitId, '흐트러짐', 'status');
    sound.play('stagger');
    await wait(260);
  },
  async 'clash-hit'(ev) { await playerHit(ev, false); },
  async 'direct-hit'(ev) { await playerHit(ev, true); },
  async 'enemy-clash-hit'(ev) { await enemyHit(ev); },
  async 'enemy-unopposed-start'(ev) {
    banner(`${unitName(ev.enemyId)}의 비경합 공격${ev.special ? ' (전용 행동)' : ''} → ${unitName(ev.targetId)} ×${ev.multiplier.toFixed(2)}`, 'danger');
    retrigger(unitEl(ev.enemyId), 'acting');
    sound.play('whoosh');
    await wait(600);
  },
  async 'enemy-unopposed-hit'(ev) { await enemyHit(ev); },
  async 'aekmagi-redirect'(ev) {
    banner(`액막이! ${unitName(ev.guardId)}이(가) ${unitName(ev.originalTargetId)} 대신 받는다`, 'gold');
    floatText(ev.guardId, '액막이', 'status');
    fx.burstAt(unitEl(ev.guardId), { color: '#3fb8a9', count: 20, speed: 4, life: 40 });
    await wait(650);
  },
  async 'healing-effect'(ev) {
    retrigger(unitEl(ev.unitId), 'healed');
    if (ev.hp) floatText(ev.unitId, `+${ev.hp}${ev.reduced ? ' (치유 감소)' : ''}`, 'heal');
    if (ev.hpAfter !== undefined) setBar('hp', ev.unitId, ev.hpAfter, ev.maxHp);
    fx.burstAt(unitEl(ev.unitId), { color: '#c9a7f2', count: 12, speed: 2, life: 50, kind: 'petal' });
    sound.play('heal');
    await wait(380);
  },
  async resonance(ev) { floatText(ev.unitId, `살풀이 공명 +${ev.amount}`, 'status'); await wait(380); },
  async 'job-effect'(ev) { floatText(ev.actorId, ev.label, 'status'); await wait(320); },
  async 'status-applied'(ev) {
    const def = STATUSES[ev.status];
    floatText(ev.unitId, `${def.icon} ${def.label}`, 'status');
    await wait(220);
  },
  async 'status-removed'(ev) { floatText(ev.unitId, `${STATUSES[ev.status].label} 해제`, 'status'); await wait(160); },
  async 'mental-change'(ev) {
    if (!battle.player(ev.unitId)) return;
    setBar('mental', ev.unitId, ev.value, 100);
    if (ev.reason !== 'heal') floatText(ev.unitId, `정신력 ${ev.delta > 0 ? '+' : ''}${ev.delta}`, 'small');
    await wait(140);
  },
  async 'shinmyeong-change'(ev) {
    setBar('shin', ev.unitId, ev.value, 100);
    if (ev.reason === 'fusion') return;
    await wait(90);
  },
  async 'dot-tick'(ev) {
    retrigger(unitEl(ev.targetId), 'hit');
    floatText(ev.targetId, `${STATUSES[ev.status].label} ${ev.amount}`, 'small');
    setBar('hp', ev.targetId, ev.hpAfter, ev.maxHp);
    await wait(380);
  },
  async 'enemy-heal'(ev) {
    floatText(ev.unitId, `+${ev.hp}`, 'heal');
    setBar('hp', ev.unitId, ev.hpAfter, ev.maxHp);
    await wait(320);
  },
  async 'unit-death'(ev) {
    unitEl(ev.unitId)?.classList.add('dead');
    sound.play('death');
    fx.burstAt(unitEl(ev.unitId), { color: '#1d1a2e', count: 20, speed: 3, life: 60, kind: 'ink', size: 5 });
    banner(`${unitName(ev.unitId)} ${ev.side === 'enemy' ? '정화' : '쓰러짐'}`, ev.side === 'enemy' ? 'gold' : 'danger');
    await wait(520);
  },
  async 'stage-clear'() { sound.play('clear'); banner('정화 완료', 'gold'); await wait(900); },
  async 'party-recovery'(ev) {
    for (const r of ev.recovered) retrigger(unitEl(r.id), 'healed');
    sound.play('heal');
    banner(ev.revived.length ? `회복 · 부활: ${ev.revived.map(unitName).join(', ')}` : '생존자 완전 회복', 'gold');
    await wait(900);
  },
  async 'run-over'() { sound.play('defeat'); banner('모든 무당이 쓰러졌다', 'danger'); await wait(1100); },
};

async function playerHit(ev, direct) {
  const target = unitEl(ev.targetId);
  retrigger(unitEl(ev.actorId), 'acting');
  if (direct) banner(`${unitName(ev.actorId)}의 일방 공격 → ${unitName(ev.targetId)}`);
  await wait(180);
  retrigger(target, 'hit');
  floatText(ev.targetId, `${ev.amount}${ev.matchup === 'overwhelming' ? '!' : ''}`);
  setBar('hp', ev.targetId, ev.hpAfter, ev.maxHp);
  shakeField(ev.fusion);
  sound.play(ev.fusion ? 'bigHit' : 'hit');
  fx.burstAt(target, { color: MATCHUP_COLORS[ev.matchup] ?? '#f3d58c', count: ev.fusion ? 60 : 22, speed: ev.fusion ? 9 : 5, life: 40 });
  await wait(ev.fusion ? 800 : 520);
}
async function enemyHit(ev) {
  const target = unitEl(ev.targetId);
  if (ev.type === 'enemy-clash-hit') retrigger(unitEl(ev.enemyId), 'acting');
  await wait(160);
  retrigger(target, 'hit');
  floatText(ev.targetId, String(ev.amount));
  setBar('hp', ev.targetId, ev.hpAfter, ev.maxHp);
  shakeField(ev.type === 'enemy-unopposed-hit');
  sound.play('hit');
  fx.burstAt(target, { color: '#ff6b5b', count: 18, speed: 5, life: 36 });
  await wait(520);
}

async function playEvents(events, { keepPhase = false } = {}) {
  // The resolver has already advanced the state; keep the pre-turn screen and only lock input
  // so bars move event by event instead of jumping to the result.
  ui.playing = true;
  ui.skip = false;
  document.body.classList.add('playing');
  $('#confirmBtn').disabled = true;
  $('#skipBtn').hidden = false;
  setHint();
  for (const ev of events) {
    const handler = handlers[ev.type];
    if (handler) {
      try { await handler(ev); } catch (error) { console.error('presentation error', ev, error); }
    }
  }
  closeClash();
  $('#fusionOverlay').hidden = true;
  ui.playing = false;
  ui.skip = false;
  document.body.classList.remove('playing');
  render();
  if (keepPhase) return;
  const s = battle.state;
  if (s.phase === PHASES.STAGE_CLEAR) showStageClear(events.find((e) => e.type === 'stage-clear'));
  else if (s.phase === PHASES.RUN_OVER) showRunOver(events.find((e) => e.type === 'run-over'));
}

// ------------------------------------------------------------------ dev panel
function setupDev() {
  if (!devMode) return;
  const panel = $('#devPanel');
  panel.hidden = false;
  const draw = () => {
    panel.innerHTML = `<b>개발 모드</b><span>seed ${battle.seed}</span>
      <button data-dev="gauge">신명 100 충전</button>
      <button data-dev="reveal">모든 스킬 공개: ${battle.options.revealAllSkills ? 'ON' : 'OFF'}</button>
      <button data-dev="boss">다음 보스 스테이지로</button>
      <button data-dev="enemy1">적 HP 1</button>
      <button data-dev="party1">파티 HP 1</button>`;
  };
  draw();
  panel.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-dev]')?.dataset.dev;
    if (!action || ui.playing || battle.state.phase !== PHASES.PLAYER_COMMANDS) return;
    if (action === 'gauge') battle.devFillGauges();
    if (action === 'reveal') {
      battle.options.revealAllSkills = !battle.options.revealAllSkills;
      battle.state.commands = [];
      battle.drawSkills();
    }
    if (action === 'enemy1') battle.aliveEnemies().forEach((x) => { x.hp = 1; });
    if (action === 'party1') battle.alivePlayers().forEach((x) => { x.hp = 1; });
    if (action === 'boss') {
      const next = Math.ceil((battle.state.runStage + 1) / 5) * 5;
      ui.pending = null;
      draw();
      render();
      await playEvents(battle.devJumpToStage(next));
      return;
    }
    ui.pending = null;
    draw();
    render();
  });
}

// ------------------------------------------------------------------ boot
function preloadImages() {
  const srcs = [...PARTY.flatMap((p) => [p.sprite, p.guardianSprite]), ...Object.values(ENEMIES).map((e) => e.sprite)];
  srcs.forEach((src) => { const img = new Image(); img.src = src; });
}

async function boot() {
  const report = validateContent();
  console.info('[content]', report.ok ? 'OK' : 'ERRORS', report.counts, report.errors);
  if (!report.ok) {
    const banner = $('#errorBanner');
    banner.hidden = false;
    banner.textContent = `콘텐츠 검증 실패:\n${report.errors.join('\n')}`;
  }
  fx.init();
  preloadImages();
  updateTopButtons();
  bindInput();
  const events = newBattle();
  setupDev();
  render();
  $('#startupHint').hidden = true;
  await playEvents(events);
}

boot();

// Exposed for manual inspection in the browser console during playtests.
window.__shaman = { get battle() { return battle; }, getMatchup };
