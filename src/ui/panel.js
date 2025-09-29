/**
 * Левая панель с кнопкой импорта и списком мешей.
 */
export class Panel {
  /**
   * @param {HTMLElement} root
   */
  constructor(root) {
    this.root = root;
    this.importButton = /** @type {HTMLButtonElement} */ (root.querySelector('[data-import-button]'));
    this.fileInput = /** @type {HTMLInputElement} */ (root.querySelector('[data-file-input]'));
    this.list = /** @type {HTMLUListElement} */ (root.querySelector('[data-mesh-list]'));
    this.selectAllButton = /** @type {HTMLButtonElement} */ (root.querySelector('[data-select-all]'));
    this.tabButtons = /** @type {HTMLButtonElement[]} */ (
      Array.from(root.querySelectorAll('[data-panel-tab]'))
    );
    this.sections = new Map(
      Array.from(root.querySelectorAll('[data-panel-section]')).map((section) => [
        section.getAttribute('data-panel-section') || '',
        section,
      ]),
    );
    const defaultTab = this.tabButtons.find((button) => button.classList.contains('panel__tab--active'));
    this.activeSection = defaultTab?.getAttribute('data-panel-tab') || 'info';
    /** @type {(file: File) => void} */
    this.onImportFile = () => {};
    /** @type {() => void} */
    this.onSelectAll = () => {};
    this.meshCount = this.list?.children.length ?? 0;

    this.#bindTabs();

    if (this.importButton) {
      this.importButton.addEventListener('click', () => {
        if (this.fileInput) {
          this.fileInput.value = '';
          this.fileInput.click();
        }
      });
    }

    if (this.selectAllButton) {
      this.selectAllButton.addEventListener('click', () => {
        this.onSelectAll();
      });
      this.#updateSelectAllState();
    }

    if (this.fileInput) {
      this.fileInput.addEventListener('change', () => {
        if (!this.fileInput?.files) {
          return;
        }
        const files = Array.from(this.fileInput.files);
        files.forEach((file) => this.onImportFile(file));
      });
    }
  }

  /**
   * Настраивает переключение вкладок панели.
   */
  #bindTabs() {
    for (const button of this.tabButtons) {
      button.addEventListener('click', () => {
        const target = button.getAttribute('data-panel-tab') || '';
        if (!target) {
          return;
        }
        this.#setActiveSection(target);
      });
    }
    if (this.activeSection) {
      this.#setActiveSection(this.activeSection);
    }
  }

  /**
   * Переключает текущую видимую секцию панели.
   * @param {string} sectionName
   */
  #setActiveSection(sectionName) {
    this.activeSection = sectionName;
    for (const button of this.tabButtons) {
      const isActive = button.getAttribute('data-panel-tab') === sectionName;
      button.classList.toggle('panel__tab--active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    }
    for (const [name, section] of this.sections.entries()) {
      if (!name) {
        continue;
      }
      section.classList.toggle('panel__section--active', name === sectionName);
    }
  }

  /**
   * Привязывает обработчик импорта файла.
   * @param {(file: File) => void} handler
   */
  bindImport(handler) {
    this.onImportFile = handler;
  }

  /**
   * Привязывает обработчик массового выбора мешей.
   * @param {() => void} handler
   */
  bindSelectAll(handler) {
    this.onSelectAll = handler;
  }

  /**
   * Создаёт DOM-строку для меша.
   * @param {{
   *   name: string,
   *   onClick: (event: MouseEvent) => void,
   *   onDoubleClick?: (event: MouseEvent) => void,
   *   onHide: () => boolean,
   *   onDelete: () => void
   * }} config
   * @returns {HTMLLIElement}
   */
  createMeshRow({ name, onClick, onDoubleClick, onHide, onDelete }) {
    const li = document.createElement('li');
    li.className = 'mesh-row';

    const label = document.createElement('div');
    label.className = 'mesh-row__label';
    label.textContent = name;

    const actions = document.createElement('div');
    actions.className = 'mesh-row__actions';

    const hideButton = document.createElement('button');
    hideButton.type = 'button';
    hideButton.className = 'mesh-row__action';
    hideButton.textContent = 'Hide';

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'mesh-row__action mesh-row__action--delete';
    deleteButton.textContent = '×';

    li.addEventListener('click', (event) => {
      if ((event.target instanceof HTMLElement) && event.target.closest('.mesh-row__actions')) {
        return;
      }
      onClick(event);
    });

    if (onDoubleClick) {
      li.addEventListener('dblclick', (event) => {
        if (
          event.target instanceof HTMLElement &&
          event.target.closest('.mesh-row__actions')
        ) {
          return;
        }
        onDoubleClick(event);
      });
    }

    hideButton.addEventListener('click', (event) => {
      event.stopPropagation();
      const visible = onHide();
      hideButton.textContent = visible ? 'Hide' : 'Show';
      li.classList.toggle('mesh-row--hidden', !visible);
    });

    deleteButton.addEventListener('click', (event) => {
      event.stopPropagation();
      onDelete();
    });

    actions.append(hideButton, deleteButton);
    li.append(label, actions);
    this.list?.append(li);
    this.meshCount += 1;
    this.#updateSelectAllState();
    return li;
  }

  /**
   * Удаляет строку меша из списка.
   * @param {string} uuid
   */
  removeMeshRow(uuid) {
    const row = this.list?.querySelector(`[data-uuid="${uuid}"]`);
    row?.remove();
    if (this.meshCount > 0) {
      this.meshCount -= 1;
    }
    if (this.meshCount < 0) {
      this.meshCount = 0;
    }
    this.#updateSelectAllState();
  }

  /**
   * Обновляет доступность кнопки массового выбора.
   */
  #updateSelectAllState() {
    if (!this.selectAllButton) {
      return;
    }
    this.selectAllButton.disabled = this.meshCount === 0;
  }
}
