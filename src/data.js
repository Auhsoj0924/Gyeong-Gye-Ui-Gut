// Immutable content definitions. Every record is plain JSON-serializable data with a stable ID.
// Resolution code reads only these tables, so tuning happens here without touching rules.

export const YUT_NAMES = { 1: '도', 2: '개', 3: '걸', 4: '윷', 5: '모' };

export const POSITIONS = {
  front: { id: 'front', label: '전열', aggro: 50 },
  middle: { id: 'middle', label: '중열', aggro: 35 },
  back: { id: 'back', label: '후열', aggro: 15 },
};

export const PLAYER_ATTRIBUTES = {
  calm: { id: 'calm', label: '평온', color: '#3fb8a9', icon: '≈' },
  courage: { id: 'courage', label: '용기', color: '#e2553a', icon: '▲' },
  haewon: { id: 'haewon', label: '해원', color: '#9b6ad6', icon: '✧' },
  hope: { id: 'hope', label: '희망', color: '#e0b440', icon: '☀' },
};

export const ENEMY_EMOTIONS = {
  rage: { id: 'rage', label: '분노', color: '#d23b3b', icon: '✹' },
  anxiety: { id: 'anxiety', label: '불안', color: '#d9c13a', icon: '◌' },
  obsession: { id: 'obsession', label: '집착', color: '#b0479f', icon: '∞' },
  despair: { id: 'despair', label: '절망', color: '#7d8fa3', icon: '▽' },
};

export const MATCHUP_LEVELS = {
  overwhelming: { id: 'overwhelming', label: '압도적인', icon: '⇈', damage: 2.0, clash: 1.2 },
  effective: { id: 'effective', label: '효과적인', icon: '↑', damage: 1.5, clash: 1.1 },
  neutral: { id: 'neutral', label: '일반적인', icon: '–', damage: 1.0, clash: 1.0 },
  weak: { id: 'weak', label: '약화된', icon: '↓', damage: 0.5, clash: 0.9 },
};

// Player skill attribute -> enemy emotion -> matchup level (16 cells).
export const MATCHUP_TABLE = {
  calm: { rage: 'overwhelming', anxiety: 'effective', obsession: 'neutral', despair: 'weak' },
  courage: { rage: 'neutral', anxiety: 'overwhelming', obsession: 'weak', despair: 'effective' },
  haewon: { rage: 'effective', anxiety: 'weak', obsession: 'overwhelming', despair: 'neutral' },
  hope: { rage: 'weak', anxiety: 'neutral', obsession: 'effective', despair: 'overwhelming' },
};

export const TARGET_TYPES = { 'enemy-single': { id: 'enemy-single', label: '적 1명' } };

// kind: dot = damage at end of turn, charge = consumed on use, timed = lasts N turns.
// delayed: the turn countdown starts at the end of the turn after it was applied.
export const STATUSES = {
  wonhon: { id: 'wonhon', label: '원혼 파열', icon: '魂', kind: 'dot', debuff: true, side: 'enemy', stackRule: 'refresh', desc: '턴 종료 시 피해' },
  seal: { id: 'seal', label: '봉인', icon: '封', kind: 'charge', debuff: true, side: 'enemy', stackRule: 'add', maxCharges: 2, clashPowerPenalty: 2, damageMultiplier: 0.5, desc: '다음 공격 경합위력 -2, 데미지 ×0.5' },
  vulnerable: { id: 'vulnerable', label: '취약', icon: '裂', kind: 'charge', debuff: true, side: 'enemy', stackRule: 'refresh', maxCharges: 1, desc: '다음에 받는 피해 ×1.25' },
  aekmagi: { id: 'aekmagi', label: '액막이', icon: '護', kind: 'charge', debuff: false, side: 'player', stackRule: 'add', maxCharges: 2, desc: '다른 아군의 피해를 대신 받음' },
  stagger: { id: 'stagger', label: '흐트러짐', icon: '亂', kind: 'charge', debuff: true, side: 'any', stackRule: 'refresh', maxCharges: 1, clashValuePenalty: 1, desc: '다음 경합값 -1' },
  bleed: { id: 'bleed', label: '출혈', icon: '血', kind: 'dot', debuff: true, side: 'player', stackRule: 'refresh', desc: '턴 종료 시 피해' },
  agitation: { id: 'agitation', label: '정신 동요', icon: '動', kind: 'timed', delayed: true, debuff: true, side: 'player', stackRule: 'refresh', desc: '추가 윷 굴림 불가' },
  bind: { id: 'bind', label: '속박', icon: '縛', kind: 'timed', delayed: true, debuff: true, side: 'player', stackRule: 'refresh', desc: '3스 스킬 선택 불가' },
  healCut: { id: 'healCut', label: '치유 감소', icon: '枯', kind: 'timed', delayed: true, debuff: true, side: 'player', stackRule: 'refresh', healMultiplier: 0.5, desc: '받는 회복량 ×0.5' },
};

// Order used when a cleanse removes one debuff.
export const CLEANSE_ORDER = ['bleed', 'healCut', 'bind', 'agitation', 'stagger'];

export const TUNING = {
  pairWeights: [
    { tiers: [1, 2], weight: 65 },
    { tiers: [1, 3], weight: 25 },
    { tiers: [2, 3], weight: 10 },
  ],
  singleSlotWeights: [
    { tier: 1, weight: 60 },
    { tier: 2, weight: 30 },
    { tier: 3, weight: 10 },
  ],
  tankAggroBonus: 20,
  unopposedMultiplier: { normal: 1.25, boss: 1.5 },
  clashWinsNeeded: 3,
  maxClashRounds: 60,
  enemyClashMultiplier: 1.0,
  mental: { default: 50, min: 0, max: 100, clashWin: 3, clashLoss: -8, unopposedHit: -10 },
  shinmyeong: { min: 0, max: 100, clashWin: 20, clashLoss: 8, directHit: 5 },
  fusionHoldMs: 800,
  bossActionEvery: 3,
  normalEnemyCount: [3, 4],
  bossAddCount: [1, 2],
  recovery: { mental: 100, reviveHpRatio: 0.3, reviveMental: 50 },
  scaling: {
    normalHp: { base: 1, perBlock: 0.18, perOffset: 0.03 },
    normalDamage: { base: 1, perBlock: 0.12, perOffset: 0.02 },
    bossHp: { base: 1.5, perBlock: 0.25, perOffset: 0 },
    bossDamage: { base: 1.2, perBlock: 0.15, perOffset: 0 },
  },
  bossRotation: ['rage', 'anxiety', 'obsession', 'despair'],
  hits: { lostPerLostRound: 1, minimum: 1 },
  winGrades: [
    { id: 'dominant', label: '압승', min: 0.85 },
    { id: 'favored', label: '우세', min: 0.6 },
    { id: 'even', label: '균형', min: 0.4, exclusiveMin: true },
    { id: 'struggling', label: '열세', min: 0.15, exclusiveMin: true },
    { id: 'hopeless', label: '위험', min: 0 },
  ],
};

export const PARTY = [
  {
    id: 'hando', name: '한도윤', position: 'front', job: 'aekmagi', jobLabel: '액막이무당', role: '탱커',
    guardian: '해태령 벽사', maxHp: 260, mental: 50, shinmyeong: 0,
    speed: [2, 5],
    sprite: 'assets/raw2/player-hando-idle.png', attackSprite: 'assets/raw2/player-hando-attack.png', bust: 'assets/raw2/bust-hando.png',
    guardianSprite: 'assets/guardian-haetae.webp',
    skills: ['hando-1', 'hando-2', 'hando-3'], fusionSkill: 'hando-f',
  },
  {
    id: 'mugyeom', name: '강무겸', position: 'middle', job: 'kalchum', jobLabel: '칼춤무당', role: '딜러',
    guardian: '도깨비 장군 철비', maxHp: 210, mental: 50, shinmyeong: 0,
    speed: [4, 7],
    sprite: 'assets/raw2/player-mugyeom-idle.png', attackSprite: 'assets/raw2/player-mugyeom-attack.png', bust: 'assets/raw2/bust-mugyeom.png',
    guardianSprite: 'assets/guardian-cheolbi.webp',
    skills: ['mugyeom-1', 'mugyeom-2', 'mugyeom-3'], fusionSkill: 'mugyeom-f',
  },
  {
    id: 'chohui', name: '윤초희', position: 'middle', job: 'salpuri', jobLabel: '살풀이무당', role: '힐러',
    guardian: '바리공주', maxHp: 190, mental: 50, shinmyeong: 0,
    speed: [3, 6],
    sprite: 'assets/raw2/player-chohui-idle.png', attackSprite: 'assets/raw2/player-chohui-attack.png', bust: 'assets/raw2/bust-chohui.png',
    guardianSprite: 'assets/guardian-bari.webp',
    skills: ['chohui-1', 'chohui-2', 'chohui-3'], fusionSkill: 'chohui-f',
  },
  {
    id: 'yujin', name: '백유진', position: 'back', job: 'bujeok', jobLabel: '부적무당', role: '마법사',
    guardian: '삼족오 금오', maxHp: 170, mental: 50, shinmyeong: 0,
    speed: [3, 6],
    sprite: 'assets/raw2/player-yujin-idle.png', attackSprite: 'assets/raw2/player-yujin-attack.png', bust: 'assets/raw2/bust-yujin.png',
    guardianSprite: 'assets/guardian-geumo.webp',
    skills: ['yujin-1', 'yujin-2', 'yujin-3'], fusionSkill: 'yujin-f',
  },
];

// Effects applied when the attack lands (clash win or direct hit).
// Effect types: mental, heal, status, enemyMental, aekmagi, vulnerable.
export const JOB_EFFECTS = {
  aekmagi: { label: '액막이 충전 1회', effects: [{ type: 'aekmagi', charges: 1, multiplier: 0.7 }] },
  kalchum: { label: '원혼 파열 2턴', effects: [{ type: 'status', status: 'wonhon', turns: 2, power: 8 }] },
  salpuri: { label: '가장 약한 아군 HP 20·정신력 5 회복', effects: [{ type: 'heal', scope: 'lowestAlly', hp: 20, mental: 5 }] },
  bujeok: { label: '봉인 1회', effects: [{ type: 'status', status: 'seal', charges: 1 }] },
};

export const SKILLS = {
  'hando-1': { id: 'hando-1', ownerId: 'hando', tier: 1, name: '진정의 방울', attribute: 'calm', clashPower: 3, damage: 18, targetType: 'enemy-single', hits: 2, fusionOnly: false, effectText: '적중 시 자신의 정신력 +5', effects: [{ type: 'mental', scope: 'self', amount: 5 }] },
  'hando-2': { id: 'hando-2', ownerId: 'hando', tier: 2, name: '장승의 문', attribute: 'courage', clashPower: 4, damage: 30, targetType: 'enemy-single', hits: 2, fusionOnly: false, effectText: '적중 시 자신의 정신력 +8', effects: [{ type: 'mental', scope: 'self', amount: 8 }] },
  'hando-3': { id: 'hando-3', ownerId: 'hando', tier: 3, name: '해태 강림', attribute: 'haewon', clashPower: 5, damage: 50, targetType: 'enemy-single', hits: 3, fusionOnly: false, effectText: '적중 시 모든 생존 아군 정신력 +5', effects: [{ type: 'mental', scope: 'allAllies', amount: 5 }] },
  'mugyeom-1': { id: 'mugyeom-1', ownerId: 'mugyeom', tier: 1, name: '도깨비 방망이', attribute: 'courage', clashPower: 3, damage: 24, targetType: 'enemy-single', hits: 2, fusionOnly: false, effectText: '추가 효과 없음', effects: [] },
  'mugyeom-2': { id: 'mugyeom-2', ownerId: 'mugyeom', tier: 2, name: '칼춤 난무', attribute: 'haewon', clashPower: 4, damage: 38, targetType: 'enemy-single', hits: 2, fusionOnly: false, effectText: '원혼 파열 2턴', effects: [{ type: 'status', status: 'wonhon', turns: 2, power: 8 }] },
  'mugyeom-3': { id: 'mugyeom-3', ownerId: 'mugyeom', tier: 3, name: '철비 강림', attribute: 'hope', clashPower: 5, damage: 64, targetType: 'enemy-single', hits: 3, fusionOnly: false, effectText: '원혼 파열 2턴, 피해 8/턴', effects: [{ type: 'status', status: 'wonhon', turns: 2, power: 8 }] },
  'chohui-1': { id: 'chohui-1', ownerId: 'chohui', tier: 1, name: '실타래 풀기', attribute: 'haewon', clashPower: 3, damage: 14, targetType: 'enemy-single', hits: 2, fusionOnly: false, effectText: 'HP가 가장 낮은 아군 HP 24 회복', effects: [{ type: 'heal', scope: 'lowestAlly', hp: 24 }], resonance: 8 },
  'chohui-2': { id: 'chohui-2', ownerId: 'chohui', tier: 2, name: '살풀이굿', attribute: 'hope', clashPower: 4, damage: 24, targetType: 'enemy-single', hits: 2, fusionOnly: false, effectText: 'HP가 가장 낮은 아군 HP 36·정신력 8 회복', effects: [{ type: 'heal', scope: 'lowestAlly', hp: 36, mental: 8 }], resonance: 10 },
  'chohui-3': { id: 'chohui-3', ownerId: 'chohui', tier: 3, name: '바리의 길 열기', attribute: 'calm', clashPower: 5, damage: 38, targetType: 'enemy-single', hits: 3, fusionOnly: false, effectText: '모든 생존 아군 최대 HP 18% 회복, 디버프 1개 제거', effects: [{ type: 'heal', scope: 'allAllies', hpPct: 0.18, cleanse: 1 }], resonance: 15 },
  'yujin-1': { id: 'yujin-1', ownerId: 'yujin', tier: 1, name: '불씨 부적', attribute: 'hope', clashPower: 3, damage: 22, targetType: 'enemy-single', hits: 2, fusionOnly: false, effectText: '추가 효과 없음', effects: [] },
  'yujin-2': { id: 'yujin-2', ownerId: 'yujin', tier: 2, name: '오방 봉인', attribute: 'calm', clashPower: 4, damage: 36, targetType: 'enemy-single', hits: 2, fusionOnly: false, effectText: '봉인 1회', effects: [{ type: 'status', status: 'seal', charges: 1 }] },
  'yujin-3': { id: 'yujin-3', ownerId: 'yujin', tier: 3, name: '금오 현신', attribute: 'courage', clashPower: 5, damage: 62, targetType: 'enemy-single', hits: 3, fusionOnly: false, effectText: '봉인 1회, 적중 시 적 정신력 -5', effects: [{ type: 'status', status: 'seal', charges: 1 }, { type: 'enemyMental', amount: -5 }] },

  // Fusion skills: guaranteed clash win; their effects replace the normal job effect.
  'hando-f': { id: 'hando-f', ownerId: 'hando', tier: 4, name: '벽사 해태합일', attribute: 'hope', clashPower: 30, damage: 100, targetType: 'enemy-single', hits: 4, fusionOnly: true, effectText: '액막이 2충전, 대신 받는 피해 ×0.5', effects: [{ type: 'aekmagi', charges: 2, multiplier: 0.5 }] },
  'mugyeom-f': { id: 'mugyeom-f', ownerId: 'mugyeom', tier: 4, name: '철비 천둥굿', attribute: 'calm', clashPower: 30, damage: 120, targetType: 'enemy-single', hits: 4, fusionOnly: true, effectText: '원혼 파열 3턴, 12/턴', effects: [{ type: 'status', status: 'wonhon', turns: 3, power: 12 }] },
  'chohui-f': { id: 'chohui-f', ownerId: 'chohui', tier: 4, name: '바리의 문 개방', attribute: 'courage', clashPower: 30, damage: 90, targetType: 'enemy-single', hits: 4, fusionOnly: true, effectText: '모든 생존 아군 HP 35·정신력 10 회복', effects: [{ type: 'heal', scope: 'allAllies', hp: 35, mental: 10 }] },
  'yujin-f': { id: 'yujin-f', ownerId: 'yujin', tier: 4, name: '금오 여명강림', attribute: 'haewon', clashPower: 30, damage: 110, targetType: 'enemy-single', hits: 4, fusionOnly: true, effectText: '봉인 2회, 대상이 받는 다음 피해 ×1.25', effects: [{ type: 'status', status: 'seal', charges: 2 }, { type: 'vulnerable', multiplier: 1.25 }] },
};

// Enemy attack effects reuse the status table. `mental` on agitation is the immediate mental loss.
export const ENEMIES = {
  'rage-ghost': { id: 'rage-ghost', name: '불타는 객귀', emotion: 'rage', position: 'front', hp: 150, damage: 28, clashPower: 4, mental: 45, boss: false, speed: [3, 6], sprite: 'assets/raw2/enemy-rage-ghost-idle.png', attackSprite: 'assets/raw2/enemy-rage-ghost-attack.png', attack: { hits: 2, name: '핏빛 할퀴기', text: '출혈 6×2턴', effects: [{ type: 'status', status: 'bleed', turns: 2, power: 6 }] } },
  'anxiety-ghost': { id: 'anxiety-ghost', name: '문틈 귀신', emotion: 'anxiety', position: 'back', hp: 120, damage: 22, clashPower: 3, mental: 65, boss: false, speed: [4, 8], sprite: 'assets/raw2/enemy-anxiety-ghost-idle.png', attackSprite: 'assets/raw2/enemy-anxiety-ghost-attack.png', attack: { hits: 2, name: '문틈 속삭임', text: '정신 동요 1턴 (정신력 -15)', effects: [{ type: 'status', status: 'agitation', turns: 1, mental: 15 }] } },
  'obsession-goblin': { id: 'obsession-goblin', name: '매듭 도깨비', emotion: 'obsession', position: 'middle', hp: 180, damage: 20, clashPower: 5, mental: 55, boss: false, speed: [2, 5], sprite: 'assets/raw2/enemy-obsession-goblin-idle.png', attackSprite: 'assets/raw2/enemy-obsession-goblin-attack.png', attack: { hits: 2, name: '인연 묶기', text: '속박 1턴', effects: [{ type: 'status', status: 'bind', turns: 1 }] } },
  'despair-corpse': { id: 'despair-corpse', name: '상여 망자', emotion: 'despair', position: 'middle', hp: 165, damage: 30, clashPower: 4, mental: 35, boss: false, speed: [1, 4], sprite: 'assets/raw2/enemy-despair-corpse-idle.png', attackSprite: 'assets/raw2/enemy-despair-corpse-attack.png', attack: { hits: 2, name: '상여의 곡', text: '치유 감소 2턴', effects: [{ type: 'status', status: 'healCut', turns: 2 }] } },

  'rage-boss': { id: 'rage-boss', name: '화귀 대장', emotion: 'rage', position: 'front', hp: 720, damage: 42, clashPower: 6, mental: 55, boss: true, speed: [4, 7], sprite: 'assets/raw2/boss-rage-idle.png', attackSprite: 'assets/raw2/boss-rage-attack.png', attack: { hits: 2, name: '화염 언월', text: '추가 효과 없음', effects: [] }, bossAction: { hits: 3, name: '분노 폭발', text: '출혈 8×2턴', effects: [{ type: 'status', status: 'bleed', turns: 2, power: 8 }] } },
  'anxiety-boss': { id: 'anxiety-boss', name: '무명 저승사자', emotion: 'anxiety', position: 'back', hp: 660, damage: 36, clashPower: 5, mental: 70, boss: true, speed: [5, 8], sprite: 'assets/raw2/boss-anxiety-idle.png', attackSprite: 'assets/raw2/boss-anxiety-attack.png', attack: { hits: 2, name: '명부 낫질', text: '추가 효과 없음', effects: [] }, bossAction: { hits: 3, name: '망자의 호명', text: '정신력 -20, 다음 턴 추가 굴림 불가', effects: [{ type: 'status', status: 'agitation', turns: 1, mental: 20 }] } },
  'obsession-boss': { id: 'obsession-boss', name: '천년 매듭 도깨비', emotion: 'obsession', position: 'middle', hp: 900, damage: 34, clashPower: 7, mental: 60, boss: true, speed: [3, 6], sprite: 'assets/raw2/boss-obsession-idle.png', attackSprite: 'assets/raw2/boss-obsession-attack.png', attack: { hits: 2, name: '매듭 방망이', text: '추가 효과 없음', effects: [] }, bossAction: { hits: 3, name: '인연 봉쇄', text: '속박 2턴, 다음 경합 -1', effects: [{ type: 'status', status: 'bind', turns: 2 }, { type: 'status', status: 'stagger', charges: 1 }] } },
  'despair-boss': { id: 'despair-boss', name: '상여왕', emotion: 'despair', position: 'middle', hp: 840, damage: 45, clashPower: 5, mental: 30, boss: true, speed: [2, 5], sprite: 'assets/raw2/boss-despair-idle.png', attackSprite: 'assets/raw2/boss-despair-attack.png', attack: { hits: 2, name: '만장 휘두르기', text: '추가 효과 없음', effects: [] }, bossAction: { hits: 3, name: '끝없는 곡', text: '치유 감소 2턴, 적중 시 HP 5% 회복', effects: [{ type: 'status', status: 'healCut', turns: 2 }, { type: 'selfHealPct', pct: 0.05 }] } },
};

export const NORMAL_ENEMY_IDS = ['rage-ghost', 'anxiety-ghost', 'obsession-goblin', 'despair-corpse'];
export const BOSS_BY_EMOTION = { rage: 'rage-boss', anxiety: 'anxiety-boss', obsession: 'obsession-boss', despair: 'despair-boss' };

export const CONTENT = {
  YUT_NAMES, POSITIONS, PLAYER_ATTRIBUTES, ENEMY_EMOTIONS, MATCHUP_LEVELS, MATCHUP_TABLE,
  TARGET_TYPES, STATUSES, CLEANSE_ORDER, TUNING, PARTY, JOB_EFFECTS, SKILLS, ENEMIES,
  NORMAL_ENEMY_IDS, BOSS_BY_EMOTION,
};
