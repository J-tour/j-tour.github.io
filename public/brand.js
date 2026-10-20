export function applyBrand(document, brand) {
  document.title = `${brand.name}｜${brand.tagline}`;
  for (const wordmark of document.querySelectorAll(".wordmark")) {
    wordmark.firstChild.textContent = brand.name;
    wordmark.setAttribute("aria-label", `${brand.name} 首頁`);
  }
  document.getElementById("footer-tagline").textContent = brand.tagline;
  document.getElementById("footer-brand").textContent = brand.name;
  // Preserve the default typographic line break; custom taglines remain plain text.
  if (brand.tagline !== "把日常，過成一段旅程。") {
    document.getElementById("hero-title").textContent = brand.tagline;
  }
}
