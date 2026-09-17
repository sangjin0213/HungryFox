import {
  state, MODES, MODE_LABELS, nextMode, applyMode,
  createBlock, getBlock, setFieldValue, selectBlock, insertBlock, duplicateBlock, removeBlock, moveBlock
} from './state.js';
import { BLOCK_TYPES } from './blocks.js';
import { renderApp, renderCanvas, renderBlock, autosize, updateProgress, FORMS } from './render.js';
import { initDnd } from './dnd.js';

const canvas = document.querySelector('.canvas');

// 임시 하드코딩 데이터
state.page.title = '데미안 독서기록';
state.page.blocks = [
  createBlock('book', { title: '데미안', author: '헤르만 헤세', storeUrl: 'https://example.com/demian' }),
  createBlock('summary', { items: ['싱클레어의 성장 과정', '두 세계의 대립', ''] }),
  createBlock('quote', { body: '새는 알에서 나오려고 투쟁한다.\n알은 세계이다.', page: '123' })
];

const imeActive = e => e.isComposing || e.keyCode === 229;

// 이벤트 대상에서 블록 / 필드 / kind 동작을 찾는다
function fieldContext(target) {
  const blockNode = target.closest('[data-block-id]');
  const fieldNode = target.closest('.field');
  if (!blockNode || !fieldNode) return null;
  const block = getBlock(blockNode.dataset.blockId);
  const field = BLOCK_TYPES[block.type].fields.find(f => f.key === fieldNode.dataset.fieldKey);
  return {
    block, field, fieldNode, target,
    form: FORMS[field.kind],
    value: block.data[field.key],
    index: target.dataset.index === undefined ? null : Number(target.dataset.index)
  };
}

function focusNextField(target) {
  const current = target.closest('.field');
  const editables = [...canvas.querySelectorAll('[data-editable]')];
  editables.slice(editables.indexOf(target) + 1).find(node => node.closest('.field') !== current)?.focus();
}

function focusInField(fieldNode, { part, index = null }) {
  const selector = index === null ? `[data-part="${part}"]` : `[data-part="${part}"][data-index="${index}"]`;
  const node = fieldNode.querySelector(selector) ?? fieldNode.querySelector('[data-editable]');
  if (!node) return;
  node.focus();
  if (typeof node.selectionStart === 'number') node.setSelectionRange(node.value.length, node.value.length);
}

// 필드 구조 변경(항목 추가/삭제 등)은 해당 블록만 다시 그린다
function applyResult(ctx, result) {
  if (result.next) {
    focusNextField(ctx.target);
    return;
  }
  setFieldValue(ctx.block.id, ctx.field.key, result.value);
  const node = renderBlock(ctx.block.id);
  updateProgress();
  focusInField(node.querySelector(`[data-field-key="${ctx.field.key}"]`), result.focus);
}

function commit(target) {
  const ctx = fieldContext(target);
  if (!ctx?.form.collect || !target.hasAttribute('data-editable')) return;
  setFieldValue(ctx.block.id, ctx.field.key, ctx.form.collect(ctx.fieldNode));
  autosize(target);
  updateProgress(ctx.block.id);
}

function setSelection(id) {
  const previous = state.selectedBlockId;
  if (previous === id) return;
  selectBlock(id);
  if (previous && getBlock(previous)) renderBlock(previous);
  renderBlock(id);
}

// 재렌더 후 같은 요소를 다시 찾기 위한 선택자
function focusSelector(node) {
  const blockNode = node.closest('[data-block-id]');
  if (!blockNode) return null;
  const fieldNode = node.closest('.field');
  const own = ['part', 'index', 'action']
    .filter(key => node !== blockNode && node.dataset[key] !== undefined)
    .map(key => `[data-${key}="${node.dataset[key]}"]`)
    .join('');
  return [
    `[data-block-id="${blockNode.dataset.blockId}"]`,
    fieldNode ? `[data-field-key="${fieldNode.dataset.fieldKey}"]` : '',
    own
  ].filter(Boolean).join(' ');
}

function restoreFocus(selector) {
  const node = selector && canvas.querySelector(selector);
  if (!node) return;
  node.focus();
  if (typeof node.selectionStart === 'number') node.setSelectionRange(node.value.length, node.value.length);
}

const BLOCK_ACTIONS = {
  'block-up': id => moveBlock(id, -1),
  'block-down': id => moveBlock(id, 1),
  'block-duplicate': id => duplicateBlock(id),
  'block-remove': id => removeBlock(id)
};

canvas.addEventListener('input', e => {
  if (e.isComposing) return;
  commit(e.target);
});

canvas.addEventListener('compositionend', e => commit(e.target));

canvas.addEventListener('keydown', e => {
  if (imeActive(e)) return;
  if (e.altKey || e.ctrlKey || e.metaKey || !e.target.hasAttribute('data-editable')) return;
  const ctx = fieldContext(e.target);
  const handler = ctx?.form.keys?.[e.target.dataset.part]?.[e.key];
  const result = handler?.(ctx);
  if (!result) return;
  e.preventDefault();
  applyResult(ctx, result);
});

canvas.addEventListener('click', e => {
  const blockNode = e.target.closest('[data-block-id]');
  const button = e.target.closest('[data-action]');
  if (!blockNode) return;
  if (!button) {
    if (state.mode === 'edit') setSelection(blockNode.dataset.blockId);
    return;
  }
  const ctx = fieldContext(button);
  if (ctx) {
    const result = ctx.form.actions?.[button.dataset.action]?.(ctx);
    if (result) applyResult(ctx, result);
    return;
  }
  const selector = focusSelector(button);
  BLOCK_ACTIONS[button.dataset.action]?.(blockNode.dataset.blockId);
  renderCanvas();
  restoreFocus(selector);
});

canvas.addEventListener('focusin', e => e.target.closest('.block')?.classList.add('is-focused'));

canvas.addEventListener('focusout', e => {
  const blockNode = e.target.closest('.block');
  if (blockNode && !blockNode.contains(e.relatedTarget)) blockNode.classList.remove('is-focused');
});

window.addEventListener('resize', () => canvas.querySelectorAll('textarea').forEach(autosize));

// 모드 전환
const TOAST_DURATION = 1500;
let toastTimer = 0;

function announceMode() {
  const toast = document.querySelector('.toast');
  toast.textContent = `${MODE_LABELS[state.mode]} 모드`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.textContent = ''; }, TOAST_DURATION);
}

// 모드 전환 직후 포커스를 둘 첫 요소
const MODE_ENTRY = {
  edit: () => document.querySelector('.palette__item:not(:disabled)'),
  write: () => canvas.querySelector('[data-editable]'),
  read: () => null
};

function setMode(mode) {
  if (mode === state.mode) return;
  applyMode(mode);
  renderApp();
  announceMode();
  const entry = MODE_ENTRY[mode]();
  if (entry) entry.focus();
  else document.activeElement?.blur();
}

const MODE_KEYS = { 1: MODES[0], 2: MODES[1], 3: MODES[2] };

// 에딧 모드: 선택 블록 기준 조작
const blockIds = () => state.page.blocks.map(block => block.id);
const clamp = (value, max) => Math.min(Math.max(value, 0), max);

function selectAndFocus(id) {
  setSelection(id);
  canvas.querySelector(`[data-block-id="${id}"]`)?.focus();
}

function stepSelection(step) {
  const ids = blockIds();
  if (ids.length === 0) return true;
  const current = ids.indexOf(state.selectedBlockId);
  const next = current === -1 ? (step > 0 ? 0 : ids.length - 1) : clamp(current + step, ids.length - 1);
  selectAndFocus(ids[next]);
  return true;
}

function moveSelected(delta) {
  const id = state.selectedBlockId;
  if (!id) return false;
  moveBlock(id, delta);
  renderCanvas();
  canvas.querySelector(`[data-block-id="${id}"]`)?.focus();
  return true;
}

function removeSelected() {
  const id = state.selectedBlockId;
  if (!id) return false;
  const index = blockIds().indexOf(id);
  removeBlock(id);
  renderCanvas();
  const ids = blockIds();
  const neighbor = ids[index] ?? ids[index - 1];
  if (neighbor) selectAndFocus(neighbor);
  return true;
}

function duplicateSelected() {
  const id = state.selectedBlockId;
  if (!id) return false;
  const copy = duplicateBlock(id);
  if (copy) {
    renderCanvas();
    selectAndFocus(copy.id);
  }
  return true;
}

function stepPalette(target, step) {
  const items = [...document.querySelectorAll('.palette__item:not(:disabled)')];
  if (items.length === 0) return true;
  const current = items.indexOf(target.closest('.palette__item'));
  items[current === -1 ? (step > 0 ? 0 : items.length - 1) : clamp(current + step, items.length - 1)].focus();
  return true;
}

// 팔레트 Enter: 선택 블록 바로 아래, 선택이 없으면 맨 끝에 삽입
function insertFromPalette(target) {
  const item = target.closest('.palette__item');
  if (!item || item.disabled) return false;
  const type = item.dataset.blockType;
  const selected = blockIds().indexOf(state.selectedBlockId);
  const block = insertBlock(type, selected === -1 ? state.page.blocks.length : selected + 1);
  if (!block) return true;
  selectBlock(block.id);
  renderCanvas();
  const sameItem = document.querySelector(`.palette__item[data-block-type="${type}"]:not(:disabled)`);
  (sameItem ?? canvas.querySelector(`[data-block-id="${block.id}"]`)).focus();
  return true;
}

// 작성 모드: 포커스가 있는 블록 기준 조작
function moveFocusedBlock(target, delta) {
  const blockNode = target.closest('[data-block-id]');
  if (!blockNode) return false;
  const selector = focusSelector(target);
  moveBlock(blockNode.dataset.blockId, delta);
  renderCanvas();
  restoreFocus(selector);
  return true;
}

// 블록 버튼에서 ↑↓: 캔버스의 앞뒤 조작 요소로 이동
function stepControl(target, step) {
  if (!target.closest('.block__actions')) return false;
  const controls = [...canvas.querySelectorAll('[data-editable], .block__actions button:not(:disabled)')];
  controls[controls.indexOf(target) + step]?.focus();
  return true;
}

const SHORTCUTS = {
  edit: {
    'ArrowUp': () => stepSelection(-1),
    'ArrowDown': () => stepSelection(1),
    'ArrowLeft': target => stepPalette(target, -1),
    'ArrowRight': target => stepPalette(target, 1),
    'Alt+ArrowUp': () => moveSelected(-1),
    'Alt+ArrowDown': () => moveSelected(1),
    'Delete': removeSelected,
    'Mod+d': duplicateSelected,
    'Enter': insertFromPalette
  },
  write: {
    'ArrowUp': target => stepControl(target, -1),
    'ArrowDown': target => stepControl(target, 1),
    'Alt+ArrowUp': target => moveFocusedBlock(target, -1),
    'Alt+ArrowDown': target => moveFocusedBlock(target, 1)
  },
  read: {}
};

const shortcutName = e => [
  e.altKey && 'Alt',
  (e.ctrlKey || e.metaKey) && 'Mod',
  e.key.length === 1 ? e.key.toLowerCase() : e.key
].filter(Boolean).join('+');

document.addEventListener('keydown', e => {
  if (imeActive(e) || e.defaultPrevented) return;
  if (e.key === 'Escape' && e.target.closest('[data-editable]')) {
    e.target.blur();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && MODE_KEYS[e.key]) {
    e.preventDefault();
    setMode(MODE_KEYS[e.key]);
    return;
  }
  if (SHORTCUTS[state.mode][shortcutName(e)]?.(e.target)) {
    e.preventDefault();
    return;
  }
  if (e.key !== 'Tab') return;
  if (e.target.closest('[data-editable]')) return;   // 필드 안에서는 표준 동작 유지
  e.preventDefault();
  setMode(nextMode(state.mode, e.shiftKey ? -1 : 1));
});

initDnd();

renderApp();
