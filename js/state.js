import { BLOCK_TYPES } from './blocks.js';

export const MODES = ['edit', 'write', 'read'];
export const MODE_LABELS = { edit: '에딧', write: '작성', read: '열람' };

export const state = {
  mode: 'edit',
  page: { title: '', blocks: [] },
  selectedBlockId: null,
  dragging: null
};

let seq = 0;
const newId = () => `b_${Date.now().toString(36)}${(seq++).toString(36)}`;

export function createBlock(type, data = {}) {
  return { id: newId(), type, data: { ...BLOCK_TYPES[type].create(), ...data } };
}

export function getBlock(id) {
  return state.page.blocks.find(block => block.id === id);
}

const indexOf = id => state.page.blocks.findIndex(block => block.id === id);

export function nextMode(mode, step) {
  return MODES[(MODES.indexOf(mode) + step + MODES.length) % MODES.length];
}

export function applyMode(mode) {
  state.mode = mode;
}

export function setFieldValue(id, key, value) {
  getBlock(id).data[key] = value;
}

export function selectBlock(id) {
  state.selectedBlockId = id;
}

export function canInsert(type) {
  return !BLOCK_TYPES[type].once || !state.page.blocks.some(block => block.type === type);
}

export function insertBlock(type, index) {
  if (!canInsert(type)) return null;
  const block = createBlock(type);
  state.page.blocks.splice(index, 0, block);
  return block;
}

export function duplicateBlock(id) {
  const source = getBlock(id);
  if (!canInsert(source.type)) return null;
  const copy = { id: newId(), type: source.type, data: structuredClone(source.data) };
  state.page.blocks.splice(indexOf(id) + 1, 0, copy);
  return copy;
}

export function removeBlock(id) {
  state.page.blocks.splice(indexOf(id), 1);
  if (state.selectedBlockId === id) state.selectedBlockId = null;
}

// index는 이동 전 배열 기준 삽입 위치(0 ~ length)
export function moveBlockTo(id, index) {
  const blocks = state.page.blocks;
  const from = indexOf(id);
  const to = index > from ? index - 1 : index;
  if (from < 0 || to === from) return false;
  blocks.splice(to, 0, ...blocks.splice(from, 1));
  return true;
}

export function moveBlock(id, delta) {
  const blocks = state.page.blocks;
  const from = indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= blocks.length) return false;
  blocks.splice(to, 0, ...blocks.splice(from, 1));
  return true;
}
