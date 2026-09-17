import { state, canInsert, insertBlock, moveBlockTo } from './state.js';
import { renderCanvas } from './render.js';

const EDGE = 80;          // 자동 스크롤 시작 영역(px)
const SCROLL_RATIO = 0.25; // 가장자리 침범 거리 대비 프레임당 스크롤량

let layout = null;   // pointerdown 시점 측정값(페이지 좌표)
let indicator = null;
let sourceNode = null;
let pointer = { x: 0, y: 0 };
let scrollFrame = 0;

const canvas = () => document.querySelector('.canvas');

// 블록 위치를 1회 측정해 캐싱. 스크롤에 영향받지 않도록 페이지 좌표로 저장
function measure() {
  const pageRect = node => {
    const rect = node.getBoundingClientRect();
    return {
      top: rect.top + scrollY, bottom: rect.bottom + scrollY,
      left: rect.left + scrollX, right: rect.right + scrollX,
      mid: rect.top + scrollY + rect.height / 2
    };
  };
  layout = {
    canvas: pageRect(canvas()),
    blocks: [...canvas().querySelectorAll('.block')].map(pageRect)
  };
}

function indicatorOffset(index) {
  const { blocks, canvas: area } = layout;
  const prev = blocks[index - 1];
  const next = blocks[index];
  const y = prev && next ? (prev.bottom + next.top) / 2 : next ? next.top : prev ? prev.bottom : area.top;
  return y - area.top;
}

function update() {
  const x = pointer.x + scrollX;
  const y = pointer.y + scrollY;
  const { canvas: area, blocks } = layout;
  const inside = x >= area.left && x <= area.right && y >= area.top && y <= area.bottom;
  const found = blocks.findIndex(block => y < block.mid);
  const index = found === -1 ? blocks.length : found;

  state.dragging.index = inside ? index : null;
  indicator.hidden = !inside;
  if (inside) indicator.style.transform = `translateY(${indicatorOffset(index)}px)`;
}

function autoScroll() {
  scrollFrame = 0;
  if (!state.dragging) return;
  const { y } = pointer;
  const overflow = y < EDGE ? y - EDGE : y > innerHeight - EDGE ? y - (innerHeight - EDGE) : 0;
  if (overflow === 0) return;
  scrollBy(0, overflow * SCROLL_RATIO);
  update();
  scrollFrame = requestAnimationFrame(autoScroll);
}

function start(dragging, node, e) {
  state.dragging = { ...dragging, index: null };
  sourceNode = node;
  sourceNode.classList.add('is-dragging');
  sourceNode.setPointerCapture(e.pointerId);
  measure();
  indicator = document.createElement('div');
  indicator.className = 'drop-indicator';
  indicator.setAttribute('aria-hidden', 'true');
  indicator.hidden = true;
  canvas().append(indicator);
  pointer = { x: e.clientX, y: e.clientY };
  update();
}

function finish() {
  cancelAnimationFrame(scrollFrame);
  scrollFrame = 0;
  indicator?.remove();
  sourceNode?.classList.remove('is-dragging');
  indicator = sourceNode = layout = null;
  state.dragging = null;
}

function onMove(e) {
  if (!state.dragging) return;
  pointer = { x: e.clientX, y: e.clientY };
  update();
  if (!scrollFrame) scrollFrame = requestAnimationFrame(autoScroll);
}

const DROPS = {
  palette: ({ type, index }) => insertBlock(type, index),
  block: ({ id, index }) => moveBlockTo(id, index)
};

// 배열 수정과 재렌더는 pointerup에서만
function onUp() {
  if (!state.dragging) return;
  const dragging = state.dragging;
  finish();
  if (dragging.index !== null && DROPS[dragging.source](dragging)) renderCanvas();
}

function onGripPointerDown(e) {
  if (e.button !== 0 || state.mode !== 'edit') return;
  const grip = e.target.closest('.block__grip');
  if (!grip) return;
  e.preventDefault();
  const blockNode = grip.closest('[data-block-id]');
  start({ source: 'block', id: blockNode.dataset.blockId }, blockNode, e);
}

function onPalettePointerDown(e) {
  if (e.button !== 0) return;
  const item = e.target.closest('.palette__item');
  if (!item || !canInsert(item.dataset.blockType)) return;
  e.preventDefault();
  start({ source: 'palette', type: item.dataset.blockType }, item, e);
}

export function initDnd() {
  document.querySelector('.palette').addEventListener('pointerdown', onPalettePointerDown);
  canvas().addEventListener('pointerdown', onGripPointerDown);
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', () => state.dragging && finish());
}
