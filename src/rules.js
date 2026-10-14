// Pure combat rules. No DOM, no hidden state: randomness always comes from the injected `rng`.
import {
  MATCHUP_LEVELS, MATCHUP_TABLE, POSITIONS, TUNING, ENEMIES, NORMAL_ENEMY_IDS, BOSS_BY_EMOTION, YUT_NAMES,
} from './data.js';
import { randomInt, pickWeighted } from './rng.js';

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Floors a product while ignoring binary floating-point dust (30 × 0.7 must be 21, not 20).
export const safeFloor = (value) => Math.floor(value + 1e-9);

export function yutName(value) {
  return YUT_NAMES[value] ?? '?';
}

export function throwYut(rng) {
  return randomInt(rng, 1, 5);
}

// First roll 1~5; with probability mental/100 roll again and keep the higher value.
export function rollYut(mental, rng, { noReroll = false } = {}) {
  const first = throwYut(rng);
  const chance = noReroll ? 0 : clamp(mental, 0, 100) / 100;
  const rerolled = rng.next() < chance;
  if (!rerolled) return { first, second: null, value: first, rerolled: false };
  const second = throwYut(rng);
  return { first, second, value: Math.max(first, second), rerolled: true };
}

export function getMatchup(attribute, emotion) {
  const levelId = MATCHUP_TABLE[attribute]?.[emotion];
  const level = MATCHUP_LEVELS[levelId];
  if (!level) throw new Error(`Unknown matchup ${attribute} vs ${emotion}`);
  return { level: level.id, label: level.label, icon: level.icon, damage: level.damage, clash: level.clash };
}

// (기본 경합위력 + 윷값) × 경합 상성 배율 - 흐트러짐 감소. Never rounded before comparison.
export function calculateClashValue(skill, yut, matchup, penalty = 0) {
  const multiplier = matchup?.clash ?? 1;
  return (skill.clashPower + yut) * multiplier - penalty;
}

// Runs rounds until one side has `winsNeeded` wins. Ties do not count.
// Each roller returns { yut, value }. Fusion skips the dice entirely.
export function resolveThreeWins(playerRoller, enemyRoller, {
  fusion = false, winsNeeded = TUNING.clashWinsNeeded, maxRounds = TUNING.maxClashRounds,
} = {}) {
  const rounds = [];
  let playerWins = 0;
  let enemyWins = 0;
  if (fusion) {
    for (let i = 0; i < winsNeeded; i += 1) {
      playerWins += 1;
      rounds.push({ player: null, enemy: null, result: 'player', fusion: true, playerWins, enemyWins });
    }
    return { winner: 'player', rounds, playerWins, enemyWins };
  }
  while (playerWins < winsNeeded && enemyWins < winsNeeded && rounds.length < maxRounds) {
    const player = playerRoller();
    const enemy = enemyRoller();
    let result = 'tie';
    if (player.value > enemy.value) { result = 'player'; playerWins += 1; }
    else if (enemy.value > player.value) { result = 'enemy'; enemyWins += 1; }
    rounds.push({ player, enemy, result, playerWins, enemyWins });
  }
  // Safety valve for pathological endless ties: the side ahead wins, the player on a dead heat.
  const winner = playerWins >= enemyWins ? 'player' : 'enemy';
  return { winner, rounds, playerWins, enemyWins };
}

export function calculatePlayerDamage(baseDamage, damageMultiplier, activeMultiplier = 1) {
  return safeFloor(baseDamage * damageMultiplier * activeMultiplier);
}

export function calculateEnemyDamage(baseDamage, attackMultiplier = 1, activeMultiplier = 1) {
  return safeFloor(baseDamage * attackMultiplier * activeMultiplier);
}

export function unopposedMultiplier(isBoss) {
  return isBoss ? TUNING.unopposedMultiplier.boss : TUNING.unopposedMultiplier.normal;
}

// Skill ids are ordered by tier (1스, 2스, 3스).
export function drawSkillPair(skillIds, rng, weights = TUNING.pairWeights) {
  const pick = pickWeighted(rng, weights);
  return pick.tiers.map((tier) => skillIds[tier - 1]);
}

export function drawSingleSlot(skillIds, rng, weights = TUNING.singleSlotWeights) {
  const pick = pickWeighted(rng, weights);
  return skillIds[pick.tier - 1];
}

// candidates: [{ id, position, tankBonus }]. Raw weights per living character, then renormalized.
export function aggroWeights(candidates, bonus = TUNING.tankAggroBonus) {
  const raw = candidates.map((c) => ({
    id: c.id,
    weight: POSITIONS[c.position].aggro + (c.tankBonus ? bonus : 0),
  }));
  const total = raw.reduce((sum, r) => sum + r.weight, 0);
  return raw.map((r) => ({ ...r, chance: total > 0 ? r.weight / total : 0 }));
}

export function selectAggroTarget(candidates, rng, bonus = TUNING.tankAggroBonus) {
  if (candidates.length === 0) return null;
  const weights = aggroWeights(candidates, bonus);
  return pickWeighted(rng, weights).id;
}

// commands: [{ actorId, targetId, seq, ... }]. The highest seq per enemy clashes, earlier ones hit directly.
export function buildEngagements(commands) {
  const byTarget = new Map();
  for (const command of commands) {
    if (!command.targetId) continue;
    if (!byTarget.has(command.targetId)) byTarget.set(command.targetId, []);
    byTarget.get(command.targetId).push(command);
  }
  const clashes = [];
  const directs = [];
  for (const list of byTarget.values()) {
    list.sort((a, b) => a.seq - b.seq);
    clashes.push(list[list.length - 1]);
    directs.push(...list.slice(0, -1));
  }
  clashes.sort((a, b) => a.seq - b.seq);
  directs.sort((a, b) => a.seq - b.seq);
  return { clashes, directs, engagedEnemyIds: new Set(byTarget.keys()) };
}

export function stageScaling(stage, scaling = TUNING.scaling) {
  const block = Math.floor((stage - 1) / 5);
  const offset = (stage - 1) % 5;
  const calc = (s) => s.base + s.perBlock * block + s.perOffset * offset;
  return {
    block,
    offset,
    normalHp: calc(scaling.normalHp),
    normalDamage: calc(scaling.normalDamage),
    bossHp: calc(scaling.bossHp),
    bossDamage: calc(scaling.bossDamage),
  };
}

export function isBossStage(stage) {
  return stage % 5 === 0;
}

export function bossEmotionForStage(stage) {
  const index = (stage / 5 - 1) % TUNING.bossRotation.length;
  return TUNING.bossRotation[index];
}

function scaledEnemy(templateId, hpMultiplier, damageMultiplier) {
  const t = ENEMIES[templateId];
  return {
    templateId,
    boss: t.boss,
    maxHp: Math.round(t.hp * hpMultiplier),
    damage: Math.round(t.damage * damageMultiplier),
    clashPower: t.clashPower,
    mental: t.mental,
  };
}

// Pure stage factory: the stage number (and rng for the roster roll) fully defines the encounter.
export function resolveStageDefinition(stage, rng) {
  const scale = stageScaling(stage);
  const boss = isBossStage(stage);
  const enemies = [];
  let bossEmotion = null;
  if (boss) {
    bossEmotion = bossEmotionForStage(stage);
    enemies.push(scaledEnemy(BOSS_BY_EMOTION[bossEmotion], scale.bossHp, scale.bossDamage));
    const adds = randomInt(rng, TUNING.bossAddCount[0], TUNING.bossAddCount[1]);
    for (let i = 0; i < adds; i += 1) {
      const id = NORMAL_ENEMY_IDS[randomInt(rng, 0, NORMAL_ENEMY_IDS.length - 1)];
      enemies.push(scaledEnemy(id, scale.normalHp, scale.normalDamage));
    }
  } else {
    const count = randomInt(rng, TUNING.normalEnemyCount[0], TUNING.normalEnemyCount[1]);
    for (let i = 0; i < count; i += 1) {
      const id = NORMAL_ENEMY_IDS[randomInt(rng, 0, NORMAL_ENEMY_IDS.length - 1)];
      enemies.push(scaledEnemy(id, scale.normalHp, scale.normalDamage));
    }
  }
  return { stage, type: boss ? 'boss' : 'normal', bossEmotion, scale, enemies };
}

export function isBossActionTurn(turn, every = TUNING.bossActionEvery) {
  return turn > 0 && turn % every === 0;
}

// ---------------------------------------------------------------- speed, multi-hit, win chance

export function rollSpeed([min, max], rng) {
  return randomInt(rng, min, max);
}

// Splits a total into per-hit damage; the last hit carries the remainder unless hits were lost.
export function splitHits(total, hits = 1, lostRounds = 0, rule = TUNING.hits) {
  const count = Math.max(1, hits);
  const kept = Math.max(rule.minimum, count - lostRounds * rule.lostPerLostRound);
  const per = Math.floor(total / count);
  const result = Array.from({ length: Math.min(kept, count) }, () => per);
  if (kept >= count) result[result.length - 1] = total - per * (count - 1);
  return result;
}

// Probability of each yut value 1~5 after the mental-based extra roll.
export function yutDistribution(mental, noReroll = false) {
  const p = noReroll ? 0 : clamp(mental, 0, 100) / 100;
  const cdf = (v) => (v / 5) * ((1 - p) + p * (v / 5));
  return [1, 2, 3, 4, 5].map((v) => cdf(v) - cdf(v - 1));
}

// side: { power, multiplier, penalty, mental, noReroll }. Exact first-to-three probability.
export function clashWinChance(player, enemy, winsNeeded = TUNING.clashWinsNeeded) {
  const pd = yutDistribution(player.mental, player.noReroll);
  const ed = yutDistribution(enemy.mental, enemy.noReroll);
  let win = 0;
  let lose = 0;
  for (let a = 0; a < 5; a += 1) {
    for (let b = 0; b < 5; b += 1) {
      const pv = (player.power + a + 1) * (player.multiplier ?? 1) - (player.penalty ?? 0);
      const ev = (enemy.power + b + 1) * (enemy.multiplier ?? 1) - (enemy.penalty ?? 0);
      const prob = pd[a] * ed[b];
      if (pv > ev + 1e-9) win += prob;
      else if (ev > pv + 1e-9) lose += prob;
    }
  }
  if (win + lose === 0) return 0.5;
  const q = win / (win + lose);
  // P(reach `winsNeeded` wins before the opponent does) = Σ C(n-1+k, k) q^n (1-q)^k
  let total = 0;
  let comb = 1;
  for (let k = 0; k < winsNeeded; k += 1) {
    if (k > 0) comb = (comb * (winsNeeded - 1 + k)) / k;
    total += comb * q ** winsNeeded * (1 - q) ** k;
  }
  return total;
}

export function winGrade(chance, grades = TUNING.winGrades) {
  for (const g of grades) {
    if (g.exclusiveMin ? chance > g.min : chance >= g.min) return { id: g.id, label: g.label };
  }
  const last = grades[grades.length - 1];
  return { id: last.id, label: last.label };
}
