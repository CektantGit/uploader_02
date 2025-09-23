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
    /** @type {(file: File) => void} */
    this.onImportFile = () => {};

    if (this.importButton) {
      this.importButton.addEventListener('click', () => {
        if (this.fileInput) {
          this.fileInput.value = '';
          this.fileInput.click();
        }
      });
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
   * Привязывает обработчик импорта файла.
   * @param {(file: File) => void} handler
   */
  bindImport(handler) {
    this.onImportFile = handler;
  }

  /**
   * Создаёт DOM-строку для меша.
   * @param {{ name: string, onClick: (event: MouseEvent) => void, onHide: () => boolean, onDelete: () => void }} config
   * @returns {HTMLLIElement}
   */
  createMeshRow({ name, onClick, onHide, onDelete }) {
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
    return li;
  }

  /**
   * Удаляет строку меша из списка.
   * @param {string} uuid
   */
  removeMeshRow(uuid) {
    const row = this.list?.querySelector(`[data-uuid="${uuid}"]`);
    row?.remove();
  }
}
