import * as THREE from 'three';

/**
 * Handles numeric transform inputs for a single selected mesh.
 */
export class Inspector extends EventTarget {
  /**
   * @param {HTMLElement} container
   */
  constructor(container) {
    super();
    this.container = container;
    this.container.classList.add('inspector');

    this.fields = {
      x: this._createField('X'),
      y: this._createField('Y'),
      z: this._createField('Z')
    };

    /** @type {THREE.Object3D | null} */
    this.mesh = null;
    /** @type {'none' | 'translate' | 'rotate' | 'scale'} */
    this.mode = 'none';

    Object.entries(this.fields).forEach(([axis, { input }]) => {
      input.addEventListener('change', () => {
        if (!this.mesh || this.mode === 'none') {
          return;
        }
        const value = Number.parseFloat(input.value);
        if (Number.isNaN(value)) {
          return;
        }
        this.dispatchEvent(
          new CustomEvent('valuechange', {
            detail: { axis, value }
          })
        );
      });
    });
  }

  /**
   * Updates inspector visibility and values.
   * @param {THREE.Object3D[]} selection
   * @param {'none' | 'translate' | 'rotate' | 'scale'} mode
   */
  update(selection, mode) {
    this.mode = mode;
    if (mode === 'none' || selection.length !== 1) {
      this.mesh = null;
      this.container.hidden = true;
      return;
    }

    this.mesh = selection[0];
    this.container.hidden = false;
    this._refreshFields();
  }

  /**
   * Refreshes displayed values from the current mesh.
   */
  refresh() {
    if (!this.mesh || this.mode === 'none') {
      return;
    }
    this._refreshFields();
  }

  _refreshFields() {
    if (!this.mesh) {
      return;
    }

    let values;
    switch (this.mode) {
      case 'translate':
        values = this.mesh.position;
        this._setFieldValues(values.x, values.y, values.z);
        break;
      case 'rotate':
        values = this.mesh.rotation;
        this._setFieldValues(
          THREE.MathUtils.radToDeg(values.x),
          THREE.MathUtils.radToDeg(values.y),
          THREE.MathUtils.radToDeg(values.z)
        );
        break;
      case 'scale':
        values = this.mesh.scale;
        this._setFieldValues(values.x, values.y, values.z);
        break;
      default:
        break;
    }
  }

  _setFieldValues(x, y, z) {
    this.fields.x.input.value = this._format(x);
    this.fields.y.input.value = this._format(y);
    this.fields.z.input.value = this._format(z);
  }

  _createField(labelText) {
    const wrapper = document.createElement('div');
    wrapper.className = 'inspector-field';

    const label = document.createElement('label');
    label.textContent = labelText;

    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';

    wrapper.append(label, input);
    this.container.appendChild(wrapper);

    return { wrapper, label, input };
  }

  _format(value) {
    return Number.parseFloat(value.toFixed(4)).toString();
  }
}
