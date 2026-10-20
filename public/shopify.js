const SHOP_DOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/;
const HANDLE = /^[a-z0-9][a-z0-9-]{0,100}$/;
const CART_ID = /^gid:\/\/shopify\/Cart\/[^\s<>]{1,1900}$/;
const VARIANT_ID = /^gid:\/\/shopify\/ProductVariant\/\d+$/;
const LINE_ID = /^gid:\/\/shopify\/CartLine\/[^\s<>]{1,1900}$/;
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const MONEY = `amount currencyCode`;
const PRODUCT_BASE = `id handle title description productType availableForSale
  featuredImage { url altText width height }
  priceRange { minVariantPrice { ${MONEY} } }`;
const PRODUCT = `${PRODUCT_BASE}
  variants(first: 100) { nodes { id title availableForSale selectedOptions { name value } price { ${MONEY} } image { url altText } } pageInfo { hasNextPage endCursor } }`;
const CART = `id checkoutUrl totalQuantity
  cost { subtotalAmount { ${MONEY} } totalAmount { ${MONEY} } totalTaxAmount { ${MONEY} } }
  lines(first: 100) { nodes { id quantity cost { totalAmount { ${MONEY} } }
    merchandise { ... on ProductVariant { id title availableForSale price { ${MONEY} } image { url altText } product { title handle } } }
  } pageInfo { hasNextPage endCursor } }`;
const ERRORS = `userErrors { field message code }`;
export const STORAGE_KEY = "jtour.shopify.cart.v1";

export class StorefrontError extends Error {
  constructor(message, code = "API", details = []) {
    super(message);
    this.name = "StorefrontError";
    this.code = code;
    this.details = details;
  }
}

function safeHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port ? url : null;
  } catch { return null; }
}

export function safeImageUrl(value) {
  const url = safeHttps(value);
  if (!url || /^(localhost|.*\.localhost)$/.test(url.hostname) ||
    /^[\d.]+$/.test(url.hostname) || url.hostname.includes(":")) return "";
  return url.href;
}

function validCheckoutDomain(value) {
  return typeof value === "string" && HOSTNAME.test(value) &&
    !/(?:^|\.)(?:localhost|local|localdomain|internal)$/.test(value);
}

export function safeCheckoutUrl(value, shopDomain, checkoutDomain = "") {
  const url = safeHttps(value);
  if (!url || !SHOP_DOMAIN.test(shopDomain || "")) return "";
  // Only the canonical shop, Shopify checkout, and an explicitly configured host.
  const allowed = [shopDomain, "checkout.shopify.com"];
  if (validCheckoutDomain(checkoutDomain)) allowed.push(checkoutDomain);
  if (!allowed.includes(url.hostname)) return "";
  if (!/^\/(?:checkouts?\/|cart\/c\/)/.test(url.pathname)) return "";
  return url.href;
}

export function safeAccountUrl(value, shopDomain) {
  const url = safeHttps(value);
  if (!url || url.search || url.hash) return "";
  if (SHOP_DOMAIN.test(shopDomain || "") && url.hostname === shopDomain &&
    /^\/account\/?$/.test(url.pathname)) return url.href;
  if (url.hostname === "shopify.com" && /^\/\d+\/account\/?$/.test(url.pathname)) return url.href;
  return "";
}

export function adminUrl(shopDomain) {
  return SHOP_DOMAIN.test(shopDomain || "")
    ? `https://admin.shopify.com/store/${shopDomain.split(".")[0]}` : "";
}

export function normalizeConfig(raw = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new StorefrontError("商店設定格式不正確。", "CONFIG");
  const shopDomain = typeof raw.shopDomain === "string" ? raw.shopDomain.trim().toLowerCase() : "";
  const token = typeof raw.storefrontAccessToken === "string" ? raw.storefrontAccessToken.trim() : "";
  const apiVersion = raw.apiVersion || "2026-07";
  const configured = Boolean(shopDomain && token);
  if ((shopDomain || token) && (!SHOP_DOMAIN.test(shopDomain) || !token || /[\s\x00-\x1f\x7f]/.test(token) || /^(shpat_|shpca_|shpss_)/i.test(token))) {
    throw new StorefrontError("Shopify 設定不完整或不正確，請檢查商店網域與公開 Storefront 權杖。", "CONFIG");
  }
  if (apiVersion !== "2026-07") throw new StorefrontError("請使用已支援的 Shopify API 版本 2026-07。", "CONFIG");
  const checkoutDomain = typeof raw.checkoutDomain === "string" ? raw.checkoutDomain.trim().toLowerCase() : "";
  if ((raw.checkoutDomain && typeof raw.checkoutDomain !== "string") || (checkoutDomain && !validCheckoutDomain(checkoutDomain))) {
    throw new StorefrontError("結帳網域必須是完整主機名稱，不可包含通訊協定、路徑、連接埠或萬用字元。", "CONFIG");
  }
  const pageHandles = {};
  for (const key of ["story", "contact"]) {
    const handle = raw.pageHandles?.[key] || "";
    if (handle && (typeof handle !== "string" || !HANDLE.test(handle))) throw new StorefrontError("Shopify 頁面 handle 格式不正確。", "CONFIG");
    pageHandles[key] = handle;
  }
  const brand = raw.brand || {};
  const email = typeof brand.contactEmail === "string" && /^[a-z0-9._+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(brand.contactEmail)
    ? brand.contactEmail : "";
  const social = safeHttps(brand.instagramUrl);
  return {
    shopDomain, token, apiVersion, checkoutDomain, configured, pageHandles,
    customerAccountUrl: safeAccountUrl(raw.customerAccountUrl, shopDomain),
    adminUrl: adminUrl(shopDomain),
    brand: {
      name: typeof brand.name === "string" ? brand.name : "J-TOUR",
      tagline: typeof brand.tagline === "string" ? brand.tagline : "把日常，過成一段旅程。",
      storyTitle: typeof brand.storyTitle === "string" ? brand.storyTitle : "讓好奇心，帶你出發。",
      story: typeof brand.story === "string" ? brand.story : "",
      contactEmail: email,
      contactHours: typeof brand.contactHours === "string" ? brand.contactHours : "",
      instagramUrl: social && ["www.instagram.com", "instagram.com"].includes(social.hostname) ? social.href : "",
    },
  };
}

export function formatMoney(money, locale = "zh-TW") {
  if (!money || !/^[A-Z]{3}$/.test(money.currencyCode) ||
    !/^\d+(?:\.\d+)?$/.test(String(money.amount)) || !Number.isFinite(Number(money.amount))) return "價格暫時無法取得";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: money.currencyCode, currencyDisplay: "code" }).format(Number(money.amount));
  } catch { return "價格暫時無法取得"; }
}

export const DEMO_PRODUCTS = [
  { id: "demo-1", handle: "weekend-bag", title: "週末・輕旅托特包", productType: "隨行包袋", description: "【展示商品，非實際販售】把一本書、一件薄外套，和說走就走的心情裝進去。棉質帆布外觀與寬版提帶，為城市裡的小旅行保留餘裕。材質、尺寸與價格均為示例。", image: "./assets/tote.svg", price: "1680", kind: "bag" },
  { id: "demo-2", handle: "daily-bottle", title: "漫步・隨行水瓶", productType: "日常器物", description: "【展示商品，非實際販售】在趕路之間，留一口慢下來的時間。霧面色調與簡潔輪廓，安靜融入每一天。材質、容量與價格均為示例。", image: "./assets/bottle.svg", price: "880", kind: "bottle" },
  { id: "demo-3", handle: "travel-notebook", title: "途中・旅人手記", productType: "旅途小物", description: "【展示商品，非實際販售】記下路邊的小店、窗外的山，還有那些不想忘記的片刻。讓紙頁，替日常留下座標。規格與價格均為示例。", image: "./assets/notebook.svg", price: "420", kind: "book" },
  { id: "demo-4", handle: "soft-cap", title: "晴日・輕量帽", productType: "旅途小物", description: "【展示商品，非實際販售】替晴朗的日子添一點陰影。柔和的米沙色，陪你沿著喜歡的方向前進。材質、尺寸與價格均為示例。", image: "./assets/cap.svg", price: "680", kind: "cap" },
].map(item => ({
  ...item, availableForSale: true,
  featuredImage: { url: item.image, altText: `${item.title}示意插畫` },
  priceRange: { minVariantPrice: { amount: item.price, currencyCode: "TWD" } },
  variants: { nodes: [{ id: `${item.id}-variant`, title: "自然色（示例）", availableForSale: true, price: { amount: item.price, currencyCode: "TWD" }, selectedOptions: [] }], pageInfo: { hasNextPage: false, endCursor: null } },
}));

function storageRead(storage, shopDomain) {
  try {
    const value = JSON.parse(storage?.getItem(STORAGE_KEY) || "null");
    if (value && value.shopDomain === shopDomain && typeof value.id === "string" && CART_ID.test(value.id)) return value.id;
    storage?.removeItem(STORAGE_KEY);
  } catch {
    try { storage?.removeItem(STORAGE_KEY); } catch { /* Storage may be disabled. */ }
  }
  return null;
}

export class StorefrontClient {
  constructor(rawConfig, { fetch: fetchImpl = globalThis.fetch, storage = null } = {}) {
    this.config = normalizeConfig(rawConfig);
    // Native window.fetch requires its Window receiver when called as a method.
    this.fetch = fetchImpl.bind(globalThis);
    this.storage = storage;
    this.cartId = this.config.configured ? storageRead(storage, this.config.shopDomain) : null;
    this.cart = null;
    this.busy = false;
    this.readingCart = false;
    this.needsRefresh = false;
    this.storageAvailable = true;
  }

  persist(id) {
    this.cartId = id;
    try {
      if (id) this.storage?.setItem(STORAGE_KEY, JSON.stringify({ id, shopDomain: this.config.shopDomain }));
      else this.storage?.removeItem(STORAGE_KEY);
    } catch { this.storageAvailable = false; }
  }

  async request(query, variables = {}, mutation = false) {
    if (!this.config.configured) throw new StorefrontError("目前為展示模式，尚未連接 Shopify。", "DEMO");
    let response;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      response = await this.fetch(`https://${this.config.shopDomain}/api/${this.config.apiVersion}/graphql.json`, {
        method: "POST", mode: "cors", credentials: "omit", redirect: "error",
        headers: { "Content-Type": "application/json", "X-Shopify-Storefront-Access-Token": this.config.token },
        body: JSON.stringify({ query, variables }), signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      if (result.errors?.length) {
        throw new StorefrontError("Shopify 暫時無法完成請求，請稍後再試。", mutation ? "MUTATION_UNCERTAIN" : "GRAPHQL", result.errors);
      }
      if (!result.data || typeof result.data !== "object") throw new Error("Invalid response");
      return result.data;
    } catch (error) {
      if (error instanceof StorefrontError) throw error;
      throw new StorefrontError(
        mutation ? "連線中斷，無法確認購物袋是否已更新。請先重新整理購物袋，確認內容後再操作；系統不會自動重送。" : "目前無法連接商店，請檢查網路後重試。",
        mutation ? "MUTATION_UNCERTAIN" : "NETWORK",
      );
    } finally { clearTimeout(timer); }
  }

  async products(after = null) {
    if (!this.config.configured) return { nodes: DEMO_PRODUCTS, pageInfo: { hasNextPage: false, endCursor: null } };
    const data = await this.request(`query Products($after: String) { products(first: 8, after: $after, sortKey: BEST_SELLING) { nodes { ${PRODUCT_BASE} } pageInfo { hasNextPage endCursor } } }`, { after });
    if (!Array.isArray(data.products?.nodes) || !data.products.pageInfo) throw new StorefrontError("商品資料不完整，請稍後重試。", "RESPONSE");
    return data.products;
  }

  async product(handle) {
    if (!this.config.configured) return DEMO_PRODUCTS.find(item => item.handle === handle) || null;
    if (!HANDLE.test(handle)) throw new StorefrontError("商品網址不正確。", "INPUT");
    const data = await this.request(`query Product($handle: String!) { product(handle: $handle) { ${PRODUCT} } }`, { handle });
    const product = data.product;
    if (!product) return null;
    if (!Array.isArray(product.variants?.nodes) || !product.variants.pageInfo) throw new StorefrontError("商品選項資料不完整，請稍後重試。", "RESPONSE");
    let pageInfo = product.variants.pageInfo;
    const seen = new Set();
    while (pageInfo.hasNextPage) {
      if (!pageInfo.endCursor || seen.has(pageInfo.endCursor)) throw new StorefrontError("商品選項分頁資料不完整。", "RESPONSE");
      seen.add(pageInfo.endCursor);
      const next = await this.request(`query Variants($handle: String!, $after: String!) { product(handle: $handle) { variants(first: 100, after: $after) { nodes { id title availableForSale selectedOptions { name value } price { ${MONEY} } image { url altText } } pageInfo { hasNextPage endCursor } } } }`, { handle, after: pageInfo.endCursor });
      if (!next.product?.variants?.pageInfo || !Array.isArray(next.product.variants.nodes)) throw new StorefrontError("商品選項無法取得。", "RESPONSE");
      product.variants.nodes.push(...next.product.variants.nodes);
      pageInfo = next.product.variants.pageInfo;
    }
    product.variants.pageInfo = pageInfo;
    return product;
  }

  async page(handle) {
    if (!this.config.configured || !handle) return null;
    if (!HANDLE.test(handle)) throw new StorefrontError("頁面網址不正確。", "INPUT");
    const data = await this.request(`query Page($handle: String!) { page(handle: $handle) { title bodySummary } }`, { handle });
    // bodySummary is plain text. Never render Shopify HTML as markup.
    return data.page || null;
  }

  async acceptCart(cart) {
    if (!cart || !CART_ID.test(cart.id) || !Array.isArray(cart.lines?.nodes)) throw new StorefrontError("購物袋回應不完整，請重新整理確認。", "MUTATION_UNCERTAIN");
    const seen = new Set();
    let info = cart.lines.pageInfo;
    while (info?.hasNextPage) {
      if (!info.endCursor || seen.has(info.endCursor)) throw new StorefrontError("購物袋分頁資料不完整，請重新整理確認。", "MUTATION_UNCERTAIN");
      seen.add(info.endCursor);
      const data = await this.request(`query CartLines($id: ID!, $after: String!) { cart(id: $id) { lines(first: 100, after: $after) { nodes { id quantity cost { totalAmount { ${MONEY} } } merchandise { ... on ProductVariant { id title availableForSale price { ${MONEY} } image { url altText } product { title handle } } } } pageInfo { hasNextPage endCursor } } } }`, { id: cart.id, after: info.endCursor });
      if (!data.cart?.lines?.pageInfo || !Array.isArray(data.cart.lines.nodes)) throw new StorefrontError("購物袋無法完整載入，請重新整理確認。", "MUTATION_UNCERTAIN");
      cart.lines.nodes.push(...data.cart.lines.nodes);
      info = data.cart.lines.pageInfo;
    }
    cart.lines.pageInfo = info;
    cart.checkoutUrl = safeCheckoutUrl(cart.checkoutUrl, this.config.shopDomain, this.config.checkoutDomain);
    this.cart = cart;
    this.persist(cart.id);
    return cart;
  }

  async acceptMutationCart(cart) {
    // Shopify may have committed the mutation before a follow-up read fails.
    if (CART_ID.test(cart?.id)) this.persist(cart.id);
    try {
      return await this.acceptCart(cart);
    } catch (error) {
      this.needsRefresh = true;
      throw error;
    }
  }

  async getCart() {
    if (this.busy || this.readingCart) throw new StorefrontError("購物袋正在更新，請稍候。", "BUSY");
    this.readingCart = true;
    try {
      if (!this.config.configured || !this.cartId) {
        this.needsRefresh = false;
        return null;
      }
      const data = await this.request(`query Cart($id: ID!) { cart(id: $id) { ${CART} } }`, { id: this.cartId });
      if (!data.cart) {
        this.cart = null;
        this.persist(null);
        this.needsRefresh = false;
        return null;
      }
      const cart = await this.acceptCart(data.cart);
      this.needsRefresh = false;
      return cart;
    } finally {
      this.readingCart = false;
    }
  }

  async mutate(operation, variables) {
    if (this.busy || this.readingCart) throw new StorefrontError("購物袋正在更新，請稍候。", "BUSY");
    if (!this.config.configured) throw new StorefrontError("展示模式無法加入購物袋或結帳。", "DEMO");
    if (this.needsRefresh) throw new StorefrontError("上次更新結果尚未確認，請先重新整理購物袋。", "REFRESH_REQUIRED");
    this.busy = true;
    try {
      const operations = {
        cartCreate: `mutation Create($lines: [CartLineInput!]!) { cartCreate(input: { lines: $lines }) { cart { ${CART} } ${ERRORS} } }`,
        cartLinesAdd: `mutation Add($cartId: ID!, $lines: [CartLineInput!]!) { cartLinesAdd(cartId: $cartId, lines: $lines) { cart { ${CART} } ${ERRORS} } }`,
        cartLinesUpdate: `mutation Update($cartId: ID!, $lines: [CartLineUpdateInput!]!) { cartLinesUpdate(cartId: $cartId, lines: $lines) { cart { ${CART} } ${ERRORS} } }`,
        cartLinesRemove: `mutation Remove($cartId: ID!, $lineIds: [ID!]!) { cartLinesRemove(cartId: $cartId, lineIds: $lineIds) { cart { ${CART} } ${ERRORS} } }`,
      };
      if (!operations[operation]) throw new StorefrontError("不支援的購物袋操作。", "INPUT");
      const data = await this.request(operations[operation], variables, true);
      const payload = data[operation];
      if (!payload) throw new StorefrontError("無法確認購物袋是否已更新，請重新整理確認。", "MUTATION_UNCERTAIN");
      if (payload.userErrors?.length) {
        const stale = !payload.cart && payload.userErrors.some(error =>
          /cart.*(?:not found|does not exist|expired|invalid)|(?:invalid|expired).*cart/i.test(error.message || "") ||
          (["INVALID", "NOT_FOUND"].includes(error.code) && error.field?.includes("cartId")));
        // Preserve a returned cart even when a subset of lines was rejected.
        if (payload.cart) await this.acceptMutationCart(payload.cart);
        if (stale) { this.cart = null; this.persist(null); }
        throw new StorefrontError(stale ? "購物袋已失效，請重新選購。未自動重送商品。" : "商品或數量無法更新，請確認庫存與購物袋內容後再試。", stale ? "STALE_CART" : "USER_ERRORS", payload.userErrors);
      }
      if (!payload.cart) {
        this.cart = null;
        this.persist(null);
        throw new StorefrontError("購物袋已失效，請重新選購。未自動重送商品。", "STALE_CART");
      }
      return await this.acceptMutationCart(payload.cart);
    } catch (error) {
      if (error.code === "MUTATION_UNCERTAIN" || error.code === "NETWORK") this.needsRefresh = true;
      throw error;
    } finally { this.busy = false; }
  }

  add(variantId, quantity = 1) {
    if (!VARIANT_ID.test(variantId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return Promise.reject(new StorefrontError("請選擇有效商品與 1–99 件的數量。", "INPUT"));
    }
    const lines = [{ merchandiseId: variantId, quantity }];
    return this.cartId ? this.mutate("cartLinesAdd", { cartId: this.cartId, lines }) : this.mutate("cartCreate", { lines });
  }

  update(lineId, quantity) {
    if (!this.cartId || !LINE_ID.test(lineId) || !Number.isInteger(quantity) || quantity < 0 || quantity > 99) {
      return Promise.reject(new StorefrontError("請選擇有效購物袋品項與 0–99 件的數量。", "INPUT"));
    }
    return quantity === 0 ? this.remove(lineId) : this.mutate("cartLinesUpdate", { cartId: this.cartId, lines: [{ id: lineId, quantity }] });
  }

  remove(lineId) {
    if (!this.cartId || !LINE_ID.test(lineId)) return Promise.reject(new StorefrontError("購物袋品項不正確，請重新整理。", "INPUT"));
    return this.mutate("cartLinesRemove", { cartId: this.cartId, lineIds: [lineId] });
  }
}
