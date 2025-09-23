import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

/**
 * Coordinates TransformControls usage across the active selection.
 */
export class TransformManager extends EventTarget {
  /**
   * @param {import('./sceneManager.js').SceneManager} sceneManager
   */
  constructor(sceneManager) {
    super();
    this.sceneManager = sceneManager;
    /** @type {'none' | 'translate' | 'rotate' | 'scale'} */
    this.mode = 'none';

    /** @type {THREE.Object3D} */
    this.anchor = new THREE.Object3D();
    this.anchor.name = 'TransformAnchor';
    this.sceneManager.scene.add(this.anchor);

    /** @type {THREE.TransformControls} */
    this.controls = new TransformControls(
      this.sceneManager.camera,
      this.sceneManager.renderer.domElement
    );
    this.controls.enabled = false;
    this.controls.visible = false;
    this.sceneManager.scene.add(this.controls);
    this.controls.attach(this.anchor);

    this._selection = [];
    this._initialStates = [];
    this._anchorStart = new THREE.Matrix4();
    this._inverseAnchorStart = new THREE.Matrix4();
    this._tempMatrix = new THREE.Matrix4();
    this._worldMatrix = new THREE.Matrix4();
    this._localMatrix = new THREE.Matrix4();
    this._position = new THREE.Vector3();
    this._quaternion = new THREE.Quaternion();
    this._scale = new THREE.Vector3();

    this.controls.addEventListener('dragging-changed', (event) => {
      this.sceneManager.controls.enabled = !event.value;
      if (!event.value) {
        this._emitChange();
      }
    });

    this.controls.addEventListener('mouseDown', () => this._captureInitialState());
    this.controls.addEventListener('objectChange', () => this._applyDelta());
  }

  /**
   * Updates the transform gizmo mode.
   * @param {'none' | 'translate' | 'rotate' | 'scale'} mode
   */
  setMode(mode) {
    this.mode = mode;
    if (mode === 'none') {
      this.controls.enabled = false;
      this.controls.visible = false;
    } else {
      this.controls.enabled = true;
      this.controls.visible = this._selection.length > 0;
      this.controls.setMode(mode);
    }
  }

  /**
   * Reflects the active selection in the transform anchor placement.
   * @param {THREE.Object3D[]} selection
   */
  setSelection(selection) {
    this._selection = selection;
    if (selection.length === 0) {
      this.controls.visible = false;
      return;
    }

    const average = this._position.set(0, 0, 0);
    const tempCenter = this._scale.set(0, 0, 0);
    selection.forEach((mesh) => {
      if (mesh.geometry && !mesh.geometry.boundingBox) {
        mesh.geometry.computeBoundingBox();
      }
      mesh.updateWorldMatrix(true, false);
      if (mesh.geometry && mesh.geometry.boundingBox) {
        mesh.geometry.boundingBox.getCenter(tempCenter);
        tempCenter.applyMatrix4(mesh.matrixWorld);
      } else {
        mesh.getWorldPosition(tempCenter);
      }
      average.add(tempCenter);
    });
    average.multiplyScalar(1 / selection.length);
    this.anchor.position.copy(average);

    if (selection.length === 1) {
      selection[0].getWorldQuaternion(this._quaternion);
      this.anchor.quaternion.copy(this._quaternion);
    } else {
      this.anchor.quaternion.identity();
    }

    this.anchor.updateMatrixWorld(true);
    if (this.mode !== 'none') {
      this.controls.visible = true;
    }
  }

  _captureInitialState() {
    if (this.mode === 'none' || this._selection.length === 0) {
      return;
    }

    this.anchor.updateMatrixWorld(true);
    this._anchorStart.copy(this.anchor.matrixWorld);
    this._inverseAnchorStart.copy(this.anchor.matrixWorld).invert();

    this._initialStates = this._selection.map((mesh) => {
      mesh.updateMatrixWorld(true);
      const parentInverse = new THREE.Matrix4();
      if (mesh.parent) {
        parentInverse.copy(mesh.parent.matrixWorld).invert();
      } else {
        parentInverse.identity();
      }

      return {
        mesh,
        world: mesh.matrixWorld.clone(),
        parentInverse
      };
    });
  }

  _applyDelta() {
    if (this.mode === 'none' || this._initialStates.length === 0) {
      return;
    }

    this.anchor.updateMatrixWorld(true);
    const delta = this._tempMatrix
      .copy(this.anchor.matrixWorld)
      .multiply(this._inverseAnchorStart);

    this._initialStates.forEach(({ mesh, world, parentInverse }) => {
      const newWorld = this._worldMatrix.copy(delta).multiply(world);
      const localMatrix = this._localMatrix.copy(parentInverse).multiply(newWorld);
      localMatrix.decompose(this._position, this._quaternion, this._scale);
      mesh.position.copy(this._position);
      mesh.quaternion.copy(this._quaternion);
      mesh.scale.copy(this._scale);
      mesh.updateMatrixWorld(true);
    });

    this._emitChange();
  }

  _emitChange() {
    this.dispatchEvent(new CustomEvent('transformchange', { detail: this._selection }));
  }
}
