# 룬빛상회 리소스 출처

원본 팩 전체는 저장소에 넣지 않았다. 아래 선택 모델, 그 모델이 참조하는 색상 팔레트, 라이선스만 로컬로 제공한다. GLB와 팔레트의 원본 바이트는 변경하지 않았다. `manifest.json`에 논리 이름, 원래 팩 내부 경로, SHA-256, 애니메이션, 크기, 권장 스케일을 기록했다.

2026-10-27 그래픽 단순화 후에는 아래 GLB 인물·가구를 게임 시작 때 읽지 않는다. 해당 파일과 아틀라스 색상 코드는 이전 자산·회귀 검증을 위해 보관하며, 현재 인물·시설·식당은 `simple-actors.mjs`, `shop-visuals.mjs`, `dining-visuals.mjs`의 직접 제작한 기본 도형으로 표시한다. 기존 글꼴·UI 아이콘의 사용과 출처는 유지한다.

## Kenney 3D 모델

공식 팩 페이지의 CC0 표시와 각 다운로드에 동봉된 라이선스를 함께 확인했다.

| 팩 | 원본 URL | 실제 보관 파일 | 동봉 라이선스 |
| --- | --- | --- | --- |
| Mini Dungeon 2.0 | https://kenney.nl/assets/mini-dungeon | `character-human.glb`, `character-orc.glb`, `barrel.glb`, `chest.glb`, `pot.glb`, `potion.glb`, `table.glb`, `chair.glb`, `weapon-sword.glb`, `shield-round.glb`, `coin.glb`, `Textures/colormap.png` | `licenses/kenney-mini-dungeon-CC0.txt` |
| Furniture Kit 2.0 | https://kenney.nl/assets/furniture-kit | `bookcaseClosed.glb`, `bedSingle.glb` | `licenses/kenney-furniture-CC0.txt` |
| Fantasy Town Kit 2.0 | https://kenney.nl/assets/fantasy-town-kit | `lantern.glb`, `stall-red.glb`, `Textures/colormap.png` | `licenses/kenney-fantasy-town-CC0.txt` |

모델은 팩별 `models/<pack>/`에 보관해 각 GLB의 상대 팔레트 경로를 유지한다. Mini Dungeon의 사람·오크는 `idle`, `walk`, `sprint`, `interact-right` 등을 포함한 애니메이션 32개를 각각 포함한다. 직업별 모자·지팡이·활과 대장간의 모루·화덕 등은 게임 코드의 기본 도형으로 조합할 수 있다. 게임에서의 스케일 조정, 배치, 복제, 그림자 설정은 실행 중 적용하며 원본 파일을 덮어쓰지 않는다.

`actor-appearance.mjs`는 실행 중 의상의 아틀라스 UV를 기존 색상 띠로 바꾼다. 주인공은 보라·아이보리, 손님은 파란 의상과 머리 덮개, 조수는 금색, 수호대는 청록, 적은 붉은 옷으로 구분한다. 피부·얼굴·눈의 색상 영역과 원본 geometry·텍스처·애니메이션은 유지하며, 모델·팔레트 이미지 파일 자체를 수정하거나 추가하지 않았다.

## 한글 글꼴

- 글꼴: Jua Regular, Google Fonts 공식 저장소 `https://github.com/google/fonts/tree/main/ofl/jua`.
- 실제 제공: `fonts/Jua-Regular.woff2`.
- 라이선스: SIL Open Font License 1.1, 원문 `licenses/Jua-OFL.txt`.
- 가공: 원본 TTF를 FontTools로 WOFF2 컨테이너에 무손실 압축했다. 글리프·윤곽선·글꼴 이름을 바꾸거나 일부 문자만 남기는 서브셋 처리는 하지 않았다.
- 크기: 원본 TTF 2,119,352바이트 → WOFF2 369,204바이트.

## 의뢰인이 요청한 원작 게임 리소스 재사용

아래 두 PNG는 이 채팅에서 분석한 `Burger Please!` 31.6.0 (`io.supercent.burgeridle`)의 Sprite 객체 추출물이다. 의뢰인이 추출 리소스의 실제 사용을 요청해 선택했으며, 추출 PNG 바이트를 그대로 복사했다.

| 게임 내 파일 | 원래 추출 파일 | 용도 |
| --- | --- | --- |
| `icons/burger-star.png` | `Icon_Star_128__0a477a10__1821.png` | 금빛 별 보상 아이콘 |
| `icons/burger-upgrade.png` | `upgrade_arrow__416382b5__1.png` | 강화 화살표 아이콘 |

이 원작 상용 게임 PNG에 공개 재배포 라이선스나 CC0 허락이 있다고 확인한 것은 아니다. 권리는 원저작권자에게 남아 있으며, 이 문서는 원본과 사용자 요청의 출처 기록이다. Kenney의 CC0 라이선스와 혼동하지 않는다. 상세 기록은 `licenses/Burger-Please-provenance.txt`에 있다.

## 직접 제작한 그래픽

작업장 버튼의 망치·검·가마솥·물약·침대 SVG와 지역의 지형·장식 기본 도형은 이 게임을 위해 직접 작성했다. 외부 아이콘 글꼴에 의존하지 않는다. 현재의 둥근 단색 인물은 공유 스킨 메시·8개 본으로 구성하며 얼굴·갑옷·텍스처가 없다. 단순 상점 시설과 가구도 직접 만든 상자·원기둥으로 표시하고, 새 외부 모델·텍스처를 추가하지 않았다.

`dining-visuals.mjs`의 음식은 그릇과 내용물 2개 기본 도형을 공유 단일 메시로 합친다. 식후에는 빈 그릇과 식탁 색으로 구분한다. 주방 조리 재고와 배식대 재고는 각각 최대 8개 인스턴스를, 주인공·조수의 머리 위 음식은 각자 최대 60개 인스턴스 버퍼를 재사용하며 같은 음식 geometry·재질을 공유한다. 식사용 테이블 4개·의자 4개·주방·배식대와 솥은 무문양 기본 도형으로 만들며 이전 가구 GLB를 로드하지 않는다. 새 이미지·모델 파일은 추가하지 않았다.

## Three.js

- 공식 npm 배포본 `https://registry.npmjs.org/three/-/three-0.170.0.tgz`, 버전 `0.170.0`.
- 실제 파일: `../vendor/three.module.js`, `GLTFLoader.js`, `BufferGeometryUtils.js`, `SkeletonUtils.js`.
- 원본 MIT 라이선스: `../vendor/LICENSE-three.txt`.
- 가공: 공식 minified core를 `three.module.js`로 보관하고 addon의 `three` 및 유틸리티 import를 로컬 상대 경로로 바꿨다. 렌더링·로더 로직은 바꾸지 않았다. 원래 경로와 변경 전·후 SHA-256은 `../vendor/manifest.json`에 있다.
- 런타임 CDN, 저장소 루트 패키지 설치, 다른 게임 코드에 의존하지 않는다.

Jua·Kenney 동봉 라이선스 파일은 문구를 유지하고 행 끝 공백과 개행만 정규화했다.
