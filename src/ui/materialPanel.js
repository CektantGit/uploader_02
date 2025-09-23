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
  }
  return neutralNormalTexture;
}

/**
 * Преобразует данные изображения в dataURL.
 * @param {ImageBitmap | HTMLCanvasElement | OffscreenCanvas | { data: ArrayLike<number>; width: number; height: number }} image
 * @returns {string | null}
 */
function imageLikeToDataUrl(image) {
  const width = image.width ?? image.canvas?.width ?? image.videoWidth ?? image.naturalWidth;
  const height = image.height ?? image.canvas?.height ?? image.videoHeight ?? image.naturalHeight;
  if (!width || !height) {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  if ('data' in image && image.data) {
    const source = image.data instanceof Uint8ClampedArray ? image.data : new Uint8ClampedArray(image.data);
    const imageData = new ImageData(source, width, height);
    context.putImageData(imageData, 0, 0);
  } else {
    context.drawImage(/** @type {CanvasImageSource} */ (image), 0, 0, width, height);
  }
  return canvas.toDataURL('image/png');
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
  if (typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement) {
    return image.currentSrc || image.src || null;
  }
  if (typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement) {
    return image.toDataURL('image/png');
  }
  if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
    return imageLikeToDataUrl(image);
  }
  if ('data' in image && typeof image.data !== 'undefined') {
    return imageLikeToDataUrl(/** @type {{ data: ArrayLike<number>; width: number; height: number }} */ (image));
  }
  if ('toDataURL' in image && typeof image.toDataURL === 'function') {
    return image.toDataURL('image/png');
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
    this.normalStrengthValue = /** @type {HTMLElement | null} */ (root.querySelector('[data-normal-strength-value]'));
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

    if (this.textureImage) {
      this.textureImage.src = WHITE_PREVIEW;
    }
    if (this.normalTextureImage) {
      this.normalTextureImage.src = NEUTRAL_NORMAL_PREVIEW;
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

    if (this.colorInput) {
      this.colorInput.value = `#${material.color.getHexString()}`;
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
    this.#updateNormalStrengthValue();

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
      if (this.activeMaterial.map) {
        this.savedColorTexture = this.activeMaterial.map;
        this.savedColorPreview = getTexturePreview(this.activeMaterial.map) ?? WHITE_PREVIEW;
      }
      this.activeMaterial.map = null;
      this.activeMaterial.needsUpdate = true;
    } else if (mode === 'texture') {
      if (!this.activeMaterial.map && this.savedColorTexture) {
        this.activeMaterial.map = this.savedColorTexture;
        this.activeMaterial.needsUpdate = true;
      }
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
    const preview = this.activeMaterial?.map ? getTexturePreview(this.activeMaterial.map) : null;
    this.textureImage.src = preview ?? this.savedColorPreview ?? WHITE_PREVIEW;
  }

  /**
   * Обновляет превью нормал-карты.
   */
  #updateNormalPreview() {
    if (!this.normalTextureImage) {
      return;
    }
    const preview = this.activeMaterial?.normalMap ? getTexturePreview(this.activeMaterial.normalMap) : null;
    this.normalTextureImage.src = preview ?? NEUTRAL_NORMAL_PREVIEW;
  }

  /**
   * Обновляет текстовое представление силы нормал-карты.
   */
  #updateNormalStrengthValue() {
    if (!this.normalStrengthInput || !this.normalStrengthValue) {
      return;
    }
    const value = Number.parseFloat(this.normalStrengthInput.value);
    if (!Number.isFinite(value)) {
      this.normalStrengthValue.textContent = '0.00';
      return;
    }
    this.normalStrengthValue.textContent = value.toFixed(2);
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
      if (this.colorMode !== 'texture') {
        this.colorMode = 'texture';
        this.#updateColorModeView();
      }
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
    this.activeMaterial.normalMap = neutral;
    if (this.activeMaterial.normalScale) {
      this.activeMaterial.normalScale.set(1, 1);
    }
    if (this.normalStrengthInput) {
      this.normalStrengthInput.value = '1';
    }
    this.activeMaterial.needsUpdate = true;
    this.#updateNormalStrengthValue();
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
    const url = URL.createObjectURL(file);
    try {
      const texture = await this.textureLoader.loadAsync(url);
      texture.colorSpace = colorSpace;
      texture.name = file.name;
      texture.needsUpdate = true;
      return texture;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Очищает текущий активный материал.
   */
  #clearActiveMaterial() {
    this.activeMesh = null;
    this.activeMaterial = null;
    this.savedColorTexture = null;
    this.savedColorPreview = WHITE_PREVIEW;
    this.colorMode = 'color';
    this.#updateColorModeView();
    this.#updateBaseTexturePreview();
    this.#updateNormalPreview();
    if (this.normalStrengthInput) {
      this.normalStrengthInput.value = '1';
    }
    this.#updateNormalStrengthValue();
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
