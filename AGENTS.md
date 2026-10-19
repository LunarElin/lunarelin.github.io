# 프로젝트 작업 안내

이 문서는 저장소의 기본 지도다. 매 작업마다 전체 구조와 과거 커밋을 다시 분석하지 말고, 아래에서 해당 작업의 진입점을 찾아 필요한 파일만 읽는다. 실제 파일과 안내가 다르면 해당 영역만 확인하고 이 문서도 함께 갱신한다. 구조 확인 기준: 2026-10-19.

## 빠른 시작

1. `git status --short --branch`로 현재 브랜치와 사용자 변경을 확인한다. 변경이 있으면 `git diff --stat`와 관련 파일의 diff만 추가로 확인한다.
2. 아래 표에서 작업 영역을 고르고, 해당 파일과 게임의 `README.md`부터 읽는다.
3. 관련 경로 안에서 `rg`로 필요한 심벌을 검색한다. 루트 전체 재귀 탐색, 아카이브 스캔, 전체 Git 이력 분석은 구조 불일치나 이력 조사 요청이 있을 때만 한다.
4. 요청한 변경과 관련된 검증만 수행한다. 문서 수정이면 링크·경로·내용 정합성을 확인하고 게임 전체 테스트나 브라우저를 실행하지 않는다.

## 저장소와 배포

- 저장소: `https://github.com/LunarElin/lunarelin.github.io`
- 공개 사이트: `https://lunarelin.github.io/`
- 기본 브랜치: `main`, 원격: `origin`. 현재 작업 브랜치는 시작할 때 확인한다.
- 기본 로컬 작업 폴더: `D:\work\Repos\lunarelin.github.io`.
- 다른 채팅에서 사용한 별도 클론: `D:\work_git\merge3\portfolio-site`. 두 폴더는 같은 원격 저장소의 별도 작업 사본이며 자동 동기화되지 않는다. 현재 채팅의 작업 폴더를 기준으로 작업한다. 별도 클론 수정·동기화가 요청된 경우에만 그 폴더의 상태를 확인한다.
- 이전 Defold 프로젝트가 있는 `D:\work_git\merge3` 자체는 별도 프로젝트다. 이 사이트의 저장소 루트로 취급하지 않는다.
- 정적 HTML/CSS/JavaScript 사이트다. GitHub Pages는 저장소 루트를 배포한다. 현재 루트에 `package.json`, 번들러, 자체 `.github/workflows`는 없다.
- 게임 실행에는 Node 패키지가 필요 없다. `tests/package.json`의 의존성은 테스트 전용이다.

## 작업별 진입점

| 작업 | 먼저 확인할 파일 | 비고 |
| --- | --- | --- |
| 포트폴리오 문구·프로필·게임 노출·메뉴 | `index.html` | 게임 소개와 플레이 링크도 여기서 관리 |
| 포트폴리오 스타일·반응형 | `portfolio/style.css` | 기존 페이지용 `css/styles.css`와 구분 |
| 프로젝트 필터·상세 작성 가이드 | `portfolio/main.js` | 실제 경력 입력 전 예시 카드와 dialog |
| 작은 머지 | `games/merge3/README.md` | 숫자 3개 이상 연결, 5×5 퍼즐 |
| 포근포근 숲 | `games/cozy-forest/README.md` | 동물 트리플 매칭·보드 아이템·수업·피버 |
| 블록 블룸 | `games/block-bloom/README.md` | 색상 탈출 슬라이딩 퍼즐·6개 모드·아이템·경제 |
| 기존 사이트 확인 | `archive/2026-10-14-original/index.html` | 보존본, 일반 작업에서는 수정하지 않음 |

각 게임은 `games/<slug>/` 안에서 독립 실행한다. 포트폴리오와 게임의 CSS·전역 상태를 섞지 않는다.

### 게임 내부의 공통 구조

- `index.html`, `styles.css`, 게임에 있는 `icon.svg`: 화면·반응형·아이콘.
- `rules.mjs`: DOM과 분리된 규칙·상태 처리. 게임에 따라 생성·힌트·보상·저장 검증도 포함한다.
- `game.mjs`: 입력·화면·연출·사운드·저장 연결. Merge3만 파일명이 `game.js`이며 ES module이다.
- `rules.test.mjs`, `tests/ui.test.mjs`: Cozy Forest와 Block Bloom의 규칙·DOM 통합 검증. Merge3에는 현재 전용 테스트 파일이 없다.
- Cozy Forest의 `art.mjs`: SVG 그래픽. `prompts.html`, `prompts.css`, `prompts.js`: 제작 요청 정리본과 복사 기능.
- Block Bloom의 `design.html`: 레퍼런스·게임 디자인·수익화 가설·기술 설계 노트.

새 게임을 추가하면 독립된 `games/<slug>/`를 만들고, `index.html`의 게임 영역과 `README.md`, 이 문서의 진입점 표를 함께 갱신한다. 게임에서 홈으로 돌아가는 기본 상대 경로는 `../../`다. 표에 없는 게임이 Git 상태에 나타나면 해당 폴더의 README와 변경 상태부터 확인한다. 다른 작업에서 생성 중인 미추적 폴더를 임의로 수정하거나 함께 커밋하지 않는다.

## 보존 경계와 콘텐츠

- 포트폴리오 주인은 **15년 이상 경력의 게임 클라이언트 개발자**다. 기획자 중심 소개로 바꾸지 않는다. 실제 참여 타이틀·엔진·언어·역할·성과는 전달된 사실만 쓴다. 예시·입력 예정 표시는 실제 이력이 제공될 때 교체한다.
- `archive/2026-10-14-original/`는 전환 전 원본이다. HTML·CSS·JS·이미지 등 Git에 포함된 페이지 파일은 28개이며 수정·이동·삭제하지 않는다. 아카이브 변경 자체가 요청된 경우는 예외다.
- 루트의 `letter.html`, `ring.html`, `timeline.html`, `css/`, `js/`, `assets/`는 기존 페이지 호환용이다. 현재 포트폴리오 리소스로 오인해 정리하지 않는다.
- `.vs/` 및 아카이브의 `.vs/` 상태 파일은 로컬 보관 대상이며 `.gitignore`로 제외한다. `node_modules`나 임시 테스트 산출물을 커밋하지 않는다.
- 현재 게임들은 브라우저 로컬 저장을 사용한다. 저장 키 `merge3:v1:best`, `cozy-forest:v1`, `block-bloom:v1`을 변경할 때는 기존 사용자 기록의 호환성을 고려한다.
- Block Bloom의 광고·결제 표현은 데모다. 실결제·광고 SDK·서버 연동이 구현됐다고 표현하지 않는다. 자세한 범위와 규칙은 각 게임 README가 기준이다.

## 실행과 검증

- 규칙 및 DOM 검증은 Node.js 24 이상을 권장한다.
- 미리보기는 저장소 루트를 제공하는 정적 HTTP 서버를 사용한다. 디렉터리 요청의 `index.html`과 `.mjs`의 JavaScript MIME 타입을 지원해야 한다. 현재 열려 있는 localhost 탭만으로 서버 실행 여부나 최신 파일 반영을 단정하지 않는다.
- Python이 실제 설치되어 있으면 아래 명령으로 실행할 수 있다. Windows의 `python`이 Store 바로가기라면 사용 가능한 Node 런타임으로 정적 서버를 실행한다. 서버 실행만을 위해 패키지·프레임워크를 추가하지 않는다.

```powershell
# 저장소 루트에서 실행. 같은 포트의 기존 작업 서버가 있으면 먼저 확인한다.
python -c "import http.server; http.server.SimpleHTTPRequestHandler.extensions_map.update({'.mjs':'text/javascript'}); http.server.ThreadingHTTPServer(('127.0.0.1',4174), http.server.SimpleHTTPRequestHandler).serve_forever()"
```

홈은 `http://127.0.0.1:4174/`, 게임은 `/games/merge3/`, `/games/cozy-forest/`, `/games/block-bloom/`이다.

| 변경 영역 | 필요한 검증 |
| --- | --- |
| 문서만 수정 | 기재한 경로·링크·명령과 실제 파일 비교, `git diff --check` |
| 포트폴리오 | 변경한 JS의 `node --check`, 바꾼 링크·필터·dialog, 화면 변경 시 PC·모바일 확인 |
| Merge3 | 변경한 JS/MJS의 `node --check`, 규칙 변경 시 고정 보드로 병합·연쇄·무효 입력·마지막 빈칸 판정 확인, 입력 변경 시 첫 머지·재시작 확인 |
| Cozy Forest 규칙 | `node --test games/cozy-forest/rules.test.mjs` |
| Block Bloom 규칙 | `node --test games/block-bloom/rules.test.mjs` |
| Cozy Forest 입력·저장·화면 연결 | 테스트 의존성이 준비된 경우 `npm --prefix games/cozy-forest/tests test` |
| Block Bloom 입력·저장·화면 연결 | 테스트 의존성이 준비된 경우 `pnpm --dir games/block-bloom/tests test` |

DOM 검증 의존성이 없고 해당 테스트가 필요할 때만 게임 README의 설치 명령을 따른다. Cozy Forest는 `games/cozy-forest/tests/`에서 `npm install`, Block Bloom은 `games/block-bloom/tests/`에서 `pnpm install --frozen-lockfile`을 사용한다. 루트에서 `npm install`, `npm test`, `npm run build`를 실행하지 않는다.

규칙·DOM 검증, 실제 브라우저 확인, 휴대폰 실기기 확인을 구분해 보고한다. DOM 테스트만으로 실제 렌더링·사운드·진동·프레임 성능이나 사람이 느끼는 재미를 검증했다고 쓰지 않는다.

## Git 작업과 유지

- 사용자 변경을 보존하고 요청 범위의 파일만 수정·스테이징한다. 작은 변경에 전체 파일 재포맷이나 프레임워크 전환을 섞지 않는다.
- 원격 병합·게시가 필요한 작업이면 먼저 `git fetch origin` 후 양쪽 변경을 확인한다. 커밋 이력을 유지하고 강제 푸시로 덮어쓰지 않는다. 새 작업 브랜치가 필요하면 기본 접두사는 `codex/`다.
- 커밋·푸시가 작업 범위에 있으면 검증 후 수행하고, 최종 답변에 로컬 저장·커밋·푸시 중 어디까지 했는지 명시한다.
- `main` 푸시와 GitHub Pages 배포 완료는 별개다. 배포 완료라고 보고하려면 해당 커밋의 배포 성공 또는 공개 사이트 최신 반영을 확인한다.
- 디렉터리·진입점·검증 명령·저장 방식이 바뀔 때만 이 안내의 해당 부분을 갱신한다. 매 작업의 로그, 임시 서버 상태, 커밋 목록이나 테스트 통과 개수를 누적하지 않는다.

AGENTS.md 적용 방식: [OpenAI 공식 안내](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
