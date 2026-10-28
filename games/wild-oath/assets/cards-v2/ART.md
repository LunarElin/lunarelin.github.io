# 카드 삽화 v2 제작 기록

2026-10-28. `create-game-assets`와 `imagegen` 스킬을 적용했다. 기존 캐릭터 아틀라스 `../characters-pop.webp`를 스타일·캐릭터 정체성의 기준으로 선택한 뒤 내장 OpenAI ImageGen으로 **한 개의 4열×3행 카드 액션 아틀라스**를 생성했다. 기존 캐릭터·원본 리소스는 변경하지 않았다.

## 아트 방향과 기술 조건

- 둥근 토이/클레이 부피, 위쪽 왼편의 부드러운 빛, 큰 색면과 크림색 하이라이트를 유지한다. 기존 은빛 늑대·주황 돌 갑옷 곰·비취 와이번을 참고했다.
- 실제 카드의 2:1 가로 그림 창에서 공격·방어·치유·기력·독·화염·번개가 서로 다른 실루엣으로 읽히도록 한다. 텍스트·숫자·카드 테두리는 이미지에 넣지 않는다.
- 생성 원본: 1448×1086 PNG, 정확히 4열×3행, 셀 362×362.
- 정규화: 각 셀의 중앙 가로 절반을 정수 좌표로 잘라 320×160으로 Lanczos 축소하고 WebP 품질85·method6으로 저장했다. 내용 재합성·재생성·색상 편집은 하지 않았다.
- 배포 파일: 12개, 모두 RGB/불투명/sRGB, 총 **153,470 bytes**. 개별 크기·SHA-256·원본 crop 좌표는 [manifest.json](manifest.json)에 기록한다.
- UI 사용: 중심 pivot(0.5,0.5), 충돌 역할 없음, `background-size: cover; background-position: center`의 장식 그림. 기존 캐릭터 아틀라스의 `300% 200%` 배경 크기를 이 파일에 적용하지 않는다.
- 원본 PNG는 생성 보관 위치에 그대로 두며 게임 배포에 넣지 않는다. 생성 ID: `01a182f6-4da2-7e30-8f63-89fb4362d86c`, 원본 파일명: `exec-2630b50f-d15f-4dd1-9056-e20fc5b439c1.png`.

## 파일과 의도

| 파일 | 주요 형태·효과 |
| --- | --- |
| claw.webp | 은빛 늑대 발과 크림색 발톱 궤적 |
| bite.webp | 주황 돌 갑옷 곰의 바위 주먹 |
| bark.webp | 잎 룬이 빛나는 둥근 나무 방패 |
| mend.webp | 녹색 생명 물방울·하얀 꽃 |
| sap.webp | 금빛 수액 병·푸른 기력 입자 |
| venom.webp | 와이번의 독니와 녹색 독 방울 |
| ember.webp | 화염 가시와 따뜻한 씨앗 |
| storm.webp | 보라 폭풍 구름·큰 노란 번개 |
| pounce.webp | 두 앞발과 두 발자국의 쌍공격 |
| ancient.webp | 고대 뿌리 주먹과 황금 충격 |
| frost.webp | 얼음 발톱과 서리 방패 |
| moonwell.webp | 초승달과 푸른 숲 샘 |

## 검증과 제한

정확한 12칸 배열과 모든 파일의 320×160 크기·포맷을 확인했다. 160×80 접촉 시트에서 주요 효과의 실루엣과 색이 구별되는 것을 확인했다. 인물 얼굴·그림 외곽 일부는 중앙 crop에서 잘리므로 이 이미지는 **액션 close-up용이며 초상화용이 아니다**. 생명 물방울·독니·번개·방패·쌍발의 핵심 형태는 유지된다.

통합 담당자가 Codex 내부 브라우저의 PC·320/390px 세로·844px 가로에서 대표 삽화를 실제 선택·정비·보상·도감·전투 배경과 함께 확인했다. 작은 전투에서는 일반 카드 그림 높이를30px로 늘리고 설명·충전 표시의 겹침 없음을 확인했다. 12종 전체는 접촉 시트·파일 검사, 대표 계열은 인게임 통합 검사로 구분한다. 실제 휴대폰·저사양 기기 성능은 미검증이다. [UI·아트 검증](../../UI-ART-UPDATE.md)에 범위를 기록한다.

## 출처와 생성 기록

OpenAI 내장 `image_gen`으로 이 프로젝트를 위해 생성한 오리지널 리소스다. 모델 이름/버전은 도구가 공개하지 않았다. 제삼자 게임·캐릭터·이미지·음원은 사용하지 않았으며, 기존 프로젝트의 생성 캐릭터 아틀라스만 참조했다. 이를 CC0나 별도 외부 라이선스 리소스로 표시하지 않는다.

WebP 변환은 원본의 내장 provenance 메타데이터를 보존한다고 보장하지 않는다. 원본 PNG는 생성 보관 위치에 남기고, 생성 ID·참조 파일·정규화 정보·체크섬을 manifest에 보관했다.

## 생성 프롬프트

```text
Use case: stylized-concept. Asset type: ONE original production mobile card-game illustration atlas, not a UI mockup. Generate exactly FOUR columns and THREE rows of equal square panels, twelve panels edge-to-edge, no gutters, no borders, no text. Overall canvas landscape 4:3, ideally 1536x1152. The attached image is a STYLE AND CHARACTER IDENTITY REFERENCE only; keep its rounded friendly toy/clay forms, soft tactile 3D shading, large color blocks, creamy highlights, light from upper left, mint/sky/cream/coral-orange palette, silver wolf with blue eyes and green neck scarf, caramel bear with chunky orange stone armor, cute jade wyvern. Make a new atlas of distinct card action illustrations. Each square panel has its own softly blurred contrasting pastel forest background. Crucial framing: the important subject and effect silhouette must fit entirely INSIDE THE CENTRAL HORIZONTAL HALF of each panel, from 25% to 75% of panel height, and inside the central 80% width, because each panel will later be cropped to a wide 2:1 card picture. Leave only unobtrusive background above and below this band. Use close-up wide compositions, broad simple effect shapes, few sparkles, no full standing characters, no tiny detail. Exact left-to-right row order: ROW 1: (1) silver wolf paw making THREE enormous creamy claw swipe arcs, (2) caramel stone-armored bear delivering a chunky orange rock punch with an impact puff, (3) round wooden bark shield with a bright broad leaf-shaped rune, (4) large green healing water droplet cradled by a simple white flower and rounded leaves. ROW 2: (5) rounded glass sap bottle filled with golden amber energy and three chunky sky-blue motes, (6) large ivory wyvern fang dripping a single jade-green poison drop with a friendly jade wyvern cheek visible, (7) curled orange fiery thorn branch surrounding a round warm ember seed, (8) a round purple storm seed/cloud with one enormous golden lightning bolt. ROW 3: (9) two silver wolf forepaws making a double attack, TWO distinct creamy paw-shaped impact marks, (10) massive rounded ancient wooden-root fist with a warm golden shockwave, (11) broad icy-blue claw slash overlapping a rounded frosty shield, (12) tiny blue forest moonwell with a glowing cream crescent reflected in water. Ensure every panel is different, every requested subject appears exactly once, exact 4x3 grid. NO letters, numbers, title, labels, game card frame, border, mockup chrome, watermark, black background, photoreal texture, scary aggression, sharp spiky anatomy, grain, or thin line filigree.
```
