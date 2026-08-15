/**
 * Unified input for tablet and desktop.
 *
 *   tap        -> walk to that spot (the main control for small hands)
 *   drag       -> a virtual stick appears under your thumb for direct steering
 *   two finger -> pinch to zoom
 *   WASD/arrow -> direct steering
 *
 * A tap only registers if the pointer stayed put; once it travels past the
 * threshold the gesture becomes a stick and never fires a tap.
 */
import { CAM_ZOOM_RANGE } from './config.js';

const DRAG_THRESHOLD = 24; // px before a tap becomes a stick
const STICK_RANGE = 70; // px for full deflection

export function createInput(canvas, { onTap, onZoom } = {}) {
  const state = { x: 0, y: 0 };
  const keys = new Set();
  const pointers = new Map();

  let stickId = null;
  let stickOrigin = { x: 0, y: 0 };
  let pinchStart = 0;
  let zoom = 1;

  const stick = document.createElement('div');
  stick.id = 'stick';
  stick.innerHTML = '<div id="stick-knob"></div>';
  document.body.appendChild(stick);
  const knob = stick.querySelector('#stick-knob');

  function showStick(x, y) {
    stick.style.left = `${x}px`;
    stick.style.top = `${y}px`;
    stick.classList.add('on');
  }

  function hideStick() {
    stick.classList.remove('on');
    knob.style.transform = '';
    stickId = null;
    state.x = 0;
    state.y = 0;
  }

  /* ------------------------------------------------------------ pointer */

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, {
      startX: e.clientX, startY: e.clientY,
      x: e.clientX, y: e.clientY,
      time: performance.now(),
      moved: false,
    });

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      if (stickId !== null) hideStick();
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;

    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchStart > 0) {
        const next = clamp(zoom * (dist / pinchStart), ...CAM_ZOOM_RANGE);
        pinchStart = dist;
        zoom = next;
        onZoom?.(zoom);
      }
      return;
    }

    const dx = p.x - p.startX;
    const dy = p.y - p.startY;
    if (!p.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      p.moved = true;
      stickId = e.pointerId;
      stickOrigin = { x: p.startX, y: p.startY };
      showStick(stickOrigin.x, stickOrigin.y);
    }

    if (stickId === e.pointerId) {
      const ox = p.x - stickOrigin.x;
      const oy = p.y - stickOrigin.y;
      const len = Math.hypot(ox, oy);
      const clamped = Math.min(len, STICK_RANGE);
      const nx = len ? (ox / len) * clamped : 0;
      const ny = len ? (oy / len) * clamped : 0;
      knob.style.transform = `translate(${nx}px, ${ny}px)`;
      state.x = nx / STICK_RANGE;
      state.y = -ny / STICK_RANGE; // screen down is world "back"
    }
  });

  function endPointer(e) {
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (!p) return;

    if (stickId === e.pointerId) hideStick();
    else if (!p.moved && performance.now() - p.time < 700 && pointers.size === 0) {
      onTap?.(p.x, p.y);
    }
    if (pointers.size < 2) pinchStart = 0;
  }

  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', endPointer);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ----------------------------------------------------------- keyboard */

  const KEYMAP = {
    ArrowUp: [0, 1], KeyW: [0, 1],
    ArrowDown: [0, -1], KeyS: [0, -1],
    ArrowLeft: [-1, 0], KeyA: [-1, 0],
    ArrowRight: [1, 0], KeyD: [1, 0],
  };

  window.addEventListener('keydown', (e) => {
    if (!KEYMAP[e.code]) return;
    e.preventDefault();
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => {
    keys.clear();
    hideStick();
  });

  return {
    /** Normalised steering vector in screen space; y is "away from camera". */
    get vector() {
      if (stickId !== null) return state;
      let x = 0;
      let y = 0;
      for (const code of keys) {
        const [kx, ky] = KEYMAP[code];
        x += kx;
        y += ky;
      }
      const len = Math.hypot(x, y);
      return len ? { x: x / len, y: y / len } : { x: 0, y: 0 };
    },
    get zoom() {
      return zoom;
    },
    setZoom(z) {
      zoom = clamp(z, ...CAM_ZOOM_RANGE);
      onZoom?.(zoom);
    },
    dispose() {
      stick.remove();
    },
  };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
