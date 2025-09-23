import { FBXLoader } from 'FBXLoader';
import { GLTFLoader } from 'GLTFLoader';
import { OBJLoader } from 'OBJLoader';
import { BufferAttribute, BufferGeometry, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';

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

      matrix.copy(child.matrixWorld);
      matrix.decompose(position, quaternion, scale);
      const transform = { position, quaternion, scale };
      const clones = this.#cloneAndSplitMesh(child, transform);

      clones.forEach((mesh, cloneIndex) => {
        const hasMultiple = clones.length > 1;
        if (child.name) {
          mesh.name = hasMultiple ? `${child.name}_part${cloneIndex + 1}` : child.name;
        } else {
          mesh.name = `${baseName}_${index}`;
        }
        mesh.userData.source = fileName;
        meshes.push(mesh);
        index += 1;
      });
    });
    return meshes;
  }

  /**
   * Клонирует меш и при необходимости разбивает его по материалам.
   * @param {import('three').Mesh} child
   * @param {{ position: Vector3; quaternion: Quaternion; scale: Vector3 }} transform
   * @returns {import('three').Mesh[]}
   */
  #cloneAndSplitMesh(child, transform) {
    const clones = [];
    const materials = Array.isArray(child.material)
      ? /** @type {import('three').Material[]} */ (child.material)
      : [/** @type {import('three').Material} */ (child.material)];
    const hasMultipleMaterials = Array.isArray(child.material) && materials.length > 1;
    const baseUserData = child.userData ? { ...child.userData } : {};

    if (hasMultipleMaterials) {
      const workingGeometry = child.geometry.index
        ? child.geometry.toNonIndexed()
        : child.geometry.clone();
      const groups = child.geometry.groups?.length
        ? child.geometry.groups
        : [
            {
              start: 0,
              count: workingGeometry.getAttribute('position')?.count ?? 0,
              materialIndex: 0,
            },
          ];
      const rangesByMaterial = new Map();

      groups.forEach((group) => {
        const materialIndex = Math.min(
          materials.length - 1,
          Math.max(0, group.materialIndex ?? 0),
        );
        const material = materials[materialIndex];
        if (!material) {
          return;
        }
        if (!rangesByMaterial.has(materialIndex)) {
          rangesByMaterial.set(materialIndex, []);
        }
        rangesByMaterial.get(materialIndex).push({ start: group.start, count: group.count });
      });

      rangesByMaterial.forEach((ranges, materialIndex) => {
        const geometry = this.#buildGeometryFromRanges(workingGeometry, ranges);
        const positionAttribute = geometry.getAttribute('position');
        if (!positionAttribute || positionAttribute.count === 0) {
          return;
        }
        const mesh = child.clone(false);
        mesh.geometry = geometry;
        mesh.material = this.#cloneSingleMaterial(materials[materialIndex]);
        mesh.userData = { ...baseUserData };
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.#applyTransform(mesh, transform);
        clones.push(mesh);
      });

      if (!clones.length) {
        const mesh = child.clone(false);
        mesh.geometry = child.geometry.clone();
        this.#ensureGeometryBounds(mesh.geometry);
        mesh.material = this.#cloneMaterial(child.material);
        mesh.userData = { ...baseUserData };
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.#applyTransform(mesh, transform);
        clones.push(mesh);
      }
    } else {
      const mesh = child.clone(false);
      mesh.geometry = child.geometry.clone();
      this.#ensureGeometryBounds(mesh.geometry);
      mesh.material = this.#cloneMaterial(child.material);
      mesh.userData = { ...baseUserData };
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.#applyTransform(mesh, transform);
      clones.push(mesh);
    }

    return clones;
  }

  /**
   * Собирает BufferGeometry из диапазонов вершин.
   * @param {BufferGeometry} sourceGeometry
   * @param {{ start: number; count: number }[]} ranges
   * @returns {BufferGeometry}
   */
  #buildGeometryFromRanges(sourceGeometry, ranges) {
    const geometry = new BufferGeometry();
    geometry.morphTargetsRelative = sourceGeometry.morphTargetsRelative ?? false;
    geometry.userData = { ...sourceGeometry.userData };

    const totalCount = ranges.reduce((sum, range) => sum + range.count, 0);
    const attributes = sourceGeometry.attributes;

    Object.keys(attributes).forEach((name) => {
      const attribute = /** @type {import('three').BufferAttribute} */ (attributes[name]);
      const ArrayType = attribute.array.constructor;
      const itemSize = attribute.itemSize;
      const newArray = new ArrayType(totalCount * itemSize);
      let offset = 0;
      ranges.forEach((range) => {
        const start = range.start * itemSize;
        const end = start + range.count * itemSize;
        newArray.set(attribute.array.subarray(start, end), offset);
        offset += range.count * itemSize;
      });
      geometry.setAttribute(name, new BufferAttribute(newArray, itemSize, attribute.normalized));
    });

    const morphAttributes = sourceGeometry.morphAttributes ?? {};
    const morphKeys = Object.keys(morphAttributes);
    if (morphKeys.length > 0) {
      geometry.morphAttributes = {};
      morphKeys.forEach((key) => {
        const sourceMorphs = morphAttributes[key];
        geometry.morphAttributes[key] = sourceMorphs.map((morphAttribute) => {
          const ArrayType = morphAttribute.array.constructor;
          const itemSize = morphAttribute.itemSize;
          const newArray = new ArrayType(totalCount * itemSize);
          let offset = 0;
          ranges.forEach((range) => {
            const start = range.start * itemSize;
            const end = start + range.count * itemSize;
            newArray.set(morphAttribute.array.subarray(start, end), offset);
            offset += range.count * itemSize;
          });
          return new BufferAttribute(newArray, itemSize, morphAttribute.normalized);
        });
      });
    }

    geometry.setDrawRange(0, totalCount);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  /**
   * Копирует мировую трансформацию в меш.
   * @param {import('three').Mesh} mesh
   * @param {{ position: Vector3; quaternion: Quaternion; scale: Vector3 }} transform
   */
  #applyTransform(mesh, transform) {
    mesh.position.copy(transform.position);
    mesh.quaternion.copy(transform.quaternion);
    mesh.scale.copy(transform.scale);
  }

  /**
   * Гарантирует наличие рассчитанных границ геометрии.
   * @param {BufferGeometry} geometry
   */
  #ensureGeometryBounds(geometry) {
    if (geometry.boundingBox === null) {
      geometry.computeBoundingBox();
    }
    if (geometry.boundingSphere === null) {
      geometry.computeBoundingSphere();
    }
  }

  /**
   * Создает копию материала, конвертируя legacy-материалы в MeshStandardMaterial для корректной работы с HDR.
   * @param {import('three').Material | import('three').Material[] | null | undefined} material
   * @returns {import('three').Material | import('three').Material[] | null | undefined}
   */
  #cloneMaterial(material) {
    if (!material) {
      return material ?? null;
    }
    if (Array.isArray(material)) {
      return material.map((mat) => this.#cloneSingleMaterial(mat));
    }
    return this.#cloneSingleMaterial(material);
  }

  /**
   * Клонирует или конвертирует единичный материал.
   * @param {import('three').Material} material
   * @returns {import('three').Material}
   */
  #cloneSingleMaterial(material) {
    if (!material) {
      return material;
    }
    if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) {
      return material.clone();
    }
    if (material.isMeshPhongMaterial || material.isMeshLambertMaterial) {
      return this.#convertToStandard(material);
    }
    if (typeof material.clone === 'function') {
      return material.clone();
    }
    return material;
  }

  /**
   * Переносит основные свойства Phong/Lambert материалов в MeshStandardMaterial, чтобы он освещался HDR окружением.
   * @param {import('three').Material & { color?: import('three').Color; emissive?: import('three').Color; shininess?: number; roughness?: number; metalness?: number; map?: any; normalMap?: any; emissiveMap?: any; aoMap?: any; alphaMap?: any; lightMap?: any; }} source
   * @returns {MeshStandardMaterial}
   */
  #convertToStandard(source) {
    const standard = new MeshStandardMaterial();
    standard.name = source.name;
    if ('color' in source && source.color) {
      standard.color.copy(source.color);
    }
    if ('map' in source) {
      standard.map = source.map ?? null;
    }
    if ('normalMap' in source) {
      standard.normalMap = source.normalMap ?? null;
      if ('normalScale' in source && source.normalScale) {
        standard.normalScale.copy(source.normalScale);
      }
    }
    // Эмиссив часто приводит к "выбеленным" мешам после конвертации — отключаем его.
    standard.emissive.setRGB(0, 0, 0);
    standard.emissiveMap = null;
    standard.emissiveIntensity = 0;
    if ('aoMap' in source) {
      standard.aoMap = source.aoMap ?? null;
      if ('aoMapIntensity' in source && typeof source.aoMapIntensity === 'number') {
        standard.aoMapIntensity = source.aoMapIntensity;
      }
    }
    if ('lightMap' in source) {
      standard.lightMap = source.lightMap ?? null;
      if ('lightMapIntensity' in source && typeof source.lightMapIntensity === 'number') {
        standard.lightMapIntensity = source.lightMapIntensity;
      }
    }
    if ('alphaMap' in source) {
      standard.alphaMap = source.alphaMap ?? null;
    }
    if ('transparent' in source) {
      standard.transparent = source.transparent;
    }
    if ('opacity' in source && typeof source.opacity === 'number') {
      standard.opacity = source.opacity;
    }
    if ('side' in source) {
      standard.side = source.side;
    }
    if ('flatShading' in source) {
      standard.flatShading = source.flatShading;
    }
    if ('depthWrite' in source) {
      standard.depthWrite = source.depthWrite;
    }
    if ('depthTest' in source) {
      standard.depthTest = source.depthTest;
    }
    if ('skinning' in source) {
      standard.skinning = source.skinning;
    }
    if ('morphTargets' in source) {
      standard.morphTargets = source.morphTargets;
    }
    if ('morphNormals' in source) {
      standard.morphNormals = source.morphNormals;
    }
    if ('roughness' in source && typeof source.roughness === 'number') {
      standard.roughness = source.roughness;
    } else if ('shininess' in source && typeof source.shininess === 'number') {
      const normalized = Math.min(source.shininess / 100, 1);
      standard.roughness = 1 - normalized;
    }
    if ('metalness' in source && typeof source.metalness === 'number') {
      standard.metalness = source.metalness;
    } else {
      standard.metalness = 0;
    }
    standard.envMapIntensity = 1;
    return standard;
  }
}
