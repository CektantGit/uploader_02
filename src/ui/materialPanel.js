import {
  CanvasTexture,
  Color,
  DataTexture,
  LinearFilter,
  LinearSRGBColorSpace,
  NoBlending,
  NormalBlending,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
} from 'three';

const WHITE_PREVIEW = createSolidColorDataUrl(100, 100, [255, 255, 255, 255]);
const NEUTRAL_NORMAL_PREVIEW = createSolidColorDataUrl(100, 100, [128, 128, 255, 255]);
const DEFAULT_ORM_PREVIEW = createSolidColorDataUrl(100, 100, [255, 255, 0, 255]);
const BAKED_PREVIEW_SIZE = 100;
let neutralNormalTexture = null;

/**
 * @typedef {'packed' | 'separate' | 'scalar'} OrmMode
 */

/**
 * @typedef {'ao' | 'metalness' | 'roughness'} OrmChannelKey
 */

/**
 * @typedef {'separate-slider' | 'separate-number' | 'scalar-slider' | 'scalar-number' | null} OrmScalarSource
 */

/**
 * @typedef {'slider' | 'texture' | 'color-alpha'} OpacityMode
 */

/**
 * @typedef {'slider-input' | 'slider-number' | null} OpacityValueSource
 */

const ORM_CHANNELS = [
  /** @type {{ key: OrmChannelKey; mapProp: 'aoMap' | 'metalnessMap' | 'roughnessMap'; scalarProp: 'aoMapIntensity' | 'metalness' | 'roughness'; defaultScalar: number; textureScalar: number; }} */ (
    {
      key: 'ao',
      mapProp: 'aoMap',
      scalarProp: 'aoMapIntensity',
      defaultScalar: 1,
      textureScalar: 1,
    }
  ),
  {
    key: 'metalness',
    mapProp: 'metalnessMap',
    scalarProp: 'metalness',
    defaultScalar: 0,
    textureScalar: 1,
  },
  {
    key: 'roughness',
    mapProp: 'roughnessMap',
    scalarProp: 'roughness',
    defaultScalar: 1,
    textureScalar: 1,
  },
];

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
 * Ограничивает значение в диапазоне [0, 1].
 * @param {number} value
 * @returns {number}
 */
function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

/**
 * Возвращает dataURL для превью скалярного значения.
 * @param {number} value
 * @returns {string}
 */
function scalarToPreview(value) {
  const clamped = clamp01(value);
  const level = Math.round(clamped * 255);
  return createSolidColorDataUrl(100, 100, [level, level, level, 255]);
}

/**
 * Преобразует hex-цвет в массив компонент.
 * @param {string} hex
 * @returns {[number, number, number]}
 */
function parseHexColor(hex) {
  if (!hex) {
    return [255, 255, 255];
  }
  let normalized = hex.trim();
  if (normalized.startsWith('#')) {
    normalized = normalized.slice(1);
  }
  if (normalized.length === 3) {
    normalized = normalized
      .split('')
      .map((component) => component + component)
      .join('');
  }
  if (normalized.length !== 6) {
    return [255, 255, 255];
  }
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  if ([red, green, blue].some((value) => !Number.isFinite(value))) {
    return [255, 255, 255];
  }
  return [red, green, blue];
}

/**
 * Ограничивает значение канала в пределах 0-255.
 * @param {number} value
 * @returns {number}
 */
function clampChannel(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 255) {
    return 255;
  }
  return Math.round(value);
}

/**
 * Возвращает яркость пикселя.
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {number}
 */
function getLuminance(r, g, b) {
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    return 255;
  }
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return clampChannel(luminance);
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
 * Определяет, содержит ли изображение прозрачные пиксели.
 * @param {ImageBitmap | HTMLCanvasElement | OffscreenCanvas | HTMLImageElement | { data?: ArrayLike<number>; width?: number; height?: number } | null} image
 * @returns {boolean}
 */
function imageLikeHasAlpha(image) {
  if (!image) {
    return false;
  }
  if ('data' in image && image.data && image.width && image.height) {
    const data = image.data;
    const { width, height } = image;
    const total = Math.min(data.length, width * height * 4);
    for (let index = 3; index < total; index += 4) {
      if (Number(data[index]) < 255) {
        return true;
      }
    }
    return false;
  }
  const normalized = normalizeImageLike(image);
  if (!normalized) {
    return false;
  }
  const { source, width, height } = normalized;
  if (!width || !height) {
    return false;
  }
  const sampleWidth = Math.min(width, 64);
  const sampleHeight = Math.min(height, 64);
  if (!sampleWidth || !sampleHeight) {
    return false;
  }
  const canvas = document.createElement('canvas');
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return false;
  }
  try {
    context.drawImage(source, 0, 0, sampleWidth, sampleHeight);
    const { data } = context.getImageData(0, 0, sampleWidth, sampleHeight);
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] < 255) {
        return true;
      }
    }
  } catch (error) {
    console.warn('Не удалось определить наличие альфа-канала изображения', error);
  }
  return false;
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
  #bakedUpdateRequestId = 0;
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
    this.opacityModeInputs = /** @type {HTMLInputElement[]} */ (Array.from(root.querySelectorAll('[data-opacity-mode]')));
    this.opacitySliderContainer = /** @type {HTMLElement | null} */ (root.querySelector('[data-opacity-slider]'));
    this.opacitySliderTarget = /** @type {HTMLElement | null} */ (root.querySelector('[data-opacity-slider-target]'));
    this.opacitySliderImage = /** @type {HTMLImageElement | null} */ (root.querySelector('[data-opacity-slider-image]'));
    this.opacitySliderInput = /** @type {HTMLInputElement | null} */ (root.querySelector('[data-opacity-slider-input]'));
    this.opacitySliderNumber = /** @type {HTMLInputElement | null} */ (root.querySelector('[data-opacity-slider-number]'));
    this.opacityTextureContainer = /** @type {HTMLElement | null} */ (root.querySelector('[data-opacity-texture]'));
    this.opacityTextureTarget = /** @type {HTMLElement | null} */ (root.querySelector('[data-opacity-texture-target]'));
    this.opacityTextureImage = /** @type {HTMLImageElement | null} */ (root.querySelector('[data-opacity-texture-image]'));
    this.opacityTextureInput = /** @type {HTMLInputElement | null} */ (root.querySelector('[data-opacity-texture-input]'));
    this.opacityTextureRemove = /** @type {HTMLButtonElement | null} */ (root.querySelector('[data-opacity-texture-remove]'));
    this.opacityColorContainer = /** @type {HTMLElement | null} */ (root.querySelector('[data-opacity-color]'));
    this.opacityColorTarget = /** @type {HTMLElement | null} */ (root.querySelector('[data-opacity-color-target]'));
    this.opacityColorImage = /** @type {HTMLImageElement | null} */ (root.querySelector('[data-opacity-color-image]'));
    this.normalTextureTarget = /** @type {HTMLElement | null} */ (root.querySelector('[data-normal-texture-target]'));
    this.normalTextureImage = /** @type {HTMLImageElement | null} */ (root.querySelector('[data-normal-texture-image]'));
    this.normalTextureInput = /** @type {HTMLInputElement | null} */ (root.querySelector('[data-normal-texture-input]'));
    this.normalTextureRemove = /** @type {HTMLButtonElement | null} */ (root.querySelector('[data-normal-texture-remove]'));
    this.normalStrengthInput = /** @type {HTMLInputElement | null} */ (root.querySelector('[data-normal-strength]'));
    this.normalStrengthNumber = /** @type {HTMLInputElement | null} */ (root.querySelector('[data-normal-strength-number]'));
    this.ormModeInputs = /** @type {HTMLInputElement[]} */ (Array.from(root.querySelectorAll('[data-orm-mode]')));
    this.ormPackedContainer = /** @type {HTMLElement | null} */ (root.querySelector('[data-orm-packed]'));
    this.ormPackedTarget = /** @type {HTMLElement | null} */ (root.querySelector('[data-orm-packed-target]'));
    this.ormPackedImage = /** @type {HTMLImageElement | null} */ (root.querySelector('[data-orm-packed-image]'));
    this.ormPackedInput = /** @type {HTMLInputElement | null} */ (root.querySelector('[data-orm-packed-input]'));
    this.ormPackedRemove = /** @type {HTMLButtonElement | null} */ (root.querySelector('[data-orm-packed-remove]'));
    this.ormSeparateContainer = /** @type {HTMLElement | null} */ (root.querySelector('[data-orm-separate]'));
    this.ormScalarContainer = /** @type {HTMLElement | null} */ (root.querySelector('[data-orm-scalar]'));
    this.messageElement = /** @type {HTMLElement | null} */ (root.querySelector('[data-material-message]'));
    this.bodyElement = /** @type {HTMLElement | null} */ (root.querySelector('[data-material-body]'));
    this.bakedColorImage = /** @type {HTMLImageElement | null} */ (root.querySelector('[data-baked-color-image]'));
    this.bakedNormalImage = /** @type {HTMLImageElement | null} */ (root.querySelector('[data-baked-normal-image]'));
    this.bakedOrmImage = /** @type {HTMLImageElement | null} */ (root.querySelector('[data-baked-orm-image]'));

    /** @type {Record<OrmChannelKey, { config: typeof ORM_CHANNELS[number]; separate: { target: HTMLElement | null; image: HTMLImageElement | null; input: HTMLInputElement | null; remove: HTMLButtonElement | null; sliderContainer: HTMLElement | null; slider: HTMLInputElement | null; number: HTMLInputElement | null; }; scalar: { container: HTMLElement | null; image: HTMLImageElement | null; slider: HTMLInputElement | null; number: HTMLInputElement | null; }; }>} */
    this.ormChannels = /** @type {any} */ ({});
    for (const channel of ORM_CHANNELS) {
      this.ormChannels[channel.key] = {
        config: channel,
        separate: {
          target: /** @type {HTMLElement | null} */ (root.querySelector(`[data-orm-${channel.key}-target]`)),
          image: /** @type {HTMLImageElement | null} */ (root.querySelector(`[data-orm-${channel.key}-image]`)),
          input: /** @type {HTMLInputElement | null} */ (root.querySelector(`[data-orm-${channel.key}-input]`)),
          remove: /** @type {HTMLButtonElement | null} */ (root.querySelector(`[data-orm-${channel.key}-remove]`)),
          sliderContainer: /** @type {HTMLElement | null} */ (root.querySelector(`[data-orm-${channel.key}-scalar]`)),
          slider: /** @type {HTMLInputElement | null} */ (root.querySelector(`[data-orm-${channel.key}-slider]`)),
          number: /** @type {HTMLInputElement | null} */ (root.querySelector(`[data-orm-${channel.key}-number]`)),
        },
        scalar: {
          container: /** @type {HTMLElement | null} */ (
            root.querySelector(`[data-orm-scalar-${channel.key}-container]`)
          ),
          image: /** @type {HTMLImageElement | null} */ (root.querySelector(`[data-orm-scalar-${channel.key}-image]`)),
          slider: /** @type {HTMLInputElement | null} */ (root.querySelector(`[data-orm-scalar-${channel.key}-slider]`)),
          number: /** @type {HTMLInputElement | null} */ (root.querySelector(`[data-orm-scalar-${channel.key}-number]`)),
        },
      };
    }

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
    /** @type {OpacityMode} */
    this.opacityMode = 'slider';
    /** @type {number} */
    this.opacityValue = 1;
    /** @type {import('three').Texture | null} */
    this.opacityTexture = null;
    /** @type {string} */
    this.opacityTexturePreview = WHITE_PREVIEW;
    /** @type {boolean} */
    this.colorTextureHasAlpha = false;
    /** @type {OrmMode} */
    this.ormMode = 'scalar';
    /** @type {import('three').Texture | null} */
    this.ormPackedTexture = null;
    /** @type {string} */
    this.ormPackedPreview = WHITE_PREVIEW;
    /** @type {Record<OrmChannelKey, { texture: import('three').Texture | null; texturePreview: string; scalar: number }>} */
    this.ormChannelState = {
      ao: {
        texture: null,
        texturePreview: WHITE_PREVIEW,
        scalar: 1,
      },
      metalness: {
        texture: null,
        texturePreview: WHITE_PREVIEW,
        scalar: 0,
      },
      roughness: {
        texture: null,
        texturePreview: WHITE_PREVIEW,
        scalar: 1,
      },
    };
    /** @type {string} */
    this.bakedColorPreview = WHITE_PREVIEW;
    /** @type {string} */
    this.bakedNormalPreview = NEUTRAL_NORMAL_PREVIEW;
    /** @type {string} */
    this.bakedOrmPreview = DEFAULT_ORM_PREVIEW;

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
    if (this.opacitySliderImage) {
      this.opacitySliderImage.src = scalarToPreview(this.opacityValue);
    }
    if (this.opacitySliderTarget) {
      this.opacitySliderTarget.classList.remove('texture-upload--no-preview');
    }
    if (this.opacitySliderInput) {
      this.opacitySliderInput.value = String(this.opacityValue);
    }
    if (this.opacitySliderNumber) {
      this.opacitySliderNumber.value = this.opacityValue.toFixed(2);
    }
    if (this.opacityTextureImage) {
      this.opacityTextureImage.src = this.opacityTexturePreview;
    }
    if (this.opacityTextureTarget) {
      this.opacityTextureTarget.classList.add('texture-upload--no-preview');
    }
    if (this.opacityColorImage) {
      this.opacityColorImage.src = WHITE_PREVIEW;
    }
    if (this.opacityColorTarget) {
      this.opacityColorTarget.classList.add('texture-upload--no-preview');
    }
    if (this.normalTextureImage) {
      this.normalTextureImage.src = NEUTRAL_NORMAL_PREVIEW;
    }
    if (this.normalTextureTarget) {
      this.normalTextureTarget.classList.remove('texture-upload--no-preview');
    }

    if (this.ormPackedImage) {
      this.ormPackedImage.src = this.ormPackedPreview;
    }
    if (this.ormPackedTarget) {
      this.ormPackedTarget.classList.remove('texture-upload--no-preview');
    }
    for (const channel of ORM_CHANNELS) {
      const preview = scalarToPreview(channel.defaultScalar);
      const state = this.ormChannelState[channel.key];
      state.scalar = channel.defaultScalar;
      state.texturePreview = preview;
      const channelRefs = this.ormChannels[channel.key];
      if (channelRefs.separate.image) {
        channelRefs.separate.image.src = preview;
      }
      if (channelRefs.separate.target) {
        channelRefs.separate.target.classList.remove('texture-upload--no-preview');
      }
      if (channelRefs.separate.slider) {
        channelRefs.separate.slider.value = String(channel.defaultScalar);
      }
      if (channelRefs.separate.number) {
        channelRefs.separate.number.value = channel.defaultScalar.toFixed(2);
      }
      if (channelRefs.scalar.image) {
        channelRefs.scalar.image.src = preview;
      }
      if (channelRefs.scalar.slider) {
        channelRefs.scalar.slider.value = String(channel.defaultScalar);
      }
      if (channelRefs.scalar.number) {
        channelRefs.scalar.number.value = channel.defaultScalar.toFixed(2);
      }
    }

    this.#resetBakedPreviews();

    this.#bindEvents();
    this.#updateColorModeView();
    this.#updateOpacityAvailability();
    this.#updateOpacityModeView();
    this.#updateOrmModeView();
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
    material.userData = material.userData ?? {};
    const { original: baseMap } = this.#updateBaseMapReferences();
    this.savedColorTexture = baseMap ?? null;
    this.savedColorPreview = getTexturePreview(baseMap ?? material.map) ?? WHITE_PREVIEW;
    this.colorMode = material.map ? 'texture' : 'color';
    this.#syncModeInputs();

    this.#syncOrmFromMaterial(material);

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
    this.#syncOpacityFromMaterial(material);
    this.#updateNormalPreview();
    this.#updateOrmModeView();
    this.#showBody();
    this.#queueBakedUpdate();
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

    this.opacityModeInputs.forEach((input) => {
      input.addEventListener('change', () => {
        if (!input.checked) {
          return;
        }
        const value = input.value;
        const mode = value === 'texture' ? 'texture' : value === 'color-alpha' ? 'color-alpha' : 'slider';
        this.#setOpacityMode(mode);
      });
    });

    if (this.opacitySliderInput) {
      this.opacitySliderInput.addEventListener('input', () => {
        const raw = Number.parseFloat(this.opacitySliderInput?.value ?? '1');
        this.#setOpacityValue(raw, 'slider-input');
      });
    }

    if (this.opacitySliderNumber) {
      const applyOpacityNumber = () => {
        if (!this.opacitySliderNumber) {
          return;
        }
        const raw = Number.parseFloat(this.opacitySliderNumber.value);
        if (!Number.isFinite(raw)) {
          if (document.activeElement !== this.opacitySliderNumber) {
            this.#syncOpacityValueInputs(null);
          }
          return;
        }
        this.#setOpacityValue(raw, 'slider-number');
      };

      this.opacitySliderNumber.addEventListener('input', applyOpacityNumber);
      this.opacitySliderNumber.addEventListener('change', applyOpacityNumber);
      this.opacitySliderNumber.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          applyOpacityNumber();
          this.opacitySliderNumber?.blur();
        }
      });
    }

    if (this.opacityTextureTarget && this.opacityTextureInput) {
      this.opacityTextureTarget.addEventListener('click', (event) => {
        if ((event.target instanceof HTMLElement) && event.target.closest('[data-opacity-texture-remove]')) {
          return;
        }
        if (this.opacityMode !== 'texture') {
          return;
        }
        this.opacityTextureInput.click();
      });
    }

    if (this.opacityTextureInput) {
      this.opacityTextureInput.addEventListener('change', async () => {
        const file = this.opacityTextureInput?.files?.[0];
        if (!file) {
          return;
        }
        await this.#handleOpacityTextureFile(file);
        this.opacityTextureInput.value = '';
      });
    }

    if (this.opacityTextureRemove) {
      this.opacityTextureRemove.addEventListener('click', (event) => {
        event.stopPropagation();
        this.#handleRemoveOpacityTexture();
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

    this.ormModeInputs.forEach((input) => {
      input.addEventListener('change', () => {
        if (!input.checked) {
          return;
        }
        const value = input.value;
        const mode = value === 'separate' ? 'separate' : value === 'scalar' ? 'scalar' : 'packed';
        this.#setOrmMode(mode);
      });
    });

    if (this.ormPackedTarget && this.ormPackedInput) {
      this.ormPackedTarget.addEventListener('click', (event) => {
        if ((event.target instanceof HTMLElement) && event.target.closest('[data-orm-packed-remove]')) {
          return;
        }
        if (this.ormMode !== 'packed') {
          return;
        }
        this.ormPackedInput.click();
      });
    }

    if (this.ormPackedInput) {
      this.ormPackedInput.addEventListener('change', async () => {
        const file = this.ormPackedInput?.files?.[0];
        if (!file) {
          return;
        }
        await this.#handlePackedTextureFile(file);
        this.ormPackedInput.value = '';
      });
    }

    if (this.ormPackedRemove) {
      this.ormPackedRemove.addEventListener('click', (event) => {
        event.stopPropagation();
        this.#handleRemovePackedTexture();
      });
    }

    for (const channel of ORM_CHANNELS) {
      const refs = this.ormChannels[channel.key];
      if (refs.separate.target && refs.separate.input) {
        refs.separate.target.addEventListener('click', (event) => {
          if ((event.target instanceof HTMLElement) && event.target.closest(`[data-orm-${channel.key}-remove]`)) {
            return;
          }
          if (this.ormMode !== 'separate') {
            return;
          }
          refs.separate.input?.click();
        });
      }

      if (refs.separate.input) {
        refs.separate.input.addEventListener('change', async () => {
          const file = refs.separate.input?.files?.[0];
          if (!file) {
            return;
          }
          await this.#handleSeparateTextureFile(channel.key, file);
          refs.separate.input.value = '';
        });
      }

      if (refs.separate.remove) {
        refs.separate.remove.addEventListener('click', (event) => {
          event.stopPropagation();
          this.#handleRemoveSeparateTexture(channel.key);
        });
      }

      if (refs.separate.slider) {
        refs.separate.slider.addEventListener('input', () => {
          const raw = Number.parseFloat(refs.separate.slider?.value ?? '0');
          this.#setChannelScalar(channel.key, raw, 'separate-slider');
        });
      }

      if (refs.separate.number) {
        const applySeparateNumber = () => {
          if (!refs.separate.number) {
            return;
          }
          const raw = Number.parseFloat(refs.separate.number.value);
          if (!Number.isFinite(raw)) {
            if (document.activeElement !== refs.separate.number) {
              this.#syncChannelInputs(channel.key, 'separate-number');
            }
            return;
          }
          this.#setChannelScalar(channel.key, raw, 'separate-number');
        };

        refs.separate.number.addEventListener('input', applySeparateNumber);
        refs.separate.number.addEventListener('change', applySeparateNumber);
        refs.separate.number.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            applySeparateNumber();
            refs.separate.number?.blur();
          }
        });
      }

      if (refs.scalar.slider) {
        refs.scalar.slider.addEventListener('input', () => {
          const raw = Number.parseFloat(refs.scalar.slider?.value ?? '0');
          this.#setChannelScalar(channel.key, raw, 'scalar-slider');
        });
      }

      if (refs.scalar.number) {
        const applyScalarNumber = () => {
          if (!refs.scalar.number) {
            return;
          }
          const raw = Number.parseFloat(refs.scalar.number.value);
          if (!Number.isFinite(raw)) {
            if (document.activeElement !== refs.scalar.number) {
              this.#syncChannelInputs(channel.key, 'scalar-number');
            }
            return;
          }
          this.#setChannelScalar(channel.key, raw, 'scalar-number');
        };

        refs.scalar.number.addEventListener('input', applyScalarNumber);
        refs.scalar.number.addEventListener('change', applyScalarNumber);
        refs.scalar.number.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            applyScalarNumber();
            refs.scalar.number?.blur();
          }
        });
      }
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
      const originalMap = this.#resolveOriginalBaseMap(map);
      if (map) {
        this.savedColorTexture = originalMap ?? map;
        this.savedColorPreview = getTexturePreview(originalMap ?? map) ?? WHITE_PREVIEW;
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
        const originalMap = this.#resolveOriginalBaseMap(activeMap);
        this.savedColorTexture = originalMap ?? activeMap;
        this.savedColorPreview = getTexturePreview(originalMap ?? activeMap) ?? WHITE_PREVIEW;
      }
      this.#ensureTextureColorNeutral();
    }
    this.#updateBaseMapReferences();
    this.#updateColorModeView();
    this.#updateBaseTexturePreview();
    this.#handleColorTextureChange();
    this.#queueBakedUpdate();
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
   * Определяет, можно ли использовать альфа-канал текстуры цвета.
   * @returns {boolean}
   */
  #canUseColorAlpha() {
    return this.colorMode === 'texture' && Boolean(this.activeMaterial?.map) && this.colorTextureHasAlpha;
  }

  /**
   * Обновляет доступность опций прозрачности.
   */
  #updateOpacityAvailability() {
    const canUse = this.#canUseColorAlpha();
    this.opacityModeInputs.forEach((input) => {
      if (input.value === 'color-alpha') {
        input.disabled = !canUse;
      }
    });
    if (this.opacityColorContainer) {
      this.opacityColorContainer.classList.toggle('is-disabled', !canUse);
    }
  }

  /**
   * Гарантирует, что выбранный режим прозрачности валиден.
   * @returns {boolean}
   */
  #ensureValidOpacityMode() {
    if (this.opacityMode === 'color-alpha' && !this.#canUseColorAlpha()) {
      this.opacityMode = 'slider';
      return true;
    }
    return false;
  }

  /**
   * Устанавливает режим прозрачности.
   * @param {OpacityMode} mode
   * @param {{ force?: boolean }} [options]
   */
  #setOpacityMode(mode, options = {}) {
    const desired = mode === 'texture' ? 'texture' : mode === 'color-alpha' ? 'color-alpha' : 'slider';
    if (desired === 'color-alpha' && !this.#canUseColorAlpha()) {
      if (!options.force) {
        this.#syncOpacityModeInputs();
        return;
      }
      this.opacityMode = 'slider';
    } else {
      if (this.opacityMode === desired && !options.force) {
        this.#updateOpacityModeView();
        return;
      }
      this.opacityMode = desired;
    }
    this.#updateOpacityAvailability();
    this.#updateOpacityModeView();
    this.#applyOpacityState();
  }

  /**
   * Возвращает исходную текстуру цвета без модификаций.
   * @param {import('three').Texture | null} texture
   * @returns {import('three').Texture | null}
   */
  #resolveOriginalBaseMap(texture) {
    if (
      texture &&
      texture.userData?.__baseMapOriginal &&
      texture.userData.__baseMapOriginal.isTexture
    ) {
      return /** @type {import('three').Texture} */ (texture.userData.__baseMapOriginal);
    }
    return texture ?? null;
  }

  /**
   * Копирует базовые настройки текстуры в новую текстуру.
   * @param {import('three').Texture} source
   * @param {import('three').Texture} target
   */
  #copyTextureSettings(source, target) {
    target.wrapS = source.wrapS;
    target.wrapT = source.wrapT;
    target.repeat.copy(source.repeat);
    target.offset.copy(source.offset);
    target.center.copy(source.center);
    target.rotation = source.rotation;
    target.magFilter = source.magFilter;
    target.minFilter = source.minFilter;
    target.anisotropy = source.anisotropy;
    target.colorSpace = source.colorSpace;
    target.flipY = source.flipY;
    target.generateMipmaps = source.generateMipmaps;
    target.premultiplyAlpha = source.premultiplyAlpha;
  }

  /**
   * Создает копию текстуры с принудительно непрозрачным альфа-каналом.
   * @param {import('three').Texture} texture
   * @returns {import('three').Texture | null}
   */
  #createOpaqueBaseMap(texture) {
    const normalized = normalizeImageLike(texture.image ?? null);
    if (!normalized || !normalized.width || !normalized.height) {
      return null;
    }
    const { source, width, height } = normalized;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      return null;
    }
    try {
      context.drawImage(source, 0, 0, width, height, 0, 0, width, height);
      const imageData = context.getImageData(0, 0, width, height);
      const data = imageData.data;
      for (let index = 3; index < data.length; index += 4) {
        data[index] = 255;
      }
      context.putImageData(imageData, 0, 0);
    } catch (error) {
      console.warn('Не удалось создать непрозрачную копию текстуры', error);
      return null;
    }

    const opaque = new CanvasTexture(canvas);
    this.#copyTextureSettings(texture, opaque);
    opaque.needsUpdate = true;
    opaque.userData = { ...(texture.userData ?? {}) };
    opaque.userData.__baseMapOriginal = texture;
    opaque.userData.__ignoreBaseAlphaClone = true;
    if (typeof opaque.userData.__hasAlpha !== 'boolean') {
      opaque.userData.__hasAlpha = this.#textureHasAlpha(texture);
    }
    if (!opaque.userData.__previewUrl) {
      const preview = texture.userData?.__previewUrl ?? getTexturePreview(texture);
      if (preview) {
        opaque.userData.__previewUrl = preview;
      }
    }
    return opaque;
  }

  /**
   * Переключает материал между оригинальной и непрозрачной текстурой цвета.
   * @param {boolean} ignore
   */
  #applyBaseTextureAlphaUsage(ignore) {
    if (!this.activeMaterial) {
      return;
    }
    const material = this.activeMaterial;
    material.userData = material.userData ?? {};
    const currentMap = /** @type {import('three').Texture | null} */ (material.map ?? null);
    if (currentMap) {
      currentMap.userData = currentMap.userData ?? {};
      if (!currentMap.userData.__baseMapOriginal || !currentMap.userData.__baseMapOriginal.isTexture) {
        currentMap.userData.__baseMapOriginal = currentMap;
      }
    }
    const originalMap = this.#resolveOriginalBaseMap(currentMap);

    material.userData.__baseMapOriginal = originalMap ?? null;

    if (!originalMap) {
      material.userData.__baseMapOpaque = null;
      if (currentMap && material.map) {
        material.map = null;
        material.needsUpdate = true;
      }
      return;
    }

    let cachedOpaque = material.userData.__baseMapOpaque ?? null;
    if (
      cachedOpaque &&
      cachedOpaque.userData?.__baseMapOriginal !== originalMap
    ) {
      cachedOpaque = null;
      material.userData.__baseMapOpaque = null;
    }

    if (ignore) {
      if (!cachedOpaque) {
        cachedOpaque = this.#createOpaqueBaseMap(originalMap);
        if (cachedOpaque) {
          material.userData.__baseMapOpaque = cachedOpaque;
        }
      }
      const targetMap = cachedOpaque ?? originalMap;
      if (material.map !== targetMap) {
        material.map = targetMap;
        material.needsUpdate = true;
      }
    } else {
      if (cachedOpaque && material.userData.__baseMapOpaque !== cachedOpaque) {
        material.userData.__baseMapOpaque = cachedOpaque;
      }
      if (material.map !== originalMap) {
        material.map = originalMap;
        material.needsUpdate = true;
      }
    }
    this.#updateBaseMapReferences();
  }

  /**
   * Актуализирует ссылки на оригинальную и вспомогательную текстуры цвета.
   * @returns {{ current: import('three').Texture | null; original: import('three').Texture | null }}
   */
  #updateBaseMapReferences() {
    if (!this.activeMaterial) {
      return { current: null, original: null };
    }
    const material = this.activeMaterial;
    material.userData = material.userData ?? {};
    const currentMap = /** @type {import('three').Texture | null} */ (material.map ?? null);
    const originalMap = this.#resolveOriginalBaseMap(currentMap);
    material.userData.__baseMapOriginal = originalMap ?? null;

    if (
      currentMap &&
      originalMap &&
      currentMap !== originalMap &&
      currentMap.userData?.__ignoreBaseAlphaClone &&
      currentMap.userData.__baseMapOriginal === originalMap
    ) {
      material.userData.__baseMapOpaque = currentMap;
    } else if (
      material.userData.__baseMapOpaque &&
      material.userData.__baseMapOpaque.userData?.__baseMapOriginal !== originalMap
    ) {
      material.userData.__baseMapOpaque = null;
    }

    return { current: currentMap, original: originalMap };
  }

  /**
   * Применяет текущие настройки прозрачности к материалу.
   */
  #applyOpacityState() {
    if (!this.activeMaterial) {
      return;
    }
    const material = this.activeMaterial;
    material.userData = material.userData ?? {};
    material.userData.__opacityMode = this.opacityMode;
    material.userData.__opacityValue = this.opacityValue;
    material.userData.__useColorAlpha = this.opacityMode === 'color-alpha';

    const currentAlphaTest =
      typeof material.alphaTest === 'number' && Number.isFinite(material.alphaTest)
        ? material.alphaTest
        : 0;

    const setAlphaMode = (mode) => {
      if (material.userData.alphaMode !== mode) {
        material.userData.alphaMode = mode;
      }
    };

    const clearAlphaMask = () => {
      if (typeof material.alphaTest !== 'number' || material.alphaTest !== 0) {
        material.alphaTest = 0;
      }
    };

    const setDepthWrite = (value) => {
      if (material.depthWrite !== value) {
        material.depthWrite = value;
      }
    };

    this.#applyBaseTextureAlphaUsage(this.opacityMode === 'slider');

    if (this.opacityMode === 'slider') {
      if (material.alphaMap) {
        material.alphaMap = null;
      }
      const fullyOpaque = this.opacityValue >= 0.999;
      material.opacity = fullyOpaque ? 1 : this.opacityValue;
      material.transparent = !fullyOpaque;
      material.blending = fullyOpaque ? NoBlending : NormalBlending;
      setDepthWrite(fullyOpaque);
      clearAlphaMask();
      setAlphaMode(fullyOpaque ? 'OPAQUE' : 'BLEND');
    } else if (this.opacityMode === 'texture') {
      const texture = this.opacityTexture ?? null;
      material.alphaMap = texture;
      material.opacity = 1;
      const hasTexture = Boolean(texture);
      const useMask = hasTexture && currentAlphaTest > 0;
      if (useMask) {
        material.transparent = false;
        material.blending = NoBlending;
        setDepthWrite(true);
        setAlphaMode('MASK');
      } else {
        material.transparent = hasTexture;
        material.blending = hasTexture ? NormalBlending : NoBlending;
        setDepthWrite(!hasTexture);
        clearAlphaMask();
        setAlphaMode(hasTexture ? 'BLEND' : 'OPAQUE');
      }
      if (texture) {
        texture.needsUpdate = true;
      }
    } else {
      if (material.alphaMap) {
        material.alphaMap = null;
      }
      material.opacity = 1;
      material.transparent = true;
      material.blending = NormalBlending;
      setDepthWrite(false);
      clearAlphaMask();
      setAlphaMode('BLEND');
    }
    material.needsUpdate = true;
    this.#queueBakedUpdate();
  }

  /**
   * Обновляет представление блока прозрачности.
   */
  #updateOpacityModeView() {
    this.#syncOpacityModeInputs();
    if (this.opacitySliderContainer) {
      this.opacitySliderContainer.classList.toggle('is-hidden', this.opacityMode !== 'slider');
    }
    if (this.opacityTextureContainer) {
      this.opacityTextureContainer.classList.toggle('is-hidden', this.opacityMode !== 'texture');
    }
    if (this.opacityColorContainer) {
      this.opacityColorContainer.classList.toggle('is-hidden', this.opacityMode !== 'color-alpha');
    }
    if (this.opacitySliderInput) {
      this.opacitySliderInput.disabled = this.opacityMode !== 'slider';
    }
    if (this.opacitySliderNumber) {
      this.opacitySliderNumber.disabled = this.opacityMode !== 'slider';
    }
  }

  /**
   * Синхронизирует radio-инпуты режима прозрачности.
   */
  #syncOpacityModeInputs() {
    this.opacityModeInputs.forEach((input) => {
      input.checked = input.value === this.opacityMode;
    });
  }

  /**
   * Устанавливает значение прозрачности.
   * @param {number} value
   * @param {OpacityValueSource} source
   */
  #setOpacityValue(value, source) {
    if (!Number.isFinite(value)) {
      this.#syncOpacityValueInputs(source);
      return;
    }
    const clamped = clamp01(value);
    this.opacityValue = clamped;
    this.#syncOpacityValueInputs(source);
    this.#updateOpacitySliderPreview();
    if (this.opacityMode === 'slider') {
      this.#applyOpacityState();
    }
  }

  /**
   * Синхронизирует элементы управления значением прозрачности.
   * @param {OpacityValueSource} source
   */
  #syncOpacityValueInputs(source) {
    const sliderValue = this.opacityValue.toString();
    const numberValue = this.opacityValue.toFixed(2);
    if (this.opacitySliderInput && source !== 'slider-input') {
      this.opacitySliderInput.value = sliderValue;
    }
    if (this.opacitySliderNumber && source !== 'slider-number') {
      this.opacitySliderNumber.value = numberValue;
    }
  }

  /**
   * Обновляет превью значения прозрачности.
   */
  #updateOpacitySliderPreview() {
    if (this.opacitySliderImage) {
      this.opacitySliderImage.src = scalarToPreview(this.opacityValue);
    }
  }

  /**
   * Обновляет превью текстуры прозрачности.
   */
  #updateOpacityTexturePreview() {
    if (!this.opacityTextureImage) {
      return;
    }
    if (this.opacityTexture) {
      const preview = this.opacityTexture.userData?.__previewUrl ?? getTexturePreview(this.opacityTexture);
      if (preview) {
        this.opacityTexturePreview = preview;
      }
    } else {
      this.opacityTexturePreview = WHITE_PREVIEW;
    }
    this.opacityTextureImage.src = this.opacityTexturePreview;
    if (this.opacityTextureTarget) {
      this.opacityTextureTarget.classList.toggle('texture-upload--no-preview', !this.opacityTexture);
    }
  }

  /**
   * Обновляет превью режима использования альфа-канала цвета.
   */
  #updateOpacityColorPreview() {
    if (!this.opacityColorImage) {
      return;
    }
    const map = this.activeMaterial?.map ?? null;
    const previewSource = map
      ? map.userData?.__previewUrl ?? getTexturePreview(map)
      : this.savedColorPreview;
    const resolved = previewSource ?? WHITE_PREVIEW;
    this.opacityColorImage.src = resolved;
    if (this.opacityColorTarget) {
      const hasPreview = Boolean(map && this.colorMode === 'texture' && previewSource);
      this.opacityColorTarget.classList.toggle('texture-upload--no-preview', !hasPreview);
    }
  }

  /**
   * Обрабатывает изменения текстуры цвета.
   */
  #handleColorTextureChange() {
    const refs = this.#updateBaseMapReferences();
    const map = refs.current;
    const original = refs.original ?? map;
    this.colorTextureHasAlpha = Boolean(original && this.#textureHasAlpha(original));
    this.#updateOpacityColorPreview();
    const modeChanged = this.#ensureValidOpacityMode();
    this.#updateOpacityAvailability();
    this.#updateOpacityModeView();
    if (this.activeMaterial && (modeChanged || this.opacityMode === 'color-alpha')) {
      this.#applyOpacityState();
    } else if (this.activeMaterial && this.opacityMode === 'slider') {
      this.#applyBaseTextureAlphaUsage(true);
    }
    this.#queueBakedUpdate();
  }

  /**
   * Синхронизирует состояние прозрачности с материалом.
   * @param {(import('three').Material & { alphaMap?: import('three').Texture | null; opacity?: number; transparent?: boolean; userData?: any })} material
   */
  #syncOpacityFromMaterial(material) {
    const alphaMap = /** @type {import('three').Texture | null} */ (material.alphaMap ?? null);
    this.opacityTexture = alphaMap;
    if (alphaMap) {
      const preview = alphaMap.userData?.__previewUrl ?? getTexturePreview(alphaMap);
      this.opacityTexturePreview = preview ?? WHITE_PREVIEW;
      this.#textureHasAlpha(alphaMap);
    } else {
      this.opacityTexturePreview = WHITE_PREVIEW;
    }
    const storedValue =
      typeof material.userData?.__opacityValue === 'number'
        ? clamp01(material.userData.__opacityValue)
        : clamp01(typeof material.opacity === 'number' ? material.opacity : 1);
    this.opacityValue = storedValue;
    const currentMap = /** @type {import('three').Texture | null} */ (material.map ?? null);
    const originalMap = this.#resolveOriginalBaseMap(currentMap);
    material.userData = material.userData ?? {};
    material.userData.__baseMapOriginal = originalMap ?? null;
    if (
      material.userData.__baseMapOpaque &&
      material.userData.__baseMapOpaque.userData?.__baseMapOriginal !== originalMap
    ) {
      material.userData.__baseMapOpaque = null;
    }
    if (currentMap && currentMap.userData?.__ignoreBaseAlphaClone && currentMap.userData.__baseMapOriginal === originalMap) {
      material.userData.__baseMapOpaque = currentMap;
    }
    this.colorTextureHasAlpha = Boolean(originalMap && this.#textureHasAlpha(originalMap));
    this.#updateOpacityColorPreview();
    let resolvedMode = this.opacityMode;
    const storedMode = material.userData?.__opacityMode;
    if (storedMode === 'texture' && this.opacityTexture) {
      resolvedMode = 'texture';
    } else if (storedMode === 'color-alpha' && this.#canUseColorAlpha()) {
      resolvedMode = 'color-alpha';
    } else if (storedMode === 'slider') {
      resolvedMode = 'slider';
    } else if (this.opacityTexture) {
      resolvedMode = 'texture';
    } else if (this.#canUseColorAlpha() && (material.userData?.__useColorAlpha || (material.transparent && material.opacity === 1))) {
      resolvedMode = 'color-alpha';
    } else if (typeof material.opacity === 'number' && material.opacity < 1) {
      resolvedMode = 'slider';
    } else if (!this.#canUseColorAlpha()) {
      resolvedMode = 'slider';
    }
    this.opacityMode = /** @type {OpacityMode} */ (resolvedMode);
    this.#syncOpacityValueInputs(null);
    this.#updateOpacitySliderPreview();
    this.#updateOpacityTexturePreview();
    this.#updateOpacityAvailability();
    this.#updateOpacityModeView();
    this.#applyOpacityState();
  }

  /**
   * Обрабатывает загрузку текстуры прозрачности.
   * @param {File} file
   */
  async #handleOpacityTextureFile(file) {
    if (!this.activeMaterial) {
      return;
    }
    try {
      const texture = await this.#loadTexture(file, LinearSRGBColorSpace);
      this.opacityTexture = texture;
      const preview = getTexturePreview(texture);
      this.opacityTexturePreview = preview ?? WHITE_PREVIEW;
      this.#updateOpacityTexturePreview();
      this.#setOpacityMode('texture', { force: true });
    } catch (error) {
      console.error('Не удалось загрузить текстуру прозрачности', error);
    }
  }

  /**
   * Удаляет активную текстуру прозрачности.
   */
  #handleRemoveOpacityTexture() {
    this.opacityTexture = null;
    this.opacityTexturePreview = WHITE_PREVIEW;
    if (this.activeMaterial && this.opacityMode === 'texture') {
      this.#applyOpacityState();
    }
    this.#updateOpacityTexturePreview();
    this.#queueBakedUpdate();
  }

  /**
   * Проверяет наличие альфа-канала у текстуры и кеширует результат.
   * @param {import('three').Texture | null} texture
   * @returns {boolean}
   */
  #textureHasAlpha(texture) {
    if (!texture) {
      return false;
    }
    texture.userData = texture.userData ?? {};
    if (typeof texture.userData.__hasAlpha === 'boolean') {
      return texture.userData.__hasAlpha;
    }
    const image = texture.image ?? null;
    if (!image) {
      texture.userData.__hasAlpha = false;
      return false;
    }
    const hasAlpha = imageLikeHasAlpha(image);
    texture.userData.__hasAlpha = hasAlpha;
    return hasAlpha;
  }

  /**
   * Синхронизирует состояние ORM с текущим материалом.
   * @param {(import('three').Material & { aoMap?: import('three').Texture | null; metalnessMap?: import('three').Texture | null; roughnessMap?: import('three').Texture | null; aoMapIntensity?: number; metalness?: number; roughness?: number })} material
   */
  #syncOrmFromMaterial(material) {
    const aoMap = /** @type {import('three').Texture | null} */ (material.aoMap ?? null);
    const metalnessMap = /** @type {import('three').Texture | null} */ (material.metalnessMap ?? null);
    const roughnessMap = /** @type {import('three').Texture | null} */ (material.roughnessMap ?? null);

    const aoIntensity = clamp01(typeof material.aoMapIntensity === 'number' ? material.aoMapIntensity : 1);
    const metalness = clamp01(typeof material.metalness === 'number' ? material.metalness : 0);
    const roughness = clamp01(typeof material.roughness === 'number' ? material.roughness : 1);

    let needsUpdate = false;
    if (typeof material.aoMapIntensity !== 'number' || material.aoMapIntensity !== aoIntensity) {
      material.aoMapIntensity = aoIntensity;
      needsUpdate = true;
    }
    if (typeof material.metalness !== 'number' || material.metalness !== metalness) {
      material.metalness = metalness;
      needsUpdate = true;
    }
    if (typeof material.roughness !== 'number' || material.roughness !== roughness) {
      material.roughness = roughness;
      needsUpdate = true;
    }

    const channelScalars = {
      ao: aoIntensity,
      metalness,
      roughness,
    };

    for (const channel of ORM_CHANNELS) {
      this.ormChannelState[channel.key].scalar = channelScalars[channel.key];
    }

    const previousPreviews = {
      ao: this.ormChannelState.ao.texturePreview,
      metalness: this.ormChannelState.metalness.texturePreview,
      roughness: this.ormChannelState.roughness.texturePreview,
    };

    const channelTextures = {
      ao: aoMap ?? null,
      metalness: metalnessMap ?? null,
      roughness: roughnessMap ?? null,
    };

    const packedTexture = (() => {
      if (
        aoMap &&
        metalnessMap &&
        aoMap === metalnessMap &&
        (!roughnessMap || roughnessMap === aoMap)
      ) {
        return aoMap;
      }
      if (aoMap && roughnessMap && aoMap === roughnessMap && !metalnessMap) {
        return aoMap;
      }
      if (metalnessMap && roughnessMap && metalnessMap === roughnessMap && !aoMap) {
        return metalnessMap;
      }
      return null;
    })();

    if (packedTexture) {
      this.ormPackedTexture = packedTexture;
      const preview =
        getTexturePreview(packedTexture) ??
        previousPreviews.ao ??
        previousPreviews.metalness ??
        previousPreviews.roughness ??
        WHITE_PREVIEW;
      this.ormPackedPreview = preview || WHITE_PREVIEW;
      for (const channel of ORM_CHANNELS) {
        this.ormChannelState[channel.key].texture = null;
        this.ormChannelState[channel.key].texturePreview = WHITE_PREVIEW;
        this.ormChannelState[channel.key].scalar = channelScalars[channel.key];
      }
      this.ormMode = 'packed';
    } else {
      this.ormPackedTexture = null;
      this.ormPackedPreview = WHITE_PREVIEW;
      const hasSeparateTextures = Boolean(channelTextures.ao || channelTextures.metalness || channelTextures.roughness);
      if (hasSeparateTextures) {
        for (const channel of ORM_CHANNELS) {
          const texture = channelTextures[channel.key];
          this.ormChannelState[channel.key].texture = texture;
          this.ormChannelState[channel.key].scalar = texture ? channelScalars[channel.key] : 1;
          if (texture) {
            const preview = getTexturePreview(texture) ?? previousPreviews[channel.key] ?? WHITE_PREVIEW;
            this.ormChannelState[channel.key].texturePreview = preview;
          } else {
            this.ormChannelState[channel.key].texturePreview = WHITE_PREVIEW;
          }
        }
        this.ormMode = 'separate';
      } else {
        for (const channel of ORM_CHANNELS) {
          this.ormChannelState[channel.key].texture = null;
          this.ormChannelState[channel.key].texturePreview = WHITE_PREVIEW;
          this.ormChannelState[channel.key].scalar = channelScalars[channel.key];
        }
        this.ormMode = 'scalar';
      }
    }

    for (const channel of ORM_CHANNELS) {
      this.#syncChannelInputs(channel.key, null);
    }

    if (needsUpdate && this.activeMaterial) {
      this.activeMaterial.needsUpdate = true;
    }
  }

  /**
   * Устанавливает режим управления каналами ORM.
   * @param {OrmMode} mode
   */
  #setOrmMode(mode, options = { force: false }) {
    const { force = false } = options;
    if (!force && this.ormMode === mode) {
      return;
    }
    this.ormMode = mode;
    this.#applyOrmState();
    this.#updateOrmModeView();
  }

  /**
   * Обновляет отображение секции ORM.
   */
  #updateOrmModeView() {
    this.#syncOrmModeInputs();
    if (this.ormPackedContainer) {
      this.ormPackedContainer.classList.toggle('is-hidden', this.ormMode !== 'packed');
    }
    if (this.ormSeparateContainer) {
      this.ormSeparateContainer.classList.toggle('is-hidden', this.ormMode !== 'separate');
    }
    if (this.ormScalarContainer) {
      this.ormScalarContainer.classList.toggle('is-hidden', this.ormMode !== 'scalar');
    }
    if (this.ormPackedInput) {
      this.ormPackedInput.disabled = this.ormMode !== 'packed';
    }
    if (this.ormPackedRemove) {
      this.ormPackedRemove.disabled = this.ormMode !== 'packed' || !this.ormPackedTexture;
    }
    this.#updatePackedPreview();

    for (const channel of ORM_CHANNELS) {
      const refs = this.ormChannels[channel.key];
      const state = this.ormChannelState[channel.key];
      const hasTexture = Boolean(state.texture);
      const showSlider = this.ormMode === 'separate' && !hasTexture;
      if (refs.separate.sliderContainer) {
        refs.separate.sliderContainer.classList.toggle('is-hidden', !showSlider);
      }
      if (refs.separate.input) {
        refs.separate.input.disabled = this.ormMode !== 'separate';
      }
      if (refs.separate.slider) {
        refs.separate.slider.disabled = this.ormMode !== 'separate' || !hasTexture;
      }
      if (refs.separate.number) {
        refs.separate.number.disabled = this.ormMode !== 'separate' || !hasTexture;
      }
      if (refs.separate.remove) {
        refs.separate.remove.disabled = this.ormMode !== 'separate' || !state.texture;
      }
      const scalarEnabled = this.ormMode === 'scalar' && channel.key !== 'ao';
      if (refs.scalar.slider) {
        refs.scalar.slider.disabled = !scalarEnabled;
      }
      if (refs.scalar.number) {
        refs.scalar.number.disabled = !scalarEnabled;
      }
      if (refs.scalar.container) {
        refs.scalar.container.classList.toggle('is-disabled', !scalarEnabled);
      }
      this.#syncChannelInputs(channel.key, null);
      this.#updateChannelPreviews(channel.key);
    }
  }

  /**
   * Синхронизирует radio-инпуты ORM.
   */
  #syncOrmModeInputs() {
    this.ormModeInputs.forEach((input) => {
      input.checked = input.value === this.ormMode;
    });
  }

  /**
   * Обновляет превью общей ORM-текстуры.
   */
  #updatePackedPreview() {
    if (!this.ormPackedImage) {
      return;
    }
    if (this.ormPackedTexture) {
      const preview = this.ormPackedTexture.userData?.__previewUrl ?? getTexturePreview(this.ormPackedTexture);
      if (preview) {
        this.ormPackedPreview = preview;
      }
      this.ormPackedImage.src = this.ormPackedPreview;
    } else {
      this.ormPackedPreview = WHITE_PREVIEW;
      this.ormPackedImage.src = WHITE_PREVIEW;
    }
    if (this.ormPackedTarget) {
      this.ormPackedTarget.classList.toggle('texture-upload--no-preview', !this.ormPackedTexture);
    }
  }

  /**
   * Обновляет превью каналов и отображение слайдеров.
   * @param {OrmChannelKey} channelKey
   */
  #updateChannelPreviews(channelKey) {
    const state = this.ormChannelState[channelKey];
    const refs = this.ormChannels[channelKey];
    if (state.texture) {
      const preview = state.texture.userData?.__previewUrl ?? getTexturePreview(state.texture);
      if (preview) {
        state.texturePreview = preview;
      }
    } else {
      state.texturePreview = WHITE_PREVIEW;
    }
    const scalarPreview = scalarToPreview(state.scalar);
    const useTexture = this.ormMode === 'separate' && Boolean(state.texture);
    const separatePreview = useTexture ? state.texturePreview : scalarPreview;
    if (refs.separate.image) {
      refs.separate.image.src = separatePreview || WHITE_PREVIEW;
    }
    if (refs.separate.target) {
      const showPlaceholder = !separatePreview;
      refs.separate.target.classList.toggle('texture-upload--no-preview', showPlaceholder);
    }
    if (refs.scalar.image) {
      refs.scalar.image.src = scalarPreview;
    }
  }

  /**
   * Синхронизирует значения слайдеров и числовых полей канала.
   * @param {OrmChannelKey} channelKey
   * @param {OrmScalarSource} source
   */
  #syncChannelInputs(channelKey, source) {
    const state = this.ormChannelState[channelKey];
    const refs = this.ormChannels[channelKey];
    const fallbackLocked = this.ormMode === 'separate' && !state.texture;
    const sliderValue = fallbackLocked ? '1' : state.scalar.toString();
    const numberValue = fallbackLocked ? '1.00' : state.scalar.toFixed(2);
    if (refs.separate.slider && source !== 'separate-slider') {
      refs.separate.slider.value = sliderValue;
    }
    if (refs.separate.number && source !== 'separate-number') {
      refs.separate.number.value = numberValue;
    }
    if (refs.scalar.slider && source !== 'scalar-slider') {
      refs.scalar.slider.value = sliderValue;
    }
    if (refs.scalar.number && source !== 'scalar-number') {
      refs.scalar.number.value = numberValue;
    }
  }

  /**
   * Устанавливает скалярное значение канала.
   * @param {OrmChannelKey} channelKey
   * @param {number} value
   * @param {OrmScalarSource} source
   */
  #setChannelScalar(channelKey, value, source) {
    if (!Number.isFinite(value)) {
      this.#syncChannelInputs(channelKey, source);
      return;
    }
    const clamped = clamp01(value);
    this.ormChannelState[channelKey].scalar = clamped;
    this.#syncChannelInputs(channelKey, source);
    this.#updateChannelPreviews(channelKey);
    this.#applyOrmState();
    this.#queueBakedUpdate();
  }

  /**
   * Применяет активный режим ORM к материалу.
   */
  #applyOrmState() {
    if (!this.activeMaterial) {
      return;
    }

    if (this.ormMode === 'packed') {
      const texture = this.ormPackedTexture ?? null;
      this.activeMaterial.aoMap = texture;
      this.activeMaterial.metalnessMap = texture;
      this.activeMaterial.roughnessMap = texture;

      for (const channel of ORM_CHANNELS) {
        const { scalarProp, textureScalar } = this.ormChannels[channel.key].config;
        const fallback = this.ormChannelState[channel.key].scalar;
        this.activeMaterial[scalarProp] = texture ? textureScalar : fallback;
      }
    } else if (this.ormMode === 'separate') {
      for (const channel of ORM_CHANNELS) {
        const state = this.ormChannelState[channel.key];
        const { mapProp, scalarProp, textureScalar } = this.ormChannels[channel.key].config;
        const texture = state.texture ?? null;
        const hasTexture = Boolean(texture);
        this.activeMaterial[mapProp] = texture;
        if (!hasTexture) {
          this.ormChannelState[channel.key].scalar = 1;
        }
        this.activeMaterial[scalarProp] = hasTexture ? textureScalar : 1;
      }
    } else {
      for (const channel of ORM_CHANNELS) {
        const state = this.ormChannelState[channel.key];
        const { mapProp, scalarProp } = this.ormChannels[channel.key].config;
        this.activeMaterial[mapProp] = null;
        this.activeMaterial[scalarProp] = state.scalar;
      }
    }

    this.activeMaterial.needsUpdate = true;
    this.#queueBakedUpdate();
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
      this.#queueBakedUpdate();
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
      texture.userData = texture.userData ?? {};
      texture.userData.__baseMapOriginal = texture;
      this.activeMaterial.map = texture;
      this.activeMaterial.needsUpdate = true;
      this.savedColorTexture = texture;
      this.savedColorPreview = getTexturePreview(texture) ?? WHITE_PREVIEW;
      this.colorMode = 'texture';
      this.#ensureTextureColorNeutral();
      this.#updateColorModeView();
      this.#updateBaseTexturePreview();
      this.#handleColorTextureChange();
      this.#queueBakedUpdate();
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
      this.#queueBakedUpdate();
    } catch (error) {
      console.error('Не удалось загрузить нормал-карту', error);
    }
  }

  /**
   * Обрабатывает загрузку объединенной ORM-текстуры.
   * @param {File} file
   */
  async #handlePackedTextureFile(file) {
    if (!this.activeMaterial) {
      return;
    }
    try {
      const texture = await this.#loadTexture(file, LinearSRGBColorSpace);
      this.ormPackedTexture = texture;
      this.ormPackedPreview = getTexturePreview(texture) ?? WHITE_PREVIEW;
      this.#setOrmMode('packed', { force: true });
    } catch (error) {
      console.error('Не удалось загрузить ORM-текстуру', error);
    }
  }

  /**
   * Удаляет объединенную ORM-текстуру.
   */
  #handleRemovePackedTexture() {
    this.ormPackedTexture = null;
    this.ormPackedPreview = WHITE_PREVIEW;
    if (this.ormMode === 'packed') {
      this.#applyOrmState();
    }
    this.#updateOrmModeView();
    this.#queueBakedUpdate();
  }

  /**
   * Обрабатывает загрузку текстуры отдельного канала ORM.
   * @param {OrmChannelKey} channelKey
   * @param {File} file
   */
  async #handleSeparateTextureFile(channelKey, file) {
    if (!this.activeMaterial) {
      return;
    }
    try {
      const texture = await this.#loadTexture(file, LinearSRGBColorSpace);
      const previousPreview = this.ormChannelState[channelKey].texturePreview;
      this.ormChannelState[channelKey].texture = texture;
      const preview = getTexturePreview(texture) ?? previousPreview ?? WHITE_PREVIEW;
      this.ormChannelState[channelKey].texturePreview = preview;
      this.#setOrmMode('separate', { force: true });
    } catch (error) {
      console.error(`Не удалось загрузить текстуру канала ${channelKey}`, error);
    }
  }

  /**
   * Удаляет текстуру отдельного канала ORM.
   * @param {OrmChannelKey} channelKey
   */
  #handleRemoveSeparateTexture(channelKey) {
    this.ormChannelState[channelKey].texture = null;
    this.ormChannelState[channelKey].texturePreview = WHITE_PREVIEW;
    this.ormChannelState[channelKey].scalar = 1;
    if (this.ormMode === 'separate') {
      this.#applyOrmState();
    }
    this.#updateOrmModeView();
    this.#queueBakedUpdate();
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
    if (this.activeMaterial.userData) {
      this.activeMaterial.userData.__baseMapOriginal = null;
      this.activeMaterial.userData.__baseMapOpaque = null;
    }
    this.savedColorTexture = null;
    this.savedColorPreview = WHITE_PREVIEW;
    this.colorMode = 'color';
    this.#restoreSavedColor();
    this.#updateBaseMapReferences();
    this.#updateColorModeView();
    this.#updateBaseTexturePreview();
    this.#handleColorTextureChange();
    this.#queueBakedUpdate();
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
    this.#queueBakedUpdate();
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
    this.#queueBakedUpdate();
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
    texture.userData.__hasAlpha = this.#textureHasAlpha(texture);
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
    this.opacityMode = 'slider';
    this.opacityValue = 1;
    this.opacityTexture = null;
    this.opacityTexturePreview = WHITE_PREVIEW;
    this.colorTextureHasAlpha = false;
    this.#syncOpacityValueInputs(null);
    this.#updateOpacitySliderPreview();
    this.#updateOpacityTexturePreview();
    this.#updateOpacityColorPreview();
    this.#updateOpacityAvailability();
    this.#updateOpacityModeView();
    this.#updateNormalPreview();
    if (this.normalStrengthInput) {
      this.normalStrengthInput.value = '1';
    }
    this.#updateNormalStrengthValue(true);
    if (this.textureTarget) {
      this.textureTarget.classList.remove('texture-upload--no-preview');
    }
    if (this.opacityTextureTarget) {
      this.opacityTextureTarget.classList.add('texture-upload--no-preview');
    }
    if (this.opacityColorTarget) {
      this.opacityColorTarget.classList.add('texture-upload--no-preview');
    }
    if (this.normalTextureTarget) {
      this.normalTextureTarget.classList.remove('texture-upload--no-preview');
    }
    this.ormMode = 'scalar';
    this.ormPackedTexture = null;
    this.ormPackedPreview = WHITE_PREVIEW;
    for (const channel of ORM_CHANNELS) {
      const preview = scalarToPreview(channel.defaultScalar);
      const state = this.ormChannelState[channel.key];
      state.texture = null;
      state.texturePreview = preview;
      state.scalar = channel.defaultScalar;
      this.#syncChannelInputs(channel.key, null);
    }
    this.#updateOrmModeView();
    this.#resetBakedPreviews();
  }

  /**
   * Сбрасывает превью запеченных текстур к состоянию по умолчанию.
   */
  #resetBakedPreviews() {
    this.bakedColorPreview = WHITE_PREVIEW;
    this.bakedNormalPreview = NEUTRAL_NORMAL_PREVIEW;
    this.bakedOrmPreview = DEFAULT_ORM_PREVIEW;
    if (this.bakedColorImage) {
      this.bakedColorImage.src = this.bakedColorPreview;
    }
    if (this.bakedNormalImage) {
      this.bakedNormalImage.src = this.bakedNormalPreview;
    }
    if (this.bakedOrmImage) {
      this.bakedOrmImage.src = this.bakedOrmPreview;
    }
  }

  /**
   * Запускает обновление превью запеченных текстур.
   */
  #queueBakedUpdate() {
    this.#updateBakedTextures().catch((error) => {
      console.error('Не удалось обновить превью запеченных текстур', error);
      this.#resetBakedPreviews();
    });
  }

  /**
   * Пересчитывает изображения запеченных текстур.
   */
  async #updateBakedTextures() {
    const requestId = ++this.#bakedUpdateRequestId;
    try {
      const [color, normal, orm] = await Promise.all([
        this.#generateBakedColorPreview(BAKED_PREVIEW_SIZE, BAKED_PREVIEW_SIZE),
        this.#generateBakedNormalPreview(BAKED_PREVIEW_SIZE, BAKED_PREVIEW_SIZE),
        this.#generateBakedOrmPreview(BAKED_PREVIEW_SIZE, BAKED_PREVIEW_SIZE),
      ]);
      if (requestId !== this.#bakedUpdateRequestId) {
        return;
      }
      const colorPreview = color || WHITE_PREVIEW;
      const normalPreview = normal || NEUTRAL_NORMAL_PREVIEW;
      const ormPreview = orm || DEFAULT_ORM_PREVIEW;
      this.bakedColorPreview = colorPreview;
      this.bakedNormalPreview = normalPreview;
      this.bakedOrmPreview = ormPreview;
      if (this.bakedColorImage) {
        this.bakedColorImage.src = colorPreview;
      }
      if (this.bakedNormalImage) {
        this.bakedNormalImage.src = normalPreview;
      }
      if (this.bakedOrmImage) {
        this.bakedOrmImage.src = ormPreview;
      }
    } catch (error) {
      if (requestId === this.#bakedUpdateRequestId) {
        console.error('Не удалось обновить превью запеченных текстур', error);
        this.#resetBakedPreviews();
      }
    }
  }

  /**
   * Формирует запеченную текстуру цвета.
   * @param {number} width
   * @param {number} height
   * @returns {Promise<string>}
   */
  async #generateBakedColorPreview(width, height) {
    try {
      if (!width || !height) {
        return this.bakedColorPreview || WHITE_PREVIEW;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) {
        return this.bakedColorPreview || WHITE_PREVIEW;
      }

      let imageData = null;
      const materialMap = this.activeMaterial?.map ?? null;
      if (this.colorMode === 'texture' && materialMap) {
        imageData = await this.#sampleTextureImageData(materialMap, width, height);
      }

      if (!imageData) {
        const colorHex =
          this.colorMode === 'color'
            ? this.colorInput?.value || this.savedColorHex || '#ffffff'
            : '#ffffff';
        const [r, g, b] = parseHexColor(colorHex);
        imageData = context.createImageData(width, height);
        const data = imageData.data;
        for (let index = 0; index < data.length; index += 4) {
          data[index] = r;
          data[index + 1] = g;
          data[index + 2] = b;
          data[index + 3] = 255;
        }
      }

      if (this.opacityMode === 'slider') {
        const opacity = clamp01(this.opacityValue);
        if (opacity < 0.999) {
          const data = imageData.data;
          for (let index = 3; index < data.length; index += 4) {
            data[index] = clampChannel((data[index] ?? 255) * opacity);
          }
        }
      } else if (this.opacityMode === 'texture' && this.opacityTexture) {
        const maskData = await this.#sampleTextureImageData(this.opacityTexture, width, height);
        if (maskData) {
          const data = imageData.data;
          const mask = maskData.data;
          for (let index = 0; index < data.length; index += 4) {
            const luminance = getLuminance(mask[index], mask[index + 1], mask[index + 2]) / 255;
            data[index + 3] = clampChannel((data[index + 3] ?? 255) * luminance);
          }
        }
      }

      const data = imageData.data;
      for (let index = 3; index < data.length; index += 4) {
        data[index] = clampChannel(data[index] ?? 255);
      }

      context.putImageData(imageData, 0, 0);
      return canvas.toDataURL('image/png');
    } catch (error) {
      console.warn('Не удалось подготовить запеченную текстуру цвета', error);
      return this.bakedColorPreview || WHITE_PREVIEW;
    }
  }

  /**
   * Формирует запеченную нормал-карту.
   * @param {number} width
   * @param {number} height
   * @returns {Promise<string>}
   */
  async #generateBakedNormalPreview(width, height) {
    try {
      if (!width || !height) {
        return this.bakedNormalPreview || NEUTRAL_NORMAL_PREVIEW;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) {
        return this.bakedNormalPreview || NEUTRAL_NORMAL_PREVIEW;
      }

      let imageData = null;
      const normalMap = this.activeMaterial?.normalMap ?? null;
      if (normalMap) {
        imageData = await this.#sampleTextureImageData(normalMap, width, height);
      }
      if (!imageData) {
        imageData = context.createImageData(width, height);
        const data = imageData.data;
        for (let index = 0; index < data.length; index += 4) {
          data[index] = 128;
          data[index + 1] = 128;
          data[index + 2] = 255;
          data[index + 3] = 255;
        }
      }

      let strength = 1;
      if (this.normalStrengthInput) {
        const parsed = Number.parseFloat(this.normalStrengthInput.value);
        if (Number.isFinite(parsed)) {
          strength = parsed;
        }
      } else if (this.activeMaterial?.normalScale && Number.isFinite(this.activeMaterial.normalScale.x)) {
        strength = this.activeMaterial.normalScale.x;
      }
      const normalizedStrength = Math.min(3, Math.max(0, strength));

      const data = imageData.data;
      for (let index = 0; index < data.length; index += 4) {
        const baseR = data[index];
        const baseG = data[index + 1];
        const baseB = data[index + 2];
        data[index] = clampChannel(128 + (baseR - 128) * normalizedStrength);
        data[index + 1] = clampChannel(128 + (baseG - 128) * normalizedStrength);
        data[index + 2] = clampChannel(255 + (baseB - 255) * normalizedStrength);
        data[index + 3] = 255;
      }

      context.putImageData(imageData, 0, 0);
      return canvas.toDataURL('image/png');
    } catch (error) {
      console.warn('Не удалось подготовить запеченную нормал-карту', error);
      return this.bakedNormalPreview || NEUTRAL_NORMAL_PREVIEW;
    }
  }

  /**
   * Формирует запеченную ORM-текстуру.
   * @param {number} width
   * @param {number} height
   * @returns {Promise<string>}
   */
  async #generateBakedOrmPreview(width, height) {
    try {
      if (!width || !height) {
        return this.bakedOrmPreview || DEFAULT_ORM_PREVIEW;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) {
        return this.bakedOrmPreview || DEFAULT_ORM_PREVIEW;
      }

      if (this.ormMode === 'packed' && this.ormPackedTexture) {
        const packedData = await this.#sampleTextureImageData(this.ormPackedTexture, width, height);
        if (packedData) {
          const packedPixels = packedData.data;
          for (let index = 3; index < packedPixels.length; index += 4) {
            packedPixels[index] = 255;
          }
          context.putImageData(packedData, 0, 0);
          return canvas.toDataURL('image/png');
        }
      }

      const imageData = context.createImageData(width, height);
      const totalPixels = width * height;
      const [aoValues, roughnessValues, metalnessValues] = await Promise.all([
        this.#getOrmChannelValues('ao', width, height),
        this.#getOrmChannelValues('roughness', width, height),
        this.#getOrmChannelValues('metalness', width, height),
      ]);

      const pixels = imageData.data;
      for (let index = 0; index < totalPixels; index += 1) {
        const offset = index * 4;
        pixels[offset] = aoValues[index] ?? 0;
        pixels[offset + 1] = roughnessValues[index] ?? 0;
        pixels[offset + 2] = metalnessValues[index] ?? 0;
        pixels[offset + 3] = 255;
      }

      context.putImageData(imageData, 0, 0);
      return canvas.toDataURL('image/png');
    } catch (error) {
      console.warn('Не удалось подготовить запеченную ORM-текстуру', error);
      return this.bakedOrmPreview || DEFAULT_ORM_PREVIEW;
    }
  }

  /**
   * Возвращает значения канала ORM.
   * @param {OrmChannelKey} channelKey
   * @param {number} width
   * @param {number} height
   * @returns {Promise<Uint8ClampedArray>}
   */
  async #getOrmChannelValues(channelKey, width, height) {
    const totalPixels = width * height;
    const values = new Uint8ClampedArray(totalPixels);
    const state = this.ormChannelState[channelKey];
    if (!state) {
      return values;
    }

    const useTexture = this.ormMode === 'separate' && Boolean(state.texture);
    if (useTexture && state.texture) {
      const textureData = await this.#sampleTextureImageData(state.texture, width, height);
      if (textureData) {
        const data = textureData.data;
        for (let index = 0; index < totalPixels; index += 1) {
          const offset = index * 4;
          values[index] = clampChannel(data[offset]);
        }
        return values;
      }
    }

    const scalarLevel = clampChannel(clamp01(state.scalar) * 255);
    values.fill(scalarLevel);
    return values;
  }

  /**
   * Считывает данные изображения текстуры.
   * @param {import('three').Texture | null} texture
   * @param {number} width
   * @param {number} height
   * @returns {Promise<ImageData | null>}
   */
  async #sampleTextureImageData(texture, width, height) {
    if (!texture || !width || !height) {
      return null;
    }
    try {
      if (texture.image) {
        const normalized = normalizeImageLike(texture.image);
        if (normalized && normalized.width && normalized.height) {
          const sampled = await this.#drawSourceToImageData(
            normalized.source,
            normalized.width,
            normalized.height,
            width,
            height,
          );
          if (sampled) {
            return sampled;
          }
        }
      }

      const previewUrl = typeof texture.userData?.__previewUrl === 'string' ? texture.userData.__previewUrl : null;
      if (previewUrl) {
        const fallback = await this.#loadImageDataFromUrl(previewUrl, width, height);
        if (fallback) {
          return fallback;
        }
      }
    } catch (error) {
      console.warn('Не удалось считать данные текстуры', error);
    }
    return null;
  }

  /**
   * Рисует источник на канвасе и возвращает ImageData.
   * @param {CanvasImageSource} source
   * @param {number} sourceWidth
   * @param {number} sourceHeight
   * @param {number} width
   * @param {number} height
   * @returns {Promise<ImageData | null>}
   */
  async #drawSourceToImageData(source, sourceWidth, sourceHeight, width, height) {
    if (!source || !sourceWidth || !sourceHeight || !width || !height) {
      return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      return null;
    }
    try {
      await this.#ensureImageSourceReady(source);
      context.drawImage(source, 0, 0, sourceWidth, sourceHeight, 0, 0, width, height);
      return context.getImageData(0, 0, width, height);
    } catch (error) {
      console.warn('Не удалось отрисовать источник изображения', error);
      return null;
    }
  }

  /**
   * Загружает изображение по URL и возвращает его данные.
   * @param {string | null} url
   * @param {number} width
   * @param {number} height
   * @returns {Promise<ImageData | null>}
   */
  async #loadImageDataFromUrl(url, width, height) {
    if (!url) {
      return null;
    }
    return new Promise((resolve) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.decoding = 'async';
      const cleanup = () => {
        image.onload = null;
        image.onerror = null;
      };
      image.onload = async () => {
        cleanup();
        const sourceWidth = image.naturalWidth || image.width;
        const sourceHeight = image.naturalHeight || image.height;
        const sampled = await this.#drawSourceToImageData(
          image,
          sourceWidth,
          sourceHeight,
          width,
          height,
        );
        resolve(sampled);
      };
      image.onerror = () => {
        cleanup();
        resolve(null);
      };
      image.src = url;
    });
  }

  /**
   * Гарантирует готовность источника изображения к отрисовке.
   * @param {CanvasImageSource} source
   * @returns {Promise<void>}
   */
  async #ensureImageSourceReady(source) {
    if (typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement) {
      if (!source.complete || !source.naturalWidth || !source.naturalHeight) {
        await new Promise((resolve) => {
          const finalize = () => {
            source.removeEventListener('load', finalize);
            source.removeEventListener('error', finalize);
            resolve();
          };
          source.addEventListener('load', finalize, { once: true });
          source.addEventListener('error', finalize, { once: true });
        });
      }
      if (typeof source.decode === 'function') {
        try {
          await source.decode();
        } catch (error) {
          console.warn('Не удалось декодировать изображение', error);
        }
      }
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
