/**
 * Stores transform snapshots and applies them on undo requests.
 */
export class UndoManager {
  /**
   * @param {number} [limit]
   */
  constructor(limit = 100) {
    this.limit = limit;
    /** @type {Array<Array<{ mesh: import('three').Object3D; position: import('three').Vector3; quaternion: import('three').Quaternion; scale: import('three').Vector3 }>>> */
    this.stack = [];
  }

  /**
   * Captures the current transform of each mesh in the iterable.
   * @param {Iterable<import('three').Object3D>} meshes
   * @returns {Array<{ mesh: import('three').Object3D; position: import('three').Vector3; quaternion: import('three').Quaternion; scale: import('three').Vector3 }>}
   */
  captureSnapshot(meshes) {
    const snapshot = [];
    const seen = new Set();
    for (const mesh of meshes) {
      if (!mesh || seen.has(mesh.uuid)) {
        continue;
      }
      seen.add(mesh.uuid);
      snapshot.push({
        mesh,
        position: mesh.position.clone(),
        quaternion: mesh.quaternion.clone(),
        scale: mesh.scale.clone(),
      });
    }
    return snapshot;
  }

  /**
   * Saves the snapshot if at least one mesh has changed since capture.
   * @param {Array<{ mesh: import('three').Object3D; position: import('three').Vector3; quaternion: import('three').Quaternion; scale: import('three').Vector3 }>} snapshot
   */
  commitSnapshot(snapshot) {
    if (!snapshot || snapshot.length === 0) {
      return;
    }
    const changed = snapshot.some(({ mesh, position, quaternion, scale }) => {
      if (!mesh) {
        return false;
      }
      return (
        !mesh.position.equals(position) ||
        !mesh.quaternion.equals(quaternion) ||
        !mesh.scale.equals(scale)
      );
    });
    if (!changed) {
      return;
    }
    if (this.stack.length >= this.limit) {
      this.stack.shift();
    }
    this.stack.push(snapshot);
  }

  /**
   * Reverts the last committed snapshot.
   * @returns {{ meshes: Set<import('three').Object3D> } | null}
   */
  undo() {
    if (this.stack.length === 0) {
      return null;
    }
    const snapshot = this.stack.pop();
    const meshes = new Set();
    snapshot.forEach(({ mesh, position, quaternion, scale }) => {
      if (!mesh) {
        return;
      }
      mesh.position.copy(position);
      mesh.quaternion.copy(quaternion);
      mesh.scale.copy(scale);
      mesh.updateMatrixWorld(true);
      meshes.add(mesh);
    });
    return { meshes };
  }

  /**
   * Clears all stored actions.
   */
  clear() {
    this.stack.length = 0;
  }
}
