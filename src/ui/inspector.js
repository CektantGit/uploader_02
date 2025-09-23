import { MathUtils } from 'three';

/**
 * Панель XYZ для редактирования трансформаций одиночного меша.
 */
export class Inspector {
  /**
   * @param {HTMLElement} root
   * @param {import('../core/transformManager.js').TransformManager} transformManager
   * @param {import('../core/selectionManager.js').SelectionManager} selectionManager
   */
  constructor(root, transformManager, selectionManager) {
    this.root = root;
    this.transformManager = transformManager;
    this.selectionManager = selectionManager;
    this.inputs = {
      x: /** @type {HTMLInputElement} */ (root.querySelector('[data-axis="x"]')),
      y: /** @type {HTMLInputElement} */ (root.querySelector('[data-axis="y"]')),
      z: /** @type {HTMLInputElement} */ (root.querySelector('[data-axis="z"]')),
    };

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
    } else {
      this.activeMesh = null;
      this.root.classList.add('hidden');
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
  }
}
