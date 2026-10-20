import test from "node:test";
import assert from "node:assert/strict";
import { applyBrand } from "../public/brand.js";

function documentStub() {
  const wordmarks = Array.from({ length: 2 }, () => ({
    firstChild: { textContent: "J-TOUR" },
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
  }));
  const nodes = Object.fromEntries(["hero-title", "footer-tagline", "footer-brand"].map(id =>
    [id, { textContent: id === "hero-title" ? "Default rich typographic layout" : "" }]));
  return {
    title: "",
    wordmarks,
    nodes,
    querySelectorAll(selector) {
      assert.equal(selector, ".wordmark");
      return wordmarks;
    },
    getElementById(id) {
      assert.ok(nodes[id], `Unexpected element: ${id}`);
      return nodes[id];
    },
  };
}

test("brand name and tagline populate title, hero, wordmarks, footer and accessible labels", () => {
  const document = documentStub();
  applyBrand(document, { name: "旅途選物", tagline: "一起，看見新的風景。" });
  assert.equal(document.title, "旅途選物｜一起，看見新的風景。");
  assert.equal(document.nodes["hero-title"].textContent, "一起，看見新的風景。");
  assert.equal(document.nodes["footer-tagline"].textContent, "一起，看見新的風景。");
  assert.equal(document.nodes["footer-brand"].textContent, "旅途選物");
  for (const wordmark of document.wordmarks) {
    assert.equal(wordmark.firstChild.textContent, "旅途選物");
    assert.equal(wordmark.attributes["aria-label"], "旅途選物 首頁");
  }
});

test("default tagline preserves decorative typography and custom content is plain text", () => {
  const document = documentStub();
  applyBrand(document, { name: "J-TOUR", tagline: "把日常，過成一段旅程。" });
  assert.equal(document.nodes["hero-title"].textContent, "Default rich typographic layout");
  const markup = "<img src=x onerror=alert(1)>";
  applyBrand(document, { name: markup, tagline: markup });
  assert.equal(document.nodes["hero-title"].textContent, markup);
  assert.equal(document.wordmarks[0].firstChild.textContent, markup);
});
