# 독서기록장 웹 프로토타입 명세

블록 기반 독서기록 페이지. 에딧 / 작성 / 열람 3모드 단일 페이지.
비주얼 디자인은 별도 문서에서 다룬다. 이 문서는 구조와 동작만 규정한다.

## 제약 (필수)

- **HTML, CSS, JavaScript만.** 프레임워크, 라이브러리, CDN, 웹폰트, 빌드 도구 전부 금지
- localStorage / sessionStorage / IndexedDB / fetch 금지. 상태는 메모리에만. 새로고침 시 초기화가 정상 동작
- ES2020+ 그대로 사용, 트랜스파일 없음
- 실행: `python3 -m http.server` (file:// 에서는 ES 모듈이 CORS로 실패)
- 타깃: 최신 Chrome / Firefox / Safari 데스크톱

범위 밖: 서버, 계정, 저장, SNS, 책 API, 사용자 정의 블록, 멀티 페이지, 2단 컬럼.

## 파일

```
index.html
css/tokens.css   CSS 변수 선언만. 선택자는 :root 하나
css/app.css      레이아웃과 컴포넌트
js/blocks.js     블록 레지스트리
js/state.js      상태와 변경 함수
js/render.js
js/dnd.js
js/main.js       초기화, 전역 키보드
```

## 데이터 모델

```js
state = {
  mode: 'edit' | 'write' | 'read',
  page: { title: '', blocks: [] },
  selectedBlockId: null,
  dragging: null
}

block = { id: 'b_xxx', type: 'summary', data: { items: ['', ''] } }
```

DOM은 state의 파생물. 요소와 상태는 `data-block-id`로 연결. 배열 인덱스를 식별자로 쓰지 않는다.

### 블록 레지스트리 (핵심)

렌더링, 편집, 빈 값 판정은 전부 레지스트리를 순회하는 제네릭 함수로 작성한다. **블록 타입별 if / switch 분기 금지.**

```js
BLOCK_TYPES = {
  summary: {
    label: '요점 정리',
    once: false,                                          // true면 페이지당 1개
    fields: [{ key: 'items', kind: 'list', placeholder: '핵심 항목' }],
    create: () => ({ items: ['', '', ''] })
  }, ...
}
```

### 필드 kind (7종)

| kind | 편집 UI | 열람 UI |
|---|---|---|
| `line` | 1행 자동확장 textarea | 단락 |
| `text` | 다행 자동확장 textarea | 단락 |
| `list` | 항목별 1행 입력 + 추가/삭제 | `ul` |
| `pairList` | 좌우 2열 입력 행 목록 | 정의 목록 |
| `rating` | 별 5개 버튼, 0은 미입력 | 별 표시 |
| `tags` | Enter 또는 쉼표로 칩 확정 | 칩 목록 |
| `url` | 1행 입력 | `a[target=_blank][rel=noopener]`, `http` 시작 아니면 링크 미생성 |

### 블록 타입 (10종)

| type | label | fields | once |
|---|---|---|---|
| `book` | 책 정보 | title(line), author(line), storeUrl(url) | O |
| `heading` | 소제목 | text(line) | |
| `summary` | 요점 정리 | items(list) | |
| `impression` | 느낀 점 | body(text) | |
| `quote` | 인용 | body(text), page(line) | |
| `concept` | 개념 정리 | pairs(pairList) | |
| `question` | 질문과 생각 | question(line), answer(text) | |
| `rating` | 별점과 한 줄 평 | score(rating), comment(line) | O |
| `keywords` | 키워드 | tags(tags) | |
| `divider` | 구분선 | 없음 | |

`once: true`인 타입이 이미 있으면 팔레트에서 비활성화하고 드롭도 거부한다.

### 빈 블록

kind별 `isEmpty(value)`를 정의한다. 모든 필드가 비면 빈 블록으로 보고 **열람 모드에서 렌더하지 않는다.** `divider`는 예외로 항상 표시한다.

## 모드

| | 에딧 | 작성 | 열람 |
|---|---|---|---|
| 텍스트 입력 | 불가, readonly + placeholder만 | 가능 | 불가 |
| 블록 추가 | 팔레트 드래그드롭 | 블록 사이 호버 `+` 버튼 | 불가 |
| 순서 변경 | 드래그, Alt+↑↓ | Alt+↑↓, 호버 버튼 | 불가 |
| 삭제 / 복제 | Delete / Ctrl+D | 호버 버튼 | 불가 |
| 팔레트 | 표시 | 없음 | 없음 |
| 그립 핸들 | 표시 | 없음 | 없음 |

**열람 모드 필수 조건**: textarea / input / contenteditable을 정적 요소로 **교체**한다. `disabled`로 남기지 않는다. 편집 UI는 DOM에 렌더하지 않는다. `draggable` 속성을 부여하지 않는다.

**작성 모드 입력 편의**

- 모든 textarea 높이 자동 조절, 내부 스크롤바 금지
- `line` 필드에서 Enter는 줄바꿈이 아니라 다음 필드로 포커스 이동
- `list` 마지막 항목에서 Enter는 새 항목, 빈 항목에서 Backspace는 항목 삭제
- 헤더에 진행률 표시: 채워진 필드 수 / 전체 필드 수

**키보드 대안**: 마우스 없이 키보드만으로 전 기능이 완주 가능해야 한다. 팔레트 항목에 포커스 후 Enter는 선택 블록 바로 아래(선택이 없으면 맨 끝)에 삽입한다.

## 모드 전환

에딧 → 작성 → 열람 순환, Shift+Tab 역순. Ctrl/Cmd+1, 2, 3 직접 전환도 함께 제공한다.

```js
document.addEventListener('keydown', e => {
  if (e.key !== 'Tab' || e.isComposing) return;
  if (e.target.closest('[data-editable]')) return;   // 필드 안에서는 표준 동작 유지
  e.preventDefault();
  setMode(nextMode(state.mode, e.shiftKey ? -1 : 1));
});
```

필드에서 Esc를 누르면 blur된다. 전환 시 `aria-live` 영역에 모드명을 알리고 짧은 토스트를 띄운다.

## 렌더링

- 함수는 `renderApp()`, `renderCanvas()`, `renderBlock(id)` 세 개
- **텍스트 입력 중 전체 재렌더 금지.** `input` 핸들러는 state만 갱신하고 DOM을 건드리지 않는다
- 구조 변경(추가, 삭제, 이동, 모드 전환) 시에만 `renderCanvas()` 호출
- 이벤트 위임: 캔버스 컨테이너에 타입별 리스너 1개씩. `closest('[data-block-id]')`로 대상 탐색. 재렌더마다 리스너를 다시 붙이지 않는다

## 한글 IME (필수)

- `input` 핸들러 첫 줄에 `if (e.isComposing) return;`
- `compositionend`에서 최종값 커밋
- 조합 중 해당 요소를 재렌더하거나 `value`를 대입하지 않는다
- `keydown` 단축키는 `e.isComposing`을 먼저 검사한다

## 드래그드롭

Pointer Events로 직접 구현한다(`pointerdown` / `pointermove` / `pointerup`). HTML5 Drag and Drop API는 터치 미지원이므로 쓰지 않는다.

1. `pointerdown`에서 블록들의 `getBoundingClientRect()`를 1회 측정해 캐싱
2. `pointermove`에서 포인터 Y와 각 블록 중간점을 비교해 삽입 인덱스 계산, 인디케이터 이동
3. 드래그 중 DOM을 실제로 옮기지 않는다
4. `pointerup`에서만 배열을 수정하고 재렌더
5. 포인터가 뷰포트 상하단 80px에 들어오면 `requestAnimationFrame`으로 자동 스크롤

## CSS 계약

스타일은 별도 디자인 문서로 나중에 적용한다. 그때 CSS 파일만 고치면 되도록 아래를 지킨다.

**모드는 속성으로만 표현한다.** `<body data-mode="edit|write|read">`를 JS가 바꾸고, 모드별 시각 차이는 전부 CSS 선택자로 처리한다. 스타일 때문에 JS를 여는 일이 없어야 한다.

**클래스 이름 고정**

```
.app  .app__header  .app__title  .app__mode  .app__progress  .toast
.palette  .palette__item
.canvas  .drop-indicator
.block  .block--{type}  .block__stripe  .block__label
        .block__grip  .block__actions  .inline-add
.field  .field--{kind}
```

블록 루트: `<section class="block block--quote" data-block-id data-block-type role="group" aria-label="인용">`
편집 가능 요소에는 `data-editable` 속성을 붙인다(Tab 처리가 이 속성에 의존한다).

**상태 클래스**: `.is-selected` `.is-dragging` `.is-empty` `.is-focused`

**값은 전부 변수로.** `app.css`에 색상, 폰트, 폰트 크기, 간격 리터럴을 쓰지 않는다. 전부 `tokens.css`의 `var()`를 참조한다. 1차 구현 단계에서는 `tokens.css`에 임시 값을 채워두고, 디자인 문서를 받으면 그 파일만 교체한다.

## 접근성

포커스 링 유지, 블록에 `role="group"`과 `aria-label`, 아이콘 버튼에 `aria-label`, 드래그의 키보드 대안 필수, `prefers-reduced-motion`에서 transition 제거.

## 구현 순서

1. index.html, tokens.css 임시 변수, 헤더, 빈 캔버스
2. BLOCK_TYPES 레지스트리와 7종 kind
3. 하드코딩 블록 3개 렌더
4. **열람 모드 렌더러부터 만든다.** 데이터 모델의 구멍이 가장 싸게 드러난다
5. 작성 모드, textarea 자동 높이, IME
6. 모드 전환과 Tab
7. 에딧 모드 UI와 팔레트
8. 드래그드롭 삽입
9. 드래그드롭 재정렬
10. 키보드 경로 전체
11. 진행률, 빈 블록 숨김
12. 접근성 점검

## 완료 기준

- [ ] 10종 블록 모두 드래그 삽입 가능
- [ ] 캔버스 내 재정렬, 삽입 위치 인디케이터 표시
- [ ] 마우스 없이 키보드만으로 전 기능 완주
- [ ] Tab으로 모드 순환, 필드 안에서는 다음 필드 이동
- [ ] 열람 모드에서 편집 불가, 편집 UI가 DOM에 없음
- [ ] 열람 모드에서 빈 블록 미표시
- [ ] 한글 조합 중 다른 곳을 클릭해도 글자가 깨지지 않음
- [ ] 블록 30개에서 입력과 드래그 지연 없음
- [ ] 네트워크 차단 상태에서 전 기능 동작
- [ ] `app.css`에 색상/크기 리터럴 없음, 전부 `var()` 참조
- [ ] 콘솔 에러 없음
