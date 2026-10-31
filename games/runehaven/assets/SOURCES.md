# 룬빛상회 리소스 출처

원본 팩 전체는 저장소에 넣지 않았다. 이전 Kenney GLB·팔레트·라이선스는 선택 파일만 보관하며 원본 바이트를 변경하지 않았다. 현재 실행에 사용하는 APK 메시의 별도 출처·변환 범위는 다음과 같다. `manifest.json`에 논리 이름, 원래 팩 내부 경로, SHA-256, 애니메이션, 크기, 권장 스케일을 기록했다.

2026-10-31 사용자의 원본 그래픽 재사용 요청에 따라, 기존 요정 기본 도형 인물·시설 대신 실제 본체 APK에서 정적으로 추출한 선택 메시를 사용한다. `burger-source/mesh-data.mjs`에는 기본 손님, 주인공·앞치마, 카운터, 그릴, 식탁, 의자, 버거, 빈 포장지, 컵, 돈 11종만 포함한다. 파일명·원본 SHA-256·면 수는 [선택 원본 목록](burger-source/manifest.json), 권리·변환·실제 사용은 [원본 메시 출처](burger-source/SOURCES.md)에 기록한다. 이들은 Supercent의 독점 원작 자산이며 아래 Kenney CC0 자산과 구분한다.

현재 렌더링은 원본 정점·면 연결에 웹 크기·피벗·역할색을 적용한다. 원본 사람의 T 자세와 본 가중치를 웹 관절로 변환하고, 원작 애니메이션·셰이더·모든 GameObject transform을 그대로 가져온 것으로 설명하지 않는다. 기존 Kenney GLB와 팔레트는 현재 초기 실행에서 읽지 않으며 과거 자산·회귀 검증용으로 보관한다. 글꼴·직접 작성 SVG의 출처도 유지한다. 자세한 현재 형태·표시 예산은 [ART.md](ART.md)를 따른다.

## Kenney 3D 모델

공식 팩 페이지의 CC0 표시와 각 다운로드에 동봉된 라이선스를 함께 확인했다.

| 팩 | 원본 URL | 실제 보관 파일 | 동봉 라이선스 |
| --- | --- | --- | --- |
| Mini Dungeon 2.0 | https://kenney.nl/assets/mini-dungeon | `character-human.glb`, `character-orc.glb`, `barrel.glb`, `chest.glb`, `pot.glb`, `potion.glb`, `table.glb`, `chair.glb`, `weapon-sword.glb`, `shield-round.glb`, `coin.glb`, `Textures/colormap.png` | `licenses/kenney-mini-dungeon-CC0.txt` |
| Furniture Kit 2.0 | https://kenney.nl/assets/furniture-kit | `bookcaseClosed.glb`, `bedSingle.glb` | `licenses/kenney-furniture-CC0.txt` |
| Fantasy Town Kit 2.0 | https://kenney.nl/assets/fantasy-town-kit | `lantern.glb`, `stall-red.glb`, `Textures/colormap.png` | `licenses/kenney-fantasy-town-CC0.txt` |

모델은 팩별 `models/<pack>/`에 보관해 각 GLB의 상대 팔레트 경로를 유지한다. Mini Dungeon의 사람·오크는 `idle`, `walk`, `sprint`, `interact-right` 등을 포함한 애니메이션 32개를 각각 포함한다. 직업별 모자·지팡이·활과 대장간의 모루·화덕 등은 게임 코드의 기본 도형으로 조합할 수 있다. 게임에서의 스케일 조정, 배치, 복제, 그림자 설정은 실행 중 적용하며 원본 파일을 덮어쓰지 않는다.

이전 GLB 표현의 `actor-appearance.mjs` 처리기는 의상의 아틀라스 UV를 기존 색상 띠로 바꿨다. 당시 주인공은 보라·아이보리, 손님은 파란 의상과 머리 덮개, 조수는 금색, 수호대는 청록, 적은 붉은 옷으로 구분했다. 피부·얼굴·눈의 색상 영역과 원본 geometry·텍스처·애니메이션은 유지했으며, 모델·팔레트 이미지 파일 자체는 수정하지 않았다. 현재 실행에서는 같은 파일의 역할 팔레트만 원본 APK 인물의 역할색에 사용하며 보관용 GLB 처리기와 구분한다.

## 한글 글꼴

- 글꼴: Jua Regular, Google Fonts 공식 저장소 `https://github.com/google/fonts/tree/main/ofl/jua`.
- 실제 제공: `fonts/Jua-Regular.woff2`.
- 라이선스: SIL Open Font License 1.1, 원문 `licenses/Jua-OFL.txt`.
- 가공: 원본 TTF를 FontTools로 WOFF2 컨테이너에 무손실 압축했다. 글리프·윤곽선·글꼴 이름을 바꾸거나 일부 문자만 남기는 서브셋 처리는 하지 않았다.
- 크기: 원본 TTF 2,119,352바이트 → WOFF2 369,204바이트.

## 규칙 참고와 직접 제작한 UI 아이콘

`Burger Please!`는 생산·운반·판매·강화와 매장 운영 규칙을 이해하기 위해 참고했다. 규칙과 조작은 정적 APK·영상 관찰을 참고하고 웹용으로 구현한다. 현재 그래픽에는 위에 기록한 선택 원본 메시를 사용하지만 원작 코드·음원·이미지·UI 로고는 반입하지 않는다.

| 게임 내 파일 | 제작 방식 | 용도 |
| --- | --- | --- |
| `icons/patron-star.svg` | 이 게임을 위해 직접 작성한 벡터 도형 | 단골 표시의 금빛 별 |
| `icons/upgrade-arrow.svg` | 이 게임을 위해 직접 작성한 벡터 도형 | 강화 버튼의 상승 화살표 |

두 SVG는 텍스처·아이콘 파일을 변환하거나 복사한 것이 아니다. 파일 경로와 SHA-256은 `manifest.json`의 `icons`에 기록한다. 별도로 사용하는 Kenney 모델과 Jua 글꼴의 출처·라이선스는 위 항목을 따른다.

앱·상회 아이콘 `../icon.svg`도 직접 작성한 벡터다. 책·하트·요정 날개를 크림·분홍·민트 색면과 아래쪽 두께로 조합했으며 외부 캐릭터·로고·이미지 파일을 사용하지 않는다.

## 직접 제작 UI와 원본 메시 표현

작업장 버튼의 망치·검·가마솥·물약·침대 SVG, 바닥 행동 원과 게이지, 지역 지형·장식은 이 게임에서 작성했다. 외부 아이콘 글꼴은 사용하지 않는다. 이전 요정의 큰 눈·머리방울·하트·보석은 제거했다. 원본의 얼굴 없는 손님과 모자·앞치마 인물에 역할색을 입혀 구분한다.

원본 식탁·의자는 두 좌석을 마주 배치하고 자리별 음식·빈 포장지·청소 진행을 표시한다. 버거와 컵은 미리 할당한 인스턴스 버퍼를 재사용한다. 손님이 받은 실제 수량을 앞손에 표시하고, 주인공·조수는 머리 위 y 1.4·z 0.14에서 한 층씩 쌓는다. 기존 층 간격은 장비 0.17·물약 0.31·음식 0.16을 유지한다.

도착한 새 물건은 340ms 감쇠 반동으로 상단 4층에 들림과 눌림을 전달하고 최대 시각 변위를 0.12로 제한한다. 멈추면 기본 행렬로 돌아가고 고정 재고에는 걷기 흔들림을 적용하지 않는다. 전달·반동·비행 시간은 웹 연출값이며 원작에서 추출한 정확한 시간으로 표시하지 않는다. [현재 아트 기준](ART.md)에 크기·면 수와 변환 한계를 기록한다.

## Three.js

- 공식 npm 배포본 `https://registry.npmjs.org/three/-/three-0.170.0.tgz`, 버전 `0.170.0`.
- 실제 파일: `../vendor/three.module.js`, `GLTFLoader.js`, `BufferGeometryUtils.js`, `SkeletonUtils.js`.
- 원본 MIT 라이선스: `../vendor/LICENSE-three.txt`.
- 가공: 공식 minified core를 `three.module.js`로 보관하고 addon의 `three` 및 유틸리티 import를 로컬 상대 경로로 바꿨다. 렌더링·로더 로직은 바꾸지 않았다. 원래 경로와 변경 전·후 SHA-256은 `../vendor/manifest.json`에 있다.
- 런타임 CDN, 저장소 루트 패키지 설치, 다른 게임 코드에 의존하지 않는다.

Jua·Kenney 동봉 라이선스 파일은 문구를 유지하고 행 끝 공백과 개행만 정규화했다.
