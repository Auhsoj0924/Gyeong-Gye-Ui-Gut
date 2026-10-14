// Startup content validation: every reference must resolve and no tuning value may be negative.
import { CONTENT } from './data.js';

export function validateContent(content = CONTENT) {
  const errors = [];
  const {
    PLAYER_ATTRIBUTES, ENEMY_EMOTIONS, MATCHUP_TABLE, MATCHUP_LEVELS, TARGET_TYPES, STATUSES,
    PARTY, SKILLS, ENEMIES, POSITIONS, JOB_EFFECTS, NORMAL_ENEMY_IDS, BOSS_BY_EMOTION, CLEANSE_ORDER,
  } = content;
  const err = (msg) => errors.push(msg);

  const checkNumbers = (label, record, keys) => {
    for (const key of keys) {
      const value = record[key];
      if (typeof value !== 'number' || Number.isNaN(value)) err(`${label}.${key} is not a number`);
      else if (value < 0) err(`${label}.${key} is negative (${value})`);
    }
  };
  const checkEffects = (label, effects) => {
    if (!Array.isArray(effects)) { err(`${label}.effects missing`); return; }
    for (const effect of effects) {
      if ((effect.type === 'status') && !STATUSES[effect.status]) err(`${label} references unknown status ${effect.status}`);
      for (const key of ['turns', 'power', 'charges', 'hp', 'mental', 'hpPct', 'cleanse', 'multiplier', 'pct']) {
        if (effect[key] !== undefined && (typeof effect[key] !== 'number' || effect[key] < 0)) err(`${label}.${key} invalid`);
      }
    }
  };

  for (const attr of Object.keys(PLAYER_ATTRIBUTES)) {
    for (const emotion of Object.keys(ENEMY_EMOTIONS)) {
      const level = MATCHUP_TABLE[attr]?.[emotion];
      if (!MATCHUP_LEVELS[level]) err(`matchup ${attr}/${emotion} missing`);
    }
  }
  for (const status of CLEANSE_ORDER) if (!STATUSES[status]) err(`cleanse order references ${status}`);

  if (PARTY.length !== 4) err(`party must contain 4 members, found ${PARTY.length}`);
  for (const member of PARTY) {
    const label = `party.${member.id}`;
    if (!POSITIONS[member.position]) err(`${label} unknown position`);
    if (!JOB_EFFECTS[member.job]) err(`${label} unknown job`);
    checkNumbers(label, member, ['maxHp', 'mental', 'shinmyeong']);
    if (member.skills.length !== 3) err(`${label} must have 3 normal skills`);
    const tiers = member.skills.map((id) => SKILLS[id]);
    tiers.forEach((skill, index) => {
      if (!skill) { err(`${label} skill ${member.skills[index]} missing`); return; }
      if (skill.ownerId !== member.id) err(`${skill.id} owner mismatch`);
      if (skill.tier !== index + 1) err(`${skill.id} tier order mismatch`);
      if (skill.fusionOnly) err(`${skill.id} must not be fusion-only`);
    });
    for (let i = 1; i < tiers.length; i += 1) {
      if (tiers[i] && tiers[i - 1] && tiers[i].clashPower <= tiers[i - 1].clashPower) err(`${label} clash power must rise by tier`);
    }
    const fusion = SKILLS[member.fusionSkill];
    if (!fusion) err(`${label} fusion skill missing`);
    else {
      if (!fusion.fusionOnly) err(`${fusion.id} must be fusion-only`);
      const used = new Set(tiers.filter(Boolean).map((s) => s.attribute));
      if (used.has(fusion.attribute) || used.size !== 3) err(`${fusion.id} must use the missing fourth attribute`);
    }
  }
  for (const skill of Object.values(SKILLS)) {
    const label = `skill.${skill.id}`;
    if (!PLAYER_ATTRIBUTES[skill.attribute]) err(`${label} unknown attribute ${skill.attribute}`);
    if (!TARGET_TYPES[skill.targetType]) err(`${label} unknown target type ${skill.targetType}`);
    checkNumbers(label, skill, ['clashPower', 'damage', 'tier']);
    checkEffects(label, skill.effects);
    if (skill.resonance !== undefined && skill.resonance < 0) err(`${label}.resonance negative`);
  }
  for (const [job, def] of Object.entries(JOB_EFFECTS)) checkEffects(`job.${job}`, def.effects);
  for (const enemy of Object.values(ENEMIES)) {
    const label = `enemy.${enemy.id}`;
    if (!ENEMY_EMOTIONS[enemy.emotion]) err(`${label} unknown emotion`);
    if (!POSITIONS[enemy.position]) err(`${label} unknown position`);
    checkNumbers(label, enemy, ['hp', 'damage', 'clashPower', 'mental']);
    checkEffects(`${label}.attack`, enemy.attack?.effects);
    if (enemy.boss) checkEffects(`${label}.bossAction`, enemy.bossAction?.effects);
  }
  for (const id of NORMAL_ENEMY_IDS) if (!ENEMIES[id] || ENEMIES[id].boss) err(`normal enemy ${id} invalid`);
  for (const [emotion, id] of Object.entries(BOSS_BY_EMOTION)) {
    if (!ENEMY_EMOTIONS[emotion]) err(`boss emotion ${emotion} unknown`);
    if (!ENEMIES[id]?.boss) err(`boss ${id} invalid`);
  }

  return {
    ok: errors.length === 0,
    errors,
    counts: {
      players: PARTY.length,
      normalSkills: Object.values(SKILLS).filter((s) => !s.fusionOnly).length,
      fusionSkills: Object.values(SKILLS).filter((s) => s.fusionOnly).length,
      normalEnemies: NORMAL_ENEMY_IDS.length,
      bosses: Object.keys(BOSS_BY_EMOTION).length,
      statuses: Object.keys(STATUSES).length,
    },
  };
}
