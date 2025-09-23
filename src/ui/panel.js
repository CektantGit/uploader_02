/**
 * Creates and manages the left-hand mesh list panel.
 */
export class Panel extends EventTarget {
  /**
   * @param {HTMLElement} container
   */
  constructor(container) {
    super();
    this.container = container;
    this.container.classList.add('panel');

    this.importButton = document.createElement('button');
    this.importButton.id = 'import-button';
    this.importButton.textContent = 'Import Model';

    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = '.glb,.gltf,.fbx,.obj';
    this.fileInput.multiple = false;
    this.fileInput.style.display = 'none';

    this.list = document.createElement('ul');
    this.list.id = 'mesh-list';
    this.list.setAttribute('role', 'list');

    this.container.append(this.importButton, this.fileInput, this.list);

    /** @type {Map<string, { mesh: THREE.Object3D, li: HTMLElement, hideButton: HTMLButtonElement }>} */
    this.meshMap = new Map();

    this.importButton.addEventListener('click', () => {
      this.fileInput.click();
    });

    this.fileInput.addEventListener('change', () => {
      if (this.fileInput.files && this.fileInput.files[0]) {
        const file = this.fileInput.files[0];
        this.dispatchEvent(new CustomEvent('import', { detail: file }));
        this.fileInput.value = '';
      }
    });
  }

  /**
   * Adds a mesh entry to the panel list.
   * @param {THREE.Object3D} mesh
   */
  addMesh(mesh) {
    const row = document.createElement('li');
    row.className = 'mesh-row';
    row.dataset.meshId = mesh.uuid;

    const label = document.createElement('span');
    label.className = 'name';
    label.textContent = mesh.name || mesh.uuid;

    const hideButton = document.createElement('button');
    hideButton.className = 'hide-button';
    hideButton.type = 'button';
    hideButton.textContent = 'Hide';

    const removeButton = document.createElement('button');
    removeButton.className = 'remove-button';
    removeButton.type = 'button';
    removeButton.textContent = 'X';

    row.append(label, hideButton, removeButton);
    this.list.append(row);

    hideButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.dispatchEvent(
        new CustomEvent('togglevisibility', {
          detail: { mesh }
        })
      );
    });

    removeButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.dispatchEvent(new CustomEvent('remove', { detail: { mesh } }));
    });

    row.addEventListener('click', (event) => {
      this.dispatchEvent(
        new CustomEvent('select', {
          detail: { mesh, additive: event.shiftKey }
        })
      );
    });

    this.meshMap.set(mesh.uuid, { mesh, li: row, hideButton });
  }

  /**
   * Removes mesh entry from list.
   * @param {THREE.Object3D} mesh
   */
  removeMesh(mesh) {
    const record = this.meshMap.get(mesh.uuid);
    if (!record) return;
    record.li.remove();
    this.meshMap.delete(mesh.uuid);
  }

  /**
   * Updates list selection state to match provided meshes.
   * @param {Set<THREE.Object3D>} selection
   */
  setSelection(selection) {
    this.meshMap.forEach(({ li, mesh }) => {
      if (selection.has(mesh)) {
        li.classList.add('selected');
      } else {
        li.classList.remove('selected');
      }
    });
  }

  /**
   * Updates hide button label based on mesh visibility.
   * @param {THREE.Object3D} mesh
   * @param {boolean} visible
   */
  setVisibility(mesh, visible) {
    const record = this.meshMap.get(mesh.uuid);
    if (!record) return;
    record.hideButton.textContent = visible ? 'Hide' : 'Show';
    record.li.classList.toggle('dimmed', !visible);
  }
}
