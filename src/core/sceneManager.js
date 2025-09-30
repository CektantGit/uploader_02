import {
  ACESFilmicToneMapping,
  Box3,
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  Line,
  LineDashedMaterial,
  MathUtils,
  PerspectiveCamera,
  PMREMGenerator,
  Raycaster,
  Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'OrbitControls';
import { RGBELoader } from 'RGBELoader';
import { GLTFExporter } from 'GLTFExporter';

const HDR_URL = 'https://vizbl.com/hdr/neutral.hdr';

/**
 * Управляет созданием сцены, камеры и рендера Three.js, а также загрузкой HDR-окружения.
 */
export class SceneManager {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new Scene();
    this.scene.background = new Color(0xffffff);

    const fov = 60;
    const aspect = window.innerWidth / window.innerHeight;
    const near = 0.1;
    const far = 1000;
    this.camera = new PerspectiveCamera(fov, aspect, near, far);
    this.camera.position.set(3, 3.5, 6);

    this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.setClearColor(0xffffff, 1);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;

    this.raycaster = new Raycaster();
    this.pointer = new Vector2();

    this._animationFrame = null;

    /** @type {Set<import('three').Object3D>} */
    this.meshRegistry = new Set();

    this.dimensionState = {
      enabled: false,
      useSelection: false,
      targets: [],
      group: new Group(),
    };

    this.dimensionState.group.visible = false;
    this.dimensionMaterial = new LineDashedMaterial({
      color: 0x2563eb,
      dashSize: 0.25,
      gapSize: 0.16,
      linewidth: 1,
    });
    this.dimensionMaterial.transparent = true;
    this.dimensionMaterial.opacity = 0.9;
    this.dimensionMaterial.depthTest = false;
    this.dimensionMaterial.depthWrite = false;

    this.dimensionLines = {
      width: new Line(new BufferGeometry(), this.dimensionMaterial.clone()),
      depth: new Line(new BufferGeometry(), this.dimensionMaterial.clone()),
      height: new Line(new BufferGeometry(), this.dimensionMaterial.clone()),
    };

    Object.values(this.dimensionLines).forEach((line) => {
      const material = /** @type {LineDashedMaterial} */ (line.material);
      material.transparent = true;
      material.opacity = 0.9;
      material.depthTest = false;
      material.depthWrite = false;
      line.renderOrder = 3;
      this.dimensionState.group.add(line);
    });

    this.dimensionLabels = {
      width: this.#createDimensionLabel(),
      depth: this.#createDimensionLabel(),
      height: this.#createDimensionLabel(),
    };

    Object.values(this.dimensionLabels).forEach((label) => {
      label.renderOrder = 4;
      this.dimensionState.group.add(label);
    });

    this.scene.add(this.dimensionState.group);
  }

  /**
   * Загружает HDR окружение и запускает цикл рендеринга.
   * @returns {Promise<void>}
   */
  async init() {
    await this.#loadHDR();
    this.#startRendering();
    window.addEventListener('resize', () => this.#onResize());
  }

  /**
   * @private
   * Загружает HDR-карту и устанавливает её как окружение сцены.
   * Используется RGBELoader + PMREMGenerator для корректного освещения.
   * @returns {Promise<void>}
   */
  async #loadHDR() {
    const pmremGenerator = new PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();

    await new Promise((resolve, reject) => {
      new RGBELoader().load(
        HDR_URL,
        (texture) => {
          const envMap = pmremGenerator.fromEquirectangular(texture).texture;
          this.scene.environment = envMap;
          texture.dispose();
          pmremGenerator.dispose();
          resolve();
        },
        undefined,
        (error) => {
          pmremGenerator.dispose();
          reject(error);
        },
      );
    });
  }

  /**
   * @private
   * Запускает requestAnimationFrame-цикл, обновляя камеры и управление.
   */
  #startRendering() {
    const renderLoop = () => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this._animationFrame = window.requestAnimationFrame(renderLoop);
    };
    renderLoop();
  }

  /**
   * Корректирует матрицы камеры и размер рендера при ресайзе окна.
   * @private
   */
  #onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * Преобразует координаты курсора в пространстве Normalized Device Coordinates.
   * @param {PointerEvent} event
   * @returns {Vector2}
   */
  getPointerNDC(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    return this.pointer.clone();
  }

  /**
   * Выполняет raycast по сцене и возвращает пересечения.
   * @param {Vector2} ndc
   * @returns {import('three').Intersection[]}
   */
  intersectObjects(ndc) {
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.intersectObjects(this.scene.children, true);
  }

  /**
   * Добавляет меш в сцену.
   * @param {import('three').Object3D} mesh
   */
  addMesh(mesh) {
    this.scene.add(mesh);
    this.meshRegistry.add(mesh);
    if (this.dimensionState.enabled && !this.dimensionState.useSelection) {
      this.dimensionState.targets = Array.from(this.meshRegistry);
      this.#refreshDimensionOverlay();
    }
  }

  /**
   * Удаляет меш из сцены.
   * @param {import('three').Object3D} mesh
   */
  removeMesh(mesh) {
    this.scene.remove(mesh);
    this.meshRegistry.delete(mesh);
    if (this.dimensionState.enabled) {
      if (this.dimensionState.useSelection) {
        this.dimensionState.targets = this.dimensionState.targets.filter(
          (target) => target !== mesh,
        );
      } else {
        this.dimensionState.targets = Array.from(this.meshRegistry);
      }
      this.#refreshDimensionOverlay();
    }
  }

  /**
   * Экспортирует все добавленные меши в единый GLB-файл.
   * @returns {Promise<Blob>}
   */
  async exportGLB() {
    if (this.meshRegistry.size === 0) {
      throw new Error('No meshes available for export.');
    }

    const exporter = new GLTFExporter();
    const exportRoot = new Group();

    this.meshRegistry.forEach((mesh) => {
      mesh.updateMatrixWorld(true);
      exportRoot.add(mesh.clone(true));
    });

    exportRoot.updateMatrixWorld(true);

    const blob = await new Promise((resolve, reject) => {
      exporter.parse(
        exportRoot,
        (result) => {
          try {
            if (result instanceof ArrayBuffer) {
              resolve(new Blob([result], { type: 'model/gltf-binary' }));
              return;
            }
            const json = typeof result === 'string' ? result : JSON.stringify(result);
            resolve(new Blob([json], { type: 'model/gltf+json' }));
          } catch (error) {
            reject(error);
          }
        },
        (error) => reject(error),
        { binary: true },
      );
    });

    return /** @type {Blob} */ (blob);
  }

  /**
   * Освобождает ресурсы рендерера.
   */
  dispose() {
    window.cancelAnimationFrame(this._animationFrame);
    this.controls.dispose();
    this.renderer.dispose();
  }

  /**
   * Включает или выключает отображение размеров модели.
   * @param {boolean} enabled
   */
  setDimensionEnabled(enabled) {
    this.dimensionState.enabled = enabled;
    if (!enabled) {
      this.dimensionState.group.visible = false;
      return;
    }
    this.#refreshDimensionOverlay();
  }

  /**
   * Обновляет набор мешей, для которых рисуются размеры.
   */
  updateDimensionTargets() {
    this.dimensionState.useSelection = false;
    this.dimensionState.targets = Array.from(this.meshRegistry);
    if (this.dimensionState.enabled) {
      this.#refreshDimensionOverlay();
    }
  }

  /**
   * Перемещает камеру так, чтобы выбранные меши целиком попадали в кадр.
   * @param {import('three').Object3D[]} meshes
   */
  frameMeshes(meshes) {
    if (!meshes || meshes.length === 0) {
      return;
    }
    const box = new Box3();
    const tempBox = new Box3();
    let hasValid = false;
    meshes.forEach((mesh) => {
      if (!mesh) {
        return;
      }
      mesh.updateMatrixWorld(true);
      tempBox.makeEmpty();
      tempBox.expandByObject(mesh);
      if (!tempBox.isEmpty()) {
        box.union(tempBox);
        hasValid = true;
      }
    });
    if (!hasValid || box.isEmpty()) {
      return;
    }

    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(maxDim) || maxDim === 0) {
      return;
    }

    const fov = MathUtils.degToRad(this.camera.fov);
    const distance = maxDim / (2 * Math.tan(fov / 2));
    const offsetDistance = distance * 1.6;
    const direction = new Vector3(1, 1, 1).normalize();
    const newPosition = center.clone().add(direction.multiplyScalar(offsetDistance));

    this.camera.position.copy(newPosition);
    this.controls.target.copy(center);
    this.controls.update();

    const near = Math.max(maxDim / 500, 0.1);
    const far = Math.max(offsetDistance * 10, near + 10);
    this.camera.near = near;
    this.camera.far = far;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Центрирует камеру на выбранном меше.
   * @param {import('three').Object3D | null} mesh
   */
  focusMesh(mesh) {
    if (!mesh) {
      return;
    }
    this.frameMeshes([mesh]);
  }

  /**
   * Форматирует длину в сантиметрах.
   * @param {number} length
   * @returns {string}
   */
  #formatCentimeters(length) {
    if (!Number.isFinite(length)) {
      return '0 cm';
    }
    const centimeters = length * 100;
    const value =
      Math.abs(centimeters) >= 10
        ? Math.round(centimeters)
        : Math.round(centimeters * 10) / 10;
    return `${value.toLocaleString('en-US')} cm`;
  }

  /**
   * Обновляет отображение размеров.
   */
  #refreshDimensionOverlay() {
    if (!this.dimensionState.enabled) {
      this.dimensionState.group.visible = false;
      return;
    }
    const targets = this.dimensionState.targets;
    if (!targets || targets.length === 0) {
      this.dimensionState.group.visible = false;
      return;
    }

    const box = new Box3();
    const tempBox = new Box3();
    let hasValid = false;
    targets.forEach((mesh) => {
      if (!mesh) {
        return;
      }
      mesh.updateMatrixWorld(true);
      tempBox.makeEmpty();
      tempBox.expandByObject(mesh);
      if (!tempBox.isEmpty()) {
        box.union(tempBox);
        hasValid = true;
      }
    });

    if (!hasValid || box.isEmpty()) {
      this.dimensionState.group.visible = false;
      return;
    }

    const size = box.getSize(new Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(maxDim) || maxDim === 0) {
      this.dimensionState.group.visible = false;
      return;
    }

    const offset = Math.max(maxDim * 0.02, 0.04);
    const labelOffset = Math.max(maxDim * 0.03, 0.06);
    const dashSize = Math.max(maxDim * 0.04, 0.05);
    const gapSize = dashSize * 0.65;

    const min = box.min.clone();
    const max = box.max.clone();

    const widthStart = new Vector3(min.x, min.y - offset, max.z + offset);
    const widthEnd = new Vector3(max.x, min.y - offset, max.z + offset);

    const depthStart = new Vector3(max.x + offset, min.y - offset, min.z);
    const depthEnd = new Vector3(max.x + offset, min.y - offset, max.z);

    const heightStart = new Vector3(max.x + offset, min.y, max.z + offset);
    const heightEnd = new Vector3(max.x + offset, max.y, max.z + offset);

    this.#updateDimensionLine(this.dimensionLines.width, widthStart, widthEnd, dashSize, gapSize);
    this.#updateDimensionLine(this.dimensionLines.depth, depthStart, depthEnd, dashSize, gapSize);
    this.#updateDimensionLine(this.dimensionLines.height, heightStart, heightEnd, dashSize, gapSize);

    const baseScale = Math.max(maxDim * 0.18, 0.32);

    const widthLabel = this.dimensionLabels.width;
    widthLabel.position.copy(widthStart.clone().lerp(widthEnd, 0.5));
    widthLabel.position.y += labelOffset;
    this.#updateDimensionLabel(widthLabel, this.#formatCentimeters(size.x), baseScale);

    const depthLabel = this.dimensionLabels.depth;
    depthLabel.position.copy(depthStart.clone().lerp(depthEnd, 0.5));
    depthLabel.position.x += labelOffset;
    this.#updateDimensionLabel(depthLabel, this.#formatCentimeters(size.z), baseScale);

    const heightLabel = this.dimensionLabels.height;
    heightLabel.position.copy(heightStart.clone().lerp(heightEnd, 0.5));
    heightLabel.position.z += labelOffset;
    this.#updateDimensionLabel(heightLabel, this.#formatCentimeters(size.y), baseScale);

    this.dimensionState.group.visible = true;
  }

  /**
   * Создаёт спрайт для отображения размера.
   * @returns {Sprite}
   */
  #createDimensionLabel() {
    const canvas = document.createElement('canvas');
    canvas.width = 192;
    canvas.height = 96;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    const material = new SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    return new Sprite(material);
  }

  /**
   * Обновляет геометрию линий размеров.
   * @param {Line} line
   * @param {Vector3} start
   * @param {Vector3} end
   * @param {number} dashSize
   * @param {number} gapSize
   */
  #updateDimensionLine(line, start, end, dashSize, gapSize) {
    const positions = new Float32Array([
      start.x,
      start.y,
      start.z,
      end.x,
      end.y,
      end.z,
    ]);
    line.geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    line.geometry.computeBoundingSphere();
    line.computeLineDistances();
    const material = /** @type {LineDashedMaterial} */ (line.material);
    material.dashSize = dashSize;
    material.gapSize = gapSize;
    material.needsUpdate = true;
  }

  /**
   * Перерисовывает текст ярлыка размера.
   * @param {Sprite} sprite
   * @param {string} text
   * @param {number} baseScale
   */
  #updateDimensionLabel(sprite, text, baseScale) {
    const canvas = document.createElement('canvas');
    canvas.width = 192;
    canvas.height = 96;
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    const radius = 20;
    const paddingX = 10;
    const paddingY = 12;

    context.fillStyle = 'rgba(15, 23, 42, 0.9)';
    context.beginPath();
    context.moveTo(paddingX + radius, paddingY);
    context.lineTo(canvas.width - paddingX - radius, paddingY);
    context.quadraticCurveTo(
      canvas.width - paddingX,
      paddingY,
      canvas.width - paddingX,
      paddingY + radius,
    );
    context.lineTo(canvas.width - paddingX, canvas.height - paddingY - radius);
    context.quadraticCurveTo(
      canvas.width - paddingX,
      canvas.height - paddingY,
      canvas.width - paddingX - radius,
      canvas.height - paddingY,
    );
    context.lineTo(paddingX + radius, canvas.height - paddingY);
    context.quadraticCurveTo(
      paddingX,
      canvas.height - paddingY,
      paddingX,
      canvas.height - paddingY - radius,
    );
    context.lineTo(paddingX, paddingY + radius);
    context.quadraticCurveTo(paddingX, paddingY, paddingX + radius, paddingY);
    context.closePath();
    context.fill();

    context.fillStyle = '#ffffff';
    context.font = '600 32px "Inter", sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;

    const material = /** @type {SpriteMaterial} */ (sprite.material);
    if (material.map) {
      material.map.dispose();
    }
    material.map = texture;
    material.needsUpdate = true;

    const aspect = canvas.height / canvas.width;
    sprite.scale.set(baseScale, baseScale * aspect, 1);
  }
}
