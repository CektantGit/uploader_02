import { ImportManager } from './core/importManager.js';
import { SceneManager } from './core/sceneManager.js';
import { SelectionManager } from './core/selectionManager.js';
import { TransformManager } from './core/transformManager.js';
import { UndoManager } from './core/undoManager.js';
import { Inspector } from './ui/inspector.js';
import { Panel } from './ui/panel.js';
import { Toolbar } from './ui/toolbar.js';
import { MaterialPanel } from './ui/materialPanel.js';
import { InfoPanel } from './ui/infoPanel.js';

const canvas = /** @type {HTMLCanvasElement | null} */ (document.getElementById('scene'));
const panelElement = /** @type {HTMLElement | null} */ (document.querySelector('[data-panel]'));
const toolbarElement = /** @type {HTMLElement | null} */ (document.querySelector('[data-toolbar]'));
const inspectorElement = /** @type {HTMLElement | null} */ (document.querySelector('[data-inspector]'));
const materialPanelElement = /** @type {HTMLElement | null} */ (
  document.querySelector('[data-material-panel]'),
);
const infoPanelElement = /** @type {HTMLElement | null} */ (document.querySelector('[data-info-panel]'));
const dimensionToggle = /** @type {HTMLInputElement | null} */ (
  document.querySelector('[data-dimension-toggle]'),
);

if (
  !canvas ||
  !panelElement ||
  !toolbarElement ||
  !inspectorElement ||
  !materialPanelElement ||
  !infoPanelElement ||
  !dimensionToggle
) {
  throw new Error('UI elements are missing in the document.');
}

const sceneManager = new SceneManager(canvas);
const selectionManager = new SelectionManager();
const undoManager = new UndoManager();
const transformManager = new TransformManager(sceneManager, undoManager);
const panel = new Panel(panelElement);
const toolbar = new Toolbar(toolbarElement);
const inspector = new Inspector(inspectorElement, transformManager, selectionManager, undoManager);
const importManager = new ImportManager(sceneManager, selectionManager, panel);
const materialPanel = new MaterialPanel(materialPanelElement);
const infoPanel = new InfoPanel(infoPanelElement);

materialPanel.update(selectionManager.getSelectionState().selectedMeshes);
sceneManager.updateDimensionTargets(selectionManager.getSelectionState().selectedMeshes);

sceneManager.setDimensionEnabled(dimensionToggle.checked);

dimensionToggle.addEventListener('change', () => {
  sceneManager.setDimensionEnabled(dimensionToggle.checked);
  sceneManager.updateDimensionTargets(selectionManager.getSelectionState().selectedMeshes);
});

let pointerDownPosition = null;
let transformRecentlyActive = false;

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
    sceneManager.updateDimensionTargets(selectionManager.getSelectionState().selectedMeshes);
  } catch (error) {
    console.error('Error importing model', error);
  }
});

panel.bindSelectAll(() => {
  selectionManager.selectAll();
});

selectionManager.addEventListener('selectionchange', (event) => {
  const { selectedMeshes } = event.detail;
  transformManager.updateAnchorFromSelection(selectedMeshes);
  inspector.update(selectedMeshes, transformManager.mode);
  materialPanel.update(selectedMeshes);
  sceneManager.updateDimensionTargets(selectedMeshes);
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
  } else {
    window.setTimeout(() => {
      transformRecentlyActive = false;
    }, 50);
  }
});

window.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.shiftKey) {
    return;
  }
  if (event.key.toLowerCase() !== 'z') {
    return;
  }
  const target = /** @type {EventTarget | null} */ (event.target);
  if (
    target &&
    (target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable))
  ) {
    return;
  }
  const result = undoManager.undo();
  if (!result) {
    return;
  }
  event.preventDefault();
  const { selectedMeshes } = selectionManager.getSelectionState();
  transformManager.updateAnchorFromSelection(selectedMeshes);
  transformManager.refresh();
  inspector.update(selectedMeshes, transformManager.mode);
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
  const intersections = sceneManager.intersectObjects(ndc);
  let targetMesh = null;
  for (const intersection of intersections) {
    const mesh = selectionManager.findRegisteredMesh(intersection.object);
    if (mesh) {
      targetMesh = mesh;
      break;
    }
  }
  const additive = event.ctrlKey || event.metaKey;
  selectionManager.selectFromScene(targetMesh, additive);
});
