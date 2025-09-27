let tooltipElement = null;

/**
 * @returns {HTMLDivElement}
 */
function ensureTooltipElement() {
  if (tooltipElement && document.body.contains(tooltipElement)) {
    return tooltipElement;
  }
  const existing = document.querySelector('.material-tooltip');
  if (existing instanceof HTMLDivElement) {
    tooltipElement = existing;
    return tooltipElement;
  }
  tooltipElement = document.createElement('div');
  tooltipElement.className = 'material-tooltip';
  tooltipElement.setAttribute('role', 'tooltip');
  tooltipElement.style.left = '-9999px';
  tooltipElement.style.top = '-9999px';
  document.body.appendChild(tooltipElement);
  return tooltipElement;
}

/**
 * Контроллер всплывающих подсказок, прикреплённых к кнопкам.
 */
export class TooltipController {
  constructor() {
    this.tooltip = ensureTooltipElement();
    /** @type {HTMLElement | null} */
    this.activeTrigger = null;
  }

  /**
   * Показывает подсказку.
   * @param {HTMLElement} trigger
   * @param {string} text
   */
  show(trigger, text) {
    this.activeTrigger = trigger;
    this.tooltip.textContent = text;
    this.tooltip.classList.add('is-visible');
    this.#position(trigger);
  }

  /**
   * Переключает состояние подсказки для элемента.
   * @param {HTMLElement} trigger
   * @param {string} text
   */
  toggle(trigger, text) {
    if (this.activeTrigger === trigger && this.tooltip.classList.contains('is-visible')) {
      this.hide(trigger, true);
    } else {
      this.show(trigger, text);
    }
  }

  /**
   * Скрывает подсказку.
   * @param {HTMLElement} trigger
   * @param {boolean} force
   */
  hide(trigger, force) {
    if (!force && document.activeElement === trigger) {
      return;
    }
    if (!force && this.activeTrigger && this.activeTrigger !== trigger) {
      return;
    }
    this.tooltip.classList.remove('is-visible');
    this.tooltip.style.left = '-9999px';
    this.tooltip.style.top = '-9999px';
    if (force || this.activeTrigger === trigger) {
      this.activeTrigger = null;
    }
  }

  /**
   * Позиционирует подсказку около элемента.
   * @param {HTMLElement} trigger
   */
  #position(trigger) {
    const rect = trigger.getBoundingClientRect();
    const margin = 12;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Сначала позиционируем под кнопкой по центру.
    this.tooltip.style.left = '-9999px';
    this.tooltip.style.top = '-9999px';
    const tooltipRect = this.tooltip.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    let top = rect.bottom + margin;

    if (top + tooltipRect.height + margin > viewportHeight) {
      top = rect.top - tooltipRect.height - margin;
    }
    if (top < margin) {
      top = margin;
    }
    if (left + tooltipRect.width + margin > viewportWidth) {
      left = viewportWidth - tooltipRect.width - margin;
    }
    if (left < margin) {
      left = margin;
    }

    this.tooltip.style.left = `${Math.round(left)}px`;
    this.tooltip.style.top = `${Math.round(top)}px`;
  }
}
