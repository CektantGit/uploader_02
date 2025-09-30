/**
 * Управляет выбором мешей как в сцене, так и в списке интерфейса.
 * Поддерживает множественный выбор и синхронизацию UI.
 */
export class SelectionManager extends EventTarget {
  constructor() {
    super();
    /** @type {Set<import('three').Object3D>} */
    this.selectedMeshes = new Set();
    /** @type {Map<string, { mesh: import('three').Object3D, li: HTMLElement }>} */
    this.meshMap = new Map();
    this.lastSelectedId = null;
  }

  /**
   * Регистрирует меш и соответствующий DOM-элемент списка.
   * @param {import('three').Object3D} mesh
   * @param {HTMLElement} li
   */
  registerMesh(mesh, li) {
    this.meshMap.set(mesh.uuid, { mesh, li });
    li.dataset.uuid = mesh.uuid;
    this.#updateListHighlight();
  }

  /**
   * Удаляет меш и все связанные данные из менеджера выбора.
   * @param {string} uuid
   */
  unregisterMesh(uuid) {
    const record = this.meshMap.get(uuid);
    if (!record) {
      return;
    }
    this.meshMap.delete(uuid);
    if (record.li?.isConnected) {
      record.li.remove();
    }
    this.selectedMeshes.delete(record.mesh);
    this.#setMeshHighlighted(record.mesh, false);
    this.#updateListHighlight();
    if (this.lastSelectedId === uuid) {
      this.lastSelectedId = null;
    }
    this.dispatchEvent(new CustomEvent('selectionchange', { detail: this.getSelectionState() }));
  }

  /**
   * Текущий набор выбранных мешей.
   * @returns {{ selectedMeshes: Set<import('three').Object3D> }}
   */
  getSelectionState() {
    return { selectedMeshes: this.selectedMeshes };
  }

  /**
   * Обработка выбора объекта в 3D-сцене.
   * @param {import('three').Object3D | null} object
   * @param {boolean} additive
   */
  selectFromScene(object, additive) {
    const mesh = this.findRegisteredMesh(object);
    this.selectMeshes(mesh ? [mesh] : [], additive);
  }

  /**
   * Возвращает зарегистрированный меш по объекту сцены.
   * @param {import('three').Object3D | null} object
   * @returns {import('three').Object3D | null}
   */
  findRegisteredMesh(object) {
    return object ? this.#findRegisteredMesh(object) : null;
  }

  /**
   * Обработка клика по строке списка.
   * @param {string} uuid
   * @param {boolean} withCtrl
   */
  selectFromList(uuid, withCtrl) {
    const mesh = this.meshMap.get(uuid)?.mesh ?? null;
    this.selectMeshes(mesh ? [mesh] : [], withCtrl);
  }

  /**
   * Унифицированный обработчик выбора мешей независимо от источника.
   * @param {import('three').Object3D[]} meshes
   * @param {boolean} additive
   */
  selectMeshes(meshes, additive) {
    if (meshes.length === 0) {
      if (!additive) {
        this.clearSelection();
      }
      return;
    }

    const nextSelection = additive ? new Set(this.selectedMeshes) : new Set();
    meshes.forEach((mesh) => {
      if (this.meshMap.has(mesh.uuid)) {
        nextSelection.add(mesh);
      }
    });

    if (nextSelection.size === 0) {
      if (!additive) {
        this.clearSelection();
      }
      return;
    }

    this.#applySelection(nextSelection);
    const last = meshes[meshes.length - 1];
    if (last && this.meshMap.has(last.uuid)) {
      this.lastSelectedId = last.uuid;
    }
  }

  /**
   * Устанавливает выбор на переданные меши.
   * @param {import('three').Object3D[]} meshes
   * @param {boolean} additive
   */
  setSelection(meshes, additive = false) {
    const newSelection = additive ? new Set(this.selectedMeshes) : new Set();
    meshes.forEach((mesh) => {
      if (this.meshMap.has(mesh.uuid)) {
        newSelection.add(mesh);
      }
    });
    this.#applySelection(newSelection);
    if (meshes.length > 0) {
      this.lastSelectedId = meshes[meshes.length - 1].uuid;
    }
  }

  /**
   * Сбрасывает выбор полностью.
   */
  clearSelection() {
    if (this.selectedMeshes.size === 0) {
      return;
    }
    this.selectedMeshes.forEach((mesh) => {
      this.#setMeshHighlighted(mesh, false);
    });
    this.selectedMeshes.clear();
    this.lastSelectedId = null;
    this.#updateListHighlight();
    this.dispatchEvent(new CustomEvent('selectionchange', { detail: this.getSelectionState() }));
  }

  /**
   * Выбирает все зарегистрированные меши.
   */
  selectAll() {
    const meshes = Array.from(this.meshMap.values())
      .map((record) => record?.mesh)
      .filter((mesh) => Boolean(mesh));
    if (meshes.length === 0) {
      this.clearSelection();
      return;
    }
    this.setSelection(/** @type {import('three').Object3D[]} */ (meshes));
  }

  /**
   * Удаляет меш из текущего выбора (например, при скрытии или удалении).
   * @param {import('three').Object3D} mesh
   */
  removeFromSelection(mesh) {
    if (this.selectedMeshes.has(mesh)) {
      this.selectedMeshes.delete(mesh);
      this.#setMeshHighlighted(mesh, false);
      this.#updateListHighlight();
      this.dispatchEvent(new CustomEvent('selectionchange', { detail: this.getSelectionState() }));
    }
  }

  /**
   * Проверяет, выбран ли меш.
   * @param {import('three').Object3D} mesh
   * @returns {boolean}
   */
  isSelected(mesh) {
    return this.selectedMeshes.has(mesh);
  }

  /**
   * Выделяет меш с учётом режима (одиночный / множественный).
   * @param {import('three').Object3D} mesh
   * @param {boolean} additive
   */
  /**
   * Применяет новый набор выбранных мешей, обновляя визуальное состояние.
   * @param {Set<import('three').Object3D>} newSelection
   */
  #applySelection(newSelection) {
    this.selectedMeshes.forEach((mesh) => {
      if (!newSelection.has(mesh)) {
        this.#setMeshHighlighted(mesh, false);
      }
    });

    newSelection.forEach((mesh) => {
      this.#setMeshHighlighted(mesh, true);
    });

    this.selectedMeshes = newSelection;
    this.#updateListHighlight();
    this.dispatchEvent(new CustomEvent('selectionchange', { detail: this.getSelectionState() }));
  }

  /**
   * Находит зарегистрированный меш, поднимаясь по иерархии родителей.
   * @param {import('three').Object3D} object
   * @returns {import('three').Object3D | null}
   */
  #findRegisteredMesh(object) {
    let current = object;
    while (current) {
      if (this.meshMap.has(current.uuid)) {
        return current;
      }
      current = current.parent;
    }
    return null;
  }

  /**
   * В текущей версии визуальная подсветка не применяется, метод зарезервирован под будущее расширение.
   * @param {import('three').Object3D} _mesh
   * @param {boolean} _highlighted
   */
  #setMeshHighlighted(_mesh, _highlighted) {}

  /**
   * Обновляет выделение в DOM-списке мешей.
   */
  #updateListHighlight() {
    this.meshMap.forEach(({ li, mesh }) => {
      if (!li) {
        return;
      }
      li.classList.toggle('selected', this.selectedMeshes.has(mesh));
    });
  }
}
