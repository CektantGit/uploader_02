import * as THREE from 'three';
import { SceneManager } from './core/sceneManager.js';
import { SelectionManager } from './core/selectionManager.js';
import { TransformManager } from './core/transformManager.js';
import { ImportManager } from './core/importManager.js';
import { Panel } from './ui/panel.js';
import { Toolbar } from './ui/toolbar.js';
import { Inspector } from './ui/inspector.js';

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('viewport'));
const panelElement = document.getElementById('panel');
const toolbarElement = document.getElementById('toolbar');
const inspectorElement = document.getElementById('inspector');

const sceneManager = new SceneManager(canvas);
const selectionManager = new SelectionManager();
const transformManager = new TransformManager(sceneManager);
const importManager = new ImportManager();
const panel = new Panel(panelElement);
const toolbar = new Toolbar(toolbarElement);
const inspector = new Inspector(inspectorElement);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let meshCounter = 1;

await sceneManager.loadEnvironment();
sceneManager.start(() => {});

/**
 * Adds imported meshes to the scene and UI registry.
 * @param {THREE.Mesh[]} meshes
 */
function addMeshes(meshes) {
  meshes.forEach((mesh) => {
    if (!mesh.name || mesh.name.trim().length === 0 || mesh.name === 'Mesh') {
      mesh.name = `Mesh ${meshCounter}`;
    }
    meshCounter += 1;
    mesh.visible = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    sceneManager.scene.add(mesh);
    selectionManager.register(mesh);
    panel.addMesh(mesh);
    panel.setVisibility(mesh, true);
  });
}

function updateInspector() {
  inspector.update(selectionManager.getSelection(), transformManager.mode);
}

panel.addEventListener('import', async (event) => {
  const file = event.detail;
  try {
    const meshes = await importManager.importModel(file);
    addMeshes(meshes);
  } catch (error) {
    console.error('Error importing model', error);
  }
});

panel.addEventListener('select', (event) => {
  const { mesh, additive } = event.detail;
  selectionManager.select(mesh, additive);
});

panel.addEventListener('togglevisibility', (event) => {
  const { mesh } = event.detail;
  mesh.visible = !mesh.visible;
  panel.setVisibility(mesh, mesh.visible);
});

panel.addEventListener('remove', (event) => {
  const { mesh } = event.detail;
  selectionManager.unregister(mesh);
  sceneManager.scene.remove(mesh);
  panel.removeMesh(mesh);
  updateInspector();
});

selectionManager.addEventListener('selectionchange', (event) => {
  const selection = event.detail;
  panel.setSelection(selectionManager.selectedMeshes);
  transformManager.setSelection(selection);
  updateInspector();
});

toolbar.addEventListener('mode', (event) => {
  const mode = event.detail;
  transformManager.setMode(mode);
  updateInspector();
});

transformManager.addEventListener('transformchange', () => {
  inspector.refresh();
});

inspector.addEventListener('valuechange', (event) => {
  const { axis, value } = event.detail;
  const selection = selectionManager.getSelection();
  if (selection.length !== 1) {
    return;
  }
  const mesh = selection[0];
  switch (transformManager.mode) {
    case 'translate':
      mesh.position[axis] = value;
      break;
    case 'rotate':
      mesh.rotation[axis] = THREE.MathUtils.degToRad(value);
      break;
    case 'scale':
      mesh.scale[axis] = value;
      break;
    default:
      break;
  }
  mesh.updateMatrixWorld(true);
  transformManager.setSelection(selection);
  inspector.refresh();
});

canvas.addEventListener('pointerdown', (event) => {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, sceneManager.camera);
  const intersections = raycaster.intersectObjects(selectionManager.getRegisteredMeshes(), true);
  selectionManager.selectFromIntersections(intersections, event.shiftKey);
});

// Expose state for debugging in the console.
Object.assign(window, {
  scene: sceneManager.scene,
  camera: sceneManager.camera,
  renderer: sceneManager.renderer,
  selectedMeshes: selectionManager.selectedMeshes,
  meshMap: panel.meshMap,
  setMode: (mode) => transformManager.setMode(mode)
});
