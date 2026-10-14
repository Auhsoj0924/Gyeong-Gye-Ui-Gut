# 작업 인계 문서 — 경계의 굿 (Prototype 5)

작성: 2026-10-12. 다른 환경에서 이어서 작업하기 위한 현재 상태 정리입니다.

> **현재 브라우저 실행은 복구했습니다.** `index.html`을 `app.js`가 사용하는 DOM과 맞추고 `src/data.js`의 스프라이트 참조를 존재하는 `assets/raw2/*.png`로 연결했습니다. `index.html`을 파일로 직접 여는 대신 아래 로컬 서버 명령으로 실행하세요. 2차 UI·애니메이션 개편과 에셋 최적화는 아래 "5. 남은 작업 체크리스트"에 남아 있습니다.

---

## 0. 위치와 기본 명령

| 항목 | 경로 |
|---|---|
| 게임 코드 | `Prototype 5 26.10.12/` |
| SPEC (정본) | `openspec/changes/build-korean-shaman-infinite-rpg/` |
| SPEC 작업 사본 | `Shamanism/` (정본과 내용 동일하게 유지, 추가로 `.claude/launch.json`만 있음) |
| 이 문서 | `Prototype 5 26.10.12/HANDOFF.md` |

```bash
cd "Prototype 5 26.10.12"
node tests/run-tests.js          # 현재 46/46 통과
python -m http.server 8125       # http://localhost:8125 (ES 모듈이라 서버 필요)
openspec validate "build-korean-shaman-infinite-rpg" --type change --strict   # 현재 valid
```

- URL 옵션: `?seed=123`(난수 고정), `?dev=1`(개발 패널).
- `Shamanism/.claude/launch.json`에 미리보기 서버 설정(`prototype5`, 포트 8125, `--directory "../Prototype 5 26.10.12"`)이 있습니다.
- 아직 git 커밋은 하지 않았습니다. `.gitignore`에는 `assets/raw/`만 들어 있습니다. `assets/raw2/`도 원본 PNG(장당 약 2.5~3MB)이므로 제외할지 정해야 합니다.

---

## 1. 1차 작업 (완료)

SPEC 문서(proposal / design / specs 4종 / tasks)를 따라 바닐라 웹 게임을 구현했습니다. tasks.md 1~8절은 모두 `[x]`입니다.

- 고정 4인 파티: 한도윤·강무겸·윤초희·백유진. 스킬 12개와 강신합일 4개.
- 윷 선 3승 경합, 정신력 추가 굴림, 16칸 상성표(데미지/경합 배율 분리).
- 마지막 지정자 경합 / 앞선 지정자 일방 공격, 비경합 공격(×1.25, 보스 ×1.50, 디버프 확정), 어그로, 액막이.
- 상태이상 9종(원혼 파열, 봉인, 취약, 액막이, 흐트러짐, 출혈, 정신 동요, 속박, 치유 감소).
- 윤초희 살풀이 공명, 강신합일(길게 누르기 0.8초 + 버튼 대체 입력, 칸 유지).
- 무한 스테이지, 5의 배수 보스(감정 순환, 3턴마다 전용 행동), 스케일링, 회복·부활, 최고 기록 `localStorage`(`shaman-p5-best`).
- SPEC에 없던 값은 기본값으로 구현했고 `design.md` §10과 `README.md`에 기록했습니다.
- 1차 그래픽: Codex `$imagegen`으로 17장 생성. 게임용은 `assets/*.webp`, 원본은 `assets/raw/`(git 제외), 프롬프트는 `assets/prompts-v1/`과 `assets/PROMPTS.md`.
- 브라우저 검증: 실제 UI 자동 조작으로 9스테이지까지 진행, 전멸·재시작, 모바일 폭, 키보드, 음소거 확인. 콘솔 오류 없음.

---

## 2. 2차 요청 — 림버스 컴퍼니 / 유니콘 오버로드 참고 개편

사용자 요청: "UI·플레이 방식·애니메이션을 림버스 컴퍼니처럼, 그래픽을 유니콘 오버로드 또는 림버스 인게임처럼."

**사용자가 고른 방향 (AskUserQuestion 답변):**

| 질문 | 선택 |
|---|---|
| 플레이 방식 범위 | **일부 규칙 추가**: 윷 경합 유지 + 속도 주사위, 다단 히트, 경합 승률 예고 |
| 그래픽 화풍 | **혼합**: 캐릭터·배경은 유니콘 오버로드풍 손그림 측면 스프라이트, UI·전투 연출은 림버스풍 |
| SPEC 처리 | **SPEC 먼저 갱신 후 구현** |

**전제:** 두 게임의 실제 에셋·UI 배치·캐릭터·로고는 복제하지 않고 참고만 합니다. SPEC의 "기존 게임 복제 금지" 문구도 유지했습니다.

### 2-1. SPEC 갱신 (완료, `openspec validate --strict` 통과)

- `proposal.md`: What Changes에 6개 항목 추가, capability 설명 갱신.
- `specs/turn-based-clash-combat/spec.md`:
  - 데이터 표: Speed dice, Multi-hit, Clash win chance.
  - 요구사항 3개 추가: 속도 순서, 타수 분할·손실, 승률 예고.
- `specs/visual-presentation/spec.md`:
  - Reference styles 절 추가.
  - 요구사항 3개 추가: 전장 내 경합 카메라, 대상 연결선·속도 표시, 만화 패널 컷인.
- `design.md`:
  - Art direction에 참고 화풍 문장 추가.
  - 상태 머신에 `ROLL_SPEED` 추가.
  - §11 속도·다단 히트, §12 정확한 승률 계산, §13 에셋 구성·전투 연출 순서.
- `tasks.md`: **9~12절(19개 항목) 추가, 모두 `[ ]` 상태**.
- 위 파일은 `Shamanism/`과 `openspec/changes/...` 양쪽에 같은 내용으로 복사되어 있습니다.

### 2-2. 규칙 구현 (완료 — tasks 9.1~9.5 해당, 체크 표시는 아직 안 함)

- `src/data.js`
  - 파티와 적 8종에 `speed: [min, max]`, 스킬에 `hits`(1·2스 2, 3스 3, 강신 4), 적 `attack.hits: 2`, 보스 `bossAction.hits: 3`.
  - `TUNING.hits`(`lostPerLostRound: 1`, `minimum: 1`), `TUNING.winGrades`(압승 ≥85%, 우세 ≥60%, 균형 >40%, 열세 >15%, 그 외 위험).
  - **스프라이트 경로를 새 경로로 바꿨습니다(파일은 아직 없음):**
    - 플레이어: `sprite: 'assets/sprites/<id>-idle.webp'`, `attackSprite: 'assets/sprites/<id>-attack.webp'`, `bust: 'assets/busts/<id>.webp'`.
    - 적: `sprite: 'assets/sprites/<templateId>-idle.webp'`, `attackSprite: 'assets/sprites/<templateId>-attack.webp'`.
    - 예: `rage-ghost-idle.webp`, `rage-boss-attack.webp`.
    - 수호령 `guardianSprite`는 기존 `assets/guardian-*.webp`를 그대로 씁니다.
- `src/rules.js`: `rollSpeed`, `splitHits(total, hits, lostRounds)`, `yutDistribution`, `clashWinChance(playerSide, enemySide)`, `winGrade` 추가.
- `src/battle.js`
  - `PHASES.ROLL_SPEED`, `rollSpeeds()`. `startTurn()`이 `speed-roll` 이벤트를 발행합니다.
  - `resolveTurn()`: 경합·일방 공격은 플레이어 속도 내림차순(동률은 선택 순서), 비경합은 적 속도 내림차순(동률은 배치 순서).
  - `landPlayerAttack(..., lostRounds)`, `landEnemyAttack(..., { lostRounds })`:
    - 타마다 `clash-hit`/`direct-hit`/`enemy-clash-hit`/`enemy-unopposed-hit` 이벤트에 `hitIndex`, `hitCount`, `final`을 붙입니다.
    - 마지막에 `attack-result` 이벤트(`side`, `kind`, `total`, `planned`, `hits[]`, `maxHits`, `lostHits`)를 발행합니다.
  - 경합 승자는 상대 승수만큼 타를 잃습니다(최소 1). 대상이 쓰러지면 남은 타는 취소합니다.
  - `previewCommand()`가 `winChance`, `grade`, `hits`를 반환합니다. 승률은 `clashSides()`로 계산합니다.
- `tests/run-tests.js`: 기존 테스트를 `attack-result` 기준으로 수정하고 9.1~9.5 테스트를 추가했습니다. **46/46 통과.**

### 2-3. 그래픽 1단계 (완료) — `assets/raw2/` 원본 PNG 14장

- 대기 포즈: `player-{hando,mugyeom,chohui,yujin}-idle.png`(오른쪽 바라봄), `enemy-{rage-ghost,anxiety-ghost,obsession-goblin,despair-corpse}-idle.png`, `boss-{rage,anxiety,obsession,despair}-idle.png`(왼쪽 바라봄).
- 배경: `bg-boundary.png`, `bg-boss.png`.
- 한도윤 대기 포즈는 눈으로 확인했습니다(측면, 손그림 화풍, 양호). **나머지 13장은 아직 보지 않았습니다.** 투명 배경, 방향, 크기 일관성을 확인해야 합니다.

### 2-4. 새 UI 골격 (일부 완료)

- `index.html`: 림버스풍 구조로 새로 작성했습니다(아래 §4 DOM 계약 참고).
- `styles.css`: 새로 작성했습니다(431줄). 클래스 계약은 §4.

---

## 3. 방금 중단한 작업

### 3-1. 그래픽 2단계 — 16장 중 15장 생성됨, **`bust-yujin.png` 1장 누락**

문서 작성 시점에 `assets/raw2/`에 들어온 파일은 다음과 같습니다.
- 공격 포즈 12장 전부(플레이어 4, 적 4, 보스 4)
- 흉상 3장(`bust-hando`, `bust-mugyeom`, `bust-chohui`)

흉상 묶음(pb)은 정상 종료(exit 0)했는데도 **`bust-yujin.png`가 없습니다.** 이 한 장만 다시 생성하면 됩니다. 아래 명령에서 `pb.txt`의 4번 항목만 남기고, 참조 이미지를 `player-yujin-idle.png` 하나로 바꿔 실행하세요.

생성된 15장은 아직 눈으로 검수하지 않았습니다. 2단계 Codex 작업 4개(pa, pb, pc, pd)는 모두 정상 종료(exit 0)했습니다.

| 묶음 | 결과 파일 (assets/raw2/) | 참조 이미지 (-i, 순서대로) |
|---|---|---|
| pa | `player-{hando,mugyeom,chohui,yujin}-attack.png` | 각 `player-*-idle.png` |
| pb | `bust-{hando,mugyeom,chohui,yujin}.png` | 각 `player-*-idle.png` |
| pc | `enemy-{rage-ghost,anxiety-ghost,obsession-goblin,despair-corpse}-attack.png` | 각 `enemy-*-idle.png` |
| pd | `boss-{rage,anxiety,obsession,despair}-attack.png` | 각 `boss-*-idle.png` |

프롬프트는 `assets/prompts-v2/`에 있습니다. 조합 방법은 `common.txt` + `pa.txt` + `ref.txt`입니다. 1단계는 `common.txt` + `a|b|c|d.txt`였습니다.

```bash
# Windows Codex 앱의 CLI (PATH에 없음). 버전 codex-cli 0.160.0
CODEX="/c/Program Files/WindowsApps/OpenAI.Codex_26.930.4958.0_x64__2p2nqsd0c76g0/app/resources/codex.exe"
P="Prototype 5 26.10.12"; R="$P/assets/raw2"; Q="$P/assets/prompts-v2"
cat "$Q/common.txt" "$Q/pa.txt" "$Q/ref.txt" | "$CODEX" exec -C "$P" -s workspace-write --skip-git-repo-check \
  -i "$R/player-hando-idle.png" -i "$R/player-mugyeom-idle.png" -i "$R/player-chohui-idle.png" -i "$R/player-yujin-idle.png"
```

- `-i`는 값을 여러 개 받으므로 **프롬프트 인자 `-`를 붙이지 말고** stdin으로만 넘기세요.
- 4묶음은 병렬로 돌려도 됩니다. 한 묶음에 5~8분 걸립니다.
- 스킬은 `$imagegen` 기본(built-in `image_gen`) 모드라 API 키가 필요 없습니다.

### 3-2. `app.js` 재작성 — 시작 직전에 중단 (tasks 11.1~11.6)

현재 `app.js`(1081줄)는 **1차 UI용 구버전**입니다. 다음 요소를 참조하는데, 새 `index.html`에는 없습니다: `#stageInfo`, `#field`, `#partyCommands`, `#commandLog`, `#clashOverlay`, `#fusionOverlay`, `.pcard`, `.target-picker` 등.

**구버전에서 그대로 가져다 쓸 수 있는 부분:**
- `sound` 객체: Web Audio 합성 큐 — select, yut, clash, tie, roundWin, roundLose, hit, bigHit, stagger, whoosh, heal, fusion, gong, clear, defeat, death.
- `fx` 객체: 캔버스 파티클. `#fx` id는 그대로입니다.
- 설정·저장: `loadPrefs`/`savePrefs`(`shaman-p5-prefs`), `browserStorage`(`shaman-p5-best`).
- `newBattle()`(seed 처리), `openModal`/`closeModal`, `openHelp`, `showStageClear`, `showRunOver`, `openFusionChooser`. 클래스명만 새 CSS에 맞추면 됩니다: `.skill-btn` → `.skill-card`, `.ghost-btn` → `.hud-btn`.
- 길게 누르기 판정, 개발 패널(`setupDev`), `preloadImages`, `boot`(콘텐츠 검증 배너), `playEvents`의 재생 큐·`ui.skip`·`wait()`, `retrigger()`.

---

## 4. `app.js` 재작성 설계 (이대로 구현하면 됨)

### 4-1. DOM 계약 (새 index.html의 id)

```text
#stageRibbon  상단 왼쪽 기울어진 스테이지 리본 (.stage-ribbon[.boss] > .no + .kind)
#topMeta      턴, 최고 기록 등 (<b>로 강조)
#helpBtn #speedBtn #muteBtn
#stage        전장 (.stage, 연출 중 .playing / 카메라 집중 .focus / .shake .big-shake .flash)
  #camera     확대/이동할 레이어 (style.transform 설정, transform-origin 0 0)
    #stageBg  배경 (style.backgroundImage; 일반 assets/bg-boundary.webp, 보스 assets/bg-boss.webp)
    #units    유닛들
  #lines      SVG 대상 연결선
  #banner     <span> 하나를 넣어 .show [.danger|.gold|.big]
  #targetTray 스킬 선택 중 적 목록 버튼 (모바일·키보드용)
#slots        하단 명령 바의 4칸 (.slot)
#threats #confirmBtn(전투 개시) #skipBtn #hint
#cutin        강신합일 만화 컷인
#modalLayer #errorBanner #devPanel #fx
```

### 4-2. CSS 클래스 계약 (styles.css에 이미 정의됨)

- **유닛:**
  ```text
  .unit.player|.enemy[.boss][.ghostly][.dead][.dim][.targetable][.hovered]
        [.attacking][.lunge][.hit][.knock][.stagger][.healed][.dying][.focus-pair]
  ```
  - 인라인 변수: `--x`(%), `--b`(%), `--z`, `--s`(깊이 배율), `--delay`(대기 애니메이션 오프셋).
  - 내부 구조:
    ```text
    .body (돌진: style --dash: Npx)
      .unit-hud (머리 위: .uname + .emotion-chip, .hud-row > .speed-die + .hp-wrap(.bar[.player] > i, .hp-num) + .mental-orb(--m), .unit-statuses > .st[.buff], .intent-chip[.special], .threat-chip, .target-tag(--gc))
      .sprite-box > .idle-anim > img.sprite.idle + img.sprite.attack(.flip 가능), .shadow
      .clash-head (경합 중에만 추가: .yut[.tossing] > .stick[.up]×4, .yut-name, .num[.win|.lose], .pips > .pip[.on]×3, .notes, .verdict)
    ```
  - `.attacking`이 붙으면 대기 이미지 대신 공격 포즈 이미지가 보입니다.
  - `.ghostly`는 떠다니는 애니메이션입니다(객귀, 문틈 귀신, 저승사자에 추천).
- **떠오르는 숫자:** `.pop`(기본 플레이어 피해 노란색), `.pop.enemy-dmg`, `.heal`, `.small`, `.status`. 내부 `.hitno`로 "1/2" 표기. `.sprite-box` 안에 붙이고 약 1초 뒤 제거.
- **연결선(SVG):** `path.ln.clash`(style `--lc` = 우세도 색), `path.ln.direct`(점선), `.ln.preview`, `circle.arrow[.direct]`, `g.lbl > rect + text`.
- **대상 목록:** `#targetTray > .tray-title + button.target-btn`(--gc; `.tb-name`, `.tb-stats b`, `.tb-note`).
- **명령 바:**
  ```text
  .slot[.has-command][.selecting][.dead]
    button.bust[.ready][.holding](--hold) > img + .speed-die + .hold-fill
    .slot-head > strong + small
    .slot-meters > .row×3 (라벨 / .bar(.player|.mental|.shin[.full]) / 값)
    button.fuse-btn
    .cards > button.skill-card[.fusion][.active][.chosen](--c = 속성색)
      > .sc-top(.attr-chip + .sc-tier) + .sc-name + .sc-power(b 위력 + .coins > .coin×타수 + small 피해) + .sc-effect(.sc-tag[.fusion])
    .slot-cmd (→ 대상 + .role[.direct] + .link-btn 취소)
  ```
- **컷인:** `#cutin > .ci-back + .ci-lines + .ci-panel.a > img(흉상) + .ci-panel.b > img(수호령) + .ci-title + .ci-sub`. 약 1.5초 뒤 hidden.
- **모달:** `.modal`, `.stat-grid > .stat`, `.actions`, `.primary-btn`, `.slot-choices`, `.matchup-table`, `.record`.
- **재생 중:** `body.playing`(명령 바 입력 잠금), `#stage.playing`(연결선 숨김).

### 4-3. 배치

- **플레이어:** 왼쪽, 중심 x≈24%, 오른쪽을 봅니다.
- **적:** 오른쪽, 중심 x≈76%, 왼쪽을 봅니다.
- **줄 간격:** 앞열이 중앙 쪽에 오고, 간격은 `min(11.5, 32/(n-1))`%입니다.
- **깊이별 값:**

  | 열 | `--b` | `--s` |
  |---|---:|---:|
  | 전열 | 6 | 1 |
  | 중열 | 11 | 0.93 |
  | 후열 | 16 | 0.86 |

  앞열일수록 z가 큽니다(1차 `layoutUnits` 참고).

### 4-4. 연결선 (`renderLines`)

- **언제:** 명령 입력 단계에만 그립니다. 기준은 `#stage`의 getBoundingClientRect입니다.
- **선 모양:** 플레이어 sprite-box 위쪽 1/3 지점에서 적 sprite-box 위쪽까지 2차 곡선을 그립니다. 제어점은 위로 띄웁니다.
- **경합 담당:** 실선이고, 라벨은 `경합 · {우세도} {승률}%`입니다. 승률은 `battle.previewCommand(actorId, slotIndex, targetId)`에서 가져옵니다.
- **일방 공격:** 점선이고, 라벨은 `일방`입니다.
- **미리보기:** 스킬을 고른 상태에서 적에 마우스를 올리면 점선 미리보기를 그립니다.
- **우세도 색:**

  | 우세도 | 색 |
  |---|---|
  | dominant | `#7fe0a4` |
  | favored | `#c6e86b` |
  | even | `#f2b51b` |
  | struggling | `#ff9a3c` |
  | hopeless | `#ff4a3d` |

- **다시 그리는 시점:** render 직후(requestAnimationFrame), resize, hover 때입니다.

### 4-5. 이벤트 재생 순서 (림버스풍)

계산은 이미 끝났으므로, 재생 중에는 화면을 다시 그리지 않고 막대·숫자만 이벤트 값으로 갱신합니다.

| 이벤트 | 연출 |
|---|---|
| `stage-start` | 이때 전장만 다시 렌더(새 적·배경 반영). 큰 배너 `STAGE n` / `보스 강림`, gong |
| `turn-start` | `bossAction`이면 위험 배너 |
| `speed-roll` | `.speed-die`에 `.rolling` + 숫자 회전 약 0.5초 → `speeds[id]` 값으로 고정 |
| `clash-start` | `focusPair(actor, enemy)`: 카메라 확대(≈1.35), 두 유닛을 중앙으로 `--dash`, 나머지 `.dim`, `#stage.focus`, 두 유닛 `.focus-pair`(HUD 숨김), `.clash-head` 생성(notes: 흐트러짐/봉인/정신 동요/전용 행동) |
| `guardian-fusion` | 컷인 (`phase: 'equip'`이면 장착, `'attack'`이면 공격 직전) |
| `yut-roll` | 양쪽 `.yut.tossing`, 막대 `up` 개수 = 윷값(모 = 0개), `.yut-name` = "걸(3) · 추가 굴림 개·걸" |
| `clash-value` | `.num`에 `toFixed(1)` |
| `clash-tie` | "동률" 표시, tie 사운드 |
| `clash-round-win` | 승자 `.num.win`, 패자 `.num.lose`(깨짐), pip 갱신, 두 유닛 `.lunge`, `#stage.flash`, 중앙 파티클, clash 사운드 → 다음 라운드 전 클래스 초기화 |
| `clash-final-win` | `.verdict` "승리"·"패배", 0.5초 후 `.clash-head` 제거 |
| `stagger` | 대상 `.stagger` + "흐트러짐" |
| `*-hit` (`hitIndex`/`hitCount`/`final`) | 공격자 `.attacking` + `.lunge` → 약 70ms 정지 → 대상 `.hit`(final이면 `.knock`), `.pop` 숫자 + "i/n", HP 막대 갱신, 흔들림(강신합일이면 big-shake), 히트 사운드. `direct-hit`의 첫 타라면 먼저 `focusDirect(attacker, target)`(작은 확대 + 돌진) + "일방 공격" 배너 |
| `enemy-unopposed-start` | `focusDirect(enemy, target)` + 위험 배너 "비경합 공격 ×1.25" |
| `aekmagi-redirect` | 적을 한도윤 쪽으로 다시 돌진, "액막이" 표시 |
| `attack-result` | 공격자 `.attacking` 해제, 짧게 대기 후 `resetFocus()`(transform 초기화, `--dash` 0, dim·focus 해제) |
| `healing-effect` / `resonance` / `job-effect` / `status-*` / `mental-change` / `shinmyeong-change` / `dot-tick` / `enemy-heal` | 1차와 같음. 막대는 `[data-bar="hp:id"]` 등을 갱신하고 `.mental-orb`의 `--m`도 갱신 |
| `unit-death` | `.dying` → 0.7초 후 `.dead` |
| `stage-clear` / `party-recovery` / `run-over` | 1차와 같음. 재생 후 각 모달 표시 |

**카메라 계산** (transform-origin 0 0, 확대 배율 z):

```text
tx = W/2 - fx*z,  ty = H*0.55 - fy*z
tx 범위 [W - W*z, 0],  ty 범위 [H - H*z, 0]
```

`(fx, fy)`는 두 유닛 기준 위치의 중점입니다.
- x = `--x`% × W
- y = H − `--b`% × H − sprite-box 높이 / 2

### 4-6. 입력

1. 스킬 카드를 클릭하면 `ui.pending`이 됩니다. 같은 카드를 다시 누르면 취소입니다.
2. 전장의 적(`.unit.targetable .sprite-box`)이나 `#targetTray` 버튼을 누르면 `battle.setCommand`가 실행됩니다.
3. Esc로 선택을 취소합니다.
4. 흉상(`.bust`)을 0.8초 이상 누르면 강신합일 칸 선택 창이 열립니다. `.fuse-btn` 클릭이나 흉상 키보드 클릭(`e.detail === 0`)도 같은 창을 엽니다.
5. `전투 개시`는 `battle.canConfirm()`일 때만 누를 수 있습니다.

---

## 5. 남은 작업 체크리스트 (tasks.md 9~12절 대응)

- [ ] **tasks.md 9.1~9.5 체크 표시**: 구현과 테스트는 끝났습니다. `Shamanism/`과 `openspec/changes/...` 양쪽을 고치세요.
- [ ] **3-1** `bust-yujin.png` 재생성 (10.3)
- [ ] **에셋 검수 (10.1~10.3)**: 30장(대기 12, 공격 12, 흉상 4, 배경 2)을 볼 때 확인할 것:
  - 투명 배경, 바라보는 방향, 대기·공격 포즈 간 캐릭터 일관성
  - 글자·로고가 없는지
  - 방향이 틀린 이미지는 `app.js`의 `SPRITE_FLIP`으로 반전하거나 다시 생성
- [ ] **WebP 변환 (10.4)** — 아래 스크립트 참고:
  - 출력 위치: `assets/sprites/<unit>-idle.webp`, `assets/sprites/<unit>-attack.webp`, `assets/busts/<id>.webp`, `assets/bg-boundary.webp`, `assets/bg-boss.webp`
  - 파일명 규칙: raw2의 `player-`, `enemy-` 접두사는 떼고, 보스는 `boss-rage` → `rage-boss`로 바꿉니다. `data.js` 경로와 일치해야 합니다.
- [ ] **`assets/PROMPTS.md` 갱신**: v2 프롬프트 설명을 추가합니다.
- [ ] **`app.js` 재작성 (11.1~11.6)** — §4 설계대로.
- [ ] **통합 검증 (12.1~12.3)**: 테스트, 브라우저에서 1~6스테이지(보스·강신합일 포함), 좁은 화면, 콘솔 오류, `openspec validate`.
- [ ] **README.md 갱신**: 새 규칙(속도·타수·승률), 새 에셋, 파일 구조, 조작법.
- [ ] **정리 여부 결정**: 구 1차 에셋(`assets/player-*.webp`, `enemy-*.webp`, `boss-*.webp`, `bg-battlefield.webp`)과 `assets/raw2/`의 git 포함 여부. 수호령 `guardian-*.webp`는 계속 사용합니다.
- [ ] **tasks.md 10~12절 체크 표시**, 그다음 사용자에게 커밋할지 확인.

### WebP 변환 스크립트 (1차 때 쓴 방식, Pillow 필요)

```python
# python -I convert.py  (Prototype 5 26.10.12/assets 에서 실행)
import os
from PIL import Image
os.makedirs('sprites', exist_ok=True); os.makedirs('busts', exist_ok=True)
for f in sorted(os.listdir('raw2')):
    name, src = os.path.splitext(f)[0], os.path.join('raw2', f)
    im = Image.open(src)
    if name.startswith('bg-'):
        im = im.convert('RGB'); im.thumbnail((1920, 1920), Image.LANCZOS)
        im.save(f'{name}.webp', 'WEBP', quality=80, method=6); continue
    im = im.convert('RGBA')
    bbox = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    if bbox: im = im.crop(bbox)
    if name.startswith('bust-'):
        im.thumbnail((360, 360), Image.LANCZOS); out = f"busts/{name[5:]}.webp"
    else:
        unit = name.replace('player-', '').replace('enemy-', '')
        if unit.startswith('boss-'):            # boss-rage-idle -> rage-boss-idle
            _, emo, pose = unit.split('-'); unit = f'{emo}-boss-{pose}'
        im.thumbnail((900 if 'boss' in unit else 720,) * 2, Image.LANCZOS); out = f'sprites/{unit}.webp'
    im.save(out, 'WEBP', quality=84, method=6)
```

주의할 점이 있습니다. 대기·공격 포즈를 각각 여백 자르기(crop)하면 두 이미지의 크기와 발 위치가 달라집니다. 포즈를 바꿀 때 캐릭터가 튀지 않으려면 둘 중 하나를 택하세요.
- 같은 유닛의 두 포즈는 두 bbox를 합친 범위로 함께 자르고 같은 높이로 맞춥니다.
- 또는 CSS에서 하단 정렬과 높이 기준으로 맞춥니다.

---

## 6. 환경·작업 메모

- **경로:** Windows + Git Bash. 경로에 공백이 있으니 항상 따옴표로 감싸세요.
- **heredoc:** Bash 도구의 heredoc이 따옴표·백틱이 섞인 긴 내용에서 깨진 적이 있습니다. 긴 패치는 파일로 저장한 뒤 `python 파일.py`로 실행하는 편이 안전했습니다.
- **미리보기 패널이 숨겨져 있을 때:** CSS 애니메이션과 타이머가 멈추거나 느려집니다. 애니메이션 상태를 스크린샷으로 판정하지 말고 화면에 띄워서 확인하세요.
- **자동 테스트 클릭:** 합성 클릭은 오디오 컨텍스트를 열지 않습니다. 사운드는 실제 클릭으로 확인해야 합니다.
- **연출이 결과를 바꾸지 않는 구조:** `battle.resolveTurn()`이 이벤트 배열을 돌려주고 UI는 재생만 합니다. 재생 시작 시 `render()`를 부르면 결과가 미리 보이니 부르지 마세요(1차에서 고친 버그).
- **테스트:** 외부 의존성 없이 `node tests/run-tests.js`로 돌립니다. `createSequenceRng([])`는 모든 굴림을 0으로 고정합니다(윷=도, 가중치 선택=첫 항목). 강제 승패는 적 `clashPower`를 0이나 50으로 조정합니다.
- **1차 기본값:** SPEC에 없던 값은 `design.md` §10과 `README.md`의 "구현 기본값" 절에 있습니다. 2차 규칙 수치는 `turn-based-clash-combat` spec의 데이터 표와 일치합니다.
