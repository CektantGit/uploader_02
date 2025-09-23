import {
  ACESFilmicToneMapping,
  Color,
  PerspectiveCamera,
  PMREMGenerator,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'OrbitControls';
import { RGBELoader } from 'RGBELoader';

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
    this.camera.position.set(3, 3, 6);

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
    this.renderOverride = null;
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
   * Устанавливает пользовательскую функцию рендера, например для постобработки.
   * @param {(() => void) | null} callback
   */
  setRenderOverride(callback) {
    this.renderOverride = callback;
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
      if (this.renderOverride) {
        this.renderOverride();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
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
   * Выполняет raycast по конкретному набору мешей.
   * @param {Vector2} ndc
   * @param {import('three').Object3D[]} meshes
   * @returns {import('three').Intersection[]}
   */
  intersectMeshes(ndc, meshes) {
    if (!meshes.length) {
      return [];
    }
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.intersectObjects(meshes, false);
  }

  /**
   * Добавляет меш в сцену.
   * @param {import('three').Object3D} mesh
   */
  addMesh(mesh) {
    this.scene.add(mesh);
  }

  /**
   * Удаляет меш из сцены.
   * @param {import('three').Object3D} mesh
   */
  removeMesh(mesh) {
    this.scene.remove(mesh);
  }

  /**
   * Освобождает ресурсы рендерера.
   */
  dispose() {
    window.cancelAnimationFrame(this._animationFrame);
    this.controls.dispose();
    this.renderer.dispose();
  }
}
