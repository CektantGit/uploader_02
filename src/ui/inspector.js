import { MathUtils } from 'three';

const INITIAL_TRANSFORM_KEY = '__initialTransform';

/**
 * Панель XYZ для редактирования трансформаций одиночного меша.
 */
export class Inspector {
  /**
   * @param {HTMLElement} root
   * @param {import('../core/transformManager.js').TransformManager} transformManager
   * @param {import('../core/selectionManager.js').SelectionManager} selectionManager
   * @param {import('../core/undoManager.js').UndoManager} undoManager
   */
  constructor(root, transformManager, selectionManager, undoManager) {
    this.root = root;
    this.transformManager = transformManager;
    this.selectionManager = selectionManager;
    this.undoManager = undoManager;
    this.inputs = {
      x: /** @type {HTMLInputElement} */ (root.querySelector('[data-axis="x"]')),
      y: /** @type {HTMLInputElement} */ (root.querySelector('[data-axis="y"]')),
      z: /** @type {HTMLInputElement} */ (root.querySelector('[data-axis="z"]')),
    };
    this.resetButton = /** @type {HTMLButtonElement | null} */ (
      root.querySelector('[data-inspector-reset]')
    );

    this.mode = 'none';
    /** @type {import('three').Object3D | null} */
    this.activeMesh = null;
    this.isSyncing = false;

    Object.values(this.inputs).forEach((input) => {
      input.addEventListener('change', () => this.#commitChanges());
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          this.#commitChanges();
        }
      });
    });

    if (this.resetButton) {
      this.resetButton.addEventListener('click', () => {
        this.#resetTransform();
      });
      this.resetButton.disabled = true;
    }
  }

  /**
   * Обновляет панель согласно текущему выбору и режиму.
   * @param {Set<import('three').Object3D>} selection
   * @param {'none' | 'translate' | 'rotate' | 'scale'} mode
   */
  update(selection, mode) {
    this.mode = mode;
    if (selection.size === 1 && mode !== 'none') {
      this.activeMesh = [...selection][0];
      this.#syncInputs();
      this.root.classList.remove('hidden');
      if (this.resetButton) {
        this.resetButton.disabled = !this.#getInitialTransform(this.activeMesh);
      }
    } else {
      this.activeMesh = null;
      this.root.classList.add('hidden');
      if (this.resetButton) {
        this.resetButton.disabled = true;
      }
    }
  }

  /**
   * Подтягивает значения из меша в инпуты.
   */
  #syncInputs() {
    if (!this.activeMesh) {
      return;
    }
    this.isSyncing = true;
    const mesh = this.activeMesh;
    if (this.mode === 'translate') {
      this.inputs.x.value = mesh.position.x.toFixed(3);
      this.inputs.y.value = mesh.position.y.toFixed(3);
      this.inputs.z.value = mesh.position.z.toFixed(3);
    } else if (this.mode === 'rotate') {
      this.inputs.x.value = MathUtils.radToDeg(mesh.rotation.x).toFixed(2);
      this.inputs.y.value = MathUtils.radToDeg(mesh.rotation.y).toFixed(2);
      this.inputs.z.value = MathUtils.radToDeg(mesh.rotation.z).toFixed(2);
    } else if (this.mode === 'scale') {
      this.inputs.x.value = mesh.scale.x.toFixed(3);
      this.inputs.y.value = mesh.scale.y.toFixed(3);
      this.inputs.z.value = mesh.scale.z.toFixed(3);
    }
    this.isSyncing = false;
  }

  /**
   * Применяет изменения из инпутов к мешу и обновляет TransformControls.
   */
  #commitChanges() {
    if (!this.activeMesh || this.isSyncing) {
      return;
    }
    const snapshot = this.undoManager?.captureSnapshot([this.activeMesh]);
    const parse = (value) => {
      const number = Number(value);
      return Number.isFinite(number) ? number : 0;
    };
    const x = parse(this.inputs.x.value);
    const y = parse(this.inputs.y.value);
    const z = parse(this.inputs.z.value);

    if (this.mode === 'translate') {
      this.activeMesh.position.set(x, y, z);
    } else if (this.mode === 'rotate') {
      this.activeMesh.rotation.set(MathUtils.degToRad(x), MathUtils.degToRad(y), MathUtils.degToRad(z));
    } else if (this.mode === 'scale') {
      this.activeMesh.scale.set(x, y, z);
    }
    this.activeMesh.updateMatrixWorld(true);

    const { selectedMeshes } = this.selectionManager.getSelectionState();
    this.transformManager.updateAnchorFromSelection(selectedMeshes);
    this.transformManager.refresh();
    this.#syncInputs();
    if (snapshot) {
      this.undoManager?.commitSnapshot(snapshot);
    }
  }

  /**
   * Сбрасывает трансформацию активного меша к исходной.
   */
  #resetTransform() {
    if (!this.activeMesh || this.isSyncing) {
      return;
    }
    const initial = this.#getInitialTransform(this.activeMesh);
    if (!initial) {
      return;
    }
    const snapshot = this.undoManager?.captureSnapshot([this.activeMesh]);
    this.activeMesh.position.copy(initial.position);
    this.activeMesh.rotation.copy(initial.rotation);
    this.activeMesh.scale.copy(initial.scale);
    this.activeMesh.updateMatrixWorld(true);

    const { selectedMeshes } = this.selectionManager.getSelectionState();
    this.transformManager.updateAnchorFromSelection(selectedMeshes);
    this.transformManager.refresh();
    this.#syncInputs();
    if (snapshot) {
      this.undoManager?.commitSnapshot(snapshot);
    }
  }

  /**
   * Возвращает сохранённую начальную трансформацию для меша.
   * @param {import('three').Object3D} mesh
   * @returns {{ position: import('three').Vector3; rotation: import('three').Euler; scale: import('three').Vector3 } | null}
   */
  #getInitialTransform(mesh) {
    const data = mesh.userData?.[INITIAL_TRANSFORM_KEY];
    if (!data || !data.position || !data.rotation || !data.scale) {
      return null;
    }
    return data;
  }
}
