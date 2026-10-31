# Burger Please! 선택 원본 메시

- 게임: `Burger Please!`, 개발사 `Supercent, Inc.`
- 본체: `io.supercent.burgeridle`, 31.6.0 (141).
- 본체 SHA-256: `426bd4308f45b9b8b84dec3819eb893a7c25ff254e7d6c26bc50551448a4d334`.
- 입력: 사용자가 분석·활용을 요청한 로컬 APK의 `unity-resources/Mesh/` OBJ 정적 추출물.
- 저작권: 원작 게임 자산은 **Supercent의 독점 자산**이다. Kenney/CC0 자산으로 표시하지 않는다. 추출·색상 변경이 원작 자산의 권리를 변경하거나 새 공개 라이선스를 부여하지 않는다.
- 선택 11종만 변환하여 `mesh-data.mjs`에 저장했다. 원본별 파일명·정점 수·면 수·SHA-256은 `manifest.json`에 기록한다. 원본 팩·APK·음원·텍스처·원작 코드·광고 SDK는 반입하지 않는다.

## 변환

`../../tests/convert-source-meshes.py <analysis-root>`는 기존 정적 분석 폴더에서 선택한 OBJ를 읽고 생성한다. 실행에는 분석 도구의 Python·UnityPy가 필요하며 게임의 런타임 의존성은 아니다.

원본의 정점과 삼각형 연결 관계를 유지하고 수치를 소수점 6자리로 정리했다. 웹에서는 `../../source-meshes.mjs`로 형상별 크기·피벗과 색을 적용한다. 버거·컵과 시설은 이 웹게임의 배치·적재 간격에 맞춰 축별 크기를 정규화한다. 원본의 모든 GameObject transform·셰이더·재질·식당 전체를 복원한 것이 아니다.

`main-Character`의 압축 본 가중치는 원본 데이터에서 복원했다. 사용한 UnityPy 1.25.2의 네 번째 가중치 분기는 정수 가중치 합을 그대로 빼므로 변환 코드에서 `(31 - 정수 합) / 31`로 계산하고 합계 1을 검증한다. 원본 T 자세의 팔을 아래로 내려놓은 자세로 변환하고 22본의 가중치를 기존 웹 8본에 묶었다. 모자·앞치마는 머리·몸과 함께 그린다. 동작은 웹의 기존 관절 애니메이션이며 원작 클립 이식은 아니다.

## 사용

| 키 | 원본 | 게임 표시 |
| --- | --- | --- |
| customer | customer | 일반 손님 |
| player | main-Character | 주인공·조수·전투 인물 몸 |
| apron | player_cloth | 모자·앞치마 |
| counter | 01_Counter | 무기·물약 카운터 |
| grill | Burger_Grill_01_01 | 생산·주방 시설 |
| table | Table | 식탁·배식대·출력 선반 |
| chair | 01_Chair | 마주 보는 의자 |
| burger | Hamburger | 장비·음식의 색상 변형과 머리 위 적재 |
| emptyDish | Hamburger.006 | 식사 후 남은 포장지 |
| cup | Coffee_cup02 | 물약의 초록 컵 표시 |
| cash | Money | 바닥에 쌓인 지폐와 수금 이동 |

공식 화면 비교: [Google Play](https://play.google.com/store/apps/details?id=io.supercent.burgeridle). 원작 화면에는 넓은 빈 바닥, 서로 떨어진 구매 영역, 대금 묶음, 쌓인 버거와 단순한 사람 형상이 보인다. 스토어 화면은 광고·다른 단계가 섞일 수 있으므로 APK 버전과 같은 배치를 보장하지 않는다.
