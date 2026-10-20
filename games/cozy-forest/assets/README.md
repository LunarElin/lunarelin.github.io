# 사용 자산과 라이선스

모든 파일은 이 게임 폴더에 로컬로 보관합니다. 팩 전체와 미사용 원본은 포함하지 않습니다.

| 제공자·팩 | 로컬 파일 | 원본 파일·실제 용도·변경 |
| --- | --- | --- |
| [Kenney UI Pack - Adventure](https://kenney.nl/assets/ui-pack-adventure) | `ui/round-brown.png` | `PNG/Default/round_brown.png`. 소리·일시 정지 버튼 바탕. 원본 PNG 그대로 사용, CSS로 표시 크기와 그림자 적용 |
| 같은 팩 | `ui/star.png` | `PNG/Default/minimap_icon_star_yellow.png`. 피버 게이지 아이콘. 원본 그대로 사용, CSS로 26px 표시 |
| [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) | `audio/pick.ogg` | `Audio/drop_001.ogg`. 동물 선택음. 파일 이름만 변경하고 재생 음량 조정 |
| 같은 팩 | `audio/match.ogg` | `Audio/confirmation_001.ogg`. 매칭 확인음. 파일 이름만 변경하고 재생 음량 조정 |
| [Jua / Google Fonts](https://github.com/google/fonts/tree/main/ofl/jua) | `fonts/jua-game.woff2` | `Jua-Regular.ttf`에서 게임 소스·HTML에 쓰는 문자와 ASCII를 부분 추출하고 WOFF2로 변환. 그림·획은 변경하지 않음. 약 89KB |

Kenney 두 팩은 **CC0 1.0**입니다. 각 다운로드 팩에 동봉된 `License.txt`를 `licenses/kenney-ui.txt`, `licenses/kenney-audio.txt`로 보관했습니다. 라이선스 문구를 유지하고 줄바꿈과 줄 끝 공백만 정리했습니다. [공식 라이선스 안내](https://kenney.nl/support)도 확인했습니다.

Jua는 Copyright 2018 The Jua Project Authors, **SIL Open Font License 1.1**이며 원문은 `fonts/OFL.txt`에 보관했습니다. 부분 추출본을 독립 판매하지 않으며 글꼴 라이선스는 그대로 유지합니다. 글꼴 생성 도구는 배포·런타임 의존성이 아닙니다. 새로운 한글 문구를 추가할 때 문자 포함 여부를 확인하고 필요하면 같은 원본으로 다시 추출합니다.

동물·풍경·게임 아이템 SVG는 이 프로젝트의 `art.mjs`와 `icon.svg`에서 직접 제작했습니다. 합성 화음은 Web Audio로 생성합니다.
