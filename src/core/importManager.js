import { GLTFLoader } from 'GLTFLoader';
import { Matrix4, Quaternion, Vector3 } from 'three';

/**
 * Отвечает за загрузку файлов и добавление новых мешей в сцену и UI.
 */
export class ImportManager {
  /**
   * @param {import('./sceneManager.js').SceneManager} sceneManager
   * @param {import('./selectionManager.js').SelectionManager} selectionManager
   * @param {import('../ui/panel.js').Panel} panel
   */
  constructor(sceneManager, selectionManager, panel) {
    this.sceneManager = sceneManager;
    this.selectionManager = selectionManager;
    this.panel = panel;
    this.loader = new GLTFLoader();
  }

  /**
   * Загружает модель из файла и добавляет её меши в сцену.
   * @param {File} file
   * @returns {Promise<void>}
   */
  async importModel(file) {
    const arrayBuffer = await file.arrayBuffer();
    const gltf = await this.#parseGLTF(arrayBuffer);
    const meshes = this.#extractMeshes(gltf.scene, file.name || 'Mesh');
    meshes.forEach((mesh) => {
      mesh.visible = true;
      mesh.matrixAutoUpdate = true;
      this.sceneManager.addMesh(mesh);
      const li = this.panel.createMeshRow({
        name: mesh.name,
        onClick: (event) => {
          this.selectionManager.selectFromList(mesh.uuid, event.shiftKey);
        },
        onHide: () => {
          mesh.visible = !mesh.visible;
          return mesh.visible;
        },
        onDelete: () => {
          this.sceneManager.removeMesh(mesh);
          this.selectionManager.unregisterMesh(mesh.uuid);
          this.panel.removeMeshRow(mesh.uuid);
        },
      });
      this.selectionManager.registerMesh(mesh, li);
    });
  }

  /**
   * Разбирает GLTF/GLB-содержимое из ArrayBuffer.
   * @param {ArrayBuffer} buffer
   * @returns {Promise<import('three/examples/jsm/loaders/GLTFLoader.js').GLTF>}
   */
  #parseGLTF(buffer) {
    return new Promise((resolve, reject) => {
      this.loader.parse(
        buffer,
        '',
        (gltf) => resolve(gltf),
        (error) => reject(error),
      );
    });
  }

  /**
   * Извлекает меши из glTF-сцены, перенося мировые матрицы в локальные координаты.
   * @param {import('three').Object3D} root
   * @param {string} fileName
   * @returns {import('three').Object3D[]}
   */
  #extractMeshes(root, fileName) {
    const meshes = [];
    const baseName = fileName.replace(/\.[^/.]+$/, '') || 'Mesh';
    let index = 1;
    const position = new Vector3();
    const quaternion = new Quaternion();
    const scale = new Vector3();
    const matrix = new Matrix4();

    root.updateMatrixWorld(true);
    root.traverse((child) => {
      if (!child.isMesh) {
        return;
      }
      const mesh = child.clone();
      mesh.geometry = child.geometry.clone();
      if (Array.isArray(child.material)) {
        mesh.material = child.material.map((material) => material.clone());
      } else if (child.material) {
        mesh.material = child.material.clone();
      }
      matrix.copy(child.matrixWorld);
      matrix.decompose(position, quaternion, scale);
      mesh.position.copy(position);
      mesh.quaternion.copy(quaternion);
      mesh.scale.copy(scale);
      mesh.name = child.name || `${baseName}_${index}`;
      mesh.userData.source = fileName;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      meshes.push(mesh);
      index += 1;
    });
    return meshes;
  }
}
