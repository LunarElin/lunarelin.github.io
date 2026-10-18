# LunarElin — Game Client Developer

15년 이상 경력의 게임 클라이언트 개발자 포트폴리오입니다. 실제 참여 타이틀, 기술 스택, 상세 이력과 성과는 입력 예정입니다.

## 구성

- `index.html`: 포트폴리오 메인, 프로젝트와 소개
- `portfolio/style.css`: 포트폴리오 디자인
- `portfolio/main.js`: 프로젝트 필터와 작성 가이드
- `archive/2026-10-14-original/index.html`: 전환 전 원본 페이지

빌드나 패키지 설치 없이 정적 HTTP 서버 또는 GitHub Pages에서 실행합니다.

## 원본 보존

2026-10-14 작업 시작 전 파일 35개를 `archive/2026-10-14-original/`에 복사하고 SHA-256 일치를 확인했습니다. 수정 및 미추적 파일도 함께 보존했습니다. 페이지에 필요한 HTML, CSS, JavaScript, 이미지 등 28개 파일은 Git에 포함합니다. Visual Studio `.vs` 상태 파일 7개는 원래 위치와 아카이브에 로컬 보관하며 `.gitignore`로 제외합니다. 원래 경로의 보조 파일도 호환성을 위해 유지합니다.

GitHub Pages의 저장소 루트 배포를 사용합니다. 포트폴리오를 수정할 때 원본 아카이브는 수정하지 않습니다.

## 플레이 가능한 게임

- `games/block-bloom/`: 블록 블룸. 입체 컬러 블록을 같은 색 출구로 미는 슬라이딩 퍼즐. 기본·트리플·2048 합성·열쇠·빙결·팩토리 6개 모드, 즉시 사용 아이템 5종, 콤보·피버, 코인 경제와 별 보상을 제공합니다. [실행·검증](games/block-bloom/README.md), [게임 디자인과 수익화 설계](games/block-bloom/design.html).
- `games/merge3/`: 작은 머지 v1. 5×5 보드에서 같은 숫자 3개 이상을 상하좌우로 연결하는 HTML5 퍼즐입니다.
- `games/cozy-forest/`: 포근포근 숲. 귀여운 동물 트리플 매칭, 보드에서 발견하는 아이템 5종, 실습 수업 6개, 무한 스테이지와 피버를 갖춘 모바일 HTML5 퍼즐입니다. 규칙·실행·검증: `games/cozy-forest/README.md`. 제작 프롬프트 정리본: `games/cozy-forest/prompts.html`.
- 홈페이지의 게임 메뉴와 플레이 버튼에서 이동합니다. 게임 상단의 홈 링크로 포트폴리오에 돌아옵니다.
- `games/merge3/rules.mjs`: DOM과 분리된 보드 판정 및 난수 코드
- `games/merge3/game.js`: 입력, 화면 표시, 최고 점수 및 판 기록
- 게임 규칙과 플레이테스트 안내: `games/merge3/README.md`

다른 채팅에서 작성해 `main`에 올린 게임 커밋을 병합하여 원래 이력을 보존했습니다. 원격 원본 홈에 추가했던 게임 링크는 새 포트폴리오의 게임 메뉴와 플레이 영역으로 반영했습니다.
