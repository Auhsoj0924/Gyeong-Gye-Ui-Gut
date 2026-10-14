# 그래픽 에셋 생성 기록

모든 이미지는 Codex CLI(`codex exec`, codex-cli 0.160.0)에서 `$imagegen` 스킬의 기본 built-in `image_gen` 모드로 생성했습니다.
원본 PNG는 `assets/raw/`에 있고, 게임에서 쓰는 `assets/*.webp`는 투명 여백을 잘라내고 최대 640px(보스 760px, 배경 1536px)로 줄여 WebP로 변환한 파일입니다.

## 실행 방법

```bash
cat common.txt batch-a.txt | codex exec -C "Prototype 5 26.10.12" -s workspace-write -
```

## 공통 지시문

```text
You are generating game art assets for a vanilla-web Korean shamanism dark-fantasy turn-based RPG prototype.
Use the $imagegen skill in its DEFAULT built-in image_gen mode (do NOT use the CLI fallback scripts/image_gen.py, and do not ask for an API key).
Generate EACH asset below with its own separate image_gen call (one call per asset). Do not ask me any questions; just proceed.

Shared art direction for every asset:
- Style/medium: Korean shamanism (musok) dark fantasy illustration, painterly digital art with ink-brush strokes and hanji paper texture, subtle talisman (bujeok) motifs, strong silhouette readable at small size, game-ready character art.
- Color palette: ink black, deep indigo, vermilion, antique gold, plus the per-asset accent color given below.
- Original designs only; do not copy existing games, dramas, webtoons or specific artists.
- Absolutely no text, no letters, no Hanja or Hangul characters, no UI, no watermark, no signature, no frame or border.

After all images are generated, COPY each final image (keep it as PNG) into the current working directory's assets/raw/ folder using EXACTLY the filename given for that asset. Never leave the asset only under CODEX_HOME/generated_images. Do not modify any other file.
Finally print a short list of the saved file paths.

Assets for this batch:
```

## 묶음 a

```text
1) assets/raw/player-hando.png - Use case: stylized-concept. Character sprite, full body, standing battle pose, 3/4 view FACING RIGHT, transparent background (real alpha). Han Doyun, a young male front-line ward shaman (aekmagi mudang, the tank). Layered white and indigo shaman robes with vermilion sash, a large cluster of brass shaman bells (bangul) in one hand and a tall carved wooden jangseung-pattern ward staff in the other, protective stance. Accent color: teal (calm). Vertical portrait framing, whole figure visible with small margin.
2) assets/raw/player-mugyeom.png - Use case: stylized-concept. Character sprite, full body, dynamic sword-dance pose, 3/4 view FACING RIGHT, transparent background (real alpha). Kang Mugyeom, a fierce male blade-dance shaman (kalchum mudang, the damage dealer). Red and black shaman costume with flowing sleeves, two curved ritual knives (shinkal) with ribbon tassels, dokkaebi-inspired horned hair ornament. Accent color: vermilion (courage). Vertical framing, whole figure visible.
3) assets/raw/player-chohui.png - Use case: stylized-concept. Character sprite, full body, graceful pose, 3/4 view FACING RIGHT, transparent background (real alpha). Yun Chohui, a young female salpuri shaman (the healer). White hanbok-style shaman robe, a long white salpuri silk scarf flowing in an arc, glowing violet thread spools floating around her hands. Accent color: violet (release, haewon). Vertical framing, whole figure visible.
4) assets/raw/player-yujin.png - Use case: stylized-concept. Character sprite, full body, casting pose, 3/4 view FACING RIGHT, transparent background (real alpha). Baek Yujin, a young female talisman shaman (bujeok mudang, the mage). Indigo and gold robe with a wide ritual hat, a fan of glowing yellow paper talismans spread in the air (no readable writing, only abstract red brush swirls), five-direction obangsaek cords. Accent color: gold (hope). Vertical framing, whole figure visible.
5) assets/raw/bg-battlefield.png - Use case: stylized-concept. Wide landscape game battle background, landscape 1536x1024. The boundary between the living world and the underworld at night: a misty dark riverbank, sotdae bird poles and faded five-color cloth strips on the left, a gloomy ghostly far shore with dim paper lanterns and a faint underworld gate silhouette on the right, moonlit indigo fog. Keep the lower-middle ground fairly flat, low-contrast and EMPTY (no characters, no creatures) so character sprites can stand on it. This one is fully opaque (no transparency).
```

## 묶음 b

```text
1) assets/raw/guardian-haetae.png - Use case: stylized-concept. Guardian spirit, transparent background (real alpha), facing right, semi-ethereal glowing spirit with smoky edges. Byeoksa, a haetae (mythical Korean lion-dog justice beast) guardian spirit, stone-and-light body with curled mane, single horn, protective roar. Accent color: teal and gold glow. Square framing, whole creature visible.
2) assets/raw/guardian-cheolbi.png - Use case: stylized-concept. Guardian spirit, transparent background (real alpha), facing right, semi-ethereal glowing spirit with smoky edges. Cheolbi, a dokkaebi general (Korean goblin warlord) in iron lamellar armor holding a huge spiked dokkaebi club, single horn, fierce grin, thunder sparks. Accent color: vermilion glow. Square framing, whole figure visible.
3) assets/raw/guardian-bari.png - Use case: stylized-concept. Guardian spirit, transparent background (real alpha), facing right, semi-ethereal glowing spirit with smoky edges. Princess Bari (Barigongju), the shamanic guide of the dead: serene woman in flowing white and pale-gold robes holding a glowing flower of life and a willow branch, a soft path of light trailing behind. Accent color: violet and soft gold glow. Square framing, whole figure visible.
4) assets/raw/guardian-geumo.png - Use case: stylized-concept. Guardian spirit, transparent background (real alpha), facing right, semi-ethereal glowing spirit. Geumo, the three-legged golden sun crow (samjogo) with wings spread wide, radiant sun-disc halo behind it, flame-like feathers. Accent color: gold glow. Square framing, whole creature visible.
```

## 묶음 c

```text
1) assets/raw/enemy-rage-ghost.png - Use case: stylized-concept. Enemy sprite, full body, 3/4 view FACING LEFT, transparent background (real alpha). Burning wandering ghost (gaekgwi of rage): a gaunt ghost in torn white mourning clothes wreathed in red flames, long clawed hands raised, furious glowing eyes. Accent color: crimson red (rage). Vertical framing, whole figure visible.
2) assets/raw/enemy-anxiety-ghost.png - Use case: stylized-concept. Enemy sprite, full body, 3/4 view FACING LEFT, transparent background (real alpha). Ghost in the door crack (ghost of anxiety): an unnaturally thin, tall pale ghost with very long black hair, emerging sideways from a fragment of a broken lattice paper door, trembling outline, sickly yellow glow. Accent color: jaundiced yellow (anxiety). Vertical framing, whole figure visible.
3) assets/raw/enemy-obsession-goblin.png - Use case: stylized-concept. Enemy sprite, full body, 3/4 view FACING LEFT, transparent background (real alpha). Knot dokkaebi (goblin of obsession): a squat hunched dokkaebi with one horn, its body wrapped and bound in tangled red fate-threads and knots that it drags along, greedy grin, magenta-purple glow. Accent color: magenta purple (obsession). Vertical framing, whole figure visible.
4) assets/raw/enemy-despair-corpse.png - Use case: stylized-concept. Enemy sprite, full body, 3/4 view FACING LEFT, transparent background (real alpha). Bier dead (corpse of despair): a slumped revenant in hemp funeral mourning garments with paper funeral flowers, carrying a broken piece of a wooden funeral bier on its back, hollow eyes, cold blue-grey mist. Accent color: slate blue-grey (despair). Vertical framing, whole figure visible.
```

## 묶음 d

```text
All four are BOSSES: make them larger, more imposing and more detailed than normal enemies, with a stronger aura.
1) assets/raw/boss-rage.png - Use case: stylized-concept. Boss sprite, full body, 3/4 view FACING LEFT, transparent background (real alpha). Fire-ghost captain (boss of rage): a towering ghost general in burnt Joseon-era style armor, blazing crimson fire mane, a flaming halberd, molten cracks in its body. Accent color: crimson red. Vertical framing, whole figure visible.
2) assets/raw/boss-anxiety.png - Use case: stylized-concept. Boss sprite, full body, 3/4 view FACING LEFT, transparent background (real alpha). Nameless underworld messenger (boss of anxiety): an original-design underworld reaper in tattered black robes with a wide black gat hat whose face is an empty void, holding a long scroll unrolling into yellow wisps (no readable writing), faint whispering spirit faces around. Accent color: sickly yellow. Vertical framing, whole figure visible.
3) assets/raw/boss-obsession.png - Use case: stylized-concept. Boss sprite, full body, 3/4 view FACING LEFT, transparent background (real alpha). Thousand-year knot dokkaebi (boss of obsession): an enormous ancient dokkaebi king with twisted horns, a cloak made of countless red knotted threads binding small trapped spirits, a giant knotted club, magenta-purple aura. Accent color: magenta purple. Vertical framing, whole figure visible.
4) assets/raw/boss-despair.png - Use case: stylized-concept. Boss sprite, full body, 3/4 view FACING LEFT, transparent background (real alpha). Bier king (boss of despair): a giant skeletal mourner-king seated upon and fused with an ornate wooden funeral bier decorated with paper flowers and phoenix carvings, ghostly mourners wailing around it, cold blue-grey mist and tears of light. Accent color: slate blue-grey. Vertical framing, whole figure visible.
```
