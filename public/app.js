import rawConfig from "./config.js";
import { StorefrontClient, formatMoney, safeImageUrl } from "./shopify.js";
import { applyBrand } from "./brand.js";

const $ = id => document.getElementById(id);
const node = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};
let storage;
try { storage = window.localStorage; } catch { storage = null; }
let client;
let configError;
try { client = new StorefrontClient(rawConfig, { storage }); }
catch (error) {
  configError = error.message;
  client = new StorefrontClient({});
}
const { config } = client;
const demo = !config.configured;
let products = [];
let pageInfo = { hasNextPage: false, endCursor: null };
let filter = "";
let productsLoading = false;
let productGeneration = 0;
let activeProduct = null;
let cartBusy = false;
let cartReady = demo;
let toastTimer;
let lastFocus;
const demoImages = new Set(["./assets/tote.svg", "./assets/bottle.svg", "./assets/notebook.svg", "./assets/cap.svg"]);

function imageUrl(value) {
  return demo && demoImages.has(value) ? value : safeImageUrl(value) || "./assets/placeholder.svg";
}
function setImage(image, value, alt = "") {
  image.src = imageUrl(value);
  image.alt = alt || "";
  image.onerror = () => {
    image.onerror = null;
    if (!image.src.endsWith("/assets/placeholder.svg")) {
      image.src = "./assets/placeholder.svg";
      image.alt = `${alt || "商品"}（圖片暫時無法載入）`;
    }
  };
}
function notify(message) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  toastTimer = setTimeout(() => { $("toast").textContent = ""; }, 8000);
}
function errorText(error) {
  const messages = error.code === "USER_ERRORS"
    ? error.details?.map(item => item.message).filter(item => typeof item === "string").join("；") : "";
  return `${error.message || "發生未預期的錯誤，請稍後重試。"}${messages ? `\nShopify：${messages}` : ""}`;
}
function openDialog(dialog) {
  if (dialog.open) return;
  lastFocus = document.activeElement;
  dialog.showModal();
  document.body.classList.add("modal-open");
}
function closeDialog(dialog) { dialog.close(); }
for (const id of ["product-dialog", "cart-dialog"]) {
  const dialog = $(id);
  dialog.addEventListener("close", () => {
    if (!$("product-dialog").open && !$("cart-dialog").open) document.body.classList.remove("modal-open");
    if (lastFocus?.isConnected) lastFocus.focus();
  });
  dialog.addEventListener("click", event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
}
$("menu-toggle").addEventListener("click", () => {
  const open = $("menu-toggle").getAttribute("aria-expanded") !== "true";
  $("menu-toggle").setAttribute("aria-expanded", String(open));
  $("menu-toggle").setAttribute("aria-label", open ? "關閉導覽選單" : "開啟導覽選單");
  $("main-nav").classList.toggle("is-open", open);
});
$("main-nav").addEventListener("click", event => {
  if (!event.target.closest("a")) return;
  $("main-nav").classList.remove("is-open");
  $("menu-toggle").setAttribute("aria-expanded", "false");
  $("menu-toggle").setAttribute("aria-label", "開啟導覽選單");
});
$("main-nav").addEventListener("keydown", event => {
  if (event.key === "Escape") {
    $("main-nav").classList.remove("is-open");
    $("menu-toggle").setAttribute("aria-expanded", "false");
    $("menu-toggle").setAttribute("aria-label", "開啟導覽選單");
    $("menu-toggle").focus();
  }
});
$("year").textContent = String(new Date().getFullYear());
applyBrand(document, config.brand);
$("mode-notice").textContent = configError || (demo ? "展示模式 · 品牌與商品皆為示例，無法購買或結帳" : "品牌視覺文案為示例 · 即時商品與安全結帳由 Shopify 提供");
if (configError) $("mode-notice").classList.add("is-error");
$("catalog-note").textContent = demo ? "展示商品 · 非實際販售\n價格、規格與圖片均為示例。" : "與 Shopify 商店同步的商品。\n庫存與最終金額以結帳頁為準。";
$("story-title").textContent = config.brand.storyTitle;
$("story-body").textContent = config.brand.story;
$("contact-hours").textContent = config.brand.contactHours;
if (config.brand.contactEmail) {
  $("contact-email").href = `mailto:${config.brand.contactEmail}`;
  $("contact-email").hidden = false;
  $("contact-unconfigured").hidden = true;
}
for (const [id, url] of [
  ["admin-link", config.adminUrl], ["account-link", config.customerAccountUrl], ["instagram-link", config.brand.instagramUrl],
]) {
  if (url) { $(id).href = url; $(id).hidden = false; }
}
// Shopify pages are deliberately rendered as plain text, never merchant-supplied HTML.
for (const [key, handle] of Object.entries(config.pageHandles)) {
  if (!handle) continue;
  client.page(handle).then(page => {
    if (!page) return;
    if (key === "story") {
      $("story-title").textContent = page.title;
      $("story-body").textContent = page.bodySummary;
    } else {
      $("contact-title").textContent = page.title;
      $("contact-body").textContent = page.bodySummary;
    }
  }).catch(() => { notify("品牌頁面暫時無法載入，目前顯示網站設定中的內容。"); });
}

function renderFilters() {
  const categories = [...new Set(products.map(product => product.productType).filter(Boolean))];
  const buttons = ["", ...categories].map(category => {
    const button = node("button", "filter", category || "全部選物");
    button.type = "button";
    button.setAttribute("aria-pressed", String(filter === category));
    button.addEventListener("click", () => {
      filter = category;
      for (const item of $("filters").children) item.setAttribute("aria-pressed", String(item === button));
      renderProducts();
    });
    return button;
  });
  $("filters").replaceChildren(...buttons);
}

function renderProducts() {
  const query = $("search").value.trim().toLocaleLowerCase("zh-TW");
  const visible = products.filter(product => (!filter || product.productType === filter) &&
    `${product.title} ${product.description} ${product.productType}`.toLocaleLowerCase("zh-TW").includes(query));
  const cards = visible.map(product => {
    const article = node("article", "product-card");
    const imageButton = node("button", "product-image-button");
    imageButton.type = "button";
    imageButton.setAttribute("aria-label", `查看${product.title}詳情`);
    const image = node("img");
    image.loading = "lazy";
    image.width = 600;
    image.height = 750;
    setImage(image, product.featuredImage?.url, product.featuredImage?.altText || product.title);
    const badge = node("span", "product-badge", demo ? "DEMO / 展示商品" : product.availableForSale ? "J-TOUR SELECT" : "暫時售完");
    const arrow = node("span", "card-arrow", "↗");
    arrow.setAttribute("aria-hidden", "true");
    imageButton.append(image, badge, arrow);
    imageButton.addEventListener("click", () => showProduct(product));
    const category = node("p", "product-category", product.productType || "日常選物");
    const title = node("h3");
    const titleButton = node("button", "product-title-button", product.title);
    titleButton.type = "button";
    titleButton.addEventListener("click", () => showProduct(product));
    title.append(titleButton);
    const price = node("p", "product-price", `${formatMoney(product.priceRange?.minVariantPrice)} 起${demo ? "（示例）" : ""}`);
    article.append(imageButton, category, title, price);
    return article;
  });
  $("product-grid").replaceChildren(...cards);
  $("catalog-status").textContent = visible.length
    ? `目前顯示 ${visible.length} 件${demo ? "展示" : ""}選物${pageInfo.hasNextPage ? " · 可載入更多商品，分類與搜尋僅涵蓋已載入項目" : ""}`
    : products.length ? "找不到符合的選物，試試其他分類或關鍵字。" : "目前沒有已發布的商品。";
}

async function loadProducts(append = false) {
  if (productsLoading) return;
  productsLoading = true;
  $("product-grid").setAttribute("aria-busy", "true");
  $("catalog-status").textContent = "正在載入選物…";
  $("load-more").disabled = true;
  $("retry-products").hidden = true;
  try {
    const result = await client.products(append ? pageInfo.endCursor : null);
    if (result.pageInfo.hasNextPage && (!result.pageInfo.endCursor || (append && result.pageInfo.endCursor === pageInfo.endCursor))) {
      throw new Error("商品分頁回應不完整，請重新載入。");
    }
    products = [...new Map((append ? [...products, ...result.nodes] : result.nodes).map(product => [product.id, product])).values()];
    pageInfo = result.pageInfo;
    renderFilters();
    renderProducts();
    $("load-more").hidden = !pageInfo.hasNextPage;
  } catch (error) {
    $("catalog-status").textContent = errorText(error);
    $("retry-products").hidden = false;
  } finally {
    productsLoading = false;
    $("load-more").disabled = false;
    $("product-grid").setAttribute("aria-busy", "false");
  }
}
$("load-more").addEventListener("click", () => loadProducts(true));
$("retry-products").addEventListener("click", () => loadProducts(Boolean(products.length)));
$("search").addEventListener("input", renderProducts);

function selectedVariant() {
  return activeProduct?.variants.nodes.find(variant => variant.id === $("product-variant").value);
}
function renderPurchaseState() {
  const variant = selectedVariant();
  const button = $("add-to-cart");
  button.disabled = demo || cartBusy || !cartReady || client.needsRefresh || !variant?.availableForSale;
  button.textContent = demo ? "展示商品 · 暫不開放購買" : cartBusy ? "購物袋處理中…" : !cartReady || client.needsRefresh ? "請先重新整理購物袋" : !variant?.availableForSale ? "此款式已售完" : "加入購物袋 ＋";
  $("product-variant").disabled = cartBusy;
  $("product-quantity").disabled = cartBusy || demo || !variant?.availableForSale;
  if (variant) {
    $("product-price").textContent = `${formatMoney(variant.price)}${demo ? "（示例價格）" : ""}`;
    setImage($("product-image"), variant.image?.url || activeProduct.featuredImage?.url, variant.image?.altText || activeProduct.title);
  }
}
async function showProduct(preview) {
  const generation = ++productGeneration;
  activeProduct = null;
  $("product-title").textContent = preview.title;
  $("product-description").textContent = "正在載入商品詳情…";
  $("product-price").textContent = formatMoney(preview.priceRange?.minVariantPrice);
  $("product-type").textContent = preview.productType || "日常選物";
  $("product-status").textContent = "";
  $("product-controls").hidden = true;
  $("product-variant").replaceChildren();
  setImage($("product-image"), preview.featuredImage?.url, preview.featuredImage?.altText || preview.title);
  openDialog($("product-dialog"));
  try {
    const product = await client.product(preview.handle);
    if (generation !== productGeneration) return;
    if (!product) throw new Error("此商品目前無法取得，可能已下架。請關閉後重新載入商品。");
    activeProduct = product;
    $("product-title").textContent = product.title;
    $("product-description").textContent = product.description || "詳細商品資訊請洽品牌客服。";
    $("product-quantity").value = "1";
    $("product-variant").replaceChildren(...product.variants.nodes.map(variant => {
      const option = node("option", "", `${variant.title === "Default Title" ? "標準款式" : variant.title}${variant.availableForSale ? "" : " · 已售完"}`);
      option.value = variant.id;
      return option;
    }));
    const available = product.variants.nodes.find(variant => variant.availableForSale);
    if (available) $("product-variant").value = available.id;
    $("product-controls").hidden = false;
    $("product-status").textContent = demo ? "此為視覺與操作展示。商品規格、價格、圖片均為示例，未提供交易。" : !cartReady || client.needsRefresh ? "請先打開購物袋並重新整理，確認內容後再選購。" : "";
    renderPurchaseState();
  } catch (error) { $("product-status").textContent = errorText(error); }
}
$("product-variant").addEventListener("change", renderPurchaseState);
$("close-product").addEventListener("click", () => closeDialog($("product-dialog")));
$("product-dialog").addEventListener("close", () => { productGeneration++; });

function setCartBusy(value) {
  cartBusy = value;
  $("refresh-cart").disabled = value || demo;
  $("cart-lines").setAttribute("aria-busy", String(value));
  for (const button of $("cart-lines").querySelectorAll("button")) {
    button.disabled = value || !cartReady || client.needsRefresh || button.dataset.unavailable === "true";
  }
  $("checkout").hidden = value || client.needsRefresh || !cartReady || !client.cart?.checkoutUrl || !client.cart.totalQuantity;
  renderPurchaseState();
}
function renderCart() {
  const cart = client.cart;
  $("cart-count").textContent = String(cart?.totalQuantity || 0);
  $("cart-summary").hidden = !cart?.lines.nodes.length;
  const lines = cart?.lines.nodes || [];
  if (!lines.length) {
    const empty = node("div", "empty-cart");
    empty.append(node("span", "", "◌"), node("h3", "", demo ? "為下一段旅程，留個位置。" : "購物袋還是空的"),
      node("p", "", demo ? "展示模式不提供加入購物袋或結帳。" : "探索日常選物，找到想一起出發的夥伴。"));
    $("cart-lines").replaceChildren(empty);
  } else {
    $("cart-lines").replaceChildren(...lines.map(line => {
      const variant = line.merchandise || {};
      const title = variant.product?.title || "已無法取得的商品";
      const item = node("article", "cart-line");
      const image = node("img");
      image.width = 78;
      image.height = 100;
      setImage(image, variant.image?.url, title);
      const info = node("div");
      info.append(node("h3", "", title), node("p", "line-variant", `${variant.title === "Default Title" ? "標準款式" : variant.title || ""}${variant.availableForSale ? "" : " · 暫時無法購買，請移除"}`),
        node("p", "line-price", formatMoney(line.cost?.totalAmount)));
      const actions = node("div", "line-actions");
      const stepper = node("div", "stepper");
      const minus = node("button", "", "−");
      minus.type = "button";
      minus.dataset.cartAction = "decrease";
      minus.dataset.lineId = line.id;
      minus.setAttribute("aria-label", `減少${title}數量`);
      minus.addEventListener("click", () => changeCart(() => client.update(line.id, line.quantity - 1)));
      const quantity = node("span", "", String(line.quantity));
      quantity.setAttribute("aria-label", `數量 ${line.quantity}`);
      const plus = node("button", "", "＋");
      plus.type = "button";
      plus.dataset.cartAction = "increase";
      plus.dataset.lineId = line.id;
      plus.setAttribute("aria-label", `增加${title}數量`);
      plus.dataset.unavailable = String(!variant.availableForSale || line.quantity >= 99);
      plus.disabled = plus.dataset.unavailable === "true";
      plus.addEventListener("click", () => changeCart(() => client.update(line.id, line.quantity + 1)));
      stepper.append(minus, quantity, plus);
      const remove = node("button", "remove-line", "移除");
      remove.type = "button";
      remove.dataset.cartAction = "remove";
      remove.dataset.lineId = line.id;
      remove.setAttribute("aria-label", `從購物袋移除${title}`);
      remove.addEventListener("click", () => changeCart(() => client.remove(line.id)));
      actions.append(stepper, remove);
      info.append(actions);
      item.append(image, info);
      return item;
    }));
    $("cart-subtotal").textContent = formatMoney(cart.cost?.subtotalAmount);
    $("cart-total").textContent = formatMoney(cart.cost?.totalAmount);
  }
  if (cart?.checkoutUrl) $("checkout").href = cart.checkoutUrl;
  else $("checkout").removeAttribute("href");
  if (cart?.totalQuantity && !cart.checkoutUrl) $("cart-status").textContent = "Shopify 未提供可驗證的安全結帳網址，已停用結帳。請重新整理或聯絡正式客服。";
  setCartBusy(cartBusy);
}
async function refreshCart() {
  if (cartBusy || demo) return;
  setCartBusy(true);
  $("cart-status").textContent = "正在與 Shopify 同步購物袋…";
  try {
    const oldId = client.cartId;
    await client.getCart();
    cartReady = true;
    $("cart-status").textContent = oldId && !client.cart ? "先前的購物袋已失效，請重新選購。" : "購物袋已與 Shopify 同步。";
    if (!client.storageAvailable || !storage) $("cart-status").textContent += " 瀏覽器未允許儲存，關閉頁面後購物袋可能無法保留。";
  } catch (error) {
    cartReady = false;
    $("cart-status").textContent = errorText(error);
  } finally { cartBusy = false; renderCart(); }
}
async function changeCart(action, added = false) {
  if (cartBusy || demo || !cartReady || client.needsRefresh) return;
  const focused = document.activeElement;
  const focusAction = focused?.dataset.cartAction;
  const focusLine = focused?.dataset.lineId;
  setCartBusy(true);
  $("cart-status").textContent = "正在更新購物袋…";
  $("product-status").textContent = "";
  try {
    await action();
    $("cart-status").textContent = "購物袋已更新，金額與庫存由 Shopify 確認。";
    if (added) {
      $("product-status").textContent = "已加入購物袋。";
      closeDialog($("product-dialog"));
      openDialog($("cart-dialog"));
    }
    notify(added ? "已加入購物袋，準備好下一段旅程。" : "購物袋已更新。");
  } catch (error) {
    const message = errorText(error);
    $("cart-status").textContent = message;
    $("product-status").textContent = message;
    if (client.needsRefresh) cartReady = false;
    notify(message);
  } finally {
    cartBusy = false;
    renderCart();
    if (focusAction && $("cart-dialog").open) {
      const nextFocus = [...$("cart-lines").querySelectorAll("button")].find(button =>
        button.dataset.cartAction === focusAction && button.dataset.lineId === focusLine && !button.disabled);
      (nextFocus || $("refresh-cart")).focus();
    }
  }
}
$("add-to-cart").addEventListener("click", () => {
  const variant = selectedVariant();
  const quantity = Number($("product-quantity").value);
  if (!variant?.availableForSale) return;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    $("product-status").textContent = "請輸入 1–99 的整數數量。";
    $("product-quantity").focus();
    return;
  }
  changeCart(() => client.add(variant.id, quantity), true);
});
$("open-cart").addEventListener("click", () => {
  if ($("product-dialog").open) closeDialog($("product-dialog"));
  openDialog($("cart-dialog"));
  if (!demo) refreshCart();
});
$("close-cart").addEventListener("click", () => closeDialog($("cart-dialog")));
$("continue-shopping").addEventListener("click", () => {
  closeDialog($("cart-dialog"));
  $("collection").scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
});
$("refresh-cart").addEventListener("click", refreshCart);
$("checkout").addEventListener("click", async event => {
  // Re-read immediately before leaving: checkout never trusts locally computed totals.
  event.preventDefault();
  if (cartBusy || !cartReady || client.needsRefresh || demo) return;
  await refreshCart();
  const cart = client.cart;
  if (cartReady && cart?.checkoutUrl && cart.totalQuantity > 0 && cart.lines.nodes.every(line => line.merchandise?.availableForSale)) {
    window.location.assign(cart.checkoutUrl);
  } else if (cart?.totalQuantity) {
    $("cart-status").textContent = "購物袋含無法購買的商品，或安全結帳網址無法驗證。請更新內容後重試。";
  }
});
renderCart();
loadProducts();
if (!demo) refreshCart();
