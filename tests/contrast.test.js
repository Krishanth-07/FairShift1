import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('WCAG 2.1 AA Color Contrast Verification', () => {
  const cssPath = path.resolve(process.cwd(), 'public/shared/base.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  // Extract CSS custom properties from :root block
  const varMap = new Map();
  const varRegex = /--([a-z0-9\-]+):\s*(#[0-9a-fA-F]{3,8})/g;
  let match;
  while ((match = varRegex.exec(cssContent)) !== null) {
    varMap.set(match[1], match[2]);
  }

  /**
   * Converts sRGB component to linear relative luminance component.
   * @param {number} c8 - 0-255 color channel.
   * @returns {number} Linear luminance.
   */
  function toLinear(c8) {
    const s = c8 / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }

  /**
   * Computes relative luminance of hex color string according to WCAG 2.1.
   * @param {string} hex - #RRGGBB or #RGB string.
   * @returns {number}
   */
  function relativeLuminance(hex) {
    let clean = hex.replace('#', '');
    if (clean.length === 3) {
      clean = clean.split('').map((c) => c + c).join('');
    }
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  }

  /**
   * Computes WCAG contrast ratio between two hex colors.
   * @param {string} hex1 - First color.
   * @param {string} hex2 - Second color.
   * @returns {number} Ratio formatted as floating point (e.g. 4.54).
   */
  function contrastRatio(hex1, hex2) {
    const lum1 = relativeLuminance(hex1);
    const lum2 = relativeLuminance(hex2);
    const lighter = Math.max(lum1, lum2);
    const darker = Math.min(lum1, lum2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  // Explicit list of UI text and background pairs requiring normal text contrast (>= 4.5:1)
  const normalTextPairs = [
    { text: 'text-primary', bg: 'bg-surface', label: 'Primary text on surface card' },
    { text: 'text-primary', bg: 'bg-primary', label: 'Primary text on body background' },
    { text: 'text-primary', bg: 'bg-subtle', label: 'Primary text on subtle table header' },
    { text: 'text-primary', bg: 'bg-card', label: 'Primary text on modal card' },
    { text: 'text-secondary', bg: 'bg-surface', label: 'Secondary text on surface' },
    { text: 'text-secondary', bg: 'bg-primary', label: 'Secondary text on body background' },
    { text: 'text-secondary', bg: 'bg-subtle', label: 'Secondary text on table/subtle row' },
    { text: 'text-muted', bg: 'bg-surface', label: 'Muted note on surface' },
    { text: 'text-muted', bg: 'bg-primary', label: 'Muted note on body background' },
    { text: 'text-muted', bg: 'bg-subtle', label: 'Muted note on subtle panel' },
    { text: 'text-on-accent', bg: 'accent-primary', label: 'White text on primary button' },
    { text: 'text-on-accent', bg: 'accent-primary-hover', label: 'White text on hovered button' },
    { text: 'status-ok', bg: 'status-ok-bg', label: 'Verified status text on ok pill' },
    { text: 'status-watch', bg: 'status-watch-bg', label: 'Watch status text on amber pill' },
    { text: 'status-danger', bg: 'status-danger-bg', label: 'Danger/Disputed text on red pill' },
    { text: 'status-info', bg: 'status-info-bg', label: 'Informational text on blue pill' },
    { text: 'text-on-accent', bg: 'status-danger', label: 'White text on danger action button' },
    { text: 'text-on-accent', bg: 'status-ok', label: 'White text on success badge' }
  ];

  // UI components requiring large text or graphical boundary contrast (>= 3.0:1)
  const largeOrBoundaryPairs = [
    { fg: 'border-strong', bg: 'bg-surface', label: 'Form input border on white card' },
    { fg: 'border-strong', bg: 'bg-primary', label: 'Form input border on body background' }
  ];

  it('all normal text and background pairs must meet or exceed WCAG 2.1 AA 4.5:1 ratio', () => {
    for (const pair of normalTextPairs) {
      const textColor = varMap.get(pair.text);
      const bgColor = varMap.get(pair.bg);

      assert.ok(textColor, `CSS variable --${pair.text} must exist in base.css`);
      assert.ok(bgColor, `CSS variable --${pair.bg} must exist in base.css`);

      const ratio = contrastRatio(textColor, bgColor);
      assert.ok(
        ratio >= 4.5,
        `Expected ${pair.label} (--${pair.text} ${textColor} on --${pair.bg} ${bgColor}) ratio ${ratio.toFixed(2)}:1 to be >= 4.5:1`
      );
    }
  });

  it('all boundary and large text elements must meet or exceed WCAG 2.1 AA 3.0:1 ratio', () => {
    for (const pair of largeOrBoundaryPairs) {
      const fgColor = varMap.get(pair.fg);
      const bgColor = varMap.get(pair.bg);

      assert.ok(fgColor, `CSS variable --${pair.fg} must exist in base.css`);
      assert.ok(bgColor, `CSS variable --${pair.bg} must exist in base.css`);

      const ratio = contrastRatio(fgColor, bgColor);
      assert.ok(
        ratio >= 3.0,
        `Expected ${pair.label} (--${pair.fg} ${fgColor} on --${pair.bg} ${bgColor}) ratio ${ratio.toFixed(2)}:1 to be >= 3.0:1`
      );
    }
  });
});
