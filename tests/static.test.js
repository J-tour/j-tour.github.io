import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";

const read = path => readFile(new URL(`../public/${path}`, import.meta.url), "utf8");

test("static storefront is Traditional Chinese, accessible and local-module CSP compatible", async () => {
  const html = await read("index.html");
  assert.match(html, /lang="zh-Hant"/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /http-equiv="Content-Security-Policy"/);
  assert.match(html, /script-src 'self'/);
  assert.match(html, /object-src 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.match(html, /<script type="module" src="\.\/app.js"><\/script>/);
  assert.doesNotMatch(html, /<script(?![^>]*src=)[^>]*>[\s\S]*?<\/script>/);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(html, /\sstyle\s*=/i);
  assert.match(html, /class="skip-link"/);
  assert.match(html, /<main id="main">/);
  assert.match(html, /<dialog[^>]+aria-labelledby="product-title"/);
  assert.match(html, /<dialog[^>]+aria-labelledby="cart-title"/);
  assert.match(html, /<noscript>/);
  assert.match(html, /展示模式|品牌與商品示例/);
});
test("no untrusted HTML insertion, fake order lookup, password or payment collection", async () => {
  const app = await read("app.js");
  const html = await read("index.html");
  assert.doesNotMatch(app, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/);
  assert.doesNotMatch(html, /type="(?:password|email)"|autocomplete="cc-/);
  assert.doesNotMatch(html, /<form\b/);
  assert.match(app, /window\.location\.assign\(cart\.checkoutUrl\)/);
  assert.match(app, /await refreshCart\(\)/);
});
test("all referenced local modules, CSS and image assets exist", async () => {
  const html = await read("index.html");
  for (const match of html.matchAll(/(?:src|href)="\.\/([^"#]+)"/g)) {
    await access(new URL(`../public/${match[1]}`, import.meta.url));
  }
  for (const asset of ["tote.svg", "bottle.svg", "notebook.svg", "cap.svg"]) {
    await access(new URL(`../public/assets/${asset}`, import.meta.url));
  }
});
test("responsive stylesheet honors reduced motion and visible keyboard focus", async () => {
  const css = await read("styles.css");
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /max-width:760px/);
  assert.match(css, /max-width:480px/);
  assert.match(css, /\[hidden\]/);
});
