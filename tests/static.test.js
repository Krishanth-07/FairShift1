import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Static Asset & CSP Compliance', () => {
  const publicDir = path.resolve(process.cwd(), 'public');

  function getFiles(dir, filter) {
    const results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...getFiles(fullPath, filter));
      } else if (filter(entry.name)) {
        results.push(fullPath);
      }
    }
    return results;
  }

  it('public/worker/index.html must have lang, title, and main semantic element', () => {
    const workerHtmlPath = path.join(publicDir, 'worker/index.html');
    assert.ok(fs.existsSync(workerHtmlPath), 'worker/index.html must exist');
    const content = fs.readFileSync(workerHtmlPath, 'utf8');

    assert.match(content, /<html\s+[^>]*lang=["'][a-zA-Z\-]+["']/i, 'index.html must specify lang attribute');
    assert.match(content, /<title>[^<]+<\/title>/i, 'index.html must have a non-empty <title>');
    assert.match(content, /<main(\s+[^>]*)?>[\s\S]*<\/main>/i, 'index.html must contain a <main> element');
  });

  it('HTML files must not contain inline <script> blocks (only external src)', () => {
    const htmlFiles = getFiles(publicDir, name => name.endsWith('.html'));
    assert.ok(htmlFiles.length > 0, 'Must find HTML files');

    for (const file of htmlFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
      let match;
      while ((match = scriptRegex.exec(content)) !== null) {
        const [fullTag, attrs, innerScript] = match;
        // Verify script has a src attribute
        assert.match(attrs, /\bsrc=["'][^"']+["']/i, `Script in ${file} must have an external src attribute: ${fullTag}`);
        // Verify inner content is empty or whitespace only
        assert.equal(innerScript.trim(), '', `Script in ${file} must not contain inline code`);
      }
    }
  });

  it('HTML files must not contain inline style attributes', () => {
    const htmlFiles = getFiles(publicDir, name => name.endsWith('.html'));

    for (const file of htmlFiles) {
      const content = fs.readFileSync(file, 'utf8');
      // Match style="..." or style='...' on any HTML tag
      const inlineStyleMatch = /<[a-z0-9\-]+\s+[^>]*\bstyle\s*=\s*['"][^'"]*['"][^>]*>/gi;
      const matches = content.match(inlineStyleMatch);
      assert.equal(matches, null, `Found forbidden inline style in ${file}: ${JSON.stringify(matches)}`);
    }
  });

  it('no JavaScript or HTML file in public/ should use innerHTML', () => {
    const files = getFiles(publicDir, name => name.endsWith('.js') || name.endsWith('.html'));

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      // Strip block and line comments to avoid false alarms in explanatory comments
      const stripped = content
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');

      assert.doesNotMatch(
        stripped,
        /\.innerHTML\b/,
        `File ${path.relative(process.cwd(), file)} must not use innerHTML`
      );
    }
  });
});
