/**
 * Renders the transform toolbar controls.
 */
export class Toolbar extends EventTarget {
  /**
   * @param {HTMLElement} container
   */
  constructor(container) {
    super();
    this.container = container;
    this.container.classList.add('toolbar');

    /** @type {Record<string, HTMLButtonElement>} */
    this.buttons = {
      none: this._createButton('None', 'none'),
      translate: this._createButton('Translation', 'translate'),
      rotate: this._createButton('Rotation', 'rotate'),
      scale: this._createButton('Scale', 'scale')
    };

    this.setMode('none');
  }

  /**
   * Marks the active mode button.
   * @param {'none' | 'translate' | 'rotate' | 'scale'} mode
   */
  setMode(mode) {
    Object.entries(this.buttons).forEach(([key, button]) => {
      if (key === mode) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    });
  }

  _createButton(label, mode) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('mode', { detail: mode }));
      this.setMode(mode);
    });
    this.container.appendChild(button);
    return button;
  }
}
