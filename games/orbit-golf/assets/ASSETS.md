# 스페이스 골프 리소스

모든 실행 리소스는 이 폴더에서 상대 경로로 제공한다. 게임 실행 중 외부 CDN·폰트·이미지 서버를 요청하지 않는다. 아래 원본은 2026-10-23에 확인했다.

## Kenney Space Kit

- 팩: **Space Kit**, 다운로드 팩의 동봉 표기 버전 **2.0**.
- 제작자: Kenney.
- 상세 페이지: <https://kenney.nl/assets/space-kit>
- 원본 다운로드: <https://kenney.nl/media/pages/assets/space-kit/20874c75ac-1677698978/kenney_space-kit.zip>
- 라이선스: **CC0 1.0**. 팩 동봉 문서를 [models/LICENSE-Kenney.txt](models/LICENSE-Kenney.txt)에 보관했다. 공식 사용 안내: <https://kenney.nl/support>.
- 전체 팩은 임시 폴더에만 추출하고 다음 GLB 네 개만 반입했다. 원본 GLB의 기하·색상·재질은 변경하지 않았다. 게임에서 크기·위치·회전과 조명만 조정한다.

| 실제 파일 | 용도 | 크기 |
| --- | --- | ---: |
| `models/astronautA.glb` | 플레이어 우주인 | 27,912 B |
| `models/alien.glb` | 트랙의 방해 우주인 | 27,784 B |
| `models/craft_speederA.glb` | 다른 트랙으로 운송하는 우주선 | 20,496 B |
| `models/meteor.glb` | 혜성·운석 방해물 | 6,496 B |

GLB는 외부 이미지나 버퍼 없이 독립 실행 가능하다. 모두 꼭짓점 색상을 사용하며 Draco·KTX 등의 별도 디코더가 필요 없다. 원본 최상위 모델 노드에는 `(2, 0, 1.5)` 위치가 있으므로 배치할 때 원점으로 정규화한다. 우주인에는 `head`, `body`, `armLeft`, `armRight`, `legLeft`, `legRight` 노드가 있다.

## Jua 글꼴

- 글꼴: **Jua Regular**, 우아한형제들(배달의민족) 제작.
- 공식 Google Fonts 저장소: <https://github.com/google/fonts/tree/main/ofl/jua>
- 원본: <https://raw.githubusercontent.com/google/fonts/main/ofl/jua/Jua-Regular.ttf>
- 라이선스: **SIL Open Font License 1.1**. 원문은 [fonts/OFL-Jua.txt](fonts/OFL-Jua.txt).
- 실행 파일: `fonts/Jua-Regular.woff2` (368,648 B).
- 가공: 원본 TTF(2,119,352 B)를 fontTools 4.67.0 및 Brotli 1.2.1로 WOFF2 형식으로 압축했다. 글리프·글꼴 이름·디자인을 변경하거나 부분 집합으로 줄이지 않았다. 변환 도구와 원본 TTF는 게임에 포함하지 않았다.
- CSS에서는 `font-display: swap`을 사용하고 시스템 한글 글꼴을 대체 글꼴로 지정한다.

## Three.js

- 버전: **0.160.1** (r160).
- 공식 프로젝트: <https://github.com/mrdoob/three.js/tree/r160>
- 라이선스: **MIT**. 원문은 [vendor/LICENSE-three.txt](vendor/LICENSE-three.txt).
- `vendor/three.module.js`: npm `three@0.160.1/build/three.module.min.js`를 로컬 이름으로 저장한 670,681 B의 독립 ES 모듈. <https://unpkg.com/three@0.160.1/build/three.module.min.js>
- `vendor/GLTFLoader.js`: 같은 버전의 `examples/jsm/loaders/GLTFLoader.js`. <https://unpkg.com/three@0.160.1/examples/jsm/loaders/GLTFLoader.js>
- `vendor/BufferGeometryUtils.js`: 같은 버전의 `examples/jsm/utils/BufferGeometryUtils.js`. <https://unpkg.com/three@0.160.1/examples/jsm/utils/BufferGeometryUtils.js>
- 가공: 두 보조 모듈의 `three` import를 `./three.module.js`로, GLTFLoader의 유틸리티 import를 `./BufferGeometryUtils.js`로 바꿨다. 나머지 구현은 변경하지 않았다. 런타임 패키지 설치·외부 import map이 필요 없다.

트랙·골프공·배경 별·이펙트는 게임 코드에서 기하 도형으로 생성한다. 효과음은 Web Audio로 생성하므로 별도의 외부 음원은 사용하지 않는다.
