import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

/**
 * Manages scene primitives, renderer lifecycle, and HDR environment setup.
 */
export class SceneManager {
  /**
   * @param {HTMLCanvasElement} canvas Target canvas element used by the renderer.
   */
  constructor(canvas) {
    /** @type {HTMLCanvasElement} */
    this.canvas = canvas;

    /** @type {THREE.Scene} */
    this.scene = new THREE.Scene();
    /** @type {THREE.PerspectiveCamera} */
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    this.camera.position.set(6, 4, 10);

    /** @type {THREE.WebGLRenderer} */
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0xffffff, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    /** @type {THREE.OrbitControls} */
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.maxPolarAngle = Math.PI - 0.1;

    this._pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this._pmremGenerator.compileEquirectangularShader();

    /** @type {Promise<void> | null} */
    this._hdrPromise = null;

    this.onResize();
    window.addEventListener('resize', () => this.onResize());
  }

  /**
   * Loads the HDR environment map and applies it to the scene.
   * @returns {Promise<void>}
   */
  async loadEnvironment() {
    if (this._hdrPromise) {
      return this._hdrPromise;
    }

    this._hdrPromise = new Promise((resolve, reject) => {
      new RGBELoader()
        .setDataType(THREE.FloatType)
        .load(
          'https://vizbl.com/hdr/neutral.hdr',
          (hdrTexture) => {
            const envMap = this._pmremGenerator.fromEquirectangular(hdrTexture).texture;
            hdrTexture.dispose();
            this.scene.environment = envMap;
            this.scene.background = null;
            resolve();
          },
          undefined,
          (error) => {
            console.error('Failed to load HDR environment', error);
            reject(error);
          }
        );
    });

    return this._hdrPromise;
  }

  /**
   * Registers the animation tick callback used by requestAnimationFrame.
   * @param {(delta:number) => void} callback
   */
  start(callback) {
    let previous = performance.now();
    const loop = (now) => {
      const delta = (now - previous) / 1000;
      previous = now;
      this.controls.update();
      callback(delta);
      this.renderer.render(this.scene, this.camera);
      this._handle = requestAnimationFrame(loop);
    };

    this._handle = requestAnimationFrame(loop);
  }

  /**
   * Stops the animation loop when cleaning up.
   */
  stop() {
    if (this._handle) {
      cancelAnimationFrame(this._handle);
      this._handle = undefined;
    }
  }

  /**
   * Updates renderer/camera aspect to match viewport size.
   */
  onResize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
}
