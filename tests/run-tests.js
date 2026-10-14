// Dependency-free test runner for the pure rules and the battle state machine.
// Run from the prototype folder: `node tests/run-tests.js`
import {
  ENEMIES, SKILLS, PARTY, MATCHUP_TABLE, TUNING, PLAYER_ATTRIBUTES, ENEMY_EMOTIONS,
} from '../src/data.js';
import { createRng, createSequenceRng } from '../src/rng.js';
import {
  rollYut, throwYut, getMatchup, calculateClashValue, resolveThreeWins, calculatePlayerDamage,
  calculateEnemyDamage, drawSkillPair, drawSingleSlot, aggroWeights, selectAggroTarget, buildEngagements,
  resolveStageDefinition, stageScaling, isBossStage, unopposedMultiplier,
  splitHits, yutDistribution, clashWinChance, winGrade, rollSpeed,
} from '../src/rules.js';
import { Battle, createMemoryStorage, PHASES } from '../src/battle.js';
import { validateContent } from '../src/validate.js';

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed += 1; } catch (error) { failures.push({ name, error }); }
}
function assert(condition, message = 'assertion failed') { if (!condition) throw new Error(message); }
function eq(actual, expected, message = '') {
  if (actual !== expected) throw new Error(`${message} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function near(actual, expected, tolerance, message = '') {
  if (Math.abs(actual - expected) > tolerance) throw new Error(`${message} expected ≈${expected}±${tolerance}, got ${actual}`);
}
const zeros = () => createSequenceRng([]); // every draw returns 0: yut is always 도(1), pickWeighted picks the first entry
const y = (n) => (n - 1) / 5 + 0.01; // rng value producing yut n

function makeBattle({ seed = 7, options = {}, storage = createMemoryStorage() } = {}) {
  const battle = new Battle({ rng: createRng(seed), storage, options });
  battle.newRun();
  return battle;
}
function setEnemies(battle, ids) {
  battle.state.enemies = ids.map((id, index) => {
    const t = ENEMIES[id];
    return {
      uid: `e${index + 1}`, templateId: id, name: t.name, emotion: t.emotion, position: t.position, boss: t.boss,
      maxHp: t.hp, hp: t.hp, damage: t.damage, clashPower: t.clashPower, mental: t.mental,
      alive: true, statuses: {}, intent: { special: false },
    };
  });
  battle.state.commands = [];
  return battle.state.enemies;
}
function expose(battle, playerId, skillIds) { battle.player(playerId).exposed = [...skillIds]; }
function command(battle, playerId, slotIndex, enemyUid) {
  const result = battle.setCommand(playerId, slotIndex, enemyUid);
  assert(result.ok, `setCommand failed: ${result.reason}`);
  return result.command;
}
const types = (events) => events.map((e) => e.type);

// ------------------------------------------------------------------ 1. content
test('1.2-1.5 content validates with all references resolved', () => {
  const report = validateContent();
  assert(report.ok, report.errors.join('; '));
  eq(report.counts.players, 4);
  eq(report.counts.normalSkills, 12);
  eq(report.counts.fusionSkills, 4);
  eq(report.counts.normalEnemies, 4);
  eq(report.counts.bosses, 4);
});
test('1.3 party records: HP 260/210/190/170, mental 50, shinmyeong 0', () => {
  eq(PARTY.map((p) => p.maxHp).join(','), '260,210,190,170');
  assert(PARTY.every((p) => p.mental === 50 && p.shinmyeong === 0));
  const battle = makeBattle();
  eq(battle.state.players.length, 4);
});
test('1.4 all twelve normal skills target an enemy; 윤초희 damage 14/24/38 with resonance 8/10/15', () => {
  const normal = Object.values(SKILLS).filter((s) => !s.fusionOnly);
  eq(normal.length, 12);
  assert(normal.every((s) => s.targetType === 'enemy-single'));
  eq(['chohui-1', 'chohui-2', 'chohui-3'].map((id) => SKILLS[id].damage).join(','), '14,24,38');
  eq(['chohui-1', 'chohui-2', 'chohui-3'].map((id) => SKILLS[id].resonance).join(','), '8,10,15');
});
test('1.5 validator catches a negative value and a missing ID', () => {
  const bad = JSON.parse(JSON.stringify((await_import_content())));
  bad.ENEMIES['rage-ghost'].hp = -1;
  bad.PARTY[0].skills[0] = 'nope';
  const report = validateContent(bad);
  assert(!report.ok);
  assert(report.errors.some((e) => e.includes('negative')));
  assert(report.errors.some((e) => e.includes('missing')));
});
function await_import_content() {
  return {
    PLAYER_ATTRIBUTES, ENEMY_EMOTIONS, MATCHUP_TABLE, MATCHUP_LEVELS: { overwhelming: {}, effective: {}, neutral: {}, weak: {} },
    TARGET_TYPES: { 'enemy-single': {} }, STATUSES: { wonhon: {}, seal: {}, vulnerable: {}, aekmagi: {}, stagger: {}, bleed: {}, agitation: {}, bind: {}, healCut: {} },
    PARTY, SKILLS, ENEMIES, POSITIONS: { front: {}, middle: {}, back: {} },
    JOB_EFFECTS: { aekmagi: { effects: [] }, kalchum: { effects: [] }, salpuri: { effects: [] }, bujeok: { effects: [] } },
    NORMAL_ENEMY_IDS: ['rage-ghost', 'anxiety-ghost', 'obsession-goblin', 'despair-corpse'],
    BOSS_BY_EMOTION: { rage: 'rage-boss', anxiety: 'anxiety-boss', obsession: 'obsession-boss', despair: 'despair-boss' },
    CLEANSE_ORDER: ['bleed'],
  };
}

// ------------------------------------------------------------------ 2. pure rules
test('2.1 yut values stay within 1~5 for seeded rngs', () => {
  for (const seed of [1, 2, 3, 42, 999]) {
    const rng = createRng(seed);
    const seen = new Set();
    for (let i = 0; i < 2000; i += 1) {
      const v = throwYut(rng);
      assert(v >= 1 && v <= 5 && Number.isInteger(v), `bad yut ${v}`);
      seen.add(v);
    }
    eq(seen.size, 5, 'all five yut values appear');
  }
});
test('2.2 mental 0 never rerolls, 100 always rerolls, reroll keeps the higher value', () => {
  const rng = createRng(5);
  for (let i = 0; i < 500; i += 1) {
    assert(!rollYut(0, rng).rerolled);
    const r = rollYut(100, rng);
    assert(r.rerolled && r.value === Math.max(r.first, r.second));
  }
  const fixed = rollYut(50, createSequenceRng([y(2), 0.49, y(5)]));
  assert(fixed.rerolled && fixed.value === 5);
  const noReroll = rollYut(50, createSequenceRng([y(2), 0.5]));
  assert(!noReroll.rerolled && noReroll.value === 2);
  const blocked = rollYut(100, createSequenceRng([y(1), 0, y(5)]), { noReroll: true });
  assert(!blocked.rerolled && blocked.value === 1, 'agitation blocks reroll');
  let rerolls = 0;
  const r50 = createRng(11);
  for (let i = 0; i < 20000; i += 1) if (rollYut(50, r50).rerolled) rerolls += 1;
  near(rerolls / 20000, 0.5, 0.02, 'mental 50 reroll rate');
});
test('2.3 all sixteen matchup cells return documented label and multipliers', () => {
  const expected = {
    calm: ['압도적인', '효과적인', '일반적인', '약화된'],
    courage: ['일반적인', '압도적인', '약화된', '효과적인'],
    haewon: ['효과적인', '약화된', '압도적인', '일반적인'],
    hope: ['약화된', '일반적인', '효과적인', '압도적인'],
  };
  const mult = { 압도적인: [2.0, 1.2], 효과적인: [1.5, 1.1], 일반적인: [1.0, 1.0], 약화된: [0.5, 0.9] };
  let cells = 0;
  for (const [attr, labels] of Object.entries(expected)) {
    ['rage', 'anxiety', 'obsession', 'despair'].forEach((emotion, i) => {
      const m = getMatchup(attr, emotion);
      eq(m.label, labels[i], `${attr}/${emotion}`);
      eq(m.damage, mult[m.label][0]);
      eq(m.clash, mult[m.label][1]);
      cells += 1;
    });
  }
  eq(cells, 16);
});
test('2.4 clash value (4 + 3) × 1.10 = 7.70 without premature rounding', () => {
  const value = calculateClashValue({ clashPower: 4 }, 3, { clash: 1.1 });
  near(value, 7.7, 1e-9);
  eq(value.toFixed(1), '7.7');
  near(calculateClashValue({ clashPower: 4 }, 3, { clash: 1.1 }) - calculateClashValue({ clashPower: 3 }, 3, { clash: 1.1 }), 1.1, 1e-9, 'power difference');
  eq(calculateClashValue({ clashPower: 4 }, 3, { clash: 1 }, 1), 6, 'stagger penalty -1');
});
test('2.5 first-to-three: 3-0, 3-1, 3-2, ties excluded, fusion auto-win', () => {
  const script = (results) => {
    let i = 0;
    const p = () => ({ value: results[i] === 'P' ? 9 : results[i] === 'T' ? 5 : 1 });
    const e = () => { const r = results[i]; i += 1; return { value: r === 'E' ? 9 : 5 - (r === 'T' ? 0 : 0) }; };
    return [p, e];
  };
  const run = (seq) => resolveThreeWins(...script(seq));
  let r = run('PPP'); eq(r.winner, 'player'); eq(`${r.playerWins}-${r.enemyWins}`, '3-0');
  r = run('PEPP'); eq(r.winner, 'player'); eq(`${r.playerWins}-${r.enemyWins}`, '3-1');
  r = run('EPEPE'); eq(r.winner, 'enemy'); eq(`${r.playerWins}-${r.enemyWins}`, '2-3');
  r = run('TTPTTEPTP'); eq(r.winner, 'player'); eq(r.rounds.filter((x) => x.result === 'tie').length, 5); eq(r.enemyWins, 1);
  r = resolveThreeWins(() => { throw new Error('no dice for fusion'); }, () => ({}), { fusion: true });
  eq(r.winner, 'player'); eq(r.rounds.length, 3); assert(r.rounds.every((x) => x.fusion));
});
test('2.6 damage formulas; clash affinity never changes the damage multiplier', () => {
  eq(calculatePlayerDamage(38, 1.5), 57);
  eq(calculatePlayerDamage(30, 0.5), 15);
  eq(calculateEnemyDamage(28, unopposedMultiplier(false)), 35);
  eq(calculateEnemyDamage(42, unopposedMultiplier(true)), 63);
  eq(calculateEnemyDamage(30, 1, 0.7), 21, 'float dust floored correctly');
  const m = getMatchup('calm', 'rage');
  eq(m.clash, 1.2); eq(m.damage, 2.0);
  eq(calculatePlayerDamage(SKILLS['hando-1'].damage, m.damage), 36);
});
test('2.7 statuses: wonhon ticks twice then expires; refresh does not stack', () => {
  const b = makeBattle();
  const [e] = setEnemies(b, ['obsession-goblin']);
  const events = [];
  b.addStatus(e, 'wonhon', { turns: 2, power: 8 }, events);
  b.addStatus(e, 'wonhon', { turns: 2, power: 8 }, events);
  eq(e.statuses.wonhon.turns, 2, 'refresh, no stacking');
  b.endTurnUpdates(events); eq(e.hp, 172);
  b.endTurnUpdates(events); eq(e.hp, 164);
  assert(!e.statuses.wonhon, 'expired after second turn');
  b.endTurnUpdates(events); eq(e.hp, 164, 'no damage after expiry');
});
test('2.7 statuses: delayed statuses survive the applying turn and last through the next', () => {
  const b = makeBattle();
  const p = b.player('mugyeom');
  const events = [];
  b.addStatus(p, 'agitation', { turns: 1, mental: 15 }, events);
  eq(p.mental, 35, 'agitation costs 15 mental immediately');
  b.endTurnUpdates(events);
  assert(p.statuses.agitation, 'still active during next turn');
  b.endTurnUpdates(events);
  assert(!p.statuses.agitation, 'expired after next turn');
  b.addStatus(p, 'bleed', { turns: 2, power: 6 }, events);
  b.endTurnUpdates(events); b.endTurnUpdates(events); b.endTurnUpdates(events);
  eq(p.hp, 210 - 12, 'bleed 6 × 2');
});
test('2.7 statuses: healCut halves healing; seal/vulnerable/stagger consumed exactly once', () => {
  const b = makeBattle();
  b.rng = zeros();
  const p = b.player('hando');
  p.hp = 100;
  const events = [];
  b.addStatus(p, 'healCut', { turns: 2 }, events);
  eq(b.healPlayer(p, { hp: 36 }, events).hp, 18);
  const [e1, e2] = setEnemies(b, ['rage-ghost', 'anxiety-ghost']);
  b.addStatus(e1, 'seal', { charges: 1 }, events);
  b.addStatus(e1, 'seal', { charges: 1 }, events);
  eq(e1.statuses.seal.charges, 2, 'seal charges add up to 2');
  b.addStatus(e1, 'seal', { charges: 1 }, events);
  eq(e1.statuses.seal.charges, 2, 'seal capped at 2');
  b.addStatus(e2, 'vulnerable', { charges: 1, multiplier: 1.25 }, events);
  const ev2 = [];
  b.landPlayerAttack(b.player('mugyeom'), SKILLS['mugyeom-1'], e2, ev2, 'direct');
  eq(ev2.find((x) => x.type === 'attack-result').total, Math.floor(24 * 2.0 * 1.25), 'vulnerable applied (courage vs anxiety = 2.0)');
  assert(!e2.statuses.vulnerable, 'vulnerable consumed');
  const ev3 = [];
  b.landPlayerAttack(b.player('mugyeom'), SKILLS['mugyeom-1'], e2, ev3, 'direct');
  eq(ev3.find((x) => x.type === 'attack-result').total, 48, 'second hit has no vulnerable bonus');
});

// ------------------------------------------------------------------ 3. commands & engagements
test('3.1 skill pair distribution follows 65/25/10', () => {
  const rng = createRng(2024);
  const ids = ['s1', 's2', 's3'];
  const counts = { 's1,s2': 0, 's1,s3': 0, 's2,s3': 0 };
  const n = 30000;
  for (let i = 0; i < n; i += 1) counts[drawSkillPair(ids, rng).join(',')] += 1;
  near(counts['s1,s2'] / n, 0.65, 0.015);
  near(counts['s1,s3'] / n, 0.25, 0.015);
  near(counts['s2,s3'] / n, 0.10, 0.015);
  const single = { s1: 0, s2: 0, s3: 0 };
  for (let i = 0; i < n; i += 1) single[drawSingleSlot(ids, rng)] += 1;
  near(single.s1 / n, 0.6, 0.015); near(single.s2 / n, 0.3, 0.015); near(single.s3 / n, 0.1, 0.015);
});
test('3.1 every living player gets two distinct exposed skills; unused skills are redrawn', () => {
  const b = makeBattle({ seed: 3 });
  for (const p of b.state.players) {
    eq(p.exposed.length, 2);
    assert(p.exposed[0] !== p.exposed[1]);
    assert(SKILLS[p.exposed[0]].tier < SKILLS[p.exposed[1]].tier);
  }
});
test('3.2 one command per character; selection sequence increases monotonically', () => {
  const b = makeBattle();
  setEnemies(b, ['rage-ghost', 'anxiety-ghost']);
  const c1 = command(b, 'hando', 0, 'e1');
  const c2 = command(b, 'mugyeom', 0, 'e1');
  const c3 = command(b, 'hando', 1, 'e2');
  assert(c1.seq < c2.seq && c2.seq < c3.seq);
  eq(b.state.commands.filter((c) => c.actorId === 'hando').length, 1);
  eq(b.commandFor('hando').targetId, 'e2');
});
test('3.3 last selection clashes, earlier same-target selection hits directly (한도윤→강무겸)', () => {
  const b = makeBattle();
  setEnemies(b, ['obsession-goblin']);
  command(b, 'hando', 0, 'e1');
  command(b, 'mugyeom', 0, 'e1');
  const roles = b.commandRoles();
  eq(roles.mugyeom, 'clash');
  eq(roles.hando, 'direct');
  const { clashes, directs } = buildEngagements(b.state.commands);
  eq(clashes.length, 1); eq(clashes[0].actorId, 'mugyeom');
  eq(directs.length, 1); eq(directs[0].actorId, 'hando');
});
test('3.4 clashes resolve before direct attacks, so an earlier direct hit cannot steal the clash', () => {
  const b = makeBattle();
  b.rng = zeros();
  const [e, spare] = setEnemies(b, ['obsession-goblin', 'obsession-goblin']);
  e.hp = 10; e.clashPower = 0; spare.hp = 9999;
  command(b, 'hando', 0, 'e1');
  command(b, 'mugyeom', 0, 'e1');
  const events = b.resolveTurn();
  const clashIndex = events.findIndex((x) => x.type === 'clash-start' && x.actorId === 'mugyeom');
  assert(clashIndex >= 0, 'mugyeom clashed');
  const cancel = events.find((x) => x.type === 'command-canceled' && x.actorId === 'hando');
  assert(cancel && cancel.reason === 'dead-target', 'later direct attack on a dead enemy is canceled');
  assert(clashIndex < events.indexOf(cancel), 'clash resolved first');
});
test('3.5 윤초희 heals on clash win and on direct hit; a lost clash applies neither damage nor heal', () => {
  // clash win
  let b = makeBattle(); b.rng = zeros();
  let [e] = setEnemies(b, ['obsession-goblin', 'obsession-goblin']);
  e.clashPower = 0;
  b.player('hando').hp = 100;
  expose(b, 'chohui', ['chohui-1', 'chohui-2']);
  command(b, 'chohui', 0, 'e1');
  let events = b.resolveTurn();
  assert(events.some((x) => x.type === 'healing-effect' && x.unitId === 'hando' && x.sourceId === 'chohui'));
  assert(events.some((x) => x.type === 'clash-hit' && x.actorId === 'chohui' && x.amount > 0));
  // direct hit
  b = makeBattle(); b.rng = zeros();
  [e] = setEnemies(b, ['obsession-goblin', 'obsession-goblin']);
  e.clashPower = 0;
  b.player('yujin').hp = 50;
  expose(b, 'chohui', ['chohui-1', 'chohui-2']);
  command(b, 'chohui', 0, 'e1');
  command(b, 'mugyeom', 0, 'e1');
  events = b.resolveTurn();
  assert(events.some((x) => x.type === 'direct-hit' && x.actorId === 'chohui'));
  assert(events.some((x) => x.type === 'healing-effect' && x.unitId === 'yujin' && x.sourceId === 'chohui'));
  // clash loss
  b = makeBattle(); b.rng = zeros();
  [e] = setEnemies(b, ['obsession-goblin', 'obsession-goblin']);
  e.clashPower = 50;
  b.player('yujin').hp = 50;
  expose(b, 'chohui', ['chohui-1', 'chohui-2']);
  command(b, 'chohui', 0, 'e1');
  events = b.resolveTurn();
  assert(!events.some((x) => x.sourceId === 'chohui' && x.type === 'healing-effect'), 'no heal after loss');
  assert(!events.some((x) => x.actorId === 'chohui' && (x.type === 'clash-hit' || x.type === 'direct-hit')), 'no damage after loss');
});
test('3.6 invalid commands: dead owner, dead/missing target, duplicates, unexposed skill are canceled safely', () => {
  const b = makeBattle(); b.rng = zeros();
  const [e1, e2] = setEnemies(b, ['obsession-goblin', 'obsession-goblin', 'obsession-goblin']);
  e1.clashPower = 0; e2.clashPower = 0;
  command(b, 'hando', 0, 'e1');
  command(b, 'mugyeom', 0, 'e2');
  command(b, 'chohui', 0, 'e1');
  b.state.commands.push({ actorId: 'mugyeom', slotIndex: 0, skillId: b.player('mugyeom').exposed[0], targetId: 'e1', seq: 0 });
  b.state.commands.push({ actorId: 'yujin', slotIndex: 0, skillId: 'yujin-3-fake', targetId: 'e2', seq: 99 });
  b.player('chohui').alive = false; b.player('chohui').hp = 0;
  b.state.commands.push({ actorId: 'ghost', slotIndex: 0, skillId: 'x', targetId: 'e1', seq: 100 });
  const events = b.resolveTurn();
  const cancels = events.filter((x) => x.type === 'command-canceled').map((x) => `${x.actorId}:${x.reason}`);
  assert(cancels.includes('chohui:dead-actor'), cancels.join());
  assert(cancels.includes('yujin:skill-not-exposed'), cancels.join());
  assert(cancels.includes('ghost:missing-actor'), cancels.join());
  assert(cancels.some((c) => c.startsWith('mugyeom:duplicate')), cancels.join());
  assert(events.some((x) => x.type === 'clash-start' && x.actorId === 'hando'), 'valid commands still resolve');
  const b2 = makeBattle();
  setEnemies(b2, ['rage-ghost']);
  b2.state.enemies[0].alive = false;
  assert(!b2.setCommand('hando', 0, 'e1').ok, 'dead target rejected');
  assert(!b2.setCommand('hando', 0, 'nope').ok, 'missing target rejected');
});
test('3.6 last selector dying before its clash cancels the clash; earlier selector hits directly', () => {
  const b = makeBattle(); b.rng = zeros();
  const [a, bEnemy] = setEnemies(b, ['rage-ghost', 'obsession-goblin']);
  a.clashPower = 50; a.damage = 1000;
  bEnemy.clashPower = 0;
  const hando = b.player('hando');
  hando.hp = 10;
  b.addStatus(hando, 'aekmagi', { charges: 1, multiplier: 0.7 }, []);
  command(b, 'yujin', 0, 'e2');
  command(b, 'mugyeom', 0, 'e1');
  command(b, 'hando', 0, 'e2');
  const events = b.resolveTurn();
  assert(events.some((x) => x.type === 'aekmagi-redirect'));
  assert(!hando.alive, 'hando died from redirected damage');
  assert(events.some((x) => x.type === 'command-canceled' && x.actorId === 'hando' && x.reason === 'dead-before-clash'));
  assert(events.some((x) => x.type === 'direct-hit' && x.actorId === 'yujin' && x.targetId === 'e2'));
  assert(!events.some((x) => x.type === 'enemy-unopposed-start' && x.enemyId === 'e2'), 'engaged enemy does not attack unopposed');
});

// ------------------------------------------------------------------ 4. unopposed enemies & updates
test('4.1 aggro weights 50/35/15 per living character, renormalized', () => {
  const candidates = [
    { id: 'hando', position: 'front' }, { id: 'mugyeom', position: 'middle' },
    { id: 'chohui', position: 'middle' }, { id: 'yujin', position: 'back' },
  ];
  const w = aggroWeights(candidates);
  near(w[0].chance, 50 / 135, 1e-9);
  near(w[3].chance, 15 / 135, 1e-9);
  const rng = createRng(77);
  const counts = { hando: 0, mugyeom: 0, chohui: 0, yujin: 0 };
  const n = 27000;
  for (let i = 0; i < n; i += 1) counts[selectAggroTarget(candidates, rng)] += 1;
  near(counts.hando / n, 50 / 135, 0.015);
  near(counts.yujin / n, 15 / 135, 0.015);
  const w2 = aggroWeights([{ id: 'mugyeom', position: 'middle' }, { id: 'yujin', position: 'back' }]);
  near(w2[0].chance, 35 / 50, 1e-9, 'renormalized after deaths');
});
test('4.2 tank bonus only while 한도윤 is alive with an 액막이 charge (50 → 70)', () => {
  const b = makeBattle();
  eq(b.aggroPreview().find((x) => x.id === 'hando').weight, 50);
  b.addStatus(b.player('hando'), 'aekmagi', { charges: 1, multiplier: 0.7 }, []);
  const w = b.aggroPreview();
  eq(w.find((x) => x.id === 'hando').weight, 70);
  near(w.find((x) => x.id === 'hando').chance, 70 / 155, 1e-9);
  b.player('hando').alive = false;
  assert(!b.aggroPreview().some((x) => x.id === 'hando'));
});
test('4.3 액막이 redirects ×0.7 and consumes one charge; a hit on 한도윤 keeps the charge', () => {
  const b = makeBattle();
  const [e] = setEnemies(b, ['rage-ghost']);
  const hando = b.player('hando');
  b.addStatus(hando, 'aekmagi', { charges: 1, multiplier: 0.7 }, []);
  let events = [];
  b.landEnemyAttack(e, hando, { name: 't', effects: [], special: false }, 30, events, { unopposed: false });
  eq(hando.statuses.aekmagi.charges, 1, 'own hit keeps charge');
  eq(hando.hp, 230);
  events = [];
  b.landEnemyAttack(e, b.player('yujin'), { name: 't', effects: [], special: false }, 30, events, { unopposed: false });
  eq(hando.hp, 230 - 21, 'redirected ×0.7');
  eq(b.player('yujin').hp, 170);
  assert(!hando.statuses.aekmagi, 'charge consumed');
});
test('4.4 unopposed ×1.25 / boss ×1.50 with guaranteed debuff; engaged enemies never attack unopposed', () => {
  const b = makeBattle(); b.rng = zeros();
  const [ghost, goblin] = setEnemies(b, ['rage-ghost', 'obsession-goblin']);
  goblin.clashPower = 0;
  for (const p of b.state.players) command(b, p.id, 0, 'e2');
  let events = b.resolveTurn();
  const hit = events.find((x) => x.type === 'attack-result' && x.enemyId === 'e1' && x.kind === 'unopposed');
  eq(hit.planned, 35, '28 × 1.25');
  eq(hit.hits.length, 2, 'enemy attacks hit twice');
  assert(events.some((x) => x.type === 'status-applied' && x.status === 'bleed' && x.unitId === hit.targetId), 'bleed applied');
  assert(events.some((x) => x.type === 'mental-change' && x.unitId === hit.targetId && x.delta === -10));
  assert(!events.some((x) => x.type === 'enemy-unopposed-start' && x.enemyId === 'e2'), 'selected enemy did not attack unopposed');
  const b2 = makeBattle(); b2.rng = zeros();
  const [boss, add] = setEnemies(b2, ['rage-boss', 'obsession-goblin']);
  add.clashPower = 0;
  for (const p of b2.state.players) command(b2, p.id, 0, 'e2');
  events = b2.resolveTurn();
  eq(events.find((x) => x.type === 'attack-result' && x.enemyId === 'e1').planned, 63, '42 × 1.50');
  void ghost; void boss;
});
test('4.5 boss signature action replaces the basic attack every third enemy phase', () => {
  const b = makeBattle(); b.rng = zeros();
  const [boss, add] = setEnemies(b, ['rage-boss', 'obsession-goblin']);
  add.hp = 9999; add.maxHp = 9999; add.clashPower = 0;
  boss.hp = 9999; boss.maxHp = 9999;
  const specials = [];
  for (let turn = 1; turn <= 6; turn += 1) {
    eq(b.state.turn, turn);
    for (const p of b.alivePlayers()) { p.hp = p.maxHp; command(b, p.id, 0, 'e2'); }
    const events = b.resolveTurn();
    const start = events.find((x) => x.type === 'enemy-unopposed-start' && x.enemyId === 'e1');
    if (start.special) specials.push(turn);
    for (const p of b.state.players) { p.alive = true; p.hp = p.maxHp; p.statuses = {}; }
  }
  eq(specials.join(','), '3,6');
  // selected boss clashes with its signature action
  const b2 = makeBattle(); b2.rng = zeros();
  const [boss2] = setEnemies(b2, ['rage-boss']);
  boss2.clashPower = 50;
  b2.state.turn = 3; boss2.intent = { special: true };
  command(b2, 'mugyeom', 0, 'e1');
  const events = b2.resolveTurn();
  const clash = events.find((x) => x.type === 'clash-start');
  assert(clash.special && clash.actionName === '분노 폭발');
  assert(events.some((x) => x.type === 'status-applied' && x.status === 'bleed' && x.power === 8), 'signature effect applied on clash win');
  eq(events.filter((x) => x.type === 'enemy-unopposed-start').length, 0);
});
test('4.6 mental and shinmyeong stay clamped to 0~100; HP and mental tracked separately', () => {
  const b = makeBattle();
  const p = b.player('yujin');
  const events = [];
  b.changeMental(p, -500, events); eq(p.mental, 0);
  b.changeMental(p, 500, events); eq(p.mental, 100);
  b.changeShinmyeong(p, 500, events); eq(p.shinmyeong, 100);
  b.changeShinmyeong(p, -500, events); eq(p.shinmyeong, 0);
  eq(p.hp, 170, 'mental changes never touch HP');
});
test('4.6 clash win/loss update mental (+3/-8) and shinmyeong (+20/+8); direct hit +5', () => {
  let b = makeBattle(); b.rng = zeros();
  let [e] = setEnemies(b, ['obsession-goblin', 'obsession-goblin']);
  e.clashPower = 0;
  command(b, 'hando', 0, 'e1');
  command(b, 'mugyeom', 0, 'e1');
  let events = b.resolveTurn();
  assert(events.some((x) => x.type === 'mental-change' && x.unitId === 'mugyeom' && x.delta === 3));
  assert(events.some((x) => x.type === 'shinmyeong-change' && x.unitId === 'mugyeom' && x.delta === 20));
  assert(events.some((x) => x.type === 'shinmyeong-change' && x.unitId === 'hando' && x.delta === 5 && x.reason === 'direct-hit'));
  b = makeBattle(); b.rng = zeros();
  [e] = setEnemies(b, ['obsession-goblin', 'obsession-goblin']);
  e.clashPower = 50;
  command(b, 'mugyeom', 0, 'e1');
  events = b.resolveTurn();
  assert(events.some((x) => x.type === 'mental-change' && x.unitId === 'mugyeom' && x.delta === -8));
  assert(events.some((x) => x.type === 'shinmyeong-change' && x.unitId === 'mugyeom' && x.delta === 8));
  assert(b.player('mugyeom').statuses.stagger, 'loser is staggered');
});

// ------------------------------------------------------------------ 5. party & fusion
test('5.2 job effects trigger only after a final clash win', () => {
  const check = (playerId, assertFn) => {
    const b = makeBattle(); b.rng = zeros();
    const [e] = setEnemies(b, ['obsession-goblin', 'obsession-goblin']);
    e.clashPower = 0; e.hp = 9999; e.maxHp = 9999;
    b.player('yujin').hp = 60;
    expose(b, playerId, [PARTY.find((p) => p.id === playerId).skills[0], PARTY.find((p) => p.id === playerId).skills[1]]);
    command(b, playerId, 0, 'e1');
    const events = b.resolveTurn();
    assert(events.some((x) => x.type === 'job-effect' && x.actorId === playerId), `${playerId} job effect`);
    assertFn(b, events, e);
  };
  check('hando', (b) => eq(b.player('hando').statuses.aekmagi.charges, 1));
  check('mugyeom', (b, ev, e) => assert(e.statuses.wonhon || ev.some((x) => x.type === 'dot-tick' && x.status === 'wonhon')));
  check('chohui', (b, ev) => assert(ev.some((x) => x.type === 'healing-effect' && x.unitId === 'yujin')));
  check('yujin', (b, ev) => assert(ev.some((x) => x.type === 'status-applied' && x.status === 'seal')));
  // no job effect on a direct hit
  const b = makeBattle(); b.rng = zeros();
  const [e] = setEnemies(b, ['obsession-goblin', 'obsession-goblin']);
  e.clashPower = 0; e.hp = 9999;
  command(b, 'hando', 0, 'e1');
  command(b, 'mugyeom', 0, 'e1');
  const events = b.resolveTurn();
  assert(!events.some((x) => x.type === 'job-effect' && x.actorId === 'hando'), 'direct hit has no job effect');
});
test('5.3 살풀이 공명 +8/+10/+15 once per command, none for zero-effect hits or for the job effect', () => {
  const run = (skillId, prep) => {
    const b = makeBattle(); b.rng = zeros();
    const [e] = setEnemies(b, ['obsession-goblin', 'obsession-goblin']);
    e.clashPower = 0; e.hp = 9999;
    const ch = b.player('chohui');
    const skills = PARTY.find((p) => p.id === 'chohui').skills;
    const slot = skills.indexOf(skillId) === 2 ? 1 : 0;
    expose(b, 'chohui', slot === 1 ? [skills[0], skillId] : [skillId, skills[2]]);
    prep(b);
    command(b, 'chohui', slot, 'e1');
    const events = b.resolveTurn();
    return { b, events, resonance: events.filter((x) => x.type === 'resonance'), gauge: ch.shinmyeong };
  };
  let r = run('chohui-1', (b) => { b.player('hando').hp = 100; });
  eq(r.resonance.length, 1); eq(r.resonance[0].amount, 8);
  eq(r.gauge, 8 + 20, 'resonance + clash win');
  r = run('chohui-2', (b) => { b.player('hando').hp = 100; });
  eq(r.resonance[0].amount, 10);
  r = run('chohui-3', (b) => { b.player('hando').hp = 100; b.player('yujin').hp = 100; });
  eq(r.resonance.length, 1, 'multi-target heal pays once'); eq(r.resonance[0].amount, 15);
  r = run('chohui-1', () => {});
  eq(r.resonance.length, 0, 'full HP: no resonance');
  r = run('chohui-3', (b) => { b.addStatus(b.player('yujin'), 'bind', { turns: 1 }, []); });
  eq(r.resonance.length, 1, 'cleanse alone triggers 바리의 길 resonance');
  r = run('chohui-1', (b) => { b.player('chohui').shinmyeong = 95; b.player('hando').hp = 10; });
  eq(r.gauge, 100, 'capped at 100');
});
test('5.4 fusion eligibility: gauge 100 and alive only; ineligible presses change nothing', () => {
  const b = makeBattle();
  const p = b.player('mugyeom');
  const before = [...p.exposed];
  p.shinmyeong = 99;
  assert(!b.canFuse('mugyeom'));
  assert(!b.equipFusion('mugyeom', 0).ok);
  eq(p.exposed.join(), before.join());
  eq(p.shinmyeong, 99);
  p.shinmyeong = 100; p.alive = false;
  assert(!b.canFuse('mugyeom'));
  p.alive = true;
  assert(b.canFuse('mugyeom'));
});
test('5.5 fusion replaces only the chosen slot', () => {
  const b = makeBattle();
  const p = b.player('yujin');
  p.shinmyeong = 100;
  const other = p.exposed[0];
  const res = b.equipFusion('yujin', 1);
  assert(res.ok); eq(res.event.type, 'guardian-fusion');
  eq(p.exposed[1], 'yujin-f');
  eq(p.exposed[0], other);
});
test('5.6 pending fusion survives turns and stage clears; only the other slot redraws at 60/30/10', () => {
  const b = makeBattle({ seed: 9 });
  b.rng = createRng(31);
  const [e, e2] = setEnemies(b, ['obsession-goblin', 'obsession-goblin']);
  e.hp = 99999; e.maxHp = 99999; e.clashPower = 0;
  e2.hp = 99999; e2.maxHp = 99999; e2.clashPower = 0;
  const p = b.player('hando');
  p.shinmyeong = 100;
  b.equipFusion('hando', 0);
  const counts = { 'hando-1': 0, 'hando-2': 0, 'hando-3': 0 };
  for (let i = 0; i < 400; i += 1) {
    for (const q of b.state.players) { q.alive = true; q.hp = q.maxHp; q.statuses = {}; }
    for (const q of b.alivePlayers()) if (q.id !== 'hando') command(b, q.id, 0, 'e2');
    b.resolveTurn();
    if (b.state.phase !== PHASES.PLAYER_COMMANDS) break;
    eq(p.exposed[0], 'hando-f', 'fusion slot kept');
    counts[p.exposed[1]] += 1;
  }
  near(counts['hando-1'] / 400, 0.6, 0.08);
  near(counts['hando-3'] / 400, 0.1, 0.05);
  // stage clear keeps the slot
  b.state.enemies.forEach((x) => { x.alive = false; x.hp = 0; });
  b.state.phase = PHASES.STAGE_CLEAR;
  b.advanceStage();
  eq(b.player('hando').exposed[0], 'hando-f', 'slot survives stage transition');
  assert(b.player('hando').pendingFusion);
});
test('5.7 fusion: guaranteed 3-0 win, fourth attribute, enhanced effect, gauge reset, slot removed, normal redraw', () => {
  for (const member of PARTY) {
    const b = makeBattle(); b.rng = zeros();
    const [e] = setEnemies(b, ['obsession-goblin', 'obsession-goblin']);
    e.clashPower = 999; e.hp = 99999; e.maxHp = 99999;
    const p = b.player(member.id);
    p.shinmyeong = 100;
    b.player('hando').hp = 100;
    b.equipFusion(member.id, 0);
    command(b, member.id, 0, 'e1');
    const events = b.resolveTurn();
    const final = events.find((x) => x.type === 'clash-final-win');
    eq(final.winner, 'player', `${member.id} fusion wins`);
    eq(`${final.playerWins}-${final.enemyWins}`, '3-0');
    assert(events.some((x) => x.type === 'guardian-fusion' && x.phase === 'attack'));
    const fusion = SKILLS[member.fusionSkill];
    const normalAttrs = new Set(member.skills.map((id) => SKILLS[id].attribute));
    assert(!normalAttrs.has(fusion.attribute), 'fourth attribute');
    const hit = events.find((x) => x.type === 'attack-result' && x.side === 'player');
    eq(hit.total, calculatePlayerDamage(fusion.damage, getMatchup(fusion.attribute, 'obsession').damage));
    eq(hit.hits.length, 4, 'fusion hits four times');
    assert(!events.some((x) => x.type === 'job-effect'), 'enhanced effect replaces the normal job effect');
    eq(p.shinmyeong, 0);
    eq(p.pendingFusion, null);
    assert(!p.exposed.includes(member.fusionSkill), 'normal skills redrawn next turn');
    eq(p.exposed.length, 2);
  }
  const b = makeBattle(); b.rng = zeros();
  const [e] = setEnemies(b, ['obsession-goblin', 'obsession-goblin']);
  e.hp = 99999;
  b.player('hando').shinmyeong = 100;
  b.equipFusion('hando', 0);
  command(b, 'hando', 0, 'e1');
  b.resolveTurn();
  eq(b.player('hando').statuses.aekmagi.charges, 2, 'hando fusion gives 2 charges');
  eq(b.player('hando').statuses.aekmagi.multiplier, 0.5);
});

// ------------------------------------------------------------------ 6. stages
test('6.1 stage factory: 1 & 6 normal (3~4), 5 & 10 boss + 1~2 adds with emotion rotation', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    for (const stage of [1, 6]) {
      const def = resolveStageDefinition(stage, createRng(seed));
      eq(def.type, 'normal');
      assert(def.enemies.length >= 3 && def.enemies.length <= 4);
      assert(def.enemies.every((e) => !e.boss));
    }
    const s5 = resolveStageDefinition(5, createRng(seed));
    eq(s5.type, 'boss'); eq(s5.enemies[0].templateId, 'rage-boss');
    assert(s5.enemies.length >= 2 && s5.enemies.length <= 3);
    eq(s5.enemies.filter((e) => e.boss).length, 1);
    eq(resolveStageDefinition(10, createRng(seed)).enemies[0].templateId, 'anxiety-boss');
  }
  eq(resolveStageDefinition(15, createRng(1)).bossEmotion, 'obsession');
  eq(resolveStageDefinition(20, createRng(1)).bossEmotion, 'despair');
  eq(resolveStageDefinition(25, createRng(1)).bossEmotion, 'rage');
  assert(isBossStage(5) && !isBossStage(6));
});
test('6.2 scaling: later blocks stronger, clash power and mental unchanged, base data untouched', () => {
  const s1 = stageScaling(1); const s6 = stageScaling(6); const s5 = stageScaling(5); const s10 = stageScaling(10);
  eq(s1.normalHp, 1); near(s6.normalHp, 1.18, 1e-9); near(s5.normalHp, 1.12, 1e-9);
  near(s6.normalDamage, 1.12, 1e-9);
  near(s5.bossHp, 1.5, 1e-9); near(s10.bossHp, 1.75, 1e-9);
  near(s5.bossDamage, 1.2, 1e-9); near(s10.bossDamage, 1.35, 1e-9);
  const early = resolveStageDefinition(2, createSequenceRng([0, 0, 0, 0, 0]));
  const late = resolveStageDefinition(7, createSequenceRng([0, 0, 0, 0, 0]));
  assert(late.enemies[0].maxHp > early.enemies[0].maxHp && late.enemies[0].damage > early.enemies[0].damage);
  eq(late.enemies[0].clashPower, early.enemies[0].clashPower);
  eq(late.enemies[0].mental, early.enemies[0].mental);
  const boss5 = resolveStageDefinition(5, createRng(1)).enemies[0];
  const boss10 = resolveStageDefinition(10, createRng(1)).enemies[0];
  eq(boss5.maxHp, 1080); eq(boss5.damage, Math.round(42 * 1.2));
  assert(boss10.maxHp / ENEMIES['anxiety-boss'].hp > boss5.maxHp / ENEMIES['rage-boss'].hp);
  eq(ENEMIES['rage-ghost'].hp, 150, 'base content untouched');
});
test('6.3 recovery: survivors full HP + mental 100; boss clear revives at 30% HP + mental 50; temp states cleared', () => {
  const b = makeBattle();
  b.state.stageType = 'normal';
  const [hando, mugyeom] = [b.player('hando'), b.player('mugyeom')];
  hando.hp = 40; hando.mental = 10; b.addStatus(hando, 'aekmagi', { charges: 1, multiplier: 0.7 }, []);
  mugyeom.alive = false; mugyeom.hp = 0;
  b.addStatus(b.player('yujin'), 'bleed', { turns: 2, power: 6 }, []);
  b.state.phase = PHASES.STAGE_CLEAR;
  b.advanceStage();
  eq(hando.hp, 260); eq(hando.mental, 100);
  assert(!hando.statuses.aekmagi && !b.player('yujin').statuses.bleed, 'temporary states removed');
  assert(!mugyeom.alive, 'normal clear does not revive');
  eq(b.state.runStage, 2);
  b.state.stageType = 'boss';
  b.state.phase = PHASES.STAGE_CLEAR;
  b.advanceStage();
  assert(mugyeom.alive); eq(mugyeom.hp, 63); eq(mugyeom.mental, 50);
  eq(mugyeom.exposed.length, 2, 'revived character draws skills');
});
test('6.4 partial death continues; full wipe ends the run; restart is a clean stage 1', () => {
  const b = makeBattle(); b.rng = zeros();
  for (const e of setEnemies(b, ['rage-ghost', 'rage-ghost'])) { e.hp = 99999; e.clashPower = 99; e.damage = 99999; }
  ['mugyeom', 'chohui'].forEach((id) => { b.player(id).alive = false; b.player(id).hp = 0; });
  command(b, 'hando', 0, 'e1');
  assert(b.canConfirm() === false, 'yujin still needs a command');
  command(b, 'yujin', 0, 'e2');
  assert(b.canConfirm());
  let events = b.resolveTurn();
  eq(b.state.phase, PHASES.RUN_OVER);
  const over = events.find((x) => x.type === 'run-over');
  eq(over.stage, 1);
  assert(b.setCommand('hando', 0, 'e1').ok === false, 'commands stop after wipe');
  // partial death
  const b2 = makeBattle(); b2.rng = zeros();
  const [e2] = setEnemies(b2, ['rage-ghost', 'obsession-goblin']);
  e2.clashPower = 99; e2.damage = 99999;
  b2.state.enemies[1].hp = 99999;
  command(b2, 'hando', 0, 'e2'); command(b2, 'mugyeom', 0, 'e2'); command(b2, 'chohui', 0, 'e2'); command(b2, 'yujin', 0, 'e1');
  events = b2.resolveTurn();
  assert(!b2.player('yujin').alive);
  eq(b2.state.phase, PHASES.PLAYER_COMMANDS, 'run continues');
  eq(b2.player('yujin').exposed.length, 0, 'dead characters get no skills');
  b2.newRun();
  eq(b2.state.runStage, 1);
  assert(b2.state.players.every((p) => p.alive && p.hp === p.maxHp && p.shinmyeong === 0 && !p.pendingFusion));
});
test('6.5 best stage persists: higher replaces, lower keeps, storage failure never stops the run', () => {
  const storage = createMemoryStorage({ bestStage: 4 });
  const b = makeBattle({ storage }); b.rng = zeros();
  eq(b.bestStage, 4);
  b.state.runStage = 6;
  b.finishRun();
  eq(storage.load().bestStage, 6);
  const b2 = new Battle({ rng: createRng(1), storage });
  b2.newRun();
  b2.state.runStage = 2;
  const ev = b2.finishRun()[0];
  eq(storage.load().bestStage, 6, 'lower record kept');
  eq(ev.best, 6); assert(!ev.newRecord);
  const broken = { load() { throw new Error('blocked'); }, save() { throw new Error('quota'); } };
  const b3 = new Battle({ rng: createRng(1), storage: broken });
  b3.newRun();
  b3.state.runStage = 3;
  b3.state.enemies.forEach((x) => { x.alive = false; });
  const clear = b3.clearStage()[0];
  eq(clear.saved, false); eq(clear.best, 4, 'session-only best');
  b3.advanceStage();
  eq(b3.state.runStage, 4, 'run continues after storage failure');
});

// ------------------------------------------------------------------ 8. integration (auto-play)
function autoPlay(seed, maxTurns = 400) {
  const b = new Battle({ rng: createRng(seed), storage: createMemoryStorage() });
  b.newRun();
  const pick = createRng(seed * 31 + 1);
  let fusions = 0;
  let maxStage = 1;
  for (let t = 0; t < maxTurns; t += 1) {
    const s = b.state;
    if (s.phase === PHASES.RUN_OVER) break;
    if (s.phase === PHASES.STAGE_CLEAR) { b.advanceStage(); maxStage = Math.max(maxStage, s.runStage); continue; }
    for (const p of b.alivePlayers()) {
      if (b.canFuse(p.id) && pick.next() < 0.7) { b.equipFusion(p.id, 0); }
      const options = b.slotOptions(p.id).filter((o) => !o.disabled);
      const option = options.find((o) => o.fusion) ?? options[Math.floor(pick.next() * options.length)];
      const enemies = b.aliveEnemies();
      const target = enemies[Math.floor(pick.next() * enemies.length)];
      const res = b.setCommand(p.id, option.slotIndex, target.uid);
      if (!res.ok) throw new Error(res.reason);
    }
    if (!b.canConfirm()) throw new Error('cannot confirm with all commands set');
    const events = b.resolveTurn();
    fusions += events.filter((x) => x.type === 'guardian-fusion' && x.phase === 'attack').length;
    for (const p of s.players) {
      if (p.hp < 0 || p.hp > p.maxHp) throw new Error(`hp out of range ${p.id} ${p.hp}`);
      if (p.mental < 0 || p.mental > 100 || p.shinmyeong < 0 || p.shinmyeong > 100) throw new Error('meter out of range');
      if (p.alive !== p.hp > 0) throw new Error(`alive flag mismatch ${p.id}`);
    }
    for (const e of s.enemies) if (e.hp < 0 || e.hp > e.maxHp) throw new Error('enemy hp out of range');
  }
  return { b, fusions, maxStage };
}
test('8.1-8.4 auto-play runs stay consistent across seeds (stage clears, bosses, fusion, wipe)', () => {
  let totalFusions = 0; let reachedBoss = false; let wiped = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    const { b, fusions, maxStage } = autoPlay(seed);
    totalFusions += fusions;
    if (maxStage >= 5) reachedBoss = true;
    if (b.state.phase === PHASES.RUN_OVER) wiped += 1;
  }
  assert(totalFusions > 0, 'fusion happened in auto-play');
  assert(reachedBoss, 'some run reached a boss stage');
  assert(wiped > 0, 'some run ended in a wipe');
});
test('8.2 stage 5 boss flow: boss UI data, recovery and continuation to stage 6', () => {
  const b = makeBattle({ seed: 4 });
  b.devJumpToStage(5);
  eq(b.state.stageType, 'boss');
  const boss = b.state.enemies[0];
  assert(boss.boss); eq(boss.templateId, 'rage-boss'); eq(boss.maxHp, 1080);
  b.state.enemies.forEach((e) => { e.alive = false; e.hp = 0; });
  b.player('chohui').alive = false; b.player('chohui').hp = 0;
  b.state.phase = PHASES.PLAYER_COMMANDS;
  const clear = b.clearStage()[0];
  eq(clear.reached, 6);
  const events = b.advanceStage();
  assert(events.some((x) => x.type === 'party-recovery' && x.revived.includes('chohui')));
  eq(b.state.runStage, 6); eq(b.state.stageType, 'normal');
});

// ------------------------------------------------------------------ 9. speed, multi-hit, win chance
test('9.1 speed dice roll inside each unit range at turn start and ignore stage scaling', () => {
  const b = makeBattle({ seed: 21 });
  for (let i = 0; i < 200; i += 1) {
    const speeds = b.rollSpeeds();
    for (const p of b.state.players) {
      const [min, max] = PARTY.find((d) => d.id === p.id).speed;
      assert(p.speed >= min && p.speed <= max && speeds[p.id] === p.speed, `${p.id} speed ${p.speed}`);
    }
    for (const e of b.state.enemies) {
      const [min, max] = ENEMIES[e.templateId].speed;
      assert(e.speed >= min && e.speed <= max, `${e.uid} speed ${e.speed}`);
    }
  }
  const events = b.startTurn();
  assert(events.some((x) => x.type === 'speed-roll'), 'speed-roll event before commands');
  eq(b.state.phase, PHASES.PLAYER_COMMANDS);
  const boss10 = makeBattle({ seed: 2 });
  boss10.devJumpToStage(10);
  const [min, max] = ENEMIES[boss10.state.enemies[0].templateId].speed;
  assert(boss10.state.enemies[0].speed >= min && boss10.state.enemies[0].speed <= max, 'boss speed not scaled');
  const r = createRng(3);
  for (let i = 0; i < 500; i += 1) { const v = rollSpeed([4, 8], r); assert(v >= 4 && v <= 8); }
});
test('9.2 faster clash resolves first regardless of selection order; phase order stays clash → direct', () => {
  const b = makeBattle(); b.rng = zeros();
  const [e1, e2, e3] = setEnemies(b, ['obsession-goblin', 'obsession-goblin', 'obsession-goblin']);
  for (const e of [e1, e2, e3]) { e.clashPower = 0; e.hp = 9999; e.maxHp = 9999; }
  b.player('hando').speed = 3; b.player('mugyeom').speed = 6; b.player('yujin').speed = 9; b.player('chohui').speed = 1;
  command(b, 'hando', 0, 'e1');
  command(b, 'mugyeom', 0, 'e2');
  command(b, 'yujin', 0, 'e3');
  command(b, 'chohui', 0, 'e3');
  const events = b.resolveTurn();
  const order = events.filter((x) => x.type === 'clash-start').map((x) => x.actorId);
  eq(order.join(','), 'mugyeom,hando,chohui', 'clashes by speed (chohui is the last selector on e3)');
  const firstDirect = events.findIndex((x) => x.type === 'direct-hit');
  const lastClash = events.map((x) => x.type).lastIndexOf('clash-final-win');
  assert(firstDirect > lastClash, 'fast direct attacker (yujin, speed 9) still waits for the clash phase');
});
test('9.3 hit splitting: 57 over 2 hits = 28 + 29; remainder on the last hit', () => {
  eq(splitHits(57, 2).join(','), '28,29');
  eq(splitHits(100, 4).join(','), '25,25,25,25');
  eq(splitHits(64, 3).join(','), '21,21,22');
  eq(splitHits(57, 2).reduce((a, b) => a + b), 57);
});
test('9.4 clash winner loses one hit per lost round (min 1); kills cancel remaining hits; effects once', () => {
  eq(splitHits(57, 2, 0).length, 2, '3:0 keeps all');
  eq(splitHits(57, 2, 2).join(','), '28', '3:2 keeps one hit without remainder');
  eq(splitHits(64, 3, 1).join(','), '21,21');
  // forced 3:0 keeps both hits
  const b = makeBattle(); b.rng = zeros();
  const [e] = setEnemies(b, ['obsession-goblin', 'obsession-goblin']);
  e.hp = 9999; e.maxHp = 9999; e.clashPower = 0;
  expose(b, 'mugyeom', ['mugyeom-2', 'mugyeom-3']);
  command(b, 'mugyeom', 0, 'e1');
  let events = b.resolveTurn();
  let res = events.find((x) => x.type === 'attack-result' && x.side === 'player');
  eq(res.hits.length, 2); eq(res.total, calculatePlayerDamage(38, 2.0));
  // scripted 3:1 (mental 0 on both sides so the reroll check never triggers)
  const b2 = makeBattle();
  const [f] = setEnemies(b2, ['obsession-goblin', 'obsession-goblin']);
  f.hp = 9999; f.maxHp = 9999; f.mental = 0; f.clashPower = 4;
  b2.player('mugyeom').mental = 0;
  expose(b2, 'mugyeom', ['mugyeom-2', 'mugyeom-3']);
  command(b2, 'mugyeom', 0, 'e1');
  const round = (pw, ew) => [y(pw), 0.99, y(ew), 0.99];
  b2.rng = createSequenceRng([...round(5, 1), ...round(1, 5), ...round(5, 1), ...round(5, 1)]);
  events = b2.resolveTurn();
  const final = events.find((x) => x.type === 'clash-final-win');
  eq(`${final.playerWins}-${final.enemyWins}`, '3-1');
  res = events.find((x) => x.type === 'attack-result' && x.side === 'player');
  eq(res.hits.length, 1, 'one hit lost'); eq(res.lostHits, 1);
  eq(res.total, Math.floor(calculatePlayerDamage(38, 2.0) / 2));
  eq(events.filter((x) => x.type === 'status-applied' && x.status === 'wonhon').length, 2, 'skill effect and job effect applied once each');
  // a kill on the first hit cancels the rest
  const b3 = makeBattle(); b3.rng = zeros();
  const [g, g2] = setEnemies(b3, ['obsession-goblin', 'obsession-goblin']);
  g.hp = 5; g.clashPower = 0; g2.hp = 9999;
  command(b3, 'hando', 0, 'e1');
  events = b3.resolveTurn();
  res = events.find((x) => x.type === 'attack-result' && x.side === 'player');
  eq(res.hits.length, 1, 'remaining hit canceled after the kill');
});
test('9.5 exact win chance: symmetry 50%, fusion 100%, grades, and Monte Carlo agreement', () => {
  near(yutDistribution(0).reduce((a, b) => a + b), 1, 1e-12);
  near(yutDistribution(100)[4], 9 / 25, 1e-12, 'P(모) with guaranteed reroll');
  near(clashWinChance({ power: 3, mental: 0 }, { power: 3, mental: 0 }), 0.5, 1e-12);
  near(clashWinChance({ power: 4, mental: 50 }, { power: 4, mental: 50 }), 0.5, 1e-12);
  assert(clashWinChance({ power: 5, mental: 50, multiplier: 1.2 }, { power: 3, mental: 50 }) > 0.85);
  eq(winGrade(0.85).label, '압승'); eq(winGrade(0.6).label, '우세'); eq(winGrade(0.5).label, '균형');
  eq(winGrade(0.4).label, '열세'); eq(winGrade(0.15).label, '위험');
  const b = makeBattle();
  setEnemies(b, ['obsession-goblin']);
  b.player('yujin').shinmyeong = 100; b.equipFusion('yujin', 0);
  const fusionPreview = b.previewCommand('yujin', 0, 'e1');
  eq(fusionPreview.winChance, 1); eq(fusionPreview.grade.label, '압승');
  const player = { power: 4, multiplier: 1.1, penalty: 0, mental: 60 };
  const enemy = { power: 5, multiplier: 1, penalty: 0, mental: 35 };
  const exact = clashWinChance(player, enemy);
  const rng = createRng(99);
  let wins = 0; const n = 20000;
  for (let i = 0; i < n; i += 1) {
    const r = resolveThreeWins(
      () => ({ value: (player.power + rollYut(player.mental, rng).value) * player.multiplier }),
      () => ({ value: enemy.power + rollYut(enemy.mental, rng).value }),
    );
    if (r.winner === 'player') wins += 1;
  }
  near(wins / n, exact, 0.015, 'simulation matches exact chance');
});

// ------------------------------------------------------------------ report
const total = passed + failures.length;
for (const f of failures) {
  console.error(`✗ ${f.name}\n    ${f.error.stack.split('\n').slice(0, 3).join('\n    ')}`);
}
console.log(`\n${passed}/${total} tests passed`);
if (failures.length) process.exit(1);
