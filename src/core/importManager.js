import { FBXLoader } from 'FBXLoader';
import { GLTFLoader } from 'GLTFLoader';
import { OBJLoader } from 'OBJLoader';
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
    this.gltfLoader = new GLTFLoader();
    this.fbxLoader = new FBXLoader();
    this.objLoader = new OBJLoader();
  }

  /**
   * Загружает модель из файла и добавляет её меши в сцену.
   * @param {File} file
   * @returns {Promise<void>}
   */
  async importModel(file) {
    const extension = this.#getExtension(file.name);
    if (!extension) {
      throw new Error('Unsupported file format');
    }

    const arrayBuffer = await file.arrayBuffer();
    const root = await this.#parseByExtension(extension, arrayBuffer);
    const meshes = this.#extractMeshes(root, file.name || 'Mesh');
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
      this.gltfLoader.parse(
        buffer,
        '',
        (gltf) => resolve(gltf),
        (error) => reject(error),
      );
    });
  }

  /**
   * Разбирает FBX модель из ArrayBuffer.
   * @param {ArrayBuffer} buffer
   * @returns {Promise<import('three').Object3D>}
   */
  async #parseFBX(buffer) {
    return this.fbxLoader.parse(buffer, '');
  }

  /**
   * Разбирает OBJ модель из ArrayBuffer.
   * @param {ArrayBuffer} buffer
   * @returns {Promise<import('three').Object3D>}
   */
  async #parseOBJ(buffer) {
    const text = new TextDecoder('utf-8').decode(buffer);
    return this.objLoader.parse(text);
  }

  /**
   * Выбирает соответствующий парсер по расширению файла.
   * @param {string} extension
   * @param {ArrayBuffer} buffer
   * @returns {Promise<import('three').Object3D>}
   */
  async #parseByExtension(extension, buffer) {
    switch (extension) {
      case 'gltf':
      case 'glb': {
        const gltf = await this.#parseGLTF(buffer);
        return gltf.scene;
      }
      case 'fbx':
        return this.#parseFBX(buffer);
      case 'obj':
        return this.#parseOBJ(buffer);
      default:
        throw new Error(`Unsupported file extension: ${extension}`);
    }
  }

  /**
   * Возвращает расширение файла в нижнем регистре.
   * @param {string} fileName
   * @returns {string | null}
   */
  #getExtension(fileName) {
    const match = /\.([^.]+)$/.exec(fileName ?? '');
    return match ? match[1].toLowerCase() : null;
  }

  /**
   * Извлекает меши из корневого объекта модели, перенося мировые матрицы в локальные координаты.
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
      if (mesh.geometry.boundingBox === null) {
        mesh.geometry.computeBoundingBox();
      }
      if (mesh.geometry.boundingSphere === null) {
        mesh.geometry.computeBoundingSphere();
      }
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
