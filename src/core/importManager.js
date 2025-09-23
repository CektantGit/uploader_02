import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { BufferGeometryUtils } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Handles loading of mesh assets from supported formats.
 */
export class ImportManager {
  constructor() {
    this.gltfLoader = new GLTFLoader();
    this.fbxLoader = new FBXLoader();
    this.objLoader = new OBJLoader();
    /** @type {DRACOLoader | null} */
    this._dracoLoader = null;
  }

  /**
   * Imports the provided file and returns processed meshes.
   * @param {File} file
   * @returns {Promise<THREE.Mesh[]>}
   */
  async importModel(file) {
    const arrayBuffer = await file.arrayBuffer();
    const extension = this._extractExtension(file.name);

    switch (extension) {
      case 'gltf':
      case 'glb':
        return this.#parseGLTF(arrayBuffer);
      case 'fbx':
        return this.#parseFBX(arrayBuffer);
      case 'obj':
        return this.#parseOBJ(arrayBuffer);
      default:
        throw new Error(`Unsupported file format: ${extension}`);
    }
  }

  /**
   * @param {string} name
   * @returns {string}
   */
  _extractExtension(name) {
    const match = /\.([^.]+)$/.exec(name.toLowerCase());
    return match ? match[1] : '';
  }

  /**
   * Normalizes materials to MeshStandardMaterial instances.
   * @param {THREE.Material | THREE.Material[]} material
   * @returns {THREE.Material | THREE.Material[]}
   */
  _normalizeMaterial(material) {
    if (Array.isArray(material)) {
      return material.map((mat) => this._normalizeMaterial(mat));
    }

    if (!material) {
      return new THREE.MeshStandardMaterial({ color: 0xffffff });
    }

    if (material.isMeshStandardMaterial) {
      return material.clone();
    }

    const standard = new THREE.MeshStandardMaterial({
      color: material.color ? material.color.clone() : new THREE.Color(0xffffff),
      map: material.map || null,
      normalMap: material.normalMap || null,
      roughnessMap: material.roughnessMap || null,
      metalnessMap: material.metalnessMap || null,
      alphaMap: material.alphaMap || null,
      aoMap: material.aoMap || null,
      transparent: material.transparent,
      opacity: material.opacity,
      side: material.side,
      skinning: material.skinning,
      morphTargets: material.morphTargets,
      morphNormals: material.morphNormals,
      alphaTest: material.alphaTest || 0
    });

    if (material.roughness !== undefined) {
      standard.roughness = material.roughness;
    }
    if (material.metalness !== undefined) {
      standard.metalness = material.metalness;
    }

    standard.emissive.set(0x000000);
    standard.emissiveMap = null;
    standard.needsUpdate = true;

    return standard;
  }

  /**
   * Splits meshes with multiple materials into individual meshes.
   * @param {THREE.Mesh} mesh
   * @returns {THREE.Mesh[]}
   */
  _splitMesh(mesh) {
    const material = this._normalizeMaterial(mesh.material);
    const materials = Array.isArray(material) ? material : [material];
    const groups = mesh.geometry ? mesh.geometry.groups : [];

    if (!Array.isArray(mesh.material) || !groups || groups.length <= 1) {
      const clone = mesh.clone();
      clone.material = materials[0] || mesh.material;
      if (clone.geometry) {
        clone.geometry = clone.geometry.clone();
        clone.geometry.computeBoundingBox();
        clone.geometry.computeBoundingSphere();
      }
      clone.castShadow = mesh.castShadow;
      clone.receiveShadow = mesh.receiveShadow;
      clone.userData = { ...mesh.userData };
      return [clone];
    }

    const geometries = BufferGeometryUtils.splitByGroups(mesh.geometry);
    return geometries.map((geometry, index) => {
      const group = groups[index];
      const materialIndex = group ? group.materialIndex : index;
      const sourceMaterial = materials[materialIndex] || materials[0];
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const part = new THREE.Mesh(geometry, sourceMaterial.clone ? sourceMaterial.clone() : sourceMaterial);
      part.name = `${mesh.name || 'Mesh'}_${index + 1}`;
      part.position.copy(mesh.position);
      part.quaternion.copy(mesh.quaternion);
      part.scale.copy(mesh.scale);
      part.castShadow = mesh.castShadow;
      part.receiveShadow = mesh.receiveShadow;
      part.userData = { ...mesh.userData };
      part.updateMatrixWorld(true);
      return part;
    });
  }

  /**
   * Collects meshes from an imported object, normalizes materials and splits groups.
   * @param {THREE.Object3D} root
   * @returns {THREE.Mesh[]}
   */
  _extractMeshes(root) {
    const meshes = [];
    root.traverse((child) => {
      if (child.isMesh || child.isSkinnedMesh) {
        const mesh = new THREE.Mesh(child.geometry.clone(), child.material);
        mesh.name = child.name || 'Mesh';
        mesh.position.copy(child.position);
        mesh.quaternion.copy(child.quaternion);
        mesh.scale.copy(child.scale);
        mesh.castShadow = child.castShadow;
        mesh.receiveShadow = child.receiveShadow;
        mesh.userData = { ...child.userData };
        if (child.geometry.boundingBox === null) {
          child.geometry.computeBoundingBox();
        }
        if (child.geometry.boundingSphere === null) {
          child.geometry.computeBoundingSphere();
        }
        mesh.geometry.computeBoundingBox();
        mesh.geometry.computeBoundingSphere();
        const split = this._splitMesh(mesh);
        meshes.push(...split);
      }
    });
    return meshes;
  }

  async #parseGLTF(arrayBuffer) {
    const executeParse = () =>
      new Promise((resolve, reject) => {
        this.gltfLoader.parse(
          arrayBuffer,
          '',
          (gltf) => {
            const meshes = this._extractMeshes(gltf.scene);
            resolve(meshes);
          },
          (error) => reject(error)
        );
      });

    try {
      return await executeParse();
    } catch (error) {
      if (error && /DRACOLoader/.test(error.message || '')) {
        this._ensureDracoLoader();
        this.gltfLoader.setDRACOLoader(this._dracoLoader);
        return executeParse();
      }
      throw error;
    }
  }

  async #parseFBX(arrayBuffer) {
    const object = this.fbxLoader.parse(arrayBuffer, '');
    return this._extractMeshes(object);
  }

  async #parseOBJ(arrayBuffer) {
    const text = new TextDecoder().decode(arrayBuffer);
    const object = this.objLoader.parse(text);
    return this._extractMeshes(object);
  }

  _ensureDracoLoader() {
    if (!this._dracoLoader) {
      this._dracoLoader = new DRACOLoader();
      this._dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    }
    return this._dracoLoader;
  }
}
