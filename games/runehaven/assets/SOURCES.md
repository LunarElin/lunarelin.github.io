# 룬빛상회 리소스 출처

원본 팩 전체는 저장소에 넣지 않았다. 아래 선택 모델, 그 모델이 참조하는 색상 팔레트, 라이선스만 로컬로 제공한다. GLB와 팔레트의 원본 바이트는 변경하지 않았다. `manifest.json`에 논리 이름, 원래 팩 내부 경로, SHA-256, 애니메이션, 크기, 권장 스케일을 기록했다.

2026-10-27 그래픽 단순화 후에는 아래 GLB 인물·가구를 게임 시작 때 읽지 않는다. 해당 파일과 아틀라스 색상 코드는 이전 자산·회귀 검증을 위해 보관하며, 현재 인물·시설·식당은 `simple-actors.mjs`, `shop-visuals.mjs`, `dining-visuals.mjs`의 직접 제작한 기본 도형으로 표시한다. 글꼴은 기존 출처를 유지하고, 단골 별·강화 화살표는 아래의 직접 작성한 SVG를 사용한다.

2026-10-30에는 [더티니핑 공식 SAMG 상점](https://www.theteenieping.com/)에서 보이는 큰 눈·크림색 얼굴·분홍/하트의 시각 특성을 참고해 파스텔 요정풍으로 변경했다. 실제 캐릭터·이미지·로고를 복사하지 않고 인물 형상·얼굴·시설·아이콘을 코드와 SVG로 직접 작성했다. 현재 방향과 표시 예산은 [ART.md](ART.md)에 기록한다. 아래 Kenney·글꼴·보관 GLB의 라이선스 이력은 그대로 유지한다.

## Kenney 3D 모델

공식 팩 페이지의 CC0 표시와 각 다운로드에 동봉된 라이선스를 함께 확인했다.

| 팩 | 원본 URL | 실제 보관 파일 | 동봉 라이선스 |
| --- | --- | --- | --- |
| Mini Dungeon 2.0 | https://kenney.nl/assets/mini-dungeon | `character-human.glb`, `character-orc.glb`, `barrel.glb`, `chest.glb`, `pot.glb`, `potion.glb`, `table.glb`, `chair.glb`, `weapon-sword.glb`, `shield-round.glb`, `coin.glb`, `Textures/colormap.png` | `licenses/kenney-mini-dungeon-CC0.txt` |
| Furniture Kit 2.0 | https://kenney.nl/assets/furniture-kit | `bookcaseClosed.glb`, `bedSingle.glb` | `licenses/kenney-furniture-CC0.txt` |
| Fantasy Town Kit 2.0 | https://kenney.nl/assets/fantasy-town-kit | `lantern.glb`, `stall-red.glb`, `Textures/colormap.png` | `licenses/kenney-fantasy-town-CC0.txt` |

모델은 팩별 `models/<pack>/`에 보관해 각 GLB의 상대 팔레트 경로를 유지한다. Mini Dungeon의 사람·오크는 `idle`, `walk`, `sprint`, `interact-right` 등을 포함한 애니메이션 32개를 각각 포함한다. 직업별 모자·지팡이·활과 대장간의 모루·화덕 등은 게임 코드의 기본 도형으로 조합할 수 있다. 게임에서의 스케일 조정, 배치, 복제, 그림자 설정은 실행 중 적용하며 원본 파일을 덮어쓰지 않는다.

이전 GLB 표현의 `actor-appearance.mjs` 처리기는 의상의 아틀라스 UV를 기존 색상 띠로 바꿨다. 당시 주인공은 보라·아이보리, 손님은 파란 의상과 머리 덮개, 조수는 금색, 수호대는 청록, 적은 붉은 옷으로 구분했다. 피부·얼굴·눈의 색상 영역과 원본 geometry·텍스처·애니메이션은 유지했으며, 모델·팔레트 이미지 파일 자체는 수정하지 않았다. 현재 실행에서는 같은 파일의 역할 팔레트만 공유 요정 인물에 사용하며 보관용 GLB 처리기와 구분한다.

## 한글 글꼴

- 글꼴: Jua Regular, Google Fonts 공식 저장소 `https://github.com/google/fonts/tree/main/ofl/jua`.
- 실제 제공: `fonts/Jua-Regular.woff2`.
- 라이선스: SIL Open Font License 1.1, 원문 `licenses/Jua-OFL.txt`.
- 가공: 원본 TTF를 FontTools로 WOFF2 컨테이너에 무손실 압축했다. 글리프·윤곽선·글꼴 이름을 바꾸거나 일부 문자만 남기는 서브셋 처리는 하지 않았다.
- 크기: 원본 TTF 2,119,352바이트 → WOFF2 369,204바이트.

## 규칙 참고와 직접 제작한 UI 아이콘

`Burger Please!`는 생산·운반·판매·강화와 매장 운영 규칙을 이해하기 위해 참고했다. 영상만으로 파악하기 어려운 규칙을 이해하기 위한 참고이며, 원작의 코드·이미지·모델·음원은 사용하지 않는다.

| 게임 내 파일 | 제작 방식 | 용도 |
| --- | --- | --- |
| `icons/patron-star.svg` | 이 게임을 위해 직접 작성한 벡터 도형 | 단골 표시의 금빛 별 |
| `icons/upgrade-arrow.svg` | 이 게임을 위해 직접 작성한 벡터 도형 | 강화 버튼의 상승 화살표 |

두 SVG는 텍스처·아이콘 파일을 변환하거나 복사한 것이 아니다. 파일 경로와 SHA-256은 `manifest.json`의 `icons`에 기록한다. 별도로 사용하는 Kenney 모델과 Jua 글꼴의 출처·라이선스는 위 항목을 따른다.

앱·상회 아이콘 `../icon.svg`도 직접 작성한 벡터다. 책·하트·요정 날개를 크림·분홍·민트 색면과 아래쪽 두께로 조합했으며 외부 캐릭터·로고·이미지 파일을 사용하지 않는다.

## 직접 제작한 그래픽

작업장 버튼의 망치·검·가마솥·물약·침대 SVG와 지역의 지형·장식 기본 도형은 이 게임을 위해 직접 작성했다. 외부 아이콘 글꼴에 의존하지 않는다. 현재 요정 인물은 큰 둥근 머리·역할색 머리방울·크림 얼굴·큰 눈과 하이라이트·분홍 볼·미소·작은 이마 보석과 가슴 하트를 하나의 공유 스킨 메시에 합친다. 몸은 1,200 triangles·8 bones·1 draw이며 이미지 텍스처를 쓰지 않는다. 마법사 모자와 전투 무기는 별도 메시다. 기본 높이 1.3, 역할별 배율, 머리 위 운반 공간과 기존 카메라 기준은 유지한다. geometry·재질을 공유하며 인물마다 복제한 외부 모델·이미지를 로드하지 않는다.

상점 시설은 기존 외곽 크기 안에서 상자 정점을 안쪽으로 둥글게 다듬고 파스텔 색을 적용했다. 지역 바닥의 큰 색면·대표 나무 2개·야외 마당도 같은 색감으로 맞췄다. 시설·지형에 새 텍스처·반사 환경·조명을 추가하지 않았으며, 자세한 형태·팔레트·예산은 [ART.md](ART.md)를 따른다.

`dining-visuals.mjs`의 음식은 그릇과 내용물 2개 기본 도형을 공유 단일 메시로 합친다. 식사용 테이블 4개에는 각각 의자 2개와 좌석별 그릇 2개를 마주 배치한다. 각 자리의 식사·식후 상태와 청소 진행에 따라 그 자리의 그릇을 바꾸거나 줄인다. 의자 8개의 좌판·등받이·받침은 하나의 공유 geometry로 합치며, 식탁 상판의 기존 외곽 크기는 유지한다. 식탁·의자·주방·배식대와 솥은 무문양 기본 도형으로 만들며 이전 가구 GLB를 로드하지 않는다.

주방 조리 재고와 배식대 재고는 각각 최대 8개 인스턴스를, 주인공·조수의 머리 위 음식은 각자 최대 60개 인스턴스 버퍼를 재사용하며 같은 음식 geometry·재질을 공유한다. 손님이 여러 음식을 받으면 받은 수량만큼 앞손 위치 y 0.65·z 0.35에 안고 있도록 같은 공유 음식을 인스턴스로 표시한다. 착석하면 손의 음식 대신 해당 좌석의 그릇을 보여준다.

`product-visuals.mjs`의 장비·물약도 직접 작성한 기본 도형과 공유 인스턴스 버퍼를 사용한다. `cargo-layout.mjs`는 머리 위 운반 기준점 y 1.4·z 0.14와 층 간격 장비 0.17·물약 0.31·음식 0.16을 공유한다. 물약은 병 몸체와 뚜껑을 포함한 높이를 0.30 이하로 만들어 층 사이 관통을 피한다. 운반 중의 층별 작은 흔들림과 수량 변화 시 180ms 팝은 합친 시각 변위를 0.04 이내로 제한하며 멈추면 중립으로 돌아간다. 고정 재고에는 이 흔들림을 적용하지 않는다. 전달 연출은 실제 적재층의 위치에 도착한 뒤 해당 물건을 표시한다. 이 움직임·시간은 웹게임에서 정한 피드백이며 원작에서 추출한 연출 값으로 취급하지 않는다. 새 외부 이미지·모델·텍스처 파일은 추가하지 않았다.

## Three.js

- 공식 npm 배포본 `https://registry.npmjs.org/three/-/three-0.170.0.tgz`, 버전 `0.170.0`.
- 실제 파일: `../vendor/three.module.js`, `GLTFLoader.js`, `BufferGeometryUtils.js`, `SkeletonUtils.js`.
- 원본 MIT 라이선스: `../vendor/LICENSE-three.txt`.
- 가공: 공식 minified core를 `three.module.js`로 보관하고 addon의 `three` 및 유틸리티 import를 로컬 상대 경로로 바꿨다. 렌더링·로더 로직은 바꾸지 않았다. 원래 경로와 변경 전·후 SHA-256은 `../vendor/manifest.json`에 있다.
- 런타임 CDN, 저장소 루트 패키지 설치, 다른 게임 코드에 의존하지 않는다.

Jua·Kenney 동봉 라이선스 파일은 문구를 유지하고 행 끝 공백과 개행만 정규화했다.
