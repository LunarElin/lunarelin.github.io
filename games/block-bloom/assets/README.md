# 로컬 리소스

## 아이콘

- 팩: Kenney **Game Icons** 1.0
- 원본: https://kenney.nl/assets/game-icons
- 공식 라이선스 안내: https://kenney.nl/support
- 라이선스: CC0, 동봉 원문 `icons/LICENSE.txt` 보존.
- 실제 사용: `PNG/White/1x/`의 `pause`, `question`, `home`, `gear`, `arrowUp`, `arrowDown`, `arrowLeft`, `arrowRight`, `return`, `audioOn`, `audioOff`, `star`.
- 변경: 필요한 12개만 추출, 투명 PNG 48×48로 축소하고 메타데이터 제거·압축. 게임의 입체 버튼 위에 22~24px 아이콘으로 표시.

## 한글 글꼴

- 원본: Jua, Copyright 2018 The Jua Project Authors.
- 출처: https://github.com/google/fonts/tree/main/ofl/jua
- 라이선스: SIL Open Font License 1.1, 원문 `fonts/OFL.txt` 보존.
- 실제 사용: `fonts/bloom-ui.woff2`.
- 변경: 게임 HTML·JS·CSS에서 사용하는 글자와 ASCII를 포함한 WOFF2 서브셋. 파생 글꼴의 내부 이름을 **Bloom UI**로 변경. 글자 추가 시 재생성이 필요하며 원본 글꼴 파일은 런타임에 포함하지 않음.
- 재생성: 빌드 도구 `fonttools`, `brotli`가 있는 Python에서 `python assets/build-font.py /path/to/Jua-Regular.ttf`. 이 도구는 게임 실행이나 일반 테스트에 필요하지 않음.
- 외부 웹 폰트 연결을 제거하고 로컬 파일을 우선 로드. 대체 글꼴에서도 버튼 너비를 유지.

블록·보드·파티클은 기존 자체 제작 CSS, 앱 아이콘은 자체 SVG, 효과음은 Web Audio 합성을 사용합니다. 원본 게임의 이미지·코드·레벨은 포함하지 않습니다.
