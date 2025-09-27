import { DRACOLoader } from 'DRACOLoader';
import { FBXLoader } from 'FBXLoader';
import { GLTFLoader } from 'GLTFLoader';
import { OBJLoader } from 'OBJLoader';
import {
  BufferAttribute,
  BufferGeometry,
  Matrix4,
  MeshStandardMaterial,
  NoBlending,
  NormalBlending,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three';

/**
 * Ограничивает значение указанными границами.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

const UNSUPPORTED_TEXTURE_PROPS = [
  'bumpMap',
  'displacementMap',
  'emissiveMap',
  'lightMap',
  'specularMap',
  'envMap',
  'gradientMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
  'sheenColorMap',
  'sheenRoughnessMap',
  'transmissionMap',
  'thicknessMap',
  'iridescenceMap',
  'iridescenceThicknessMap',
  'anisotropyMap',
];

const INITIAL_TRANSFORM_KEY = '__initialTransform';

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
    /** @type {import('three/examples/jsm/loaders/DRACOLoader.js').DRACOLoader | null} */
    this.dracoLoader = null;
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
      if (!mesh.userData) {
        mesh.userData = {};
      }
      if (!mesh.userData[INITIAL_TRANSFORM_KEY]) {
        mesh.userData[INITIAL_TRANSFORM_KEY] = {
          position: mesh.position.clone(),
          rotation: mesh.rotation.clone(),
          scale: mesh.scale.clone(),
        };
      }
      this.sceneManager.addMesh(mesh);
      const li = this.panel.createMeshRow({
        name: mesh.name,
        onClick: (event) => {
          const additive = event.ctrlKey || event.metaKey;
          this.selectionManager.selectFromList(mesh.uuid, additive);
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
  #parseGLTF(buffer, extension) {
    return new Promise((resolve, reject) => {
      const loader = this.gltfLoader;
      if (this.#bufferUsesDraco(buffer, extension)) {
        loader.setDRACOLoader(this.#getDracoLoader());
      }
      loader.parse(
        buffer,
        '',
        (gltf) => resolve(gltf),
        (error) => reject(error),
      );
    });
  }

  /**
   * Лениво создаёт и настраивает DRACOLoader для распаковки сжатых мешей.
   * @returns {import('three/examples/jsm/loaders/DRACOLoader.js').DRACOLoader}
   */
  #getDracoLoader() {
    if (!this.dracoLoader) {
      this.dracoLoader = new DRACOLoader();
      this.dracoLoader.setDecoderPath(
        'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/',
      );
    }
    return this.dracoLoader;
  }

  /**
   * Проверяет, содержит ли GLTF/GLB описание расширения KHR_draco_mesh_compression.
   * @param {ArrayBuffer} buffer
   * @param {'gltf' | 'glb'} extension
   * @returns {boolean}
   */
  #bufferUsesDraco(buffer, extension) {
    try {
      if (extension === 'gltf') {
        const text = new TextDecoder('utf-8').decode(buffer);
        return text.includes('KHR_draco_mesh_compression');
      }

      const MAGIC = 0x46546c67; // glTF
      const JSON_TYPE = 0x4e4f534a; // JSON
      const view = new DataView(buffer);
      const magic = view.getUint32(0, true);
      if (magic !== MAGIC) {
        return false;
      }
      const jsonByteLength = view.getUint32(12, true);
      const chunkType = view.getUint32(16, true);
      if (chunkType !== JSON_TYPE) {
        return false;
      }
      const jsonBytes = new Uint8Array(buffer, 20, jsonByteLength);
      const jsonText = new TextDecoder('utf-8').decode(jsonBytes);
      return jsonText.includes('KHR_draco_mesh_compression');
    } catch (error) {
      // Не получилось определить расширения — считаем, что сжатие не используется.
      return false;
    }
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
        const gltf = await this.#parseGLTF(buffer, extension);
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
        this.#sanitizeMaterial(mesh.material, mesh.geometry);
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
        this.#sanitizeMaterial(mesh.material, mesh.geometry);
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
      this.#sanitizeMaterial(mesh.material, mesh.geometry);
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
   * Подготавливает материал к использованию в приложении, отключая неподдерживаемые параметры.
   * @param {import('three').Material | import('three').Material[] | null | undefined} material
   * @param {BufferGeometry | null | undefined} geometry
   */
  #sanitizeMaterial(material, geometry) {
    if (!material) {
      return;
    }
    if (Array.isArray(material)) {
      material.forEach((item) => this.#sanitizeMaterial(item, geometry));
      return;
    }
    if (!material.isMaterial) {
      return;
    }

    const meshMaterial = /** @type {import('three').MeshStandardMaterial & { userData: any }} */ (material);
    meshMaterial.userData = meshMaterial.userData ?? {};

    let needsUpdate = false;

    for (const prop of UNSUPPORTED_TEXTURE_PROPS) {
      if (prop in meshMaterial && meshMaterial[prop]) {
        meshMaterial[prop] = null;
        needsUpdate = true;
      }
    }

    const color = /** @type {import('three').Color | undefined} */ (meshMaterial.color);
    if (color && typeof color.getHexString === 'function') {
      const currentHex = `#${color.getHexString()}`;
      if (typeof meshMaterial.userData.__baseColorBackup !== 'string') {
        meshMaterial.userData.__baseColorBackup = currentHex;
      }
    }

    if (meshMaterial.map) {
      if (meshMaterial.map.colorSpace !== SRGBColorSpace) {
        meshMaterial.map.colorSpace = SRGBColorSpace;
        meshMaterial.map.needsUpdate = true;
        needsUpdate = true;
      }
      if (color && typeof color.set === 'function') {
        const hex = color.getHexString().toLowerCase();
        if (hex !== 'ffffff') {
          color.set('#ffffff');
          needsUpdate = true;
        }
      }
    }

    const aoIntensity = clamp(
      typeof meshMaterial.aoMapIntensity === 'number' ? meshMaterial.aoMapIntensity : 1,
      0,
      1,
    );
    if (meshMaterial.aoMapIntensity !== aoIntensity) {
      meshMaterial.aoMapIntensity = aoIntensity;
      needsUpdate = true;
    }
    const metalness = clamp(
      typeof meshMaterial.metalness === 'number' ? meshMaterial.metalness : 0,
      0,
      1,
    );
    if (meshMaterial.metalness !== metalness) {
      meshMaterial.metalness = metalness;
      needsUpdate = true;
    }
    const roughness = clamp(
      typeof meshMaterial.roughness === 'number' ? meshMaterial.roughness : 1,
      0,
      1,
    );
    if (meshMaterial.roughness !== roughness) {
      meshMaterial.roughness = roughness;
      needsUpdate = true;
    }

    const opacity = clamp(
      typeof meshMaterial.opacity === 'number' ? meshMaterial.opacity : 1,
      0,
      1,
    );
    if (meshMaterial.opacity !== opacity) {
      meshMaterial.opacity = opacity;
      needsUpdate = true;
    }
    const alphaTest = clamp(
      typeof meshMaterial.alphaTest === 'number' ? meshMaterial.alphaTest : 0,
      0,
      1,
    );
    const hasAlphaMask = alphaTest > 0;
    if (meshMaterial.alphaTest !== alphaTest) {
      meshMaterial.alphaTest = alphaTest;
      needsUpdate = true;
    }
    const shouldBeTransparent =
      !hasAlphaMask && (Boolean(meshMaterial.transparent) || opacity < 1 || Boolean(meshMaterial.alphaMap));
    if (meshMaterial.transparent !== shouldBeTransparent) {
      meshMaterial.transparent = shouldBeTransparent;
      needsUpdate = true;
    }
    const desiredBlending = shouldBeTransparent ? NormalBlending : NoBlending;
    if (meshMaterial.blending !== desiredBlending) {
      meshMaterial.blending = desiredBlending;
      needsUpdate = true;
    }
    const desiredDepthWrite = hasAlphaMask ? true : !shouldBeTransparent;
    if (meshMaterial.depthWrite !== desiredDepthWrite) {
      meshMaterial.depthWrite = desiredDepthWrite;
      needsUpdate = true;
    }
    const desiredAlphaMode = hasAlphaMask ? 'MASK' : shouldBeTransparent ? 'BLEND' : 'OPAQUE';
    meshMaterial.userData = meshMaterial.userData ?? {};
    if (meshMaterial.userData.alphaMode !== desiredAlphaMode) {
      meshMaterial.userData.alphaMode = desiredAlphaMode;
      needsUpdate = true;
    }
    if (!hasAlphaMask && meshMaterial.alphaTest !== 0) {
      meshMaterial.alphaTest = 0;
      needsUpdate = true;
    }

    if (geometry && geometry.isBufferGeometry && (meshMaterial.aoMap || meshMaterial.lightMap)) {
      const uv2 = geometry.getAttribute('uv2');
      const uv = geometry.getAttribute('uv');
      if (!uv2 && uv) {
        geometry.setAttribute('uv2', uv.clone());
      } else if (!uv && !uv2) {
        meshMaterial.aoMap = null;
        meshMaterial.lightMap = null;
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      meshMaterial.needsUpdate = true;
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
