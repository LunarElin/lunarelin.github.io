# 선술집 판타지 아트 v3

2026-10-29. `create-game-assets`와 `imagegen` 스킬을 적용했다. 기존 파스텔/클레이 리소스를 내용 정체성 참고로만 사용하고, 성숙한 영웅 판타지의 붓질·짙은 명암·보석색 조명으로 새로 생성했다. 게임 UI의 어두운 목재·가죽·황동 재질에 맞춘 오리지널 삽화다.

## 시각 기준과 선택

- 첫 시안은 은빛 늑대·주황 돌갑옷 곰·비취 와이번·뿔 장식 드루이드·고목 수호자·빈 숲 전장의 3×2 아틀라스다.
- 기존 유아형 큰 눈과 플라스틱/클레이 재질을 성숙한 동물 비율, 붓으로 칠한 털·바위·나무·금속으로 교체했다. 청록/남색 암부와 왼쪽 위 따뜻한 빛을 공통으로 사용한다.
- 원본과90px 접촉 시트를 확인한 통합 담당자가 이 시안을 시각 기준으로 선택했다. 그 새 시안을 참조해12종 카드 액션 아틀라스를 생성했다.
- 차가운 흰색/사파이어=발톱·얼음, 주황/금색=묵직한 돌·뿌리 타격, 비취=치유/독, 보라/노랑=번개처럼 효과의 큰 형태와 채도를 구분한다. 넓고 밝은 파스텔 배경은 사용하지 않는다.
- 상용 게임의 캐릭터·스크린샷·로고·카드 프레임·UI 이미지를 추출하거나 삽입하지 않았다. 기존 프로젝트의 생성 캐릭터 정체성만 참조했다.

## 배포 파일과 정규화

| 파일 | 크기 | 내용 |
| --- | --- | --- |
| `portraits.webp` | 1152×768 | 3열×2행, 셀384×384. 순서 wolf/bear/wyvern, druid/guardian/clearing. 기존3×2 CSS 좌표와 호환. |
| `cards/*.webp` | 각각320×160 | 4열×3행 원본의 중앙 가로 절반을 잘라 만든 액션 close-up12종. |

모두 불투명RGB/sRGB WebP다. 품질82·method6, Lanczos 축소를 사용했다. 생성 원본을 의미적으로 재합성·색상 편집하지 않고 격자 분할·중앙 crop·크기/포맷 정규화만 수행했다. 파일별 크기·SHA-256·좌표·피벗·상태는 [manifest.json](manifest.json)에 기록한다.

원본 PNG 두 장은 기본 생성 보관 경로에 유지하고 게임 배포에는 포함하지 않는다. WebP 변환은 원본의 내장 provenance 메타데이터를 보존한다고 보장하지 않으므로 생성 ID·참조·원본 파일명을 manifest에 남긴다.

## 기술·접촉 시트 검증

원본 초상화1536×1024는 정확한3×2, 카드1448×1086는 정확한4×3 격자다. 초상화384px 셀은90px 접촉 시트에서도 얼굴·형태·역광의 구분을 유지한다. 카드362px 셀은 세로 중앙90~271px를 잘라320×160으로 정규화했다.160×80 접촉 시트에서12개 효과의 색·형태를 확인했다.

액션 그림은 초상화가 아니라 효과 close-up이다. 원본의 발/주먹/잎/니/번개/샘은 중앙 crop에 유지되지만 인물의 얼굴·갑옷·주변 숲 일부는 잘린다. 카드에는 `background-size:cover; background-position:center`를 사용한다. 초상화 아틀라스의3×2 배율을 카드 액션 파일에 적용하지 않는다.

생성 결과와 접촉 시트 검증만으로 실제 모바일 품질을 확정하지 않는다. 2026-10-29 통합 후 Codex 내부 브라우저에서 PC·320~390px의 시작 선택·덱·도감·전투를 확인하고, 새 초상화와 액션 그림의 crop·효과/글자 배경을 함께 검토했다. manifest에 이 검토 범위를 반영했다. 실제 iOS/Android 기기·모든 카드 각각의 전투 프레임을 검증한 것은 아니다. 상세는 [통합 검증 기록](../../TAVERN-REDESIGN.md)을 참고한다.

## 출처

- 도구: OpenAI 내장 `image_gen`. 모델 이름/버전은 도구가 공개하지 않았다.
- 생성 ID: `01a18311-10e5-73f0-8baa-8530896ecf51`.
- 초상화 원본: `exec-2d7bce1b-cba2-4412-96a9-44770490e78d.png`.
- 카드 원본: `exec-1e26dc8b-d4ac-42e2-9a8d-98b930e2fbcf.png`.
- 최초 참조: 프로젝트의 `../characters-pop.webp`, 정체성만 참조.
- 카드 참조: 새로 선택한 초상화 생성 원본.
- 이 리소스를 CC0나 제삼자 라이선스 자산으로 표시하지 않는다. 프로젝트용 오리지널 생성 리소스로 관리한다.

## 초상화 생성 프롬프트

```text
Use case: stylized-concept. Asset type: ONE original fantasy card-game portrait sprite atlas, not a UI screenshot, no card frame. Create an exact 3-column by 2-row grid of SIX equal SQUARE edge-to-edge paintings, overall 3:2 landscape, ideally 1536x1024. The attached reference is ONLY an identity/subject guide. REDESIGN its soft baby-toy look completely into richly painted mature heroic-fantasy card illustration: visible confident brush strokes, strong readable silhouettes, deep blue-green forest shadows, saturated sapphire blue, jade green and ruby/copper accents, luminous focused highlights, carved wood and hammered stone/metal with convincing texture. Hand-painted stylization with sculptural anatomy, NOT photorealism and NOT a clay toy render. No pale pastel backdrops, no mint wash, no cheerful sky-blue nursery lighting, no baby proportions or giant toddler eyes. Faces and important details well inside central 65% of EACH cell so each portrait reads at 80px. Tight head-and-shoulders or head-and-upper-body compositions with atmospheric shadowed backgrounds. One coherent upper-left warm key light balanced by cool blue shadow and restrained magical rim light. Exact row order: TOP LEFT an adult noble silver wolf with alert deep blue eyes, elongated adult muzzle, green scarf and emerald leaf talisman; TOP MIDDLE a massive adult brown bear wearing angular amber-orange stone armor and weathered bronze fasteners, sturdy determined expression; TOP RIGHT an adult jade wyvern with elegant angular horn/wing silhouette, emerald scales and sharp intelligent gold eyes, power and poise, not a baby dragon. BOTTOM LEFT an adult forest druid wearing a deep green hood with antler crown and bronze leaf clasp, steady intelligent human face, staff with a glowing jade stone partly visible; BOTTOM MIDDLE a venerable moss-covered tree guardian with rugged carved bark features, large amber eyes and old root shoulders, serious, not a cute mascot; BOTTOM RIGHT an EMPTY dusk woodland arena clearing with carved stones, dark trees, earthy ground, cold moonlight and warm amber light on stone edges, no creatures and no UI. These are completely original designs. No recognizable commercial-game characters, no logos, no letters, numbers, labels, borders, grid dividers, watermarks, cards or mockup chrome. Dark rich midtones but readable faces and focal details, never crushed black. Keep all six paintings separate with no cross-panel overlap.
```

## 액션 카드 생성 프롬프트

```text
Use case: stylized-concept. Asset type: ONE original production fantasy card-action illustration atlas, not UI or card frames. The attached image is the APPROVED STYLE AND ORIGINAL CHARACTER IDENTITY REFERENCE: keep its hand-painted brushwork, mature proportions, angular carved material edges, deep blue-black forest ambient shadows, upper-left warm rim light, saturated jewel-color highlights and textured wood/stone/bronze. Create an exact FOUR-column by THREE-row grid of twelve equal SQUARE panels, edge-to-edge, overall landscape 4:3, ideally 1536x1152. Every panel is separate, with no overlap across cells. No borders, gutters or grid divider lines. CRITICAL COMPOSITION: each panel will be cropped to the CENTRAL HORIZONTAL HALF of its height to make a 2:1 wide picture. The large important effect and identifying subject MUST fit inside that central 25%-75% vertical band and central 85% width. Use wide close-up action compositions and large simple effect shapes. Dark atmospheric forest backgrounds with readable focal objects lit brightly; deep shadows, vivid color, no pale sky wash or pastel cream backgrounds. Physical materials show painterly detail, but avoid fine noisy sparkle dust. EXACT LEFT-TO-RIGHT ROW ORDER: ROW ONE (1) the adult silver wolf's clawed forepaw sweeping THREE broad ivory-white crescent claw streaks through deep blue shadow; (2) the mature brown bear's amber-orange stone gauntlet punching with a weighty stone impact and a few large broken-rock shapes, copper highlights; (3) weathered round wooden bark shield with carved iron/bronze rim and a broad luminous emerald leaf rune, warm highlights on aged grain; (4) a vivid emerald healing droplet and white woodland flower cradled by dark leaves, pale green magical light focused at the center. ROW TWO (5) thick dark amber sap flask in a weathered wooden cradle, gold liquid and THREE brilliant sapphire energy motes, real heavy glass and bronze cap, NOT a cute baby bottle; (6) adult jade wyvern's large ivory fang dripping one emerald venom drop against inky-green scales; (7) dark twisting thorn branch enclosing a blazing deep-orange ember, hard warm rim light and charred texture; (8) large violet storm seed/cloud split by one bold brilliant golden lightning bolt over deep indigo. ROW THREE (9) two adult silver wolf forepaws delivering a double strike, TWO large ivory claw/paw-shaped impact streaks over cobalt shadow; (10) ancient rugged wooden-root fist slamming into stone with a broad gold-orange shock ring and broken stone, dark green moss; (11) broad blue-ice claw slash crossing an angular frosty shield with rich sapphire shadows and bright cold-white edges; (12) a mysterious blue forest moonwell with carved stone rim and a luminous white crescent reflected in indigo water, a few emerald leaves and bronze warmth on the rim. Preserve the approved wolf green talisman/scarf, amber bear stone armor and jade wyvern identity where a face is visible, but effects and action dominate, not full portrait repetition. Painterly stylized mature heroic-fantasy card art, completely original content. NO recognizable commercial-game characters or symbols, no letters, numbers, text, labels, logos, borders, card frames, mockup chrome, watermarks, black empty voids, gore, horror, baby/chibi eyes, toys, clay/plastic render, pastel mint/peach backgrounds, thin filigree or photographic grain.
```
