import { EffectComposer } from 'EffectComposer';
import { RenderPass } from 'RenderPass';
import { OutlinePass } from 'OutlinePass';
import { Color, NormalBlending, Vector2 } from 'three';

const HOVER_COLORS = {
  visible: new Color(0xf97316),
  hidden: new Color(0xc2410c),
};

const SELECTION_COLORS = {
  visible: new Color(0x2563eb),
  hidden: new Color(0x1d4ed8),
};

/**
 * Управляет постобработкой и контурами выбора/ховера с использованием OutlinePass.
 */
export class OutlineManager extends EventTarget {
  /**
   * @param {import('./sceneManager.js').SceneManager} sceneManager
   */
  constructor(sceneManager) {
    super();
    this.sceneManager = sceneManager;
    this.composer = new EffectComposer(this.sceneManager.renderer);
    this.renderPass = new RenderPass(this.sceneManager.scene, this.sceneManager.camera);
    this.composer.addPass(this.renderPass);

    const resolution = new Vector2(
      this.sceneManager.renderer.domElement.clientWidth,
      this.sceneManager.renderer.domElement.clientHeight,
    );

    this.selectionOutlinePass = this.#createOutlinePass(resolution, {
      visibleColor: SELECTION_COLORS.visible,
      hiddenColor: SELECTION_COLORS.hidden,
      edgeStrength: 2.2,
      edgeThickness: 1.0,
    });
    this.selectionOutlinePass.renderToScreen = false;
    this.composer.addPass(this.selectionOutlinePass);

    this.hoverOutlinePass = this.#createOutlinePass(resolution, {
      visibleColor: HOVER_COLORS.visible,
      hiddenColor: HOVER_COLORS.hidden,
      edgeStrength: 3.0,
      edgeThickness: 1.2,
    });
    this.hoverOutlinePass.renderToScreen = true;
    this.composer.addPass(this.hoverOutlinePass);

    /** @type {Set<import('three').Object3D>} */
    this.selectedMeshes = new Set();
    /** @type {import('three').Object3D | null} */
    this.hoveredMesh = null;
    this.dirty = true;
    this.#enabled = true;

    this.sceneManager.setRenderOverride(() => this.render());
    window.addEventListener('resize', this.#handleResize);
    this.#handleResize();
  }

  get enabled() {
    return this.#enabled;
  }

  /**
   * Включает или выключает эффект Outline.
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    if (this.#enabled === enabled) {
      return;
    }
    this.#enabled = enabled;
    this.selectionOutlinePass.enabled = enabled;
    this.hoverOutlinePass.enabled = enabled;
    this.dirty = true;
    this.dispatchEvent(new CustomEvent('toggle', { detail: { enabled } }));
  }

  /**
   * Обновляет список выбранных мешей для подсветки.
   * @param {Set<import('three').Object3D>} meshes
   */
  setSelectedMeshes(meshes) {
    this.selectedMeshes = new Set(
      Array.from(meshes).filter((mesh) => this.#isHighlightable(mesh)),
    );
    this.dirty = true;
  }

  /**
   * Задаёт текущий меш под курсором.
   * @param {import('three').Object3D | null} mesh
   */
  setHoveredMesh(mesh) {
    const highlightable = mesh && this.#isHighlightable(mesh) ? mesh : null;
    if (this.hoveredMesh === highlightable) {
      return;
    }
    this.hoveredMesh = highlightable;
    this.dirty = true;
  }

  /**
   * Рендерит кадр с учётом состояния Outline.
   */
  render() {
    if (this.hoveredMesh && !this.#isHighlightable(this.hoveredMesh)) {
      this.hoveredMesh = null;
      this.dirty = true;
    }

    let selectionChanged = false;
    const filteredSelection = new Set();
    this.selectedMeshes.forEach((mesh) => {
      if (this.#isHighlightable(mesh)) {
        filteredSelection.add(mesh);
      } else {
        selectionChanged = true;
      }
    });
    if (selectionChanged) {
      this.selectedMeshes = filteredSelection;
      this.dirty = true;
    }

    if (this.dirty) {
      const selectionTargets = Array.from(this.selectedMeshes).filter(
        (mesh) => mesh !== this.hoveredMesh,
      );
      this.selectionOutlinePass.selectedObjects = selectionTargets;
      this.hoverOutlinePass.selectedObjects = this.hoveredMesh ? [this.hoveredMesh] : [];
      this.dirty = false;
    }

    if (this.#enabled) {
      this.composer.render();
    } else {
      this.sceneManager.renderer.render(this.sceneManager.scene, this.sceneManager.camera);
    }
  }

  /**
   * Создаёт и настраивает OutlinePass с корректным смешиванием цветов.
   * @param {Vector2} resolution
   * @param {{ visibleColor: Color, hiddenColor: Color, edgeStrength: number, edgeThickness: number }} config
   * @returns {OutlinePass}
   */
  #createOutlinePass(resolution, config) {
    const pass = new OutlinePass(resolution.clone(), this.sceneManager.scene, this.sceneManager.camera);
    pass.visibleEdgeColor.copy(config.visibleColor);
    pass.hiddenEdgeColor.copy(config.hiddenColor);
    pass.edgeStrength = config.edgeStrength;
    pass.edgeGlow = 0;
    pass.edgeThickness = config.edgeThickness;
    pass.pulsePeriod = 0;
    pass.usePatternTexture = false;
    pass.overlayMaterial.transparent = true;
    pass.overlayMaterial.blending = NormalBlending;
    pass.overlayMaterial.depthWrite = false;
    pass.overlayMaterial.depthTest = true;
    pass.overlayMaterial.premultipliedAlpha = true;
    return pass;
  }

  /**
   * Проверяет, можно ли подсвечивать объект (меш и включённая видимость).
   * @param {import('three').Object3D | null} mesh
   * @returns {boolean}
   */
  #isHighlightable(mesh) {
    return Boolean(mesh && mesh.visible && 'isMesh' in mesh && mesh.isMesh);
  }

  /**
   * Подгоняет размеры рендер-пайплайна под текущее окно.
   */
  #handleResize = () => {
    const width = this.sceneManager.renderer.domElement.clientWidth;
    const height = this.sceneManager.renderer.domElement.clientHeight;
    this.composer.setSize(width, height);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.selectionOutlinePass.resolution.set(width, height);
    this.hoverOutlinePass.resolution.set(width, height);
  };

  #enabled;
}
