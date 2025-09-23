import * as THREE from 'three';

/**
 * Handles mesh registration and selection state tracking.
 */
export class SelectionManager extends EventTarget {
  constructor() {
    super();
    /** @type {Set<THREE.Object3D>} */
    this.selectedMeshes = new Set();
    /** @type {Set<THREE.Mesh>} */
    this._registered = new Set();
  }

  /**
   * Registers a mesh for selection interactions.
   * @param {THREE.Mesh} mesh
   */
  register(mesh) {
    this._registered.add(mesh);
  }

  /**
   * Removes a mesh from the registration list and selection state.
   * @param {THREE.Mesh} mesh
   */
  unregister(mesh) {
    this._registered.delete(mesh);
    if (this.selectedMeshes.has(mesh)) {
      this.selectedMeshes.delete(mesh);
      this._notify();
    }
  }

  /**
   * @returns {THREE.Mesh[]}
   */
  getRegisteredMeshes() {
    return Array.from(this._registered);
  }

  /**
   * Returns current selection as an array.
   * @returns {THREE.Object3D[]}
   */
  getSelection() {
    return Array.from(this.selectedMeshes);
  }

  /**
   * Clears all selected meshes.
   */
  clear() {
    if (this.selectedMeshes.size > 0) {
      this.selectedMeshes.clear();
      this._notify();
    }
  }

  /**
   * Selects meshes derived from pointer ray intersections.
   * @param {THREE.Intersection[]} intersections
   * @param {boolean} additive
   */
  selectFromIntersections(intersections, additive = false) {
    const hit = intersections.find((item) => this._registered.has(item.object));
    if (!hit) {
      if (!additive) {
        this.clear();
      }
      return;
    }

    this.select(hit.object, additive);
  }

  /**
   * Adds or replaces selection with the target mesh.
   * @param {THREE.Object3D} mesh
   * @param {boolean} additive
   */
  select(mesh, additive = false) {
    if (!this._registered.has(/** @type {THREE.Mesh} */ (mesh))) {
      return;
    }

    if (!additive) {
      this.selectedMeshes.clear();
    }

    if (this.selectedMeshes.has(mesh) && additive) {
      this.selectedMeshes.delete(mesh);
    } else {
      this.selectedMeshes.add(mesh);
    }

    this._notify();
  }

  /**
   * Forces selection set to match provided array.
   * @param {THREE.Object3D[]} meshes
   */
  setSelection(meshes) {
    this.selectedMeshes = new Set(meshes.filter((mesh) => this._registered.has(mesh)));
    this._notify();
  }

  _notify() {
    this.dispatchEvent(new CustomEvent('selectionchange', { detail: this.getSelection() }));
  }
}
