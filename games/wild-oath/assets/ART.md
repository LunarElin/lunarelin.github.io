# 리소스 출처

## 액션 카드 삽화 v2

2026-10-28 추가. 기존 생성 캐릭터를 참고해 내장 ImageGen으로 카드 효과 삽화 12종을 만들었다. 320×160 WebP 총153,470 bytes만 배포하며 기존 초상화는 유지한다. [제작·프롬프트·제한](cards-v2/ART.md), [출처·정규화·체크섬 manifest](cards-v2/manifest.json), [아트 방향](art-direction-brief.md)을 참고한다. 생성 원본 PNG는 게임 폴더에 포함하지 않는다.

## 캐릭터·전장 아틀라스

- 파일: `characters-pop.webp` (1536×1024, 295,712 bytes).
- 제작: OpenAI 내장 ImageGen 도구로 야생의 서약을 위해 생성한 오리지널 이미지. 참고 게임의 설치 파일이나 Steam의 이미지를 추출·복제하지 않았다.
- 가공: 원본 PNG를 같은 해상도의 WebP 품질 86으로 인코딩했다. 원본 PNG는 게임 배포에 포함하지 않는다.
- 배열: 3열×2행, 각 셀 512×512. CSS `background-size: 300% 200%`로 사용한다.

| 셀 | 대상 | background-position |
| --- | --- | --- |
| 위 왼쪽 | 둥근 은빛 늑대 | `0% 0%` |
| 위 가운데 | 주황 돌 갑옷 곰 | `50% 0%` |
| 위 오른쪽 | 아기 비취 와이번 | `100% 0%` |
| 아래 왼쪽 | 작은 뿔의 드루이드 | `0% 100%` |
| 아래 가운데 | 이끼 나무 수호자 | `50% 100%` |
| 아래 오른쪽 | 밝은 숲 전장 | `100% 100%` |

생성 프롬프트:

> Use case: stylized-concept. Asset type: ORIGINAL mobile fantasy card battler sprite atlas for Wild Oath. Create one landscape image aspect 3:2 composed of EXACTLY 3 columns and 2 rows of equal square panels flush edge to edge, NO gutters NO borders NO text. Each panel an independent clear centered subject, keep entire face well inside central 65% of its square. Top-left: adorable brave chubby silver white wolf with large blue eyes, small ears, rounded paws, playful confident expression. Top-middle: friendly stout caramel brown bear with a few big smooth orange stone armor pieces, round cheeks and chunky paws. Top-right: cute emerald jade wyvern baby dragon, rounded little horns, small wings, round belly, friendly determined face. Bottom-left: adorable young forest druid with rounded green hood, two little antlers, warm human face big eyes and leaf staff, mint cloak. Bottom-middle: whimsical grumpy mossy tree guardian with short stubby wooden limbs, round amber eyes, soft mushroom/leaf details. Bottom-right: EMPTY bright enchanted forest clearing game arena with puffy round trees, chunky stones, soft green grass, blue sky, no creature. Style across all six: polished cheerful casual mobile game, soft 3D clay/toy rendering, simple chunky silhouettes, smooth inflated rounded forms, big color blocks, warm cream highlights, soft ambient occlusion, clear consistent upper-left studio lighting, subtle material gradients and tactile volume. Bright lively palette mint green, sky blue, sunshine yellow, coral orange, cream. Each creature on a clean softly contrasting pastel backdrop. Friendly pop storybook feeling, not dark fantasy. Excellent readability at a tiny 80px portrait. High quality finished production game illustration, coherent scale and style. Avoid realistic fur, photographic texture, intricate details, scary claws, sharp angles, moody cinematic darkness, black backgrounds, tiny glows, watermarks, lettering, UI frames. Each cell square, no cropped faces, no cross-cell overlap.

## 한글 글꼴

- 파일: `DoHyeon-Regular.ttf` (원본 그대로).
- 글꼴: Do Hyeon, Copyright 2018 The Do Hyeon Project Authors.
- 공식 배포: <https://github.com/google/fonts/tree/main/ofl/dohyeon>.
- 라이선스: SIL Open Font License 1.1. 동봉한 `FONT-LICENSE.txt`에 전문을 보관한다.
- 로컬 제공. 네트워크 폰트 서비스에 런타임 의존하지 않는다.

## 타격 효과음

- 팩: Kenney **Impact Sounds 1.0**.
- 공식 상세: <https://kenney.nl/assets/impact-sounds>.
- 라이선스: CC0 (Creative Commons Zero). 공식 상세와 팩 안의 `License.txt`를 모두 확인했다. 배포본에 `KENNEY-LICENSE.txt`로 동봉한다.
- 실제 사용 파일: `impactPunch_heavy_000.ogg`, `impactPunch_medium_000.ogg`, `impactPlate_heavy_000.ogg`, `impactSoft_heavy_000.ogg`.
- 가공: 없음. 필요한 네 파일만 반입했다 (총 37,019 bytes). 팩 원본과 미사용 오디오를 저장소에 포함하지 않는다.
- 이전 iOS Safari에서 OGG 디코딩이 불가능할 수 있으므로 게임은 오디오 실패 시에도 조작·전투를 유지해야 한다.

확인일: 2026-10-21.

## 둥근 UI 그래픽

- 팩: Kenney **UI Pack 2.0** (2024-06-12).
- 공식 상세: <https://kenney.nl/assets/ui-pack>. 상세 페이지의 Creative Commons CC0 표기와 ZIP 동봉 `License.txt`를 확인했다.
- 라이선스: CC0 (Creative Commons Zero). 원문은 `kenney-pop/LICENSE.txt`에 보관한다.
- 사용 목적: 플레이어·상대의 별도 덱 뒷면, 진영별 드로우 화살표, 출전·재섞기 아이콘. 둥근 입체 UI에 필요한 원본 SVG 다섯 개만 반입했다 (6,411 bytes). 글꼴·PNG·미사용 벡터·전체 팩은 배포하지 않는다.
- 가공: 아래 이름으로 변경하고 화면에서 크기만 조정한다. 원본 SVG의 모양과 색은 변경하지 않았다.

| 프로젝트 파일 | 팩 내 원본 파일 | 실제 용도 |
| --- | --- | --- |
| `kenney-pop/star.svg` | `Vector/Yellow/star.svg` | 양쪽 덱 뒷면 별 |
| `kenney-pop/arrow-blue.svg` | `Vector/Blue/arrow_basic_e.svg` | 플레이어 덱에서 플레이 영역으로 향하는 화살표 |
| `kenney-pop/arrow-red.svg` | `Vector/Red/arrow_basic_e.svg` | 상대 덱에서 플레이 영역으로 향하는 화살표 |
| `kenney-pop/play.svg` | `Vector/Extra/icon_play_dark.svg` | 출전 버튼 |
| `kenney-pop/repeat.svg` | `Vector/Extra/icon_repeat_dark.svg` | 재섞기 안내 |

확인일: 2026-10-21. 런타임에는 외부 사이트에 접근하지 않고 이 폴더의 파일을 상대 경로로 제공한다.
