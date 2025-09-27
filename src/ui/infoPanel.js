import { TooltipController } from './tooltip.js';

/**
 * @typedef {{ id: string; name: string; subs?: CategoryNode[]; previewUrl?: string }} CategoryNode
 */

const INFO_TRANSLATIONS = {
  en: {
    tabs: {
      info: 'Info',
      mesh: 'Mesh',
    },
    name: {
      label: 'Name',
      placeholder: 'Object name',
    },
    description: {
      label: 'Description',
      placeholder: 'Describe the object',
    },
    tags: {
      label: 'Tags',
      placeholder: 'tag1, tag2',
    },
    placement: {
      label: 'Placement type',
      help: 'Choose a surface on which your AR object can be placed.',
      options: {
        all: 'All',
        floor: 'Floor',
        wall: 'Wall',
        ceiling: 'Ceiling',
        carpet: 'Carpet',
      },
    },
    destination: {
      label: 'Destination Url',
      placeholder: 'https://',
      help: "The user of the application will go to this address if they click the 'Buy' button.",
    },
    brand: {
      label: 'Brand',
      placeholder: 'Brand name',
    },
    category: {
      label: 'Category',
      placeholder: 'Select category',
      help: 'Select the main catalog category for the object.',
    },
    subcategory: {
      label: 'Subcategory',
      placeholder: 'Select subcategory',
    },
    visibility: {
      label: 'Visibility',
      help: 'Choose where the object will be visible.',
      options: {
        visible: 'Visible everywhere',
        catalogs: 'Only in my catalogs',
        hidden: 'Hidden everywhere',
      },
    },
    covers: {
      label: 'Covers',
      add: 'Add Cover',
      remove: 'Remove cover',
    },
    delete: {
      label: 'Delete object',
    },
    loading: 'Loading…',
    loadFailed: 'Failed to load',
  },
  ru: {
    tabs: {
      info: 'Инфо',
      mesh: 'Меши',
    },
    name: {
      label: 'Название',
      placeholder: 'Название объекта',
    },
    description: {
      label: 'Описание',
      placeholder: 'Кратко опишите объект',
    },
    tags: {
      label: 'Теги',
      placeholder: 'тег1, тег2',
    },
    placement: {
      label: 'Тип размещения',
      help: 'Выберите поверхность, на которой может быть размещён ваш объект AR.',
      options: {
        all: 'Все',
        floor: 'Пол',
        wall: 'Стена',
        ceiling: 'Потолок',
        carpet: 'Ковер',
      },
    },
    destination: {
      label: 'Целевой URL',
      placeholder: 'https://',
      help: 'Пользователь перейдёт по этому адресу, если нажмёт кнопку «Купить».',
    },
    brand: {
      label: 'Бренд',
      placeholder: 'Название бренда',
    },
    category: {
      label: 'Категория',
      placeholder: 'Выберите категорию',
      help: 'Выберите основную категорию каталога для объекта.',
    },
    subcategory: {
      label: 'Подкатегория',
      placeholder: 'Выберите подкатегорию',
    },
    visibility: {
      label: 'Видимость',
      help: 'Укажите, где объект будет отображаться.',
      options: {
        visible: 'Видим везде',
        catalogs: 'Только в моих каталогах',
        hidden: 'Скрыт везде',
      },
    },
    covers: {
      label: 'Обложки',
      add: 'Добавить обложку',
      remove: 'Удалить обложку',
    },
    delete: {
      label: 'Удалить объект',
    },
    loading: 'Загрузка…',
    loadFailed: 'Не удалось загрузить',
  },
};

const CATEGORY_API = 'https://api.vizbl.us/obj/GetCats';

/**
 * Панель с информационными настройками объекта.
 */
export class InfoPanel {
  /**
   * @param {HTMLElement} root
   */
  constructor(root) {
    this.root = root;
    this.nameInput = /** @type {HTMLInputElement | null} */ (root.querySelector('[data-info-name]'));
    this.descriptionInput = /** @type {HTMLTextAreaElement | null} */ (root.querySelector('[data-info-description]'));
    this.tagsInput = /** @type {HTMLInputElement | null} */ (root.querySelector('[data-info-tags]'));
    this.placementSelect = /** @type {HTMLSelectElement | null} */ (root.querySelector('[data-info-placement]'));
    this.destinationInput = /** @type {HTMLInputElement | null} */ (root.querySelector('[data-info-destination]'));
    this.brandInput = /** @type {HTMLInputElement | null} */ (root.querySelector('[data-info-brand]'));
    this.categorySelect = /** @type {HTMLSelectElement | null} */ (root.querySelector('[data-info-category]'));
    this.subcategoryGroup = /** @type {HTMLElement | null} */ (root.querySelector('[data-info-subcategory-group]'));
    this.subcategorySelect = /** @type {HTMLSelectElement | null} */ (root.querySelector('[data-info-subcategory]'));
    this.visibilitySelect = /** @type {HTMLSelectElement | null} */ (root.querySelector('[data-info-visibility]'));
    this.coverTarget = /** @type {HTMLElement | null} */ (root.querySelector('[data-info-cover-target]'));
    this.coverImage = /** @type {HTMLImageElement | null} */ (root.querySelector('[data-info-cover-image]'));
    this.coverInput = /** @type {HTMLInputElement | null} */ (root.querySelector('[data-info-cover-input]'));
    this.coverRemove = /** @type {HTMLButtonElement | null} */ (root.querySelector('[data-info-cover-remove]'));
    this.deleteButton = /** @type {HTMLButtonElement | null} */ (root.querySelector('[data-info-delete]'));
    this.tooltip = new TooltipController();
    this.activeLanguage = 'en';
    /** @type {CategoryNode[] | null} */
    this.categories = null;
    /** @type {CategoryNode | null} */
    this.selectedCategory = null;
    this.#bindTooltipButtons();
    this.#bindCategorySelect();
    this.#bindCoverControls();
    this.#applyLanguage();
    this.#updateSubcategories();
    this.#loadInitialData();
  }

  /**
   * Подключает обработчики к кнопкам подсказок.
   */
  #bindTooltipButtons() {
    const buttons = /** @type {HTMLButtonElement[]} */ (
      Array.from(this.root.querySelectorAll('[data-tooltip-button]'))
    );
    for (const button of buttons) {
      button.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
      });
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const key = button.getAttribute('data-i18n-tooltip');
        const text = key ? this.#translatePath(key) : '';
        this.tooltip.toggle(button, text);
      });
      button.addEventListener('pointerenter', () => {
        const key = button.getAttribute('data-i18n-tooltip');
        if (!key) {
          return;
        }
        this.tooltip.show(button, this.#translatePath(key));
      });
      button.addEventListener('pointerleave', () => {
        this.tooltip.hide(button, false);
      });
      button.addEventListener('focus', () => {
        const key = button.getAttribute('data-i18n-tooltip');
        if (!key) {
          return;
        }
        this.tooltip.show(button, this.#translatePath(key));
      });
      button.addEventListener('blur', () => {
        this.tooltip.hide(button, true);
      });
    }
  }

  /**
   * Применяет текстовые переводы к элементам панели.
   */
  #applyLanguage() {
    const translations = INFO_TRANSLATIONS[this.activeLanguage] || INFO_TRANSLATIONS.en;
    const scope = this.root.closest('[data-panel]') || this.root;
    const keyElements = /** @type {HTMLElement[]} */ (
      Array.from(scope.querySelectorAll('[data-i18n-key]'))
    );
    for (const element of keyElements) {
      const key = element.getAttribute('data-i18n-key');
      if (!key) {
        continue;
      }
      const translation = this.#translatePath(key);
      if (translation) {
        element.textContent = translation;
      }
    }

    const placeholderElements = /** @type {HTMLElement[]} */ (
      Array.from(this.root.querySelectorAll('[data-i18n-placeholder]'))
    );
    for (const element of placeholderElements) {
      const key = element.getAttribute('data-i18n-placeholder');
      if (!key) {
        continue;
      }
      const translation = this.#translatePath(key);
      if (translation && 'placeholder' in element) {
        /** @type {HTMLInputElement} */ (element).placeholder = translation;
      }
    }

    const tooltipButtons = /** @type {HTMLButtonElement[]} */ (
      Array.from(this.root.querySelectorAll('[data-i18n-tooltip]'))
    );
    for (const button of tooltipButtons) {
      const key = button.getAttribute('data-i18n-tooltip');
      if (!key) {
        continue;
      }
      const translation = this.#translatePath(key);
      if (translation) {
        button.setAttribute('aria-label', translation);
      }
    }

    if (this.coverRemove) {
      this.coverRemove.setAttribute('aria-label', this.#translatePath('covers.remove') || 'Remove');
    }
  }

  /**
   * Выполняет запросы за категориями и цветами.
   */
  async #loadInitialData() {
    await this.#loadCategories();
  }

  /**
   * Загружает категории из API.
   */
  async #loadCategories() {
    if (!this.categorySelect) {
      return;
    }
    this.#setCategoryLoading(true);
    try {
      const response = await fetch(CATEGORY_API, { mode: 'cors' });
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      const data = await response.json();
      if (!data || !Array.isArray(data.cats)) {
        throw new Error('Unexpected categories payload');
      }
      this.categories = data.cats;
      this.#populateCategories();
    } catch (error) {
      console.error('Failed to load categories', error);
      this.#setCategoryError();
    } finally {
      this.#setCategoryLoading(false);
    }
  }

  /**
   * Заполняет основной список категорий.
   */
  #populateCategories() {
    if (!this.categorySelect) {
      return;
    }
    const existing = Array.from(this.categorySelect.querySelectorAll('option'));
    for (const option of existing) {
      if (!option.value) {
        continue;
      }
      option.remove();
    }
    if (!this.categories) {
      return;
    }
    for (const category of this.categories) {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = category.name;
      this.categorySelect.append(option);
    }
  }

  /**
   * Настраивает обработчики выбора категории.
   */
  #bindCategorySelect() {
    if (!this.categorySelect) {
      return;
    }
    this.categorySelect.addEventListener('change', () => {
      const value = this.categorySelect?.value || '';
      if (!value || !this.categories) {
        this.selectedCategory = null;
        this.#updateSubcategories();
        return;
      }
      this.selectedCategory = this.categories.find((category) => category.id === value) ?? null;
      this.#updateSubcategories();
    });
  }

  /**
   * Обновляет состояние подкатегорий в зависимости от выбранной категории.
   */
  #updateSubcategories() {
    if (!this.subcategoryGroup || !this.subcategorySelect) {
      return;
    }
    const subs = this.selectedCategory?.subs ?? null;
    this.subcategorySelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = this.#translatePath('subcategory.placeholder') || 'Select subcategory';
    this.subcategorySelect.append(placeholder);

    if (!subs || subs.length === 0) {
      this.subcategoryGroup.classList.add('is-hidden');
      return;
    }
    this.subcategoryGroup.classList.remove('is-hidden');
    for (const sub of subs) {
      const option = document.createElement('option');
      option.value = sub.id;
      option.textContent = sub.name;
      this.subcategorySelect.append(option);
    }
  }

  /**
   * Настраивает загрузку обложки.
   */
  #bindCoverControls() {
    if (this.coverInput) {
      this.coverInput.addEventListener('change', () => {
        const file = this.coverInput?.files?.[0] ?? null;
        if (!file) {
          return;
        }
        const reader = new FileReader();
        reader.addEventListener('load', () => {
          if (typeof reader.result === 'string') {
            this.#setCoverPreview(reader.result);
          }
        });
        reader.readAsDataURL(file);
      });
    }

    if (this.coverRemove) {
      this.coverRemove.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.coverInput && (this.coverInput.value = '');
        this.#setCoverPreview(null);
      });
    }
  }

  /**
   * Устанавливает превью обложки.
   * @param {string | null} url
   */
  #setCoverPreview(url) {
    if (!this.coverImage || !this.coverTarget) {
      return;
    }
    if (url) {
      this.coverImage.src = url;
      this.coverTarget.classList.add('has-image');
    } else {
      this.coverImage.removeAttribute('src');
      this.coverTarget.classList.remove('has-image');
    }
  }

  /**
   * Включает или отключает индикатор загрузки категорий.
   * @param {boolean} loading
   */
  #setCategoryLoading(loading) {
    if (!this.categorySelect) {
      return;
    }
    this.categorySelect.disabled = loading;
    if (loading) {
      this.categorySelect.dataset.loading = 'true';
    } else {
      delete this.categorySelect.dataset.loading;
    }
  }

  /**
   * Отображает ошибку загрузки категорий.
   */
  #setCategoryError() {
    if (!this.categorySelect) {
      return;
    }
    const option = document.createElement('option');
    option.value = '';
    option.textContent = this.#translatePath('loadFailed') || 'Failed to load';
    option.disabled = true;
    option.selected = true;
    this.categorySelect.append(option);
  }

  /**
   * Устанавливает активный язык интерфейса панели.
   * @param {keyof typeof INFO_TRANSLATIONS} language
   */
  setLanguage(language) {
    if (language in INFO_TRANSLATIONS) {
      this.activeLanguage = language;
    } else {
      this.activeLanguage = 'en';
    }
    this.#applyLanguage();
  }

  /**
   * Возвращает перевод по ключу вида `placement.label`.
   * @param {string} path
   * @returns {string | null}
   */
  #translatePath(path) {
    const translations = INFO_TRANSLATIONS[this.activeLanguage] || INFO_TRANSLATIONS.en;
    const segments = path.split('.');
    let current = /** @type {any} */ (translations);
    for (const segment of segments) {
      if (!current || !(segment in current)) {
        return null;
      }
      current = current[segment];
    }
    if (typeof current === 'string') {
      return current;
    }
    return null;
  }
}
