/**
 * Панель инструментов трансформации (None, Translation, Rotation, Scale).
 */
export class Toolbar {
  /**
   * @param {HTMLElement} root
   */
  constructor(root) {
    this.root = root;
    this.buttons = new Map();
    /** @type {(mode: 'none' | 'translate' | 'rotate' | 'scale') => void} */
    this.onModeChange = () => {};

    this.root.querySelectorAll('[data-mode]').forEach((button) => {
      const mode = /** @type {'none' | 'translate' | 'rotate' | 'scale'} */ (button.dataset.mode);
      if (!mode) {
        return;
      }
      this.buttons.set(mode, button);
      button.addEventListener('click', () => {
        this.setActiveMode(mode);
        this.onModeChange(mode);
      });
    });
  }

  /**
   * Назначает обработчик переключения режима.
   * @param {(mode: 'none' | 'translate' | 'rotate' | 'scale') => void} handler
   */
  bindModeChange(handler) {
    this.onModeChange = handler;
  }

  /**
   * Обновляет визуальное состояние активной кнопки.
   * @param {'none' | 'translate' | 'rotate' | 'scale'} mode
   */
  setActiveMode(mode) {
    this.buttons.forEach((button, buttonMode) => {
      button.classList.toggle('active', buttonMode === mode);
    });
  }
}
