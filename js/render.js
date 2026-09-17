import { state, MODE_LABELS, getBlock, canInsert } from './state.js';
import { BLOCK_TYPES, KINDS, isBlockEmpty, countFields } from './blocks.js';

const $ = selector => document.querySelector(selector);

// null / undefined / false 속성은 생략, true는 빈 속성
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    node.setAttribute(name, value === true ? '' : value);
  }
  node.append(...children.flat());
  return node;
}

const isFilled = value => value.trim() !== '';
const isLinkable = value => /^https?:\/\//i.test(value.trim());

// kind별 열람 UI. 모두 정적 요소만 만든다
const READ_VIEWS = {
  line: value => el('p', {}, value),
  text: value => el('p', {}, value),
  list: items => el('ul', {}, ...items.filter(isFilled).map(item => el('li', {}, item))),
  pairList: pairs => el('dl', {},
    ...pairs.filter(pair => pair.some(isFilled)).flatMap(([term, desc]) => [el('dt', {}, term), el('dd', {}, desc)])
  ),
  rating: score => el('span', { role: 'img', 'aria-label': `별점 ${score}점 / ${KINDS.rating.max}점` },
    '★'.repeat(score) + '☆'.repeat(KINDS.rating.max - score)
  ),
  tags: tags => el('ul', {}, ...tags.map(tag => el('li', {}, tag))),
  url: value => isLinkable(value)
    ? el('a', { href: value.trim(), target: '_blank', rel: 'noopener' }, value)
    : el('p', {}, value)
};

// 입력 요소. editable=false(에딧 모드)면 readonly + placeholder만
function control(tag, attrs, value, editable) {
  const node = el(tag, {
    ...attrs,
    'aria-label': attrs.placeholder,
    readonly: !editable,
    tabindex: editable ? null : -1,
    'data-editable': editable
  });
  if (editable) node.value = value;
  return node;
}

function actionButton(action, index, label, text, attrs = {}) {
  return el('button', {
    type: 'button', 'data-action': action, 'data-part': action, 'data-index': index,
    'aria-label': label, 'data-editable': true, ...attrs
  }, text);
}

const valueOf = node => node.querySelector('[data-part="value"]').value;
const without = (array, index) => array.filter((_, i) => i !== index);
const toNextField = () => ({ next: true });
const confirmTag = ({ value, target }) => {
  const tag = target.value.trim();
  return { value: tag ? [...value, tag] : value, focus: { part: 'draft' } };
};

/*
 * kind별 작성/에딧 UI와 동작
 * view(value, field, editable) → 노드
 * collect(fieldNode) → DOM에서 읽은 값 (input 이벤트용)
 * keys[part][key](ctx), actions[action](ctx) → { value, focus } | { next } | null
 */
export const FORMS = {
  line: {
    view: (value, field, editable) =>
      control('textarea', { 'data-part': 'value', rows: 1, placeholder: field.placeholder }, value, editable),
    collect: valueOf,
    keys: { value: { Enter: toNextField } }
  },
  text: {
    view: (value, field, editable) =>
      control('textarea', { 'data-part': 'value', rows: 3, placeholder: field.placeholder }, value, editable),
    collect: valueOf
  },
  url: {
    view: (value, field, editable) =>
      control('input', { type: 'url', 'data-part': 'value', placeholder: field.placeholder }, value, editable),
    collect: valueOf
  },
  list: {
    view: (items, field, editable) => [
      el('ul', {}, items.map((item, index) => el('li', {},
        control('input', { type: 'text', 'data-part': 'item', 'data-index': index, placeholder: field.placeholder }, item, editable),
        editable ? actionButton('remove', index, '항목 삭제', '×') : []
      ))),
      editable ? actionButton('add', null, '항목 추가', '+') : []
    ],
    collect: node => [...node.querySelectorAll('[data-part="item"]')].map(input => input.value),
    keys: {
      item: {
        Enter: ({ value, index }) => index === value.length - 1
          ? { value: [...value, ''], focus: { part: 'item', index: index + 1 } }
          : null,
        Backspace: ({ value, index, target }) => target.value === ''
          ? { value: without(value, index), focus: { part: 'item', index: Math.max(index - 1, 0) } }
          : null
      }
    },
    actions: {
      add: ({ value }) => ({ value: [...value, ''], focus: { part: 'item', index: value.length } }),
      remove: ({ value, index }) => ({ value: without(value, index), focus: { part: 'add' } })
    }
  },
  pairList: {
    view: (pairs, field, editable) => [
      pairs.map(([term, desc], index) => el('div', {},
        control('input', { type: 'text', 'data-part': 'term', 'data-index': index, placeholder: field.placeholder[0] }, term, editable),
        control('input', { type: 'text', 'data-part': 'desc', 'data-index': index, placeholder: field.placeholder[1] }, desc, editable),
        editable ? actionButton('remove', index, '행 삭제', '×') : []
      )),
      editable ? actionButton('add', null, '행 추가', '+') : []
    ],
    collect: node => [...node.querySelectorAll('[data-part="term"]')].map(term =>
      [term.value, node.querySelector(`[data-part="desc"][data-index="${term.dataset.index}"]`).value]
    ),
    actions: {
      add: ({ value }) => ({ value: [...value, ['', '']], focus: { part: 'term', index: value.length } }),
      remove: ({ value, index }) => ({ value: without(value, index), focus: { part: 'add' } })
    }
  },
  rating: {
    view: (score, field, editable) => editable
      ? el('div', { role: 'group', 'aria-label': field.placeholder },
          Array.from({ length: KINDS.rating.max }, (_, i) => i + 1).map(n =>
            actionButton('set', n, `별 ${n}개`, n <= score ? '★' : '☆', { 'aria-pressed': String(n === score) })
          ))
      : el('span', { 'aria-hidden': 'true' }, '☆'.repeat(KINDS.rating.max)),
    actions: {
      set: ({ value, index }) => ({ value: value === index ? 0 : index, focus: { part: 'set', index } })
    }
  },
  tags: {
    view: (tags, field, editable) => [
      editable ? el('ul', {}, tags.map((tag, index) => el('li', {}, tag, actionButton('remove', index, `${tag} 삭제`, '×')))) : [],
      control('input', { type: 'text', 'data-part': 'draft', placeholder: field.placeholder }, '', editable)
    ],
    keys: { draft: { Enter: confirmTag, ',': confirmTag } },
    actions: {
      remove: ({ value, index }) => ({ value: without(value, index), focus: { part: 'draft' } })
    }
  }
};

const VIEWS = {
  read: (kind, value) => READ_VIEWS[kind](value),
  write: (kind, value, field) => FORMS[kind].view(value, field, true),
  edit: (kind, value, field) => FORMS[kind].view(value, field, false)
};

function blockButton(action, label, text, disabled = false) {
  return el('button', { type: 'button', 'data-action': action, 'aria-label': label, disabled }, text);
}

// 모드별 블록 부속 UI. 열람 모드는 없음
const BLOCK_CHROME = {
  edit: block => ({
    head: [el('button', {
      type: 'button', class: 'block__grip', 'aria-label': `${BLOCK_TYPES[block.type].label} 끌어서 이동`,
      'aria-keyshortcuts': 'Alt+ArrowUp Alt+ArrowDown'
    }, '⠿')],
    tail: []
  }),
  write: block => ({
    head: [],
    tail: [el('div', { class: 'block__actions' },
      blockButton('block-up', '위로 이동', '↑'),
      blockButton('block-down', '아래로 이동', '↓'),
      blockButton('block-duplicate', '복제', '⧉', !canInsert(block.type)),
      blockButton('block-remove', '삭제', '×')
    )]
  }),
  read: () => ({ head: [], tail: [] })
};

function buildField(block, field) {
  return el('div', { class: `field field--${field.kind}`, 'data-field-key': field.key },
    VIEWS[state.mode](field.kind, block.data[field.key], field)
  );
}

function buildBlock(block) {
  const type = BLOCK_TYPES[block.type];
  const chrome = BLOCK_CHROME[state.mode](block);
  return el('section', {
    class: [
      'block', `block--${block.type}`,
      state.selectedBlockId === block.id && 'is-selected',
      isBlockEmpty(block) && 'is-empty'
    ].filter(Boolean).join(' '),
    'data-block-id': block.id,
    'data-block-type': block.type,
    role: 'group',
    'aria-label': type.label,
    'aria-current': state.selectedBlockId === block.id && state.mode === 'edit' ? 'true' : null,
    tabindex: state.mode === 'edit' ? -1 : null   // 에딧 모드 방향키 선택 시 포커스 대상
  },
    el('div', { class: 'block__stripe', 'aria-hidden': 'true' }),
    chrome.head,
    el('div', { class: 'block__label' }, type.label),
    type.fields.map(field => buildField(block, field)),
    chrome.tail
  );
}

// textarea 높이를 내용에 맞춘다. 내부 스크롤바는 CSS에서 숨김
export function autosize(node) {
  if (node.tagName !== 'TEXTAREA') return;
  node.style.height = 'auto';
  node.style.height = `${node.scrollHeight + node.offsetHeight - node.clientHeight}px`;
}

const autosizeWithin = root => root.querySelectorAll('textarea').forEach(autosize);

export function renderApp() {
  document.body.dataset.mode = state.mode;
  $('.app__title').textContent = state.page.title;
  $('.app__mode').textContent = MODE_LABELS[state.mode];
  renderCanvas();
}

function buildPaletteItem([type, { label }]) {
  return el('button', {
    type: 'button', class: 'palette__item', 'data-block-type': type, disabled: !canInsert(type),
    'aria-keyshortcuts': 'Enter'
  }, label);
}

export function renderCanvas() {
  // 팔레트 활성 여부(once)는 캔버스 내용에 따라 달라지므로 함께 갱신
  const palette = $('.palette');
  const showPalette = state.mode === 'edit';
  palette.hidden = !showPalette;
  palette.replaceChildren(...(showPalette ? Object.entries(BLOCK_TYPES).map(buildPaletteItem) : []));

  // 열람 모드에서는 빈 블록을 렌더하지 않는다
  const visible = state.mode === 'read' ? state.page.blocks.filter(block => !isBlockEmpty(block)) : state.page.blocks;
  const canvas = $('.canvas');
  canvas.replaceChildren(...visible.map(block => renderBlock(block.id)));
  autosizeWithin(canvas);
  updateProgress();
}

// 입력 중에도 호출된다. 헤더 텍스트와 블록의 is-empty 클래스만 갱신
export function updateProgress(blockId = null) {
  const { filled, total } = countFields(state.page.blocks);
  $('.app__progress').textContent = `${filled} / ${total}`;
  if (blockId) $(`.canvas [data-block-id="${blockId}"]`)?.classList.toggle('is-empty', isBlockEmpty(getBlock(blockId)));
}

export function renderBlock(id) {
  const node = buildBlock(getBlock(id));
  const current = $(`.canvas [data-block-id="${id}"]`);
  if (current) {
    current.replaceWith(node);
    autosizeWithin(node);
  }
  return node;
}
