import { TransformControls } from 'TransformControls';
import { Box3, Matrix4, Object3D, Quaternion, Vector3 } from 'three';

const MODE_MAP = {
  none: null,
  translate: 'translate',
  rotate: 'rotate',
  scale: 'scale',
};

/**
 * Управляет TransformControls и общим anchor-объектом для множественных трансформаций.
 */
export class TransformManager extends EventTarget {
  /**
   * @param {import('./sceneManager.js').SceneManager} sceneManager
   * @param {import('./undoManager.js').UndoManager} undoManager
   */
  constructor(sceneManager, undoManager) {
    super();
    this.sceneManager = sceneManager;
    this.undoManager = undoManager;
    this.mode = 'none';
    this.anchor = new Object3D();
    this.anchor.name = 'SelectionAnchor';
    this.sceneManager.scene.add(this.anchor);

    this.transformControls = new TransformControls(
      this.sceneManager.camera,
      this.sceneManager.renderer.domElement,
    );
    this.transformControls.visible = false;
    this.transformControls.setSpace('world');
    this.sceneManager.scene.add(this.transformControls);

    /** @type {Set<import('three').Object3D>} */
    this.currentSelection = new Set();

    this.isDragging = false;
    this.dragState = null;
    this.pendingUndoSnapshot = null;

    this.transformControls.addEventListener('dragging-changed', (event) => {
      this.isDragging = event.value;
      if (this.sceneManager.controls) {
        this.sceneManager.controls.enabled = !event.value;
      }
      if (event.value) {
        if (this.undoManager) {
          this.pendingUndoSnapshot = this.undoManager.captureSnapshot(this.currentSelection);
        }
        this.#cacheRelativeStates();
      } else {
        this.dragState = null;
        if (this.undoManager && this.pendingUndoSnapshot) {
          this.undoManager.commitSnapshot(this.pendingUndoSnapshot);
        }
        this.pendingUndoSnapshot = null;
        this.dispatchEvent(new CustomEvent('transformcommit', { detail: this.getState() }));
      }
      this.dispatchEvent(new CustomEvent('draggingchange', { detail: { dragging: this.isDragging } }));
    });

    this.transformControls.addEventListener('change', () => {
      if (!this.isDragging) {
        return;
      }
      this.#applyAnchorTransform();
      this.dispatchEvent(new CustomEvent('transformchange', { detail: this.getState() }));
    });
  }

  /**
   * Возвращает текущее состояние трансформаций.
   */
  getState() {
    return {
      mode: this.mode,
      selection: this.currentSelection,
    };
  }

  /**
   * Устанавливает режим работы TransformControls.
   * @param {'none' | 'translate' | 'rotate' | 'scale'} mode
   */
  setMode(mode) {
    const previousMode = this.mode;
    this.mode = mode;
    if (mode === 'none') {
      this.transformControls.detach();
      this.transformControls.visible = false;
    } else {
      const controlsMode = MODE_MAP[mode];
      if (controlsMode) {
        this.transformControls.setMode(controlsMode);
      }
      const hasSelection = this.currentSelection.size > 0;
      if (hasSelection) {
        this.transformControls.attach(this.anchor);
      } else {
        this.transformControls.detach();
      }
      this.transformControls.visible = hasSelection;
    }
    if (this.currentSelection.size > 0) {
      this.updateAnchorFromSelection(this.currentSelection);
    }
    if (previousMode !== mode) {
      this.dispatchEvent(new CustomEvent('modechange', { detail: { mode } }));
    }
  }

  /**
   * Обновляет anchor в зависимости от текущего выбора.
   * @param {Set<import('three').Object3D>} selection
   */
  updateAnchorFromSelection(selection) {
    this.currentSelection = new Set(selection);
    if (this.currentSelection.size === 0) {
      this.transformControls.detach();
      this.transformControls.visible = false;
      return;
    }

    if (this.currentSelection.size === 1) {
      const mesh = [...this.currentSelection][0];
      mesh.updateMatrixWorld(true);
      const position = new Vector3();
      const quaternion = new Quaternion();
      mesh.getWorldPosition(position);
      mesh.getWorldQuaternion(quaternion);
      this.anchor.position.copy(position);
      this.anchor.quaternion.copy(quaternion);
      this.anchor.scale.set(1, 1, 1);
    } else {
      // Для множественного выбора anchor ставится в центр масс (по объёму bounding box'ов).
      const box = new Box3();
      const center = new Vector3();
      const size = new Vector3();
      const accumulated = new Vector3();
      let totalWeight = 0;
      this.currentSelection.forEach((mesh) => {
        mesh.updateMatrixWorld(true);
        box.setFromObject(mesh);
        box.getCenter(center);
        box.getSize(size);
        const weight = Math.max(size.x * size.y * size.z, 1e-6);
        accumulated.addScaledVector(center, weight);
        totalWeight += weight;
      });
      if (totalWeight > 0) {
        accumulated.divideScalar(totalWeight);
        this.anchor.position.copy(accumulated);
      } else {
        this.anchor.position.set(0, 0, 0);
      }
      this.anchor.quaternion.identity();
      this.anchor.scale.set(1, 1, 1);
    }

    this.anchor.updateMatrixWorld(true);
    const shouldShow = this.mode !== 'none' && this.currentSelection.size > 0;
    if (shouldShow) {
      this.transformControls.attach(this.anchor);
      this.transformControls.visible = true;
      this.transformControls.updateMatrixWorld(true);
    } else {
      this.transformControls.detach();
      this.transformControls.visible = false;
    }
  }

  /**
   * Принудительно синхронизирует TransformControls с актуальными координатами anchor.
   */
  refresh() {
    if (this.transformControls.object === this.anchor) {
      this.transformControls.updateMatrixWorld(true);
    }
  }

  /**
   * Сохраняет относительные матрицы мешей относительно anchor перед трансформацией.
   * @private
   */
  #cacheRelativeStates() {
    if (this.currentSelection.size === 0) {
      return;
    }
    this.anchor.updateMatrixWorld(true);
    const anchorMatrix = new Matrix4().copy(this.anchor.matrixWorld);
    const anchorInverse = new Matrix4().copy(anchorMatrix).invert();
    const meshStates = new Map();
    this.currentSelection.forEach((mesh) => {
      mesh.updateMatrixWorld(true);
      const relative = new Matrix4().multiplyMatrices(anchorInverse, mesh.matrixWorld);
      meshStates.set(mesh.uuid, { mesh, relative });
    });
    this.dragState = { anchorMatrix, meshStates };
  }

  /**
   * Применяет текущую матрицу anchor к каждому выбранному мешу.
   * @private
   */
  #applyAnchorTransform() {
    if (!this.dragState) {
      return;
    }
    this.anchor.updateMatrixWorld(true);
    const anchorMatrix = new Matrix4().copy(this.anchor.matrixWorld);
    const position = new Vector3();
    const quaternion = new Quaternion();
    const scale = new Vector3();
    this.dragState.meshStates.forEach(({ mesh, relative }) => {
      const worldMatrix = new Matrix4().multiplyMatrices(anchorMatrix, relative);
      worldMatrix.decompose(position, quaternion, scale);
      mesh.position.copy(position);
      mesh.quaternion.copy(quaternion);
      mesh.scale.copy(scale);
      mesh.updateMatrixWorld(true);
    });
  }
}
