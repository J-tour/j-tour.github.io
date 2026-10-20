// This file is public. Use only a Shopify Storefront public access token.
// Never put an Admin API token, private Storefront token, or customer data here.
export default {
  shopDomain: "", // Example: "your-store.myshopify.com" (not a full URL)
  storefrontAccessToken: "",
  apiVersion: "2026-07",
  // Optional exact primary checkout hostname, e.g. "shop.your-brand.com".
  // No URL scheme, path, port, wildcard, or credentials.
  checkoutDomain: "",
  // Optional: https://your-store.myshopify.com/account or
  // https://shopify.com/123456789/account (your official hosted customer account).
  customerAccountUrl: "",
  // Optional published Shopify Online Store page handles, fetched through Storefront.
  // Uses the API's short, plain-text bodySummary (up to 200 characters), not rich HTML.
  pageHandles: { story: "", contact: "" },
  brand: {
    name: "J-TOUR",
    tagline: "把日常，過成一段旅程。",
    storyTitle: "不必走得很遠，\n也能重新看見生活。",
    story: "【品牌示例文案】J-TOUR 相信，旅行不只是目的地，而是一種對生活保持好奇的方式。我們以輕盈、耐用與恰到好處的設計，陪你從城市街角，走向下一片風景。",
    contactEmail: "", // Set a real public customer-service email before launch.
    contactHours: "【示例】週一至週五 10:00–18:00，國定假日除外",
    instagramUrl: "", // Optional https://www.instagram.com/your-brand/
  },
};
