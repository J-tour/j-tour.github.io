import test from "node:test";
import assert from "node:assert/strict";
import {
  StorefrontClient, StorefrontError, normalizeConfig, safeImageUrl, safeCheckoutUrl,
  safeAccountUrl, adminUrl, formatMoney, DEMO_PRODUCTS, STORAGE_KEY,
} from "../public/shopify.js";

const config = { shopDomain: "jtour-example.myshopify.com", storefrontAccessToken: "public-example-token", apiVersion: "2026-07" };
const cartId = "gid://shopify/Cart/example?key=example";
const variantId = "gid://shopify/ProductVariant/123";
const lineId = "gid://shopify/CartLine/example?cart=example";
const money = amount => ({ amount, currencyCode: "TWD" });
function cart(overrides = {}) {
  return {
    id: cartId,
    checkoutUrl: "https://jtour-example.myshopify.com/checkouts/co/example?key=example",
    totalQuantity: 2,
    cost: { subtotalAmount: money("1512.00"), totalAmount: money("1587.60"), totalTaxAmount: money("75.60") },
    lines: {
      nodes: [{
        id: lineId, quantity: 2, cost: { totalAmount: money("1512.00") },
        merchandise: { id: variantId, title: "自然色", availableForSale: true, price: money("880.00"), product: { title: "隨行水瓶", handle: "bottle" } },
      }],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
    ...overrides,
  };
}
function memoryStorage(initial = null) {
  const map = new Map(initial ? [[STORAGE_KEY, initial]] : []);
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: key => map.delete(key),
    map,
  };
}
function mockFetch(...responses) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, ...options, parsedBody: JSON.parse(options.body) });
    const response = responses.shift();
    if (response instanceof Error) throw response;
    if (typeof response === "function") return response(url, options);
    if (!response) throw new Error("Unexpected request");
    return { ok: true, status: 200, json: async () => response };
  };
  return { fetch, calls };
}
function storedCart() { return JSON.stringify({ id: cartId, shopDomain: config.shopDomain }); }
function clientWithCart(mock, storage = memoryStorage(storedCart())) {
  return new StorefrontClient(config, { fetch: mock.fetch, storage });
}
const isCode = code => error => error instanceof StorefrontError && error.code === code;

test("config defaults to explicit demo; valid public configuration is normalized", () => {
  assert.equal(normalizeConfig().configured, false);
  const value = normalizeConfig({ ...config, shopDomain: " JTOUR-EXAMPLE.myshopify.com ", brand: { contactEmail: "hello@example.com", instagramUrl: "https://www.instagram.com/example/" } });
  assert.equal(value.shopDomain, config.shopDomain);
  assert.equal(value.configured, true);
  assert.equal(value.apiVersion, "2026-07");
  assert.equal(value.brand.contactEmail, "hello@example.com");
  assert.equal(value.brand.instagramUrl, "https://www.instagram.com/example/");
  assert.equal(value.adminUrl, "https://admin.shopify.com/store/jtour-example");
});
test("config rejects incomplete, hostile, unsupported, private-token settings", () => {
  for (const raw of [
    null, [], { shopDomain: config.shopDomain }, { storefrontAccessToken: "example" },
    { ...config, shopDomain: "https://jtour-example.myshopify.com" },
    { ...config, shopDomain: "jtour-example.myshopify.com.evil.example" },
    { ...config, shopDomain: "-example.myshopify.com" },
    { ...config, shopDomain: "merchant.example" },
    { ...config, storefrontAccessToken: "example\nheader" },
    { ...config, storefrontAccessToken: "shpat_example" },
    { ...config, storefrontAccessToken: "shpss_example" },
    { ...config, apiVersion: "2025-01" },
    { ...config, pageHandles: { story: '../bad' } },
  ]) assert.throws(() => normalizeConfig(raw), isCode("CONFIG"));
});
test("public brand fields do not create email/social injection links", () => {
  const value = normalizeConfig({ brand: { contactEmail: "evil@example.com\nBcc:other@example.com", instagramUrl: "https://instagram.com.evil.example/"} });
  assert.equal(value.brand.contactEmail, "");
  assert.equal(value.brand.instagramUrl, "");
  assert.equal(normalizeConfig({ customerAccountUrl: "javascript:alert(1)" }).customerAccountUrl, "");
  assert.equal(normalizeConfig({ brand: { contactEmail: "hello@example.com?bcc=evil%40example.com" } }).brand.contactEmail, "");
});
test("checkout host and path allowlist blocks open redirects and deceptive hosts", () => {
  assert.equal(safeCheckoutUrl(cart().checkoutUrl, config.shopDomain), cart().checkoutUrl);
  assert.equal(safeCheckoutUrl("https://checkout.shopify.com/checkouts/example", config.shopDomain), "https://checkout.shopify.com/checkouts/example");
  assert.equal(safeCheckoutUrl("https://jtour-example.myshopify.com/cart/c/example", config.shopDomain), "https://jtour-example.myshopify.com/cart/c/example");
  for (const value of [
    "javascript:alert(1)", "//jtour-example.myshopify.com/checkouts/example",
    "http://jtour-example.myshopify.com/checkouts/example",
    "https://jtour-example.myshopify.com.evil.example/checkouts/a",
    "https://another-shop.myshopify.com/checkouts/a",
    "https://shopify.com/checkouts/a", "https://checkout.shopify.com.evil.example/checkouts/a",
    "https://untrusted-user@jtour-example.myshopify.com/checkouts/a",
    "https://jtour-example.myshopify.com:444/checkouts/a",
    "https://jtour-example.myshopify.com/account", "https://jtour-example.myshopify.com/",
  ]) assert.equal(safeCheckoutUrl(value, config.shopDomain), "", value);
  assert.equal(safeCheckoutUrl(cart().checkoutUrl, ""), "");
});
test("images require HTTPS, without credentials, ports or local addresses", () => {
  assert.equal(safeImageUrl("https://cdn.shopify.com/s/files/image.jpg"), "https://cdn.shopify.com/s/files/image.jpg");
  for (const value of ["http://cdn.shopify.com/a", "data:image/svg+xml,a", "javascript:a", "/local.svg", undefined, "https://untrusted-user@cdn.shopify.com/a", "https://localhost/a", "https://127.0.0.1/a", "https://[::1]/a", "https://cdn.shopify.com:8443/a"]) {
    assert.equal(safeImageUrl(value), "", String(value));
  }
});
test("admin points only at official Shopify and hosted account URLs are narrow", () => {
  assert.equal(adminUrl(config.shopDomain), "https://admin.shopify.com/store/jtour-example");
  assert.equal(adminUrl("evil.example"), "");
  assert.equal(safeAccountUrl(`https://${config.shopDomain}/account`, config.shopDomain), `https://${config.shopDomain}/account`);
  assert.equal(safeAccountUrl("https://shopify.com/123456789/account", config.shopDomain), "https://shopify.com/123456789/account");
  for (const value of ["https://evil.example/account", "https://shopify.com.evil.example/123/account", "https://shopify.com/123/account?redirect=evil", `https://${config.shopDomain}/account#x`, `https://${config.shopDomain}/account/login`, "http://shopify.com/123/account"]) {
    assert.equal(safeAccountUrl(value, config.shopDomain), "", value);
  }
});
test("money uses authoritative currency, rejects malformed values, never assumes TWD", () => {
  assert.match(formatMoney({ amount: "1234.50", currencyCode: "USD" }), /USD.*1,234\.50/);
  assert.match(formatMoney({ amount: "1234", currencyCode: "JPY" }), /JPY.*1,234/);
  assert.match(formatMoney(money("0")), /TWD.*0/);
  for (const value of [null, {}, money("NaN"), money("Infinity"), money("-10"), { amount: "1", currencyCode: "<bad>" }]) assert.equal(formatMoney(value), "價格暫時無法取得");
});
test("demo products are clearly examples and never call fetch or create cart", async () => {
  let calls = 0;
  const client = new StorefrontClient({}, { fetch: async () => { calls++; throw new Error("Should not fetch"); } });
  const result = await client.products();
  assert.equal(result.nodes.length, 4);
  assert.equal(result.pageInfo.hasNextPage, false);
  assert.ok(result.nodes.every(item => item.description.includes("展示商品，非實際販售")));
  assert.equal(await client.product(DEMO_PRODUCTS[0].handle), DEMO_PRODUCTS[0]);
  assert.equal(await client.product("missing"), null);
  assert.equal(await client.getCart(), null);
  assert.equal(await client.page("story"), null);
  await assert.rejects(client.add(variantId), isCode("DEMO"));
  assert.equal(calls, 0);
  assert.equal(client.cart, null);
});
test("catalog pagination uses public token with credentials omitted and no automatic redirects", async () => {
  const mock = mockFetch({ data: { products: { nodes: [], pageInfo: { hasNextPage: true, endCursor: "next" } } } });
  const client = new StorefrontClient(config, { fetch: mock.fetch });
  const result = await client.products("cursor-before");
  assert.equal(result.pageInfo.endCursor, "next");
  assert.equal(mock.calls[0].url, "https://jtour-example.myshopify.com/api/2026-07/graphql.json");
  assert.equal(mock.calls[0].headers["X-Shopify-Storefront-Access-Token"], config.storefrontAccessToken);
  assert.equal(mock.calls[0].credentials, "omit");
  assert.equal(mock.calls[0].redirect, "error");
  assert.deepEqual(mock.calls[0].parsedBody.variables, { after: "cursor-before" });
});
test("fetch keeps the global receiver required by native browser Window.fetch", async () => {
  const client = new StorefrontClient(config, {
    fetch: function () {
      assert.equal(this, globalThis);
      return Promise.resolve({ ok: true, json: async () => ({ data: { products: { nodes: [], pageInfo: { hasNextPage: false } } } }) });
    },
  });
  assert.equal((await client.products()).nodes.length, 0);
});
test("all variant pages are fetched and their availability and individual prices preserved", async () => {
  const first = { id: variantId, title: "A", availableForSale: false, price: money("500") };
  const second = { id: "gid://shopify/ProductVariant/456", title: "B", availableForSale: true, price: money("900") };
  const mock = mockFetch(
    { data: { product: { handle: "test", variants: { nodes: [first], pageInfo: { hasNextPage: true, endCursor: "v2" } } } } },
    { data: { product: { variants: { nodes: [second], pageInfo: { hasNextPage: false, endCursor: null } } } } },
  );
  const product = await new StorefrontClient(config, { fetch: mock.fetch }).product("test");
  assert.deepEqual(product.variants.nodes, [first, second]);
  assert.deepEqual(mock.calls[1].parsedBody.variables, { handle: "test", after: "v2" });
  assert.equal(product.variants.pageInfo.hasNextPage, false);
});
test("variant pagination detects repeated or missing cursors", async () => {
  const product = { variants: { nodes: [], pageInfo: { hasNextPage: true, endCursor: "repeat" } } };
  const mock = mockFetch({ data: { product } }, { data: { product: { variants: { nodes: [], pageInfo: { hasNextPage: true, endCursor: "repeat" } } } } });
  await assert.rejects(new StorefrontClient(config, { fetch: mock.fetch }).product("test"), isCode("RESPONSE"));
  assert.equal(mock.calls.length, 2);
});
test("unpublished products return null and malformed variant responses fail safely", async () => {
  let mock = mockFetch({ data: { product: null } });
  assert.equal(await new StorefrontClient(config, { fetch: mock.fetch }).product("unpublished"), null);
  mock = mockFetch({ data: { product: { variants: null } } });
  await assert.rejects(new StorefrontClient(config, { fetch: mock.fetch }).product("broken"), isCode("RESPONSE"));
});
test("page content uses plain-text bodySummary, validates handle, tolerates unpublished page", async () => {
  const mock = mockFetch({ data: { page: { title: "Story", bodySummary: "<script>plain text</script>" } } }, { data: { page: null } });
  const client = new StorefrontClient(config, { fetch: mock.fetch });
  assert.equal((await client.page("story")).bodySummary, "<script>plain text</script>");
  assert.match(mock.calls[0].parsedBody.query, /bodySummary/);
  assert.equal(await client.page("missing"), null);
  await assert.rejects(client.page("../script"), isCode("INPUT"));
  await assert.rejects(client.product("../script"), isCode("INPUT"));
});
test("network, HTTP, JSON, GraphQL and malformed catalog responses fail safely", async () => {
  for (const response of [
    new Error("offline"),
    () => ({ ok: false, status: 503 }),
    () => ({ ok: true, json: async () => { throw new Error("bad JSON"); } }),
    { unexpected: true },
  ]) {
    const mock = mockFetch(response);
    await assert.rejects(new StorefrontClient(config, { fetch: mock.fetch }).products(), isCode("NETWORK"));
    assert.equal(mock.calls.length, 1);
  }
  let mock = mockFetch({ errors: [{ message: "Access denied" }] });
  await assert.rejects(new StorefrontClient(config, { fetch: mock.fetch }).products(), isCode("GRAPHQL"));
  mock = mockFetch({ data: { products: null } });
  await assert.rejects(new StorefrontClient(config, { fetch: mock.fetch }).products(), isCode("RESPONSE"));
});
test("corrupt, foreign-shop, or invalid stored cart data is discarded safely", () => {
  for (const value of ["{broken", '"string"', "123", "null", JSON.stringify({ id: "javascript:bad", shopDomain: config.shopDomain }), JSON.stringify({ id: cartId, shopDomain: "other.myshopify.com" }), JSON.stringify({ id: cartId })]) {
    const storage = memoryStorage(value);
    const client = new StorefrontClient(config, { storage });
    assert.equal(client.cartId, null, value);
    assert.equal(storage.map.has(STORAGE_KEY), false, value);
  }
  const blockedStorage = { getItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  assert.doesNotThrow(() => new StorefrontClient(config, { storage: blockedStorage }));
});
test("create sends only merchandise IDs and quantities; returned cart owns totals and persistence", async () => {
  const mock = mockFetch({ data: { cartCreate: { cart: cart(), userErrors: [] } } });
  const storage = memoryStorage();
  const client = new StorefrontClient(config, { fetch: mock.fetch, storage });
  const result = await client.add(variantId, 2);
  assert.deepEqual(mock.calls[0].parsedBody.variables, { lines: [{ merchandiseId: variantId, quantity: 2 }] });
  assert.equal(result.cost.subtotalAmount.amount, "1512.00"); // Not 880 × 2.
  assert.equal(result.cost.totalAmount.amount, "1587.60");
  assert.deepEqual(JSON.parse(storage.map.get(STORAGE_KEY)), { id: cartId, shopDomain: config.shopDomain });
  assert.equal(client.cartId, cartId);
  assert.equal(client.busy, false);
});
test("existing cart add, update and remove use the correct Shopify mutations", async () => {
  const mock = mockFetch(
    { data: { cartLinesAdd: { cart: cart(), userErrors: [] } } },
    { data: { cartLinesUpdate: { cart: cart(), userErrors: [] } } },
    { data: { cartLinesRemove: { cart: cart({ totalQuantity: 0, lines: { nodes: [], pageInfo: { hasNextPage: false } } }), userErrors: [] } } },
  );
  const client = clientWithCart(mock);
  await client.add(variantId, 2);
  await client.update(lineId, 1);
  await client.update(lineId, 0);
  assert.deepEqual(mock.calls[0].parsedBody.variables, { cartId, lines: [{ merchandiseId: variantId, quantity: 2 }] });
  assert.deepEqual(mock.calls[1].parsedBody.variables, { cartId, lines: [{ id: lineId, quantity: 1 }] });
  assert.deepEqual(mock.calls[2].parsedBody.variables, { cartId, lineIds: [lineId] });
  assert.match(mock.calls[2].parsedBody.query, /cartLinesRemove/);
  assert.equal(client.cart.totalQuantity, 0);
});
test("invalid quantities and identifiers never trigger a request", async () => {
  const mock = mockFetch();
  const client = clientWithCart(mock);
  for (const qty of [0, -1, 1.2, 100, "2", NaN]) await assert.rejects(client.add(variantId, qty), isCode("INPUT"));
  for (const qty of [-1, 100, NaN, "1"]) await assert.rejects(client.update(lineId, qty), isCode("INPUT"));
  await assert.rejects(client.add("gid://shopify/Product/1"), isCode("INPUT"));
  await assert.rejects(client.update("invalid", 1), isCode("INPUT"));
  await assert.rejects(client.remove("invalid"), isCode("INPUT"));
  assert.equal(mock.calls.length, 0);
});
test("duplicate concurrent mutations are rejected without a second request", async () => {
  let resolve;
  const mock = mockFetch(() => new Promise(done => { resolve = done; }));
  const client = new StorefrontClient(config, { fetch: mock.fetch });
  const first = client.add(variantId);
  await assert.rejects(client.add(variantId), isCode("BUSY"));
  await assert.rejects(client.getCart(), isCode("BUSY"));
  assert.equal(mock.calls.length, 1);
  resolve({ ok: true, json: async () => ({ data: { cartCreate: { cart: cart(), userErrors: [] } } }) });
  await first;
  assert.equal(client.busy, false);
});
test("cart reads cannot race mutations or other cart reads", async () => {
  let resolve;
  const mock = mockFetch(() => new Promise(done => { resolve = done; }));
  const client = clientWithCart(mock);
  const read = client.getCart();
  await assert.rejects(client.add(variantId), isCode("BUSY"));
  await assert.rejects(client.getCart(), isCode("BUSY"));
  resolve({ ok: true, json: async () => ({ data: { cart: cart() } }) });
  await read;
  assert.equal(client.readingCart, false);
});
test("ambiguous mutations are never retried; further writes require successful explicit refresh", async () => {
  const mock = mockFetch(new Error("connection lost after server accepted"), { data: { cart: cart() } }, { data: { cartLinesAdd: { cart: cart(), userErrors: [] } } });
  const client = clientWithCart(mock);
  await assert.rejects(client.add(variantId), isCode("MUTATION_UNCERTAIN"));
  assert.equal(mock.calls.length, 1);
  assert.equal(client.needsRefresh, true);
  await assert.rejects(client.add(variantId), isCode("REFRESH_REQUIRED"));
  assert.equal(mock.calls.length, 1);
  await client.getCart();
  assert.equal(client.needsRefresh, false);
  await client.add(variantId);
  assert.equal(mock.calls.length, 3);
});
test("ambiguous cartCreate does not automatically create another cart", async () => {
  const mock = mockFetch(new Error("offline"));
  const client = new StorefrontClient(config, { fetch: mock.fetch });
  await assert.rejects(client.add(variantId), isCode("MUTATION_UNCERTAIN"));
  await assert.rejects(client.add(variantId), isCode("REFRESH_REQUIRED"));
  assert.equal(mock.calls.length, 1);
  assert.equal(client.cartId, null);
  assert.equal(await client.getCart(), null);
  assert.equal(mock.calls.length, 1);
});
test("GraphQL mutation errors and incomplete responses also lock writes until refresh", async () => {
  for (const result of [{ errors: [{ message: "Internal error" }] }, { data: {} }, { data: { cartCreate: { cart: { id: cartId }, userErrors: [] } } }]) {
    const mock = mockFetch(result);
    const client = new StorefrontClient(config, { fetch: mock.fetch });
    await assert.rejects(client.add(variantId), isCode("MUTATION_UNCERTAIN"));
    assert.equal(client.needsRefresh, true);
    await assert.rejects(client.add(variantId), isCode("REFRESH_REQUIRED"));
    assert.equal(mock.calls.length, 1);
  }
});
test("HTTP and invalid JSON mutation responses are ambiguous and are not retried", async () => {
  for (const response of [
    () => ({ ok: false, status: 502 }),
    () => ({ ok: true, json: async () => { throw new Error("truncated JSON"); } }),
  ]) {
    const mock = mockFetch(response);
    const client = clientWithCart(mock);
    await assert.rejects(client.update(lineId, 1), isCode("MUTATION_UNCERTAIN"));
    await assert.rejects(client.remove(lineId), isCode("REFRESH_REQUIRED"));
    assert.equal(mock.calls.length, 1);
  }
});
test("userErrors preserve server messages and authoritative partial cart without retry", async () => {
  const errors = [{ field: ["lines", "0", "quantity"], code: "INVALID", message: "Only one item is available." }];
  const authoritative = cart({ totalQuantity: 1 });
  const mock = mockFetch({ data: { cartLinesAdd: { cart: authoritative, userErrors: errors } } });
  const client = clientWithCart(mock);
  await assert.rejects(client.add(variantId, 2), error => {
    assert.equal(error.code, "USER_ERRORS");
    assert.deepEqual(error.details, errors);
    return true;
  });
  assert.equal(client.cart.totalQuantity, 1);
  assert.equal(client.busy, false);
  assert.equal(mock.calls.length, 1);
});
test("expired cart read clears storage, and next explicit add creates a new cart", async () => {
  const mock = mockFetch({ data: { cart: null } }, { data: { cartCreate: { cart: cart(), userErrors: [] } } });
  const storage = memoryStorage(storedCart());
  const client = clientWithCart(mock, storage);
  assert.equal(await client.getCart(), null);
  assert.equal(client.cartId, null);
  assert.equal(storage.map.has(STORAGE_KEY), false);
  await client.add(variantId);
  assert.match(mock.calls[1].parsedBody.query, /cartCreate/);
});
test("expired cart mutation clears storage and never silently repeats or recreates", async () => {
  for (const payload of [
    { cart: null, userErrors: [{ field: ["cartId"], code: "INVALID", message: "The specified cart does not exist." }] },
    { cart: null, userErrors: [] },
  ]) {
    const mock = mockFetch({ data: { cartLinesAdd: payload } });
    const storage = memoryStorage(storedCart());
    const client = clientWithCart(mock, storage);
    await assert.rejects(client.add(variantId), isCode("STALE_CART"));
    assert.equal(client.cartId, null);
    assert.equal(storage.map.has(STORAGE_KEY), false);
    assert.equal(mock.calls.length, 1);
  }
});
test("untrusted checkout URLs are removed from the authoritative cart", async () => {
  const mock = mockFetch({ data: { cart: cart({ checkoutUrl: "https://evil.example/checkouts/a" }) } });
  const result = await clientWithCart(mock).getCart();
  assert.equal(result.checkoutUrl, "");
});
test("cart line pagination retains server costs rather than recomputing totals", async () => {
  const nextLine = { ...cart().lines.nodes[0], id: "gid://shopify/CartLine/second", quantity: 1 };
  const mock = mockFetch(
    { data: { cart: cart({ totalQuantity: 3, lines: { nodes: cart().lines.nodes, pageInfo: { hasNextPage: true, endCursor: "line-next" } } }) } },
    { data: { cart: { lines: { nodes: [nextLine], pageInfo: { hasNextPage: false, endCursor: null } } } } },
  );
  const result = await clientWithCart(mock).getCart();
  assert.equal(result.lines.nodes.length, 2);
  assert.equal(result.cost.totalAmount.amount, "1587.60");
  assert.deepEqual(mock.calls[1].parsedBody.variables, { id: cartId, after: "line-next" });
});
test("failed mutation-followup pagination keeps the returned cart ID for read recovery", async () => {
  const mock = mockFetch(
    { data: { cartCreate: { cart: cart({ lines: { nodes: [], pageInfo: { hasNextPage: true, endCursor: "next" } } }), userErrors: [] } } },
    new Error("offline during pagination"),
    { data: { cart: cart() } },
  );
  const client = new StorefrontClient(config, { fetch: mock.fetch, storage: memoryStorage() });
  await assert.rejects(client.add(variantId), isCode("NETWORK"));
  assert.equal(client.cartId, cartId);
  assert.equal(client.needsRefresh, true);
  await client.getCart();
  assert.equal(client.cart.totalQuantity, 2);
  assert.equal(client.needsRefresh, false);
});
test("unavailable browser storage never prevents an accepted transaction", async () => {
  const storage = { getItem() { return null; }, removeItem() {}, setItem() { throw new Error("quota"); } };
  const mock = mockFetch({ data: { cartCreate: { cart: cart(), userErrors: [] } } });
  const client = new StorefrontClient(config, { fetch: mock.fetch, storage });
  await client.add(variantId);
  assert.equal(client.cart.id, cartId);
  assert.equal(client.storageAvailable, false);
});
