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
    const mesh = object ? this.#findRegisteredMesh(object) : null;
    if (!mesh) {
      if (!additive) {
        this.clearSelection();
      }
      return;
    }
    this.#selectMesh(mesh, additive);
  }

  /**
   * Обработка клика по строке списка.
   * @param {string} uuid
   * @param {boolean} withShift
   */
  selectFromList(uuid, withShift) {
    if (!this.meshMap.has(uuid)) {
      return;
    }

    if (withShift && this.lastSelectedId) {
      const range = this.#getRangeBetween(this.lastSelectedId, uuid);
      if (range.length > 0) {
        this.setSelection(range, true);
        return;
      }
    }

    const mesh = this.meshMap.get(uuid)?.mesh ?? null;
    if (mesh) {
      this.#selectMesh(mesh, withShift);
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
  #selectMesh(mesh, additive) {
    const nextSelection = additive
      ? new Set(this.selectedMeshes).add(mesh)
      : new Set([mesh]);
    this.#applySelection(nextSelection);
    this.lastSelectedId = mesh.uuid;
  }

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
   * Возвращает массив мешей из диапазона Map по двум идентификаторам.
   * @param {string} startId
   * @param {string} endId
   * @returns {import('three').Object3D[]}
   */
  #getRangeBetween(startId, endId) {
    const keys = Array.from(this.meshMap.keys());
    const startIndex = keys.indexOf(startId);
    const endIndex = keys.indexOf(endId);
    if (startIndex === -1 || endIndex === -1) {
      return [];
    }
    const [from, to] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
    return keys.slice(from, to + 1).map((key) => this.meshMap.get(key)?.mesh).filter(Boolean);
  }

  /**
   * Подсвечивает меш и его геометрию для визуальной обратной связи.
   * @param {import('three').Object3D} mesh
   * @param {boolean} highlighted
   */
  #setMeshHighlighted(mesh, highlighted) {
    mesh.traverse((child) => {
      if (!child.isMesh || !child.material) {
        return;
      }
      if (highlighted) {
        if (!child.userData.__selectionMaterialCloned) {
          child.material = child.material.clone();
          child.userData.__selectionMaterialCloned = true;
        }
        if (!child.userData.__originalColor && child.material.color) {
          child.userData.__originalColor = child.material.color.clone();
        }
        if (child.material.color && child.userData.__originalColor) {
          child.material.color.copy(child.userData.__originalColor);
          child.material.color.offsetHSL(0, 0, 0.2);
        }
      } else if (child.userData.__originalColor && child.material.color) {
        child.material.color.copy(child.userData.__originalColor);
      }
    });
  }

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
