/**
 * @file Inline Accessible SVG Icons
 *
 * Generates lightweight, accessible vector icons using pure document.createElementNS.
 * Adheres strictly to AGENTS.md performance rules: zero media binaries, zero external icon fonts.
 * Every icon sets aria-hidden="true" and is accompanied by a semantic text label.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** SVG Path definitions for core platform icons. */
const ICON_PATHS = {
  checkin: [
    { tag: 'path', d: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4' },
    { tag: 'polyline', points: '10 17 15 12 10 7' },
    { tag: 'line', x1: '15', y1: '12', x2: '3', y2: '12' }
  ],
  payslip: [
    { tag: 'rect', x: '4', y: '2', width: '16', height: '20', rx: '2' },
    { tag: 'line', x1: '8', y1: '6', x2: '16', y2: '6' },
    { tag: 'line', x1: '8', y1: '10', x2: '16', y2: '10' },
    { tag: 'line', x1: '8', y1: '14', x2: '12', y2: '14' },
    { tag: 'line', x1: '8', y1: '18', x2: '14', y2: '18' }
  ],
  report: [
    { tag: 'path', d: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' },
    { tag: 'line', x1: '12', y1: '9', x2: '12', y2: '13' },
    { tag: 'line', x1: '12', y1: '17', x2: '12.01', y2: '17' }
  ],
  feedback: [
    { tag: 'path', d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' }
  ],
  rest: [
    { tag: 'path', d: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' }
  ],
  warning: [
    { tag: 'circle', cx: '12', cy: '12', r: '10' },
    { tag: 'line', x1: '12', y1: '8', x2: '12', y2: '12' },
    { tag: 'line', x1: '12', y1: '16', x2: '12.01', y2: '16' }
  ],
  speaker: [
    { tag: 'polygon', points: '11 5 6 9 2 9 2 15 6 15 11 19 11 5' },
    { tag: 'path', d: 'M15.54 8.46a5 5 0 0 1 0 7.07' },
    { tag: 'path', d: 'M19.07 4.93a10 10 0 0 1 0 14.14' }
  ],
  mic: [
    { tag: 'path', d: 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z' },
    { tag: 'path', d: 'M19 10v2a7 7 0 0 1-14 0v-2' },
    { tag: 'line', x1: '12', y1: '19', x2: '12', y2: '23' },
    { tag: 'line', x1: '8', y1: '23', x2: '16', y2: '23' }
  ],
  check: [
    { tag: 'path', d: 'M22 11.08V12a10 10 0 1 1-5.93-9.14' },
    { tag: 'polyline', points: '22 4 12 14.01 9 11.01' }
  ],
  language: [
    { tag: 'circle', cx: '12', cy: '12', r: '10' },
    { tag: 'line', x1: '2', y1: '12', x2: '22', y2: '12' },
    { tag: 'path', d: 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' }
  ]
};

/**
 * Creates an inline SVG element.
 *
 * @param {string} name - Icon identifier (e.g. 'checkin', 'payslip', 'report').
 * @param {number} [size=24] - Square dimensions in pixels.
 * @returns {SVGElement} Accessible SVG DOM node.
 */
export function createSvg(name, size = 24) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('fs-icon', `fs-icon-${name}`);

  const elements = ICON_PATHS[name] || ICON_PATHS.warning;
  for (const spec of elements) {
    const el = document.createElementNS(SVG_NS, spec.tag);
    for (const [attr, val] of Object.entries(spec)) {
      if (attr !== 'tag') {
        el.setAttribute(attr, val);
      }
    }
    svg.appendChild(el);
  }

  return svg;
}

/**
 * Creates a container element pairing the vector icon with a visible or screen-reader label.
 *
 * @param {string} name - Icon name.
 * @param {string} labelText - Companion text label.
 * @param {boolean} [labelVisible=true] - Whether the text label is rendered visibly.
 * @returns {HTMLElement} Container span.
 */
export function createIcon(name, labelText, labelVisible = true) {
  const container = document.createElement('span');
  container.className = 'fs-icon-wrapper';

  const svg = createSvg(name);
  container.appendChild(svg);

  if (labelText) {
    const label = document.createElement('span');
    label.className = labelVisible ? 'fs-icon-label' : 'sr-only';
    label.textContent = labelText;
    container.appendChild(label);
  }

  return container;
}
