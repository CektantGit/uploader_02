import {
  Color,
  DataTexture,
  LinearFilter,
  LinearSRGBColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
} from 'three';

const WHITE_PREVIEW = createSolidColorDataUrl(100, 100, [255, 255, 255, 255]);
const NEUTRAL_NORMAL_PREVIEW = createSolidColorDataUrl(100, 100, [128, 128, 255, 255]);
let neutralNormalTexture = null;

/**
 * Создает dataURL квадратного изображения заданного цвета.
 * @param {number} width
 * @param {number} height
 * @param {[number, number, number, number]} rgba
 * @returns {string}
 */
function createSolidColorDataUrl(width, height, rgba) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    return '';
  }
  const [r, g, b, a] = rgba;
  context.fillStyle = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
  context.fillRect(0, 0, width, height);
  return canvas.toDataURL('image/png');
}

/**
 * Возвращает нейтральную нормал карту (0.5, 0.5, 1.0).
 * @returns {import('three').Texture}
 */
function getNeutralNormalTexture() {
  if (!neutralNormalTexture) {
    const size = 2;
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i += 1) {
      const offset = i * 4;
      data[offset] = 128;
      data[offset + 1] = 128;
      data[offset + 2] = 255;
      data[offset + 3] = 255;
    }
    neutralNormalTexture = new DataTexture(data, size, size);
    neutralNormalTexture.name = 'NeutralNormalMap';
    neutralNormalTexture.needsUpdate = true;
    neutralNormalTexture.colorSpace = LinearSRGBColorSpace;
    neutralNormalTexture.minFilter = LinearFilter;
    neutralNormalTexture.magFilter = LinearFilter;
    neutralNormalTexture.wrapS = RepeatWrapping;
    neutralNormalTexture.wrapT = RepeatWrapping;
    neutralNormalTexture.userData = neutralNormalTexture.userData ?? {};
    neutralNormalTexture.userData.__isUploaded = false;
  }
  return neutralNormalTexture;
}

/**
 * Преобразует источник изображения в CanvasImageSource с исходными размерами.
 * @param {any} image
 * @returns {{ source: CanvasImageSource; width: number; height: number } | null}
 */
function normalizeImageLike(image) {
  if (!image) {
    return null;
  }
  if (typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement) {
    return { source: image, width: image.width, height: image.height };
  }
  if (typeof OffscreenCanvas !== 'undefined' && image instanceof OffscreenCanvas) {
    return { source: /** @type {CanvasImageSource} */ (image), width: image.width, height: image.height };
  }
  if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
    return { source: image, width: image.width, height: image.height };
  }
  if (typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement) {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) {
      return null;
    }
    return { source: image, width, height };
  }
  if ('data' in image && typeof image.data !== 'undefined' && image.width && image.height) {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    const sourceData = image.data instanceof Uint8ClampedArray ? image.data : new Uint8ClampedArray(image.data);
    const imageData = new ImageData(sourceData, image.width, image.height);
    context.putImageData(imageData, 0, 0);
    return { source: canvas, width: image.width, height: image.height };
  }
  if ('canvas' in image && image.canvas) {
    const canvas = image.canvas;
    if (typeof HTMLCanvasElement !== 'undefined' && canvas instanceof HTMLCanvasElement) {
      return { source: canvas, width: canvas.width, height: canvas.height };
    }
    if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
      return { source: /** @type {CanvasImageSource} */ (canvas), width: canvas.width, height: canvas.height };
    }
  }
  return null;
}

/**
 * Создает уменьшенное превью 100x100 из изображения.
 * @param {ImageBitmap | HTMLCanvasElement | OffscreenCanvas | { data: ArrayLike<number>; width: number; height: number }} image
 * @param {number} [targetWidth=100]
 * @param {number} [targetHeight=100]
 * @returns {string | null}
 */
function imageLikeToDataUrl(image, targetWidth = 100, targetHeight = 100) {
  if (!targetWidth || !targetHeight) {
    return null;
  }
  const normalized = normalizeImageLike(image);
  if (!normalized) {
    return null;
  }
  const { source, width, height } = normalized;
  if (!width || !height) {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  const targetAspect = targetWidth / targetHeight;
  const sourceAspect = width / height;
  let sx = 0;
  let sy = 0;
  let sWidth = width;
  let sHeight = height;
  if (Number.isFinite(sourceAspect) && Number.isFinite(targetAspect) && sourceAspect !== targetAspect) {
    if (sourceAspect > targetAspect) {
      sHeight = height;
      sWidth = height * targetAspect;
      sx = (width - sWidth) / 2;
    } else {
      sWidth = width;
      sHeight = width / targetAspect;
      sy = (height - sHeight) / 2;
    }
  }
  try {
    context.drawImage(source, sx, sy, sWidth, sHeight, 0, 0, targetWidth, targetHeight);
    return canvas.toDataURL('image/png');
  } catch (error) {
    console.warn('Не удалось создать уменьшенное превью текстуры', error);
    return null;
  }
}

/**
 * Извлекает dataURL из текстуры.
 * @param {import('three').Texture | null | undefined} texture
 * @returns {string | null}
 */
function getTexturePreview(texture) {
  if (!texture || !texture.image) {
    return null;
  }
  const image = texture.image;
  if (typeof image === 'string') {
    return image;
  }
  const preview = imageLikeToDataUrl(image, 100, 100);
  if (preview) {
    return preview;
  }
  if (typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement) {
    return image.currentSrc || image.src || null;
  }
  if (typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement) {
    try {
      return image.toDataURL('image/png');
    } catch (error) {
      console.warn('Не удалось получить dataURL холста текстуры', error);
      return null;
    }
  }
  if ('toDataURL' in image && typeof image.toDataURL === 'function') {
    try {
      return image.toDataURL('image/png');
    } catch (error) {
      console.warn('Не удалось получить dataURL текстуры', error);
      return null;
    }
  }
  if ('src' in image && typeof image.src === 'string') {
    return image.src;
  }
  return null;
}

/**
 * Правая панель настроек материала.
 */
export class MaterialPanel {
  /**
   * @param {HTMLElement} root
   */
  constructor(root) {
    this.root = root;
    this.textureLoader = new TextureLoader();
    this.modeInputs = /** @type {HTMLInputElement[]} */ (Array.from(root.querySelectorAll('[data-color-mode]')));
    this.colorPicker = /** @type {HTMLElement | null} */ (root.querySelector('[data-color-picker]'));
    this.colorPreview = /** @type {HTMLElement | null} */ (root.querySelector('[data-color-preview]'));
    this.colorInput = /** @type {HTMLInputElement | null} */ (root.querySelector('[data-color-input]'));
    this.texturePicker = /** @type {HTMLElement | null} */ (root.querySelector('[data-color-texture]'));
    this.textureTarget = /** @type {HTMLElement | null} */ (root.querySelector('[data-color-texture-target]'));
    this.textureImage = /** @type {HTMLImageElement | null} */ (root.querySelector('[data-color-texture-image]'));
    this.textureInput = /** @type {HTMLInputElement | null} */ (root.querySelector('[data-color-texture-input]'));
    this.textureRemoveButton = /** @type {HTMLButtonElement | null} */ (root.querySelector('[data-color-texture-remove]'));
    this.normalTextureTarget = /** @type {HTMLElement | null} */ (root.querySelector('[data-normal-texture-target]'));
    this.normalTextureImage = /** @type {HTMLImageElement | null} */ (root.querySelector('[data-normal-texture-image]'));
    this.normalTextureInput = /** @type {HTMLInputElement | null} */ (root.querySelector('[data-normal-texture-input]'));
    this.normalTextureRemove = /** @type {HTMLButtonElement | null} */ (root.querySelector('[data-normal-texture-remove]'));
    this.normalStrengthInput = /** @type {HTMLInputElement | null} */ (root.querySelector('[data-normal-strength]'));
    this.normalStrengthNumber = /** @type {HTMLInputElement | null} */ (root.querySelector('[data-normal-strength-number]'));
    this.messageElement = /** @type {HTMLElement | null} */ (root.querySelector('[data-material-message]'));
    this.bodyElement = /** @type {HTMLElement | null} */ (root.querySelector('[data-material-body]'));

    /** @type {'color' | 'texture'} */
    this.colorMode = 'color';
    /** @type {import('three').Object3D | null} */
    this.activeMesh = null;
    /** @type {(import('three').Material & { color?: Color; map?: import('three').Texture | null; normalMap?: import('three').Texture | null; normalScale?: import('three').Vector2 }) | null} */
    this.activeMaterial = null;
    /** @type {import('three').Texture | null} */
    this.savedColorTexture = null;
    /** @type {string} */
    this.savedColorPreview = WHITE_PREVIEW;
    /** @type {string} */
    this.savedColorHex = '#ffffff';

    if (this.colorInput) {
      this.colorInput.value = this.savedColorHex;
    }
    this.#refreshColorPreview();

    if (this.textureImage) {
      this.textureImage.src = WHITE_PREVIEW;
    }
    if (this.textureTarget) {
      this.textureTarget.classList.remove('texture-upload--no-preview');
    }
    if (this.normalTextureImage) {
      this.normalTextureImage.src = NEUTRAL_NORMAL_PREVIEW;
    }
    if (this.normalTextureTarget) {
      this.normalTextureTarget.classList.remove('texture-upload--no-preview');
    }

    this.#bindEvents();
    this.#updateColorModeView();
    this.#showMessage('Выберите один меш для настройки материала.');
  }

  /**
   * Синхронизирует панель с текущим выбором.
   * @param {Set<import('three').Object3D>} selection
   */
  update(selection) {
    if (!selection || selection.size !== 1) {
      this.#clearActiveMaterial();
      this.#showMessage(selection?.size ? 'Выберите только один меш для редактирования.' : 'Выберите один меш для настройки материала.');
      return;
    }

    const [mesh] = selection;
    const material = this.#resolveMaterial(mesh);
    if (!material || !material.color || !(material.color instanceof Color)) {
      this.#clearActiveMaterial();
      this.#showMessage('Материал не поддерживается.');
      return;
    }

    this.activeMesh = mesh;
    this.activeMaterial = material;
    this.savedColorTexture = material.map ?? null;
    this.savedColorPreview = getTexturePreview(material.map) ?? WHITE_PREVIEW;
    this.colorMode = material.map ? 'texture' : 'color';
    this.#syncModeInputs();

    const baseColorBackup =
      typeof material.userData?.__baseColorBackup === 'string'
        ? material.userData.__baseColorBackup
        : null;
    if (baseColorBackup) {
      this.savedColorHex = baseColorBackup.startsWith('#') ? baseColorBackup : `#${baseColorBackup}`;
    } else {
      this.savedColorHex = `#${material.color.getHexString()}`;
    }
    if (this.colorInput) {
      this.colorInput.value = this.savedColorHex;
    }
    this.#refreshColorPreview();

    if (this.colorMode === 'texture') {
      this.#ensureTextureColorNeutral();
    }

    if (!material.normalScale) {
      material.normalScale = new Vector2(1, 1);
    }
    if (!material.normalMap) {
      material.normalMap = getNeutralNormalTexture();
      material.needsUpdate = true;
    }

    if (this.normalStrengthInput && material.normalScale) {
      const raw = Number.isFinite(material.normalScale.x) ? material.normalScale.x : 1;
      const clamped = Math.min(3, Math.max(0, raw));
      if (raw !== clamped) {
        material.normalScale.set(clamped, clamped);
      }
      this.normalStrengthInput.value = String(clamped);
    }
    this.#updateNormalStrengthValue(true);

    this.#updateColorModeView();
    this.#updateBaseTexturePreview();
    this.#updateNormalPreview();
    this.#showBody();
  }

  /**
   * Настраивает обработчики элементов UI.
   */
  #bindEvents() {
    this.modeInputs.forEach((input) => {
      input.addEventListener('change', () => {
        if (!input.checked) {
          return;
        }
        const mode = input.value === 'texture' ? 'texture' : 'color';
        this.#setColorMode(mode);
      });
    });

    if (this.colorInput) {
      this.colorInput.addEventListener('input', () => {
        this.#applyColorFromInput();
      });
    }

    if (this.textureTarget && this.textureInput) {
      this.textureTarget.addEventListener('click', (event) => {
        if ((event.target instanceof HTMLElement) && event.target.closest('[data-color-texture-remove]')) {
          return;
        }
        this.textureInput.click();
      });
    }

    if (this.textureInput) {
      this.textureInput.addEventListener('change', async () => {
        const file = this.textureInput?.files?.[0];
        if (!file) {
          return;
        }
        await this.#handleBaseTextureFile(file);
        this.textureInput.value = '';
      });
    }

    if (this.textureRemoveButton) {
      this.textureRemoveButton.addEventListener('click', (event) => {
        event.stopPropagation();
        this.#handleRemoveBaseTexture();
      });
    }

    if (this.normalTextureTarget && this.normalTextureInput) {
      this.normalTextureTarget.addEventListener('click', (event) => {
        if ((event.target instanceof HTMLElement) && event.target.closest('[data-normal-texture-remove]')) {
          return;
        }
        this.normalTextureInput.click();
      });
    }

    if (this.normalTextureInput) {
      this.normalTextureInput.addEventListener('change', async () => {
        const file = this.normalTextureInput?.files?.[0];
        if (!file) {
          return;
        }
        await this.#handleNormalTextureFile(file);
        this.normalTextureInput.value = '';
      });
    }

    if (this.normalTextureRemove) {
      this.normalTextureRemove.addEventListener('click', (event) => {
        event.stopPropagation();
        this.#handleRemoveNormalTexture();
      });
    }

    if (this.normalStrengthInput) {
      this.normalStrengthInput.addEventListener('input', () => {
        this.#applyNormalStrength();
      });
    }

    if (this.normalStrengthNumber) {
      const applyFromNumber = () => {
        if (!this.normalStrengthInput || !this.normalStrengthNumber) {
          return;
        }
        const raw = Number.parseFloat(this.normalStrengthNumber.value);
        if (!Number.isFinite(raw)) {
          if (document.activeElement !== this.normalStrengthNumber) {
            this.#updateNormalStrengthValue(true);
          }
          return;
        }
        const clamped = Math.min(3, Math.max(0, raw));
        this.normalStrengthInput.value = String(clamped);
        this.#applyNormalStrength();
      };

      this.normalStrengthNumber.addEventListener('input', applyFromNumber);
      this.normalStrengthNumber.addEventListener('change', applyFromNumber);
      this.normalStrengthNumber.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          applyFromNumber();
          this.normalStrengthNumber?.blur();
        }
      });
    }
  }

  /**
   * Возвращает основной материал меша.
   * @param {import('three').Object3D} mesh
   */
  #resolveMaterial(mesh) {
    const material = /** @type {any} */ (mesh.material);
    if (!material) {
      return null;
    }
    if (Array.isArray(material)) {
      return material.find((item) => item && item.isMaterial) ?? null;
    }
    if (material.isMaterial) {
      return material;
    }
    return null;
  }

  /**
   * Применяет выбранный режим цвета.
   * @param {'color' | 'texture'} mode
   */
  #setColorMode(mode) {
    if (this.colorMode === mode) {
      return;
    }
    this.colorMode = mode;
    if (!this.activeMaterial) {
      this.#updateColorModeView();
      return;
    }
    if (mode === 'color') {
      const map = this.activeMaterial.map ?? null;
      if (map) {
        this.savedColorTexture = map;
        this.savedColorPreview = getTexturePreview(map) ?? WHITE_PREVIEW;
      }
      if (this.activeMaterial.map) {
        this.activeMaterial.map = null;
        this.activeMaterial.needsUpdate = true;
      }
      this.#restoreSavedColor();
    } else {
      if (!this.activeMaterial.map && this.savedColorTexture) {
        this.activeMaterial.map = this.savedColorTexture;
        this.activeMaterial.needsUpdate = true;
      }
      const activeMap = this.activeMaterial.map ?? null;
      if (activeMap) {
        this.savedColorTexture = activeMap;
        this.savedColorPreview = getTexturePreview(activeMap) ?? WHITE_PREVIEW;
      }
      this.#ensureTextureColorNeutral();
    }
    this.#updateColorModeView();
    this.#updateBaseTexturePreview();
  }

  /**
   * Обновляет представление в зависимости от режима.
   */
  #updateColorModeView() {
    this.#syncModeInputs();
    if (this.colorPicker) {
      this.colorPicker.classList.toggle('is-hidden', this.colorMode !== 'color');
    }
    if (this.texturePicker) {
      this.texturePicker.classList.toggle('is-hidden', this.colorMode !== 'texture');
    }
    if (this.colorInput) {
      this.colorInput.disabled = this.colorMode !== 'color';
    }
  }

  /**
   * Синхронизирует radio-инпуты с текущим режимом.
   */
  #syncModeInputs() {
    this.modeInputs.forEach((input) => {
      input.checked = input.value === this.colorMode;
    });
  }

  /**
   * Запоминает текущий цвет и делает материал нейтральным для текстуры.
   */
  #ensureTextureColorNeutral() {
    if (!this.activeMaterial || !this.activeMaterial.color) {
      return;
    }
    const currentHex = this.activeMaterial.color.getHexString();
    const storedHex = this.colorInput?.value && /^#?[0-9a-fA-F]{6}$/.test(this.colorInput.value)
      ? this.colorInput.value
      : `#${currentHex}`;
    this.savedColorHex = storedHex.startsWith('#') ? storedHex : `#${storedHex}`;
    if (this.activeMaterial) {
      this.activeMaterial.userData = this.activeMaterial.userData ?? {};
      this.activeMaterial.userData.__baseColorBackup = this.savedColorHex;
    }
    if (currentHex.toLowerCase() !== 'ffffff') {
      this.activeMaterial.color.set('#ffffff');
      this.activeMaterial.needsUpdate = true;
    }
    if (this.colorInput) {
      this.colorInput.value = this.savedColorHex;
    }
    this.#refreshColorPreview();
  }

  /**
   * Восстанавливает сохраненный цвет материала.
   */
  #restoreSavedColor() {
    if (!this.activeMaterial || !this.activeMaterial.color) {
      return;
    }
    const target = this.savedColorHex || '#ffffff';
    const normalized = target.startsWith('#') ? target.slice(1) : target;
    const currentHex = this.activeMaterial.color.getHexString();
    if (currentHex.toLowerCase() !== normalized.toLowerCase()) {
      this.activeMaterial.color.set(`#${normalized}`);
      this.activeMaterial.needsUpdate = true;
    }
    const normalizedWithHash = `#${normalized}`;
    if (this.activeMaterial) {
      this.activeMaterial.userData = this.activeMaterial.userData ?? {};
      this.activeMaterial.userData.__baseColorBackup = normalizedWithHash;
    }
    if (this.colorInput) {
      this.colorInput.value = normalizedWithHash;
    }
    this.savedColorHex = normalizedWithHash;
    this.#refreshColorPreview();
  }

  /**
   * Применяет цвет из color-инпута к материалу.
   */
  #applyColorFromInput() {
    if (!this.activeMaterial || this.colorMode !== 'color' || !this.colorInput) {
      return;
    }
    const value = this.colorInput.value;
    if (!value) {
      return;
    }
    try {
      this.activeMaterial.color?.set(value);
      this.activeMaterial.needsUpdate = true;
      this.savedColorHex = value;
      if (this.activeMaterial) {
        this.activeMaterial.userData = this.activeMaterial.userData ?? {};
        this.activeMaterial.userData.__baseColorBackup = this.savedColorHex;
      }
      this.#refreshColorPreview();
    } catch (error) {
      console.warn('Не удалось применить цвет', error);
    }
  }

  /**
   * Обновляет превью базовой текстуры.
   */
  #updateBaseTexturePreview() {
    if (!this.textureImage) {
      return;
    }
    const map = this.activeMaterial?.map ?? null;
    const preview = map
      ? map.userData?.__previewUrl ?? getTexturePreview(map)
      : this.savedColorPreview;
    const resolvedPreview = preview ?? WHITE_PREVIEW;
    this.textureImage.src = resolvedPreview;
    if (this.textureTarget) {
      const hasPreview = Boolean(resolvedPreview);
      this.textureTarget.classList.toggle('texture-upload--no-preview', !hasPreview);
    }
  }

  /**
   * Обновляет фон превью цвета.
   */
  #refreshColorPreview() {
    if (!this.colorPreview) {
      return;
    }
    const rawValue = this.colorInput?.value || this.savedColorHex || '#ffffff';
    const normalized = rawValue.startsWith('#') ? rawValue : `#${rawValue}`;
    this.colorPreview.style.backgroundColor = normalized;
  }

  /**
   * Обновляет превью нормал-карты.
   */
  #updateNormalPreview() {
    if (!this.normalTextureImage) {
      return;
    }
    const normalMap = this.activeMaterial?.normalMap ?? null;
    const preview = normalMap
      ? normalMap.userData?.__previewUrl ?? getTexturePreview(normalMap)
      : null;
    const resolvedPreview = preview ?? NEUTRAL_NORMAL_PREVIEW;
    this.normalTextureImage.src = resolvedPreview;
    if (this.normalTextureTarget) {
      const hasPreview = Boolean(resolvedPreview);
      this.normalTextureTarget.classList.toggle('texture-upload--no-preview', !hasPreview);
    }
  }

  /**
   * Обновляет текстовое представление силы нормал-карты.
   */
  #updateNormalStrengthValue(force = false) {
    if (!this.normalStrengthInput) {
      return;
    }
    const value = Number.parseFloat(this.normalStrengthInput.value);
    const normalized = Number.isFinite(value) ? value : 0;
    if (this.normalStrengthNumber && (force || document.activeElement !== this.normalStrengthNumber)) {
      this.normalStrengthNumber.value = normalized.toFixed(2);
    }
  }

  /**
   * Обрабатывает загрузку новой базовой текстуры.
   * @param {File} file
   */
  async #handleBaseTextureFile(file) {
    if (!this.activeMaterial) {
      return;
    }
    try {
      const texture = await this.#loadTexture(file, SRGBColorSpace);
      this.activeMaterial.map = texture;
      this.activeMaterial.needsUpdate = true;
      this.savedColorTexture = texture;
      this.savedColorPreview = getTexturePreview(texture) ?? WHITE_PREVIEW;
      this.colorMode = 'texture';
      this.#ensureTextureColorNeutral();
      this.#updateColorModeView();
      this.#updateBaseTexturePreview();
    } catch (error) {
      console.error('Не удалось загрузить текстуру цвета', error);
    }
  }

  /**
   * Обрабатывает загрузку новой нормал-карты.
   * @param {File} file
   */
  async #handleNormalTextureFile(file) {
    if (!this.activeMaterial) {
      return;
    }
    try {
      const texture = await this.#loadTexture(file, LinearSRGBColorSpace);
      this.activeMaterial.normalMap = texture;
      this.activeMaterial.needsUpdate = true;
      this.#updateNormalPreview();
    } catch (error) {
      console.error('Не удалось загрузить нормал-карту', error);
    }
  }

  /**
   * Удаляет базовую текстуру.
   */
  #handleRemoveBaseTexture() {
    if (!this.activeMaterial) {
      return;
    }
    if (this.activeMaterial.map) {
      this.activeMaterial.map = null;
      this.activeMaterial.needsUpdate = true;
    }
    this.savedColorTexture = null;
    this.savedColorPreview = WHITE_PREVIEW;
    this.colorMode = 'color';
    this.#restoreSavedColor();
    this.#updateColorModeView();
    this.#updateBaseTexturePreview();
  }

  /**
   * Восстанавливает нейтральную нормал-карту.
   */
  #handleRemoveNormalTexture() {
    if (!this.activeMaterial) {
      return;
    }
    const neutral = getNeutralNormalTexture();
    neutral.userData = neutral.userData ?? {};
    neutral.userData.__isUploaded = false;
    this.activeMaterial.normalMap = neutral;
    if (this.activeMaterial.normalScale) {
      this.activeMaterial.normalScale.set(1, 1);
    }
    if (this.normalStrengthInput) {
      this.normalStrengthInput.value = '1';
    }
    this.activeMaterial.needsUpdate = true;
    this.#updateNormalStrengthValue(true);
    this.#updateNormalPreview();
  }

  /**
   * Применяет силу нормал-карты к материалу.
   */
  #applyNormalStrength() {
    if (!this.activeMaterial || !this.normalStrengthInput) {
      return;
    }
    const value = Number.parseFloat(this.normalStrengthInput.value);
    if (!Number.isFinite(value)) {
      this.#updateNormalStrengthValue();
      return;
    }
    const clamped = Math.min(3, Math.max(0, value));
    if (this.activeMaterial.normalScale) {
      this.activeMaterial.normalScale.set(clamped, clamped);
      this.activeMaterial.needsUpdate = true;
    }
    this.normalStrengthInput.value = String(clamped);
    this.#updateNormalStrengthValue();
  }

  /**
   * Загружает текстуру из файла.
   * @param {File} file
   * @param {number} colorSpace
   * @returns {Promise<import('three').Texture>}
   */
  async #loadTexture(file, colorSpace) {
    const dataUrl = await this.#readFileAsDataUrl(file);
    const texture = await this.textureLoader.loadAsync(dataUrl);
    texture.colorSpace = colorSpace;
    texture.name = file.name;
    texture.needsUpdate = true;
    texture.userData = texture.userData ?? {};
    texture.userData.__isUploaded = true;
    const previewUrl = getTexturePreview(texture);
    texture.userData.__previewUrl = previewUrl ?? dataUrl;
    return texture;
  }

  /**
   * Считывает файл как dataURL.
   * @param {File} file
   * @returns {Promise<string>}
   */
  #readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : null;
        if (result) {
          resolve(result);
        } else {
          reject(new Error('Не удалось прочитать файл как dataURL'));
        }
      };
      reader.onerror = () => {
        reject(reader.error ?? new Error('Ошибка чтения файла'));
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * Очищает текущий активный материал.
   */
  #clearActiveMaterial() {
    this.activeMesh = null;
    this.activeMaterial = null;
    this.savedColorTexture = null;
    this.savedColorPreview = WHITE_PREVIEW;
    this.savedColorHex = '#ffffff';
    this.colorMode = 'color';
    if (this.colorInput) {
      this.colorInput.value = this.savedColorHex;
    }
    this.#refreshColorPreview();
    this.#updateColorModeView();
    this.#updateBaseTexturePreview();
    this.#updateNormalPreview();
    if (this.normalStrengthInput) {
      this.normalStrengthInput.value = '1';
    }
    this.#updateNormalStrengthValue(true);
    if (this.textureTarget) {
      this.textureTarget.classList.remove('texture-upload--no-preview');
    }
    if (this.normalTextureTarget) {
      this.normalTextureTarget.classList.remove('texture-upload--no-preview');
    }
  }

  /**
   * Показывает сообщение и скрывает тело панели.
   * @param {string} message
   */
  #showMessage(message) {
    if (this.messageElement) {
      this.messageElement.textContent = message;
      this.messageElement.classList.remove('is-hidden');
    }
    if (this.bodyElement) {
      this.bodyElement.classList.add('is-hidden');
    }
  }

  /**
   * Отображает содержимое панели и скрывает сообщение.
   */
  #showBody() {
    if (this.messageElement) {
      this.messageElement.classList.add('is-hidden');
    }
    if (this.bodyElement) {
      this.bodyElement.classList.remove('is-hidden');
    }
  }
}
