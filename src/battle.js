// Battle state controller. Owns the mutable run state and resolves turns in explicit phases.
// The UI only calls these commands and plays back the returned events; it never computes results.
import {
  PARTY, SKILLS, ENEMIES, STATUSES, JOB_EFFECTS, TUNING, CLEANSE_ORDER, POSITIONS,
} from './data.js';
import {
  clamp, safeFloor, rollYut, getMatchup, calculateClashValue, resolveThreeWins,
  calculatePlayerDamage, calculateEnemyDamage, unopposedMultiplier, drawSkillPair, drawSingleSlot,
  aggroWeights, selectAggroTarget, buildEngagements, resolveStageDefinition, isBossActionTurn,
  rollSpeed, splitHits, clashWinChance, winGrade,
} from './rules.js';
import { createRng } from './rng.js';

export const PHASES = {
  STAGE_START: 'STAGE_START',
  ROLL_SPEED: 'ROLL_SPEED',
  DRAW_PLAYER_SKILLS: 'DRAW_PLAYER_SKILLS',
  PLAYER_COMMANDS: 'PLAYER_COMMANDS',
  BUILD_ENGAGEMENTS: 'BUILD_ENGAGEMENTS',
  RESOLVE_CLASHES: 'RESOLVE_CLASHES',
  RESOLVE_DIRECT_PLAYER_ATTACKS: 'RESOLVE_DIRECT_PLAYER_ATTACKS',
  RESOLVE_UNENGAGED_ENEMY_ATTACKS: 'RESOLVE_UNENGAGED_ENEMY_ATTACKS',
  APPLY_END_TURN_UPDATES: 'APPLY_END_TURN_UPDATES',
  STAGE_CLEAR: 'STAGE_CLEAR',
  RUN_OVER: 'RUN_OVER',
};

const POSITION_ORDER = { front: 0, middle: 1, back: 2 };

// In-memory storage used when no browser storage is injected (tests, blocked storage).
export function createMemoryStorage(initial = null) {
  let data = initial;
  return {
    load: () => data,
    save: (next) => { data = JSON.parse(JSON.stringify(next)); return true; },
  };
}

function createPlayer(def) {
  return {
    id: def.id,
    name: def.name,
    position: def.position,
    job: def.job,
    maxHp: def.maxHp,
    hp: def.maxHp,
    mental: def.mental,
    shinmyeong: def.shinmyeong,
    alive: true,
    statuses: {},
    exposed: [],
    pendingFusion: null,
    speed: 0,
  };
}

export class Battle {
  constructor({ rng = createRng(), storage = createMemoryStorage(), options = {} } = {}) {
    this.rng = rng;
    this.storage = storage;
    this.options = { revealAllSkills: false, ...options };
    this.state = null;
    this.storageOk = true;
    this.savedBest = this.loadBest();
  }

  // ---------------------------------------------------------------- persistence

  loadBest() {
    try {
      const data = this.storage.load();
      return Number(data?.bestStage) || 0;
    } catch {
      this.storageOk = false;
      return 0;
    }
  }

  persistBest(reachedStage, summary) {
    const best = Math.max(this.savedBest, this.state.sessionBest, reachedStage);
    const improved = reachedStage > this.savedBest;
    this.state.sessionBest = Math.max(this.state.sessionBest, reachedStage);
    if (!improved && !summary) return { saved: false, best };
    try {
      const ok = this.storage.save({ bestStage: best, lastRun: summary ?? null, savedAt: new Date().toISOString() });
      if (ok === false) throw new Error('storage rejected');
      this.savedBest = best;
      this.storageOk = true;
      return { saved: true, best };
    } catch {
      // Storage failure must never stop the run; keep a session-only record.
      this.storageOk = false;
      return { saved: false, best };
    }
  }

  get bestStage() {
    return Math.max(this.savedBest, this.state?.sessionBest ?? 0);
  }

  // ---------------------------------------------------------------- run / stage lifecycle

  newRun() {
    this.state = {
      runStage: 1,
      sessionBest: 0,
      stageType: 'normal',
      bossEmotion: null,
      turn: 0,
      enemyPhase: 0,
      phase: PHASES.STAGE_START,
      players: PARTY.map(createPlayer),
      enemies: [],
      commands: [],
      selectionSequence: 0,
      stats: { turns: 0, clashWins: 0, clashLosses: 0, fusions: 0, kills: 0, stagesCleared: 0 },
      result: null,
    };
    return this.startStage(1);
  }

  startStage(stage) {
    const s = this.state;
    const def = resolveStageDefinition(stage, this.rng);
    s.runStage = stage;
    s.stageType = def.type;
    s.bossEmotion = def.bossEmotion;
    s.scale = def.scale;
    s.turn = 0;
    s.enemyPhase = 0;
    s.phase = PHASES.STAGE_START;
    const counts = {};
    def.enemies.forEach((e) => { counts[e.templateId] = (counts[e.templateId] ?? 0) + 1; });
    const seen = {};
    s.enemies = def.enemies.map((e, index) => {
      const t = ENEMIES[e.templateId];
      seen[e.templateId] = (seen[e.templateId] ?? 0) + 1;
      const suffix = counts[e.templateId] > 1 ? ` ${seen[e.templateId]}` : '';
      return {
        uid: `e${index + 1}`,
        templateId: e.templateId,
        name: t.name + suffix,
        emotion: t.emotion,
        position: t.position,
        boss: t.boss,
        maxHp: e.maxHp,
        hp: e.maxHp,
        damage: e.damage,
        clashPower: e.clashPower,
        mental: e.mental,
        alive: true,
        statuses: {},
        intent: { special: false },
        speed: 0,
      };
    });
    s.enemies.sort((a, b) => (Number(b.boss) - Number(a.boss)) || POSITION_ORDER[a.position] - POSITION_ORDER[b.position]);
    s.sessionBest = Math.max(s.sessionBest, stage);
    const events = [{ type: 'stage-start', stage, stageType: def.type, bossEmotion: def.bossEmotion, enemies: s.enemies.map((e) => e.uid) }];
    events.push(...this.startTurn());
    return events;
  }

  startTurn() {
    const s = this.state;
    s.turn += 1;
    s.enemyPhase = s.turn;
    s.commands = [];
    for (const enemy of s.enemies) {
      enemy.intent = { special: enemy.boss && isBossActionTurn(s.enemyPhase) };
    }
    s.phase = PHASES.ROLL_SPEED;
    const speeds = this.rollSpeeds();
    s.phase = PHASES.DRAW_PLAYER_SKILLS;
    const draws = this.drawSkills();
    s.phase = PHASES.PLAYER_COMMANDS;
    return [
      { type: 'turn-start', turn: s.turn, bossAction: s.enemies.some((e) => e.alive && e.intent.special) },
      { type: 'speed-roll', speeds },
      { type: 'skill-draw', draws },
    ];
  }

  // Every living unit rolls its speed die; it orders actions inside each resolution phase.
  rollSpeeds() {
    const speeds = {};
    for (const p of this.state.players) {
      p.speed = p.alive ? rollSpeed(PARTY.find((d) => d.id === p.id).speed, this.rng) : 0;
      if (p.alive) speeds[p.id] = p.speed;
    }
    for (const e of this.state.enemies) {
      e.speed = e.alive ? rollSpeed(ENEMIES[e.templateId].speed, this.rng) : 0;
      if (e.alive) speeds[e.uid] = e.speed;
    }
    return speeds;
  }

  drawSkills() {
    const draws = {};
    for (const p of this.state.players) {
      if (!p.alive) { p.exposed = []; continue; }
      const def = PARTY.find((d) => d.id === p.id);
      if (this.options.revealAllSkills) {
        p.exposed = [...def.skills];
      } else if (p.pendingFusion) {
        const other = drawSingleSlot(def.skills, this.rng);
        p.exposed = [];
        p.exposed[p.pendingFusion.slotIndex] = def.fusionSkill;
        p.exposed[1 - p.pendingFusion.slotIndex] = other;
      } else {
        p.exposed = drawSkillPair(def.skills, this.rng);
      }
      if (p.pendingFusion && this.options.revealAllSkills) p.exposed[p.pendingFusion.slotIndex] = def.fusionSkill;
      draws[p.id] = [...p.exposed];
    }
    return draws;
  }

  // ---------------------------------------------------------------- queries

  player(id) { return this.state.players.find((p) => p.id === id); }
  enemy(uid) { return this.state.enemies.find((e) => e.uid === uid); }
  alivePlayers() { return this.state.players.filter((p) => p.alive); }
  aliveEnemies() { return this.state.enemies.filter((e) => e.alive); }

  slotOptions(playerId) {
    const p = this.player(playerId);
    if (!p || !p.alive) return [];
    return p.exposed.map((skillId, slotIndex) => {
      const skill = SKILLS[skillId];
      const bound = Boolean(p.statuses.bind) && skill.tier === 3;
      return { slotIndex, skillId, skill, fusion: skill.fusionOnly, disabled: bound, reason: bound ? '속박: 3스 사용 불가' : null };
    });
  }

  commandFor(playerId) {
    return this.state.commands.find((c) => c.actorId === playerId) ?? null;
  }

  // Role each current command will take: last selection on an enemy clashes, earlier ones hit directly.
  commandRoles() {
    const { clashes } = buildEngagements(this.state.commands);
    const clashSet = new Set(clashes.map((c) => c.actorId));
    const roles = {};
    for (const c of this.state.commands) roles[c.actorId] = clashSet.has(c.actorId) ? 'clash' : 'direct';
    return roles;
  }

  previewCommand(playerId, slotIndex, enemyUid) {
    const p = this.player(playerId);
    const e = this.enemy(enemyUid);
    if (!p || !e) return null;
    const skill = SKILLS[p.exposed[slotIndex]];
    const matchup = getMatchup(skill.attribute, e.emotion);
    const vulnerable = e.statuses.vulnerable ? e.statuses.vulnerable.multiplier : 1;
    const winChance = skill.fusionOnly ? 1 : clashWinChance(...this.clashSides(p, skill, e, matchup));
    return {
      matchup,
      damage: calculatePlayerDamage(skill.damage, matchup.damage, vulnerable),
      hits: skill.hits,
      clashRange: [calculateClashValue(skill, 1, matchup), calculateClashValue(skill, 5, matchup)],
      winChance,
      grade: winGrade(winChance),
    };
  }

  // Both clash participants as seen right now (shared by the win-chance preview).
  clashSides(player, skill, enemy, matchup) {
    return [
      {
        power: skill.clashPower,
        multiplier: matchup.clash,
        penalty: player.statuses.stagger ? STATUSES.stagger.clashValuePenalty : 0,
        mental: player.mental,
        noReroll: Boolean(player.statuses.agitation),
      },
      {
        power: enemy.statuses.seal ? Math.max(0, enemy.clashPower - STATUSES.seal.clashPowerPenalty) : enemy.clashPower,
        multiplier: TUNING.enemyClashMultiplier,
        penalty: enemy.statuses.stagger ? STATUSES.stagger.clashValuePenalty : 0,
        mental: enemy.mental,
        noReroll: false,
      },
    ];
  }

  // Threat preview for enemies that no current command targets (they will attack unopposed).
  previewThreats() {
    const engaged = new Set(this.state.commands.map((c) => c.targetId));
    return this.aliveEnemies().map((e) => {
      const action = this.enemyAction(e);
      const seal = e.statuses.seal ? STATUSES.seal.damageMultiplier : 1;
      return {
        uid: e.uid,
        engaged: engaged.has(e.uid),
        action,
        unopposedDamage: calculateEnemyDamage(e.damage, unopposedMultiplier(e.boss), seal),
        clashDamage: calculateEnemyDamage(e.damage, 1, seal),
        multiplier: unopposedMultiplier(e.boss),
      };
    });
  }

  // Expected recovery from a skill's heal effects if it lands now (UI preview only, no mutation).
  previewHeal(skillId) {
    const skill = SKILLS[skillId];
    const result = [];
    for (const effect of skill?.effects ?? []) {
      if (effect.type !== 'heal') continue;
      const units = effect.scope === 'allAllies' ? this.alivePlayers() : [this.lowestAlly()].filter(Boolean);
      for (const u of units) {
        const raw = effect.hpPct ? safeFloor(u.maxHp * effect.hpPct) : (effect.hp ?? 0);
        const cut = u.statuses.healCut ? STATUSES.healCut.healMultiplier : 1;
        result.push({
          id: u.id,
          name: u.name,
          hp: Math.min(u.maxHp - u.hp, safeFloor(raw * cut)),
          mental: Math.min(TUNING.mental.max - u.mental, effect.mental ?? 0),
        });
      }
    }
    return result;
  }

  aggroPreview() {
    return aggroWeights(this.aggroCandidates());
  }

  aggroCandidates() {
    return this.alivePlayers().map((p) => ({
      id: p.id,
      position: p.position,
      tankBonus: p.job === 'aekmagi' && (p.statuses.aekmagi?.charges ?? 0) > 0,
    }));
  }

  enemyAction(enemy) {
    const t = ENEMIES[enemy.templateId];
    return enemy.intent.special && t.bossAction ? { ...t.bossAction, special: true } : { ...t.attack, special: false };
  }

  canConfirm() {
    const s = this.state;
    if (s.phase !== PHASES.PLAYER_COMMANDS) return false;
    return this.alivePlayers().every((p) => this.commandFor(p.id));
  }

  // ---------------------------------------------------------------- commands

  setCommand(playerId, slotIndex, targetId) {
    const s = this.state;
    if (s.phase !== PHASES.PLAYER_COMMANDS) return { ok: false, reason: '명령 입력 단계가 아닙니다.' };
    const p = this.player(playerId);
    if (!p || !p.alive) return { ok: false, reason: '행동할 수 없는 캐릭터입니다.' };
    const option = this.slotOptions(playerId)[slotIndex];
    if (!option) return { ok: false, reason: '공개되지 않은 스킬입니다.' };
    if (option.disabled) return { ok: false, reason: option.reason };
    const target = this.enemy(targetId);
    if (!target || !target.alive) return { ok: false, reason: '살아 있는 적을 선택해야 합니다.' };
    s.commands = s.commands.filter((c) => c.actorId !== playerId);
    s.selectionSequence += 1;
    const command = { actorId: playerId, slotIndex, skillId: option.skillId, targetId, targetType: option.skill.targetType, seq: s.selectionSequence };
    s.commands.push(command);
    return { ok: true, command, event: { type: 'target-selected', ...command } };
  }

  clearCommand(playerId) {
    this.state.commands = this.state.commands.filter((c) => c.actorId !== playerId);
  }

  canFuse(playerId) {
    const p = this.player(playerId);
    return Boolean(p && p.alive && this.state.phase === PHASES.PLAYER_COMMANDS
      && p.shinmyeong >= TUNING.shinmyeong.max && !p.pendingFusion);
  }

  equipFusion(playerId, slotIndex) {
    if (!this.canFuse(playerId)) return { ok: false, reason: '신명이 가득 찬 생존 캐릭터만 강신합일할 수 있습니다.' };
    const p = this.player(playerId);
    if (slotIndex < 0 || slotIndex >= p.exposed.length) return { ok: false, reason: '교체할 슬롯이 없습니다.' };
    const def = PARTY.find((d) => d.id === playerId);
    p.exposed[slotIndex] = def.fusionSkill;
    p.pendingFusion = { characterId: playerId, slotIndex, fusionSkillId: def.fusionSkill, createdAt: this.state.turn, used: false };
    const cmd = this.commandFor(playerId);
    if (cmd && cmd.slotIndex === slotIndex) this.clearCommand(playerId);
    return { ok: true, event: { type: 'guardian-fusion', phase: 'equip', actorId: playerId, slotIndex, skillId: def.fusionSkill } };
  }

  // ---------------------------------------------------------------- dev helpers

  devFillGauges() {
    for (const p of this.alivePlayers()) p.shinmyeong = TUNING.shinmyeong.max;
  }

  devJumpToStage(stage) {
    return this.startStage(stage);
  }

  // ---------------------------------------------------------------- unit mutations

  changeMental(unit, delta, events, reason) {
    const before = unit.mental;
    unit.mental = clamp(unit.mental + delta, TUNING.mental.min, TUNING.mental.max);
    const change = unit.mental - before;
    if (change !== 0) events.push({ type: 'mental-change', unitId: unit.id ?? unit.uid, delta: change, value: unit.mental, reason });
    return change;
  }

  changeShinmyeong(player, delta, events, reason) {
    const before = player.shinmyeong;
    player.shinmyeong = clamp(player.shinmyeong + delta, TUNING.shinmyeong.min, TUNING.shinmyeong.max);
    const change = player.shinmyeong - before;
    if (change !== 0) events.push({ type: 'shinmyeong-change', unitId: player.id, delta: change, value: player.shinmyeong, reason });
    return change;
  }

  addStatus(unit, statusId, params, events) {
    const def = STATUSES[statusId];
    const existing = unit.statuses[statusId];
    let next;
    if (def.kind === 'charge') {
      const incoming = params.charges ?? 1;
      const charges = def.stackRule === 'add'
        ? Math.min(def.maxCharges, (existing?.charges ?? 0) + incoming)
        : Math.min(def.maxCharges, Math.max(existing?.charges ?? 0, incoming));
      next = { charges };
      if (params.multiplier !== undefined) {
        next.multiplier = statusId === 'aekmagi'
          ? Math.min(existing?.multiplier ?? params.multiplier, params.multiplier)
          : Math.max(existing?.multiplier ?? params.multiplier, params.multiplier);
      } else if (existing?.multiplier !== undefined) {
        next.multiplier = existing.multiplier;
      }
    } else {
      next = {
        turns: Math.max(existing?.turns ?? 0, params.turns ?? 1),
        power: Math.max(existing?.power ?? 0, params.power ?? 0),
        fresh: Boolean(def.delayed),
      };
    }
    unit.statuses[statusId] = next;
    events.push({ type: 'status-applied', unitId: unit.id ?? unit.uid, status: statusId, ...next });
    if (statusId === 'agitation' && params.mental) this.changeMental(unit, -params.mental, events, 'agitation');
  }

  removeStatus(unit, statusId, events, reason = 'expired') {
    if (!unit.statuses[statusId]) return;
    delete unit.statuses[statusId];
    events.push({ type: reason === 'expired' ? 'status-expired' : 'status-removed', unitId: unit.id ?? unit.uid, status: statusId, reason });
  }

  consumeCharge(unit, statusId, events) {
    const st = unit.statuses[statusId];
    if (!st) return null;
    const snapshot = { ...st };
    st.charges -= 1;
    events.push({ type: 'status-consumed', unitId: unit.id ?? unit.uid, status: statusId, remaining: st.charges });
    if (st.charges <= 0) delete unit.statuses[statusId];
    return snapshot;
  }

  damageEnemy(enemy, amount, events, meta) {
    const before = enemy.hp;
    enemy.hp = Math.max(0, enemy.hp - amount);
    const event = { ...meta, targetId: enemy.uid, amount: before - enemy.hp, raw: amount, hpAfter: enemy.hp, maxHp: enemy.maxHp };
    events.push(event);
    if (enemy.hp <= 0 && enemy.alive) {
      enemy.alive = false;
      enemy.statuses = {};
      this.state.stats.kills += 1;
      events.push({ type: 'unit-death', unitId: enemy.uid, side: 'enemy' });
    }
    return event;
  }

  damagePlayer(player, amount, events, meta) {
    const before = player.hp;
    player.hp = Math.max(0, player.hp - amount);
    const event = { ...meta, targetId: player.id, amount: before - player.hp, raw: amount, hpAfter: player.hp, maxHp: player.maxHp };
    events.push(event);
    if (player.hp <= 0 && player.alive) {
      player.alive = false;
      player.statuses = {};
      events.push({ type: 'unit-death', unitId: player.id, side: 'player' });
    }
    return event;
  }

  healPlayer(player, { hp = 0, mental = 0 }, events, sourceId) {
    if (!player.alive) return { hp: 0, mental: 0 };
    const cut = player.statuses.healCut ? STATUSES.healCut.healMultiplier : 1;
    const hpAmount = safeFloor(hp * cut);
    const before = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + hpAmount);
    const hpGain = player.hp - before;
    const mentalGain = mental > 0 ? this.changeMental(player, mental, events, 'heal') : 0;
    if (hpGain > 0 || mentalGain > 0) {
      events.push({ type: 'healing-effect', unitId: player.id, sourceId, hp: hpGain, mental: mentalGain, hpAfter: player.hp, maxHp: player.maxHp, reduced: cut < 1 });
    }
    return { hp: hpGain, mental: mentalGain };
  }

  cleanse(player, count, events) {
    let removed = 0;
    for (const statusId of CLEANSE_ORDER) {
      if (removed >= count) break;
      if (player.statuses[statusId]) {
        this.removeStatus(player, statusId, events, 'cleansed');
        removed += 1;
      }
    }
    return removed;
  }

  lowestAlly() {
    const alive = this.alivePlayers();
    if (alive.length === 0) return null;
    return alive.reduce((low, p) => (p.hp / p.maxHp < low.hp / low.maxHp ? p : low), alive[0]);
  }

  // Applies a list of data-driven effects. Returns what actually changed (used for 살풀이 공명).
  applyEffects(effects, { actor, target }, events) {
    const outcome = { hp: 0, mental: 0, cleansed: 0 };
    for (const effect of effects) {
      switch (effect.type) {
        case 'mental': {
          const units = effect.scope === 'allAllies' ? this.alivePlayers() : [actor];
          for (const u of units) this.changeMental(u, effect.amount, events, 'skill');
          break;
        }
        case 'heal': {
          const units = effect.scope === 'allAllies' ? this.alivePlayers() : [this.lowestAlly()].filter(Boolean);
          for (const u of units) {
            const hp = effect.hpPct ? safeFloor(u.maxHp * effect.hpPct) : (effect.hp ?? 0);
            const gained = this.healPlayer(u, { hp, mental: effect.mental ?? 0 }, events, actor.id);
            outcome.hp += gained.hp;
            outcome.mental += gained.mental;
            if (effect.cleanse) outcome.cleansed += this.cleanse(u, effect.cleanse, events);
          }
          break;
        }
        case 'status': {
          if (target && target.alive) this.addStatus(target, effect.status, effect, events);
          break;
        }
        case 'vulnerable': {
          if (target && target.alive) this.addStatus(target, 'vulnerable', { charges: 1, multiplier: effect.multiplier }, events);
          break;
        }
        case 'enemyMental': {
          if (target && target.alive) this.changeMental(target, effect.amount, events, 'skill');
          break;
        }
        case 'aekmagi': {
          this.addStatus(actor, 'aekmagi', { charges: effect.charges, multiplier: effect.multiplier }, events);
          break;
        }
        default:
          break;
      }
    }
    return outcome;
  }

  // Player attack landing (clash win or direct hit): damage, on-hit effects, 살풀이 공명.
  // The total is split into hits; a clash winner loses one hit per round it lost (minimum one).
  landPlayerAttack(actor, skill, enemy, events, kind, lostRounds = 0) {
    const matchup = getMatchup(skill.attribute, enemy.emotion);
    let active = 1;
    if (enemy.statuses.vulnerable) {
      active *= enemy.statuses.vulnerable.multiplier;
      this.consumeCharge(enemy, 'vulnerable', events);
    }
    const damage = calculatePlayerDamage(skill.damage, matchup.damage, active);
    const hits = splitHits(damage, skill.hits, lostRounds);
    const dealt = [];
    hits.forEach((amount, index) => {
      if (!enemy.alive) return;
      const hit = this.damageEnemy(enemy, amount, events, {
        type: kind === 'clash' ? 'clash-hit' : 'direct-hit',
        actorId: actor.id, skillId: skill.id, fusion: skill.fusionOnly, matchup: matchup.level, matchupLabel: matchup.label,
        hitIndex: index + 1, hitCount: hits.length, final: index === hits.length - 1,
      });
      dealt.push(hit.amount);
    });
    events.push({
      type: 'attack-result', side: 'player', kind, actorId: actor.id, targetId: enemy.uid, skillId: skill.id,
      planned: damage, total: dealt.reduce((a, b) => a + b, 0), hits: dealt, maxHits: skill.hits, lostHits: skill.hits - hits.length,
    });
    const outcome = this.applyEffects(skill.effects, { actor, target: enemy }, events);
    if (skill.resonance && (outcome.hp > 0 || outcome.mental > 0 || outcome.cleansed > 0)) {
      this.changeShinmyeong(actor, skill.resonance, events, 'resonance');
      events.push({ type: 'resonance', unitId: actor.id, amount: skill.resonance, skillId: skill.id });
    }
    return outcome;
  }

  // Enemy attack landing on a player, with 액막이 redirection. `unopposed` adds the mental hit and debuffs.
  landEnemyAttack(enemy, player, action, baseDamage, events, { unopposed, lostRounds = 0 }) {
    let target = player;
    let damage = baseDamage;
    // 액막이 is decided once per attack: the whole multi-hit attack is redirected.
    const guard = this.alivePlayers().find((p) => p.id !== player.id && (p.statuses.aekmagi?.charges ?? 0) > 0);
    if (guard) {
      const charge = this.consumeCharge(guard, 'aekmagi', events);
      damage = safeFloor(baseDamage * (charge.multiplier ?? 0.7));
      events.push({ type: 'aekmagi-redirect', guardId: guard.id, originalTargetId: player.id, enemyId: enemy.uid, damage });
      target = guard;
    }
    const hits = splitHits(damage, action.hits ?? 1, lostRounds);
    const dealt = [];
    hits.forEach((amount, index) => {
      if (!target.alive) return;
      const hit = this.damagePlayer(target, amount, events, {
        type: unopposed ? 'enemy-unopposed-hit' : 'enemy-clash-hit', enemyId: enemy.uid, actionName: action.name, special: action.special,
        hitIndex: index + 1, hitCount: hits.length, final: index === hits.length - 1,
      });
      dealt.push(hit.amount);
    });
    events.push({
      type: 'attack-result', side: 'enemy', kind: unopposed ? 'unopposed' : 'clash', enemyId: enemy.uid, targetId: target.id,
      planned: damage, total: dealt.reduce((a, b) => a + b, 0), hits: dealt, maxHits: action.hits ?? 1, lostHits: (action.hits ?? 1) - hits.length,
    });
    if (unopposed && target.alive) this.changeMental(target, TUNING.mental.unopposedHit, events, 'unopposed');
    // Debuffs: always on unopposed attacks; in a won clash only the boss signature action carries its effect.
    if (unopposed || action.special) {
      for (const effect of action.effects) {
        if (effect.type === 'status' && target.alive) this.addStatus(target, effect.status, effect, events);
        if (effect.type === 'selfHealPct' && enemy.alive) {
          const before = enemy.hp;
          enemy.hp = Math.min(enemy.maxHp, enemy.hp + safeFloor(enemy.maxHp * effect.pct));
          if (enemy.hp > before) events.push({ type: 'enemy-heal', unitId: enemy.uid, hp: enemy.hp - before, hpAfter: enemy.hp, maxHp: enemy.maxHp });
        }
      }
    }
  }

  finishFusion(actor, events) {
    actor.pendingFusion = null;
    this.state.stats.fusions += 1;
    const before = actor.shinmyeong;
    actor.shinmyeong = 0;
    events.push({ type: 'shinmyeong-change', unitId: actor.id, delta: -before, value: 0, reason: 'fusion' });
  }

  // ---------------------------------------------------------------- turn resolution

  outcome() {
    if (this.alivePlayers().length === 0) return 'RUN_OVER';
    if (this.aliveEnemies().length === 0) return 'STAGE_CLEAR';
    return null;
  }

  validateCommands(events) {
    const s = this.state;
    const latest = new Map();
    for (const c of s.commands) {
      const prev = latest.get(c.actorId);
      if (prev) events.push({ type: 'command-canceled', actorId: prev.seq < c.seq ? prev.actorId : c.actorId, reason: 'duplicate' });
      if (!prev || prev.seq < c.seq) latest.set(c.actorId, c);
    }
    const valid = [];
    for (const c of latest.values()) {
      const actor = this.player(c.actorId);
      const target = this.enemy(c.targetId);
      let reason = null;
      if (!actor) reason = 'missing-actor';
      else if (!actor.alive) reason = 'dead-actor';
      else if (actor.exposed[c.slotIndex] !== c.skillId) reason = 'skill-not-exposed';
      else if (!c.targetId || !target) reason = 'missing-target';
      else if (!target.alive) reason = 'dead-target';
      if (reason) events.push({ type: 'command-canceled', actorId: c.actorId, reason });
      else valid.push(c);
    }
    return valid;
  }

  resolveClash(command, events) {
    const actor = this.player(command.actorId);
    const enemy = this.enemy(command.targetId);
    const skill = SKILLS[command.skillId];
    if (!actor.alive) {
      events.push({ type: 'command-canceled', actorId: actor.id, reason: 'dead-before-clash' });
      return;
    }
    if (!enemy.alive) {
      events.push({ type: 'command-canceled', actorId: actor.id, reason: 'dead-target' });
      return;
    }
    const action = this.enemyAction(enemy);
    const matchup = getMatchup(skill.attribute, enemy.emotion);

    // One-shot modifiers are consumed when the clash begins.
    const playerPenalty = actor.statuses.stagger ? STATUSES.stagger.clashValuePenalty : 0;
    if (playerPenalty) this.consumeCharge(actor, 'stagger', events);
    const enemyPenalty = enemy.statuses.stagger ? STATUSES.stagger.clashValuePenalty : 0;
    if (enemyPenalty) this.consumeCharge(enemy, 'stagger', events);
    let sealMultiplier = 1;
    let enemyPower = enemy.clashPower;
    if (enemy.statuses.seal) {
      this.consumeCharge(enemy, 'seal', events);
      sealMultiplier = STATUSES.seal.damageMultiplier;
      enemyPower = Math.max(0, enemyPower - STATUSES.seal.clashPowerPenalty);
    }
    const noReroll = Boolean(actor.statuses.agitation);

    events.push({
      type: 'clash-start', actorId: actor.id, enemyId: enemy.uid, skillId: skill.id, fusion: skill.fusionOnly,
      matchup: matchup.level, matchupLabel: matchup.label, clashMultiplier: matchup.clash, damageMultiplier: matchup.damage,
      actionName: action.name, special: action.special, playerPenalty, enemyPenalty, sealed: sealMultiplier < 1, noReroll,
      playerPower: skill.clashPower, enemyPower,
    });
    if (skill.fusionOnly) {
      events.push({ type: 'guardian-fusion', phase: 'attack', actorId: actor.id, skillId: skill.id });
    }

    const playerRoller = () => {
      const yut = rollYut(actor.mental, this.rng, { noReroll });
      return { yut, value: calculateClashValue(skill, yut.value, matchup, playerPenalty) };
    };
    const enemyRoller = () => {
      const yut = rollYut(enemy.mental, this.rng);
      return { yut, value: calculateClashValue({ clashPower: enemyPower }, yut.value, { clash: TUNING.enemyClashMultiplier }, enemyPenalty) };
    };
    const result = resolveThreeWins(playerRoller, enemyRoller, { fusion: skill.fusionOnly });
    result.rounds.forEach((round, index) => {
      const base = { actorId: actor.id, enemyId: enemy.uid, round: index + 1 };
      if (!round.fusion) {
        events.push({ type: 'yut-roll', ...base, player: round.player.yut, enemy: round.enemy.yut });
        events.push({ type: 'clash-value', ...base, playerValue: round.player.value, enemyValue: round.enemy.value, result: round.result });
      }
      if (round.result === 'tie') events.push({ type: 'clash-tie', ...base, playerWins: round.playerWins, enemyWins: round.enemyWins });
      else events.push({ type: 'clash-round-win', ...base, winner: round.result, fusion: Boolean(round.fusion), playerWins: round.playerWins, enemyWins: round.enemyWins });
    });
    events.push({ type: 'clash-final-win', actorId: actor.id, enemyId: enemy.uid, winner: result.winner, playerWins: result.playerWins, enemyWins: result.enemyWins });

    if (result.winner === 'player') {
      this.state.stats.clashWins += 1;
      events.push({ type: 'stagger', unitId: enemy.uid, side: 'enemy' });
      this.landPlayerAttack(actor, skill, enemy, events, 'clash', result.enemyWins);
      if (enemy.alive) this.addStatus(enemy, 'stagger', { charges: 1 }, events);
      if (!skill.fusionOnly) {
        const job = JOB_EFFECTS[actor.job];
        events.push({ type: 'job-effect', actorId: actor.id, job: actor.job, label: job.label });
        this.applyEffects(job.effects, { actor, target: enemy }, events);
      }
      this.changeMental(actor, TUNING.mental.clashWin, events, 'clash-win');
      this.changeShinmyeong(actor, TUNING.shinmyeong.clashWin, events, 'clash-win');
      if (skill.fusionOnly) this.finishFusion(actor, events);
    } else {
      this.state.stats.clashLosses += 1;
      events.push({ type: 'stagger', unitId: actor.id, side: 'player' });
      const damage = calculateEnemyDamage(enemy.damage, 1, sealMultiplier);
      this.landEnemyAttack(enemy, actor, action, damage, events, { unopposed: false, lostRounds: result.playerWins });
      if (actor.alive) {
        this.addStatus(actor, 'stagger', { charges: 1 }, events);
        this.changeMental(actor, TUNING.mental.clashLoss, events, 'clash-loss');
        this.changeShinmyeong(actor, TUNING.shinmyeong.clashLoss, events, 'clash-loss');
      }
    }
  }

  resolveDirect(command, events) {
    const actor = this.player(command.actorId);
    const enemy = this.enemy(command.targetId);
    const skill = SKILLS[command.skillId];
    if (!actor.alive) { events.push({ type: 'command-canceled', actorId: actor.id, reason: 'dead-actor' }); return; }
    if (!enemy.alive) { events.push({ type: 'command-canceled', actorId: actor.id, reason: 'dead-target' }); return; }
    if (skill.fusionOnly) events.push({ type: 'guardian-fusion', phase: 'attack', actorId: actor.id, skillId: skill.id });
    this.landPlayerAttack(actor, skill, enemy, events, 'direct');
    this.changeShinmyeong(actor, TUNING.shinmyeong.directHit, events, 'direct-hit');
    if (skill.fusionOnly) this.finishFusion(actor, events);
  }

  resolveUnengaged(enemy, events) {
    const candidates = this.aggroCandidates();
    const targetId = selectAggroTarget(candidates, this.rng);
    if (!targetId) return;
    const action = this.enemyAction(enemy);
    let sealMultiplier = 1;
    if (enemy.statuses.seal) {
      this.consumeCharge(enemy, 'seal', events);
      sealMultiplier = STATUSES.seal.damageMultiplier;
    }
    const multiplier = unopposedMultiplier(enemy.boss);
    const damage = calculateEnemyDamage(enemy.damage, multiplier, sealMultiplier);
    events.push({ type: 'enemy-unopposed-start', enemyId: enemy.uid, targetId, actionName: action.name, special: action.special, multiplier });
    this.landEnemyAttack(enemy, this.player(targetId), action, damage, events, { unopposed: true });
  }

  endTurnUpdates(events) {
    const tick = (unit, isPlayer) => {
      for (const [statusId, st] of Object.entries({ ...unit.statuses })) {
        const def = STATUSES[statusId];
        if (def.kind === 'charge') continue;
        if (def.kind === 'dot' && unit.alive) {
          const meta = { type: 'dot-tick', status: statusId };
          if (isPlayer) this.damagePlayer(unit, st.power, events, meta);
          else this.damageEnemy(unit, st.power, events, meta);
          if (!unit.alive) return;
        }
        if (st.fresh) { st.fresh = false; continue; }
        st.turns -= 1;
        if (st.turns <= 0) this.removeStatus(unit, statusId, events);
      }
    };
    for (const e of this.state.enemies) if (e.alive) tick(e, false);
    for (const p of this.state.players) if (p.alive) tick(p, true);
  }

  resolveTurn() {
    const s = this.state;
    if (s.phase !== PHASES.PLAYER_COMMANDS) throw new Error(`resolveTurn called in phase ${s.phase}`);
    const events = [];
    s.stats.turns += 1;

    s.phase = PHASES.BUILD_ENGAGEMENTS;
    const valid = this.validateCommands(events);
    const built = buildEngagements(valid);
    const { engagedEnemyIds } = built;
    // Speed orders actions inside a phase; the phase order itself never changes.
    const bySpeed = (a, b) => (this.player(b.actorId).speed - this.player(a.actorId).speed) || (a.seq - b.seq);
    const clashes = [...built.clashes].sort(bySpeed);
    const directs = [...built.directs].sort(bySpeed);
    const unengaged = s.enemies
      .map((enemy, index) => ({ enemy, index }))
      .filter(({ enemy }) => enemy.alive && !engagedEnemyIds.has(enemy.uid))
      .sort((a, b) => (b.enemy.speed - a.enemy.speed) || (a.index - b.index))
      .map(({ enemy }) => enemy);
    events.push({
      type: 'engagements',
      clashes: clashes.map((c) => ({ actorId: c.actorId, enemyId: c.targetId })),
      directs: directs.map((c) => ({ actorId: c.actorId, enemyId: c.targetId })),
    });

    const phases = [
      [PHASES.RESOLVE_CLASHES, () => clashes.forEach((c) => !this.outcome() && this.resolveClash(c, events))],
      [PHASES.RESOLVE_DIRECT_PLAYER_ATTACKS, () => directs.forEach((c) => !this.outcome() && this.resolveDirect(c, events))],
      [PHASES.RESOLVE_UNENGAGED_ENEMY_ATTACKS, () => {
        for (const enemy of unengaged) {
          if (this.outcome()) break;
          if (enemy.alive) this.resolveUnengaged(enemy, events);
        }
      }],
      [PHASES.APPLY_END_TURN_UPDATES, () => this.endTurnUpdates(events)],
    ];
    for (const [phase, run] of phases) {
      if (this.outcome()) break;
      s.phase = phase;
      events.push({ type: 'phase', phase });
      run();
    }

    const outcome = this.outcome();
    if (outcome === 'RUN_OVER') events.push(...this.finishRun());
    else if (outcome === 'STAGE_CLEAR') events.push(...this.clearStage());
    else events.push(...this.startTurn());
    return events;
  }

  clearStage() {
    const s = this.state;
    s.phase = PHASES.STAGE_CLEAR;
    s.stats.stagesCleared += 1;
    const reached = s.runStage + 1;
    const save = this.persistBest(reached, null);
    return [{ type: 'stage-clear', stage: s.runStage, stageType: s.stageType, reached, best: save.best, saved: save.saved }];
  }

  // Recovery happens before the next stage is built. Pending fusion slots survive.
  advanceStage() {
    const s = this.state;
    if (s.phase !== PHASES.STAGE_CLEAR) throw new Error('advanceStage requires STAGE_CLEAR');
    const wasBoss = s.stageType === 'boss';
    const recovered = [];
    for (const p of s.players) {
      if (p.alive) {
        p.hp = p.maxHp;
        p.mental = TUNING.recovery.mental;
        recovered.push({ id: p.id, revived: false });
      } else if (wasBoss) {
        p.alive = true;
        p.hp = Math.max(1, safeFloor(p.maxHp * TUNING.recovery.reviveHpRatio));
        p.mental = TUNING.recovery.reviveMental;
        recovered.push({ id: p.id, revived: true });
      }
      p.statuses = {};
    }
    const events = [{ type: 'party-recovery', recovered, revived: recovered.filter((r) => r.revived).map((r) => r.id) }];
    events.push(...this.startStage(s.runStage + 1));
    return events;
  }

  finishRun() {
    const s = this.state;
    s.phase = PHASES.RUN_OVER;
    const previousBest = this.savedBest;
    const summary = { stage: s.runStage, ...s.stats, endedAt: new Date().toISOString() };
    const save = this.persistBest(s.runStage, summary);
    s.result = { stage: s.runStage, best: save.best, newRecord: s.runStage > previousBest, saved: save.saved, stats: { ...s.stats } };
    return [{ type: 'run-over', ...s.result }];
  }
}

export function snapshot(battle) {
  return JSON.parse(JSON.stringify(battle.state));
}

export { POSITIONS };
