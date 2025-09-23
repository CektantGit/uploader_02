import { ImportManager } from './core/importManager.js';
import { SceneManager } from './core/sceneManager.js';
import { SelectionManager } from './core/selectionManager.js';
import { TransformManager } from './core/transformManager.js';
import { OutlineManager } from './core/outlineManager.js';
import { Inspector } from './ui/inspector.js';
import { Panel } from './ui/panel.js';
import { Toolbar } from './ui/toolbar.js';

const canvas = /** @type {HTMLCanvasElement | null} */ (document.getElementById('scene'));
const panelElement = /** @type {HTMLElement | null} */ (document.querySelector('[data-panel]'));
const toolbarElement = /** @type {HTMLElement | null} */ (document.querySelector('[data-toolbar]'));
const inspectorElement = /** @type {HTMLElement | null} */ (document.querySelector('[data-inspector]'));
const outlineToggleButton = /** @type {HTMLButtonElement | null} */ (
  document.querySelector('[data-outline-toggle]')
);

if (!canvas || !panelElement || !toolbarElement || !inspectorElement || !outlineToggleButton) {
  throw new Error('UI elements are missing in the document.');
}

const sceneManager = new SceneManager(canvas);
const selectionManager = new SelectionManager();
const transformManager = new TransformManager(sceneManager);
const panel = new Panel(panelElement);
const toolbar = new Toolbar(toolbarElement);
const inspector = new Inspector(inspectorElement, transformManager, selectionManager);
const importManager = new ImportManager(sceneManager, selectionManager, panel);
const outlineManager = new OutlineManager(sceneManager);
outlineManager.setOverlayLayer(transformManager.getOverlayLayer());

let pointerDownPosition = null;
let transformRecentlyActive = false;
/** @type {{ clientX: number; clientY: number } | null} */
let pendingHoverPointer = null;
let hoverFrameHandle = null;

const cancelScheduledHover = () => {
  if (hoverFrameHandle !== null) {
    window.cancelAnimationFrame(hoverFrameHandle);
    hoverFrameHandle = null;
  }
  pendingHoverPointer = null;
};

const scheduleHoverRaycast = () => {
  if (hoverFrameHandle !== null) {
    return;
  }
  hoverFrameHandle = window.requestAnimationFrame(() => {
    hoverFrameHandle = null;
    if (!pendingHoverPointer) {
      outlineManager.setHoveredMesh(null);
      return;
    }
    const pointer = pendingHoverPointer;
    pendingHoverPointer = null;
    const ndc = sceneManager.getPointerNDC(
      /** @type {PointerEvent} */ ({ clientX: pointer.clientX, clientY: pointer.clientY }),
    );
    const registeredMeshes = selectionManager.getRegisteredMeshes();
    if (registeredMeshes.length === 0) {
      outlineManager.setHoveredMesh(null);
      return;
    }
    const intersections = sceneManager.intersectMeshes(ndc, registeredMeshes);
    let hovered = null;
    for (const intersection of intersections) {
      const mesh = selectionManager.findRegisteredMesh(intersection.object);
      if (mesh) {
        hovered = mesh;
        break;
      }
    }
    outlineManager.setHoveredMesh(hovered);
  });
};

const updateOutlineToggle = (enabled) => {
  outlineToggleButton.classList.toggle('outline-toggle--active', enabled);
  outlineToggleButton.classList.toggle('outline-toggle--inactive', !enabled);
  outlineToggleButton.textContent = enabled ? 'Outline: On' : 'Outline: Off';
};

outlineManager.addEventListener('toggle', (event) => {
  updateOutlineToggle(event.detail.enabled);
});

outlineToggleButton.addEventListener('click', () => {
  outlineManager.setEnabled(!outlineManager.enabled);
});

updateOutlineToggle(outlineManager.enabled);

(async () => {
  try {
    await sceneManager.init();
  } catch (error) {
    console.error('Failed to initialize scene', error);
  }
})();

toolbar.bindModeChange((mode) => {
  transformManager.setMode(mode);
  const { selectedMeshes } = selectionManager.getSelectionState();
  transformManager.updateAnchorFromSelection(selectedMeshes);
  inspector.update(selectedMeshes, mode);
});
toolbar.setActiveMode('none');

panel.bindImport(async (file) => {
  try {
    await importManager.importModel(file);
  } catch (error) {
    console.error('Error importing model', error);
  }
});

selectionManager.addEventListener('selectionchange', (event) => {
  const { selectedMeshes } = event.detail;
  transformManager.updateAnchorFromSelection(selectedMeshes);
  inspector.update(selectedMeshes, transformManager.mode);
  outlineManager.setSelectedMeshes(selectedMeshes);
});

transformManager.addEventListener('transformchange', () => {
  const { selectedMeshes } = selectionManager.getSelectionState();
  inspector.update(selectedMeshes, transformManager.mode);
});

transformManager.addEventListener('transformcommit', () => {
  const { selectedMeshes } = selectionManager.getSelectionState();
  inspector.update(selectedMeshes, transformManager.mode);
});

transformManager.addEventListener('modechange', (event) => {
  toolbar.setActiveMode(event.detail.mode);
});

transformManager.addEventListener('draggingchange', (event) => {
  if (event.detail.dragging) {
    transformRecentlyActive = true;
    cancelScheduledHover();
    outlineManager.setHoveredMesh(null);
  } else {
    window.setTimeout(() => {
      transformRecentlyActive = false;
    }, 50);
  }
});

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) {
    return;
  }
  pointerDownPosition = { x: event.clientX, y: event.clientY };
});

canvas.addEventListener('pointerup', (event) => {
  if (event.button !== 0 || !pointerDownPosition) {
    return;
  }
  const movement = Math.hypot(event.clientX - pointerDownPosition.x, event.clientY - pointerDownPosition.y);
  pointerDownPosition = null;
  if (movement > 4 || transformManager.isDragging || transformRecentlyActive) {
    return;
  }
  const ndc = sceneManager.getPointerNDC(event);
  const registeredMeshes = selectionManager.getRegisteredMeshes();
  const intersections = sceneManager.intersectMeshes(ndc, registeredMeshes);
  let targetMesh = null;
  for (const intersection of intersections) {
    const mesh = selectionManager.findRegisteredMesh(intersection.object);
    if (mesh) {
      targetMesh = mesh;
      break;
    }
  }
  selectionManager.selectFromScene(targetMesh, event.shiftKey);
  pendingHoverPointer = { clientX: event.clientX, clientY: event.clientY };
  scheduleHoverRaycast();
});

canvas.addEventListener('pointermove', (event) => {
  if (transformManager.isDragging) {
    cancelScheduledHover();
    outlineManager.setHoveredMesh(null);
    return;
  }
  if (event.buttons !== 0) {
    cancelScheduledHover();
    outlineManager.setHoveredMesh(null);
    return;
  }
  pendingHoverPointer = { clientX: event.clientX, clientY: event.clientY };
  scheduleHoverRaycast();
});

canvas.addEventListener('pointerleave', () => {
  cancelScheduledHover();
  outlineManager.setHoveredMesh(null);
});
