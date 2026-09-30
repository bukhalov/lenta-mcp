Failed to create stream fd: Operation not permitted
Failed to create stream fd: Operation not permitted
Failed to create stream fd: Operation not permitted
const API = "https://integration.api.lenta.com";
const CHANNELS = new Set(["cc", "lo", "locc", "utk", "b2b", "ozn"]);
const BRANDS = new Set(["lo", "utk", "smy", "mntk", "obi", "antares", "remi", "ulybka_radugi"]);

const tools = [
  {
    name: "stores",
    description: "Получить список магазинов Ленты (или другой витрины). Возвращает реальные данные и ID для запросов каталога.",
    inputSchema: { type: "object", properties: { retailBrand: { type: "string", description: "Витрина: lo (Лента, по умолчанию), utk, mntk, obi, remi и др." } } },
  },
  {
    name: "nearest_store",
    description: "Найти ближайшие магазины Ленты по координатам. API принимает широту и долготу, не адрес.",
    inputSchema: { type: "object", required: ["latitude", "longitude"], properties: { latitude: { type: "number", minimum: -90, maximum: 90 }, longitude: { type: "number", minimum: -180, maximum: 180 }, retailBrand: { type: "string", description: "Необязательный код витрины, по умолчанию lo." } } },
  },
  {
    name: "categories",
    description: "Получить дерево или часть дерева товарных категорий для магазина и канала продаж.",
    inputSchema: { type: "object", required: ["storeId", "channel"], properties: { storeId: { type: "integer" }, channel: { type: "string", enum: [...CHANNELS] }, retailBrand: { type: "string", default: "lo" }, id: { type: "integer", description: "Необязательно: конкретная категория." }, parentId: { type: "integer", description: "Необязательно: дочерние категории." }, levels: { type: "integer", minimum: 1 } } },
  },
  {
    name: "products_search",
    description: "Искать товары в каталоге магазина с учетом канала продаж, витрины и пагинации.",
    inputSchema: { type: "object", required: ["storeId", "channel", "query"], properties: { storeId: { type: "integer" }, channel: { type: "string", enum: [...CHANNELS] }, query: { type: "string", minLength: 1 }, retailBrand: { type: "string", default: "lo" }, limit: { type: "integer", minimum: 1, maximum: 100, default: 20 }, offset: { type: "integer", minimum: 0, default: 0 } } },
  },
  {
    name: "product_details",
    description: "Получить карточку товара по SKU в конкретном магазине и канале продаж.",
    inputSchema: { type: "object", required: ["itemId", "storeId", "channel"], properties: { itemId: { type: "string", description: "SKU / ID товара." }, storeId: { type: "integer" }, channel: { type: "string", enum: [...CHANNELS] }, retailBrand: { type: "string", default: "lo" } } },
  },
  {
    name: "products_by_category",
    description: "Получить товары указанной категории с учетом магазина, канала и пагинации.",
    inputSchema: { type: "object", required: ["storeId", "channel", "categoryId"], properties: { storeId: { type: "integer" }, channel: { type: "string", enum: [...CHANNELS] }, categoryId: { type: "integer" }, retailBrand: { type: "string", default: "lo" }, limit: { type: "integer", minimum: 1, maximum: 100, default: 20 }, offset: { type: "integer", minimum: 0, default: 0 } } },
  },
  {
    name: "discounts",
    description: "Вычисляемый фильтр акций: получает товары каталога и оставляет только позиции, где поля ответа API явно показывают скидку (цена ниже прежней или положительный размер скидки). Это не отдельный endpoint Ленты.",
    inputSchema: { type: "object", required: ["storeId", "channel"], properties: { storeId: { type: "integer" }, channel: { type: "string", enum: [...CHANNELS] }, retailBrand: { type: "string", default: "lo" }, query: { type: "string", description: "Необязательный поисковый фильтр по названию." }, categoryId: { type: "integer" }, minDiscountPct: { type: "number", minimum: 0, maximum: 100, default: 0 }, limit: { type: "integer", minimum: 1, maximum: 100, default: 50 }, offset: { type: "integer", minimum: 0, default: 0 } } },
  },
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

function rpc(id, result, error) {
  return error ? { jsonrpc: "2.0", id, error } : { jsonrpc: "2.0", id, result };
}

function validateChannel(channel) {
  if (!CHANNELS.has(channel)) throw new Error("channel должен быть одним из: cc, lo, locc, utk, b2b, ozn.");
}

function brand(args) {
  const value = args.retailBrand || "lo";
  if (!BRANDS.has(value)) throw new Error("Неизвестный retailBrand. Используйте код витрины из документации Integration API.");
  return value;
}

function limitOffset(args) {
  const limit = Math.min(100, Math.max(1, Number(args.limit ?? 20)));
  const offset = Math.max(0, Number(args.offset ?? 0));
  if (!Number.isInteger(limit) || !Number.isInteger(offset)) throw new Error("limit и offset должны быть целыми числами.");
  return { limit, offset };
}

async function lentaGet(path, params) {
  const url = new URL(path, API);
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(key, String(v)));
    else if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, { headers: { accept: "application/json" } });
  const bodyText = await response.text();
  let body;
  try { body = bodyText ? JSON.parse(bodyText) : null; } catch { body = bodyText.slice(0, 4000); }
  if (!response.ok) throw new Error(`Integration API вернул HTTP ${response.status}: ${JSON.stringify(body).slice(0, 3000)}`);
  return body;
}

async function catalogItems(args, extra = {}) {
  validateChannel(args.channel);
  const { limit, offset } = limitOffset(args);
  return lentaGet("/catalog/v1/items", {
    stores: args.storeId,
    channel: args.channel,
    retailBrand: brand(args),
    query: args.query,
    categoryId: args.categoryId,
    limit,
    offset,
    ...extra,
  });
}

function findItems(value) {
  if (Array.isArray(value)) return value.filter((x) => x && typeof x === "object" && !Array.isArray(x));
  if (!value || typeof value !== "object") return [];
  for (const [key, child] of Object.entries(value)) {
    if (["items", "products", "results", "skus", "content"].includes(key.toLowerCase()) && Array.isArray(child)) return findItems(child);
  }
  for (const child of Object.values(value)) {
    const found = findItems(child);
    if (found.length) return found;
  }
  return [];
}

function numberFor(obj, names) {
  for (const [key, value] of Object.entries(obj)) {
    if (names.test(key) && value !== null && value !== "" && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
}

function discountEvidence(item) {
  const prices = item?.prices && typeof item.prices === "object" ? item.prices : {};
  const current = numberFor(prices, /^(price|cost|currentprice|saleprice|discountprice|finalprice)$/i)
    ?? numberFor(item, /^(price|currentprice|saleprice|discountprice|finalprice)$/i);
  const previous = numberFor(prices, /^(oldprice|originalprice|regularprice|priceregular|costregular|baseprice|previousprice|listprice)$/i)
    ?? numberFor(item, /^(oldprice|originalprice|regularprice|priceregular|costregular|baseprice|previousprice|listprice)$/i);
  const explicitPct = numberFor(prices, /^(discountpercent|discountpercentage|discountpct|salepercent)$/i)
    ?? numberFor(item, /^(discountpercent|discountpercentage|discountpct|salepercent)$/i);
  const explicitAmount = numberFor(prices, /^(discount|discountamount)$/i)
    ?? numberFor(item, /^(discount|discountamount)$/i);
  const currentLower = current !== undefined && previous !== undefined && previous > current;
  const discountKeys = [...Object.keys(prices), ...Object.keys(item)];
  const pctKey = discountKeys.find((k) => /^(discountpercent|discountpercentage|discountpct|salepercent)$/i.test(k));
  const amountKey = discountKeys.find((k) => /^(discount|discountamount)$/i.test(k));
  const hasExplicitPct = explicitPct !== undefined && explicitPct > 0 && !!pctKey;
  const explicitDiscount = explicitAmount !== undefined && explicitAmount > 0 && !!amountKey;
  const promoFlag = prices.isPromoactionPrice === true || prices.isPromotionalPrice === true || item.isPromoactionPrice === true || item.isPromotionalPrice === true;
  const pct = hasExplicitPct ? explicitPct : (currentLower ? Math.round(((previous - current) / previous) * 10000) / 100 : undefined);
  const isDiscount = currentLower || hasExplicitPct || explicitDiscount || promoFlag;
  return { isDiscount, pct, currentPrice: current, previousPrice: previous, discountAmount: explicitAmount, evidence: hasExplicitPct ? "discount percentage field" : (currentLower ? "price<previous price" : (explicitDiscount ? "discount amount field" : (promoFlag ? "promotional-price flag" : undefined))) };
}

async function callTool(name, args) {
  switch (name) {
    case "stores": {
      const rb = args.retailBrand || "lo";
      if (!BRANDS.has(rb)) throw new Error("Неизвестный retailBrand.");
      return lentaGet("/v1/stores", { retailBrand: rb });
    }
    case "nearest_store": {
      const { latitude, longitude } = args;
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error("Укажите корректные широту (-90…90) и долготу (-180…180).");
      const result = await lentaGet("/v1/stores/nearest/hub", { latitude, longitude, retailBrand: args.retailBrand || "lo" });
      if (Array.isArray(result?.hubs)) result.hubs.sort((a, b) => Number(a.distance) - Number(b.distance));
      return result;
    }
    case "categories": {
      validateChannel(args.channel);
      return lentaGet("/catalog/v1/categories", { stores: args.storeId, channel: args.channel, retailBrand: brand(args), id: args.id, parentId: args.parentId, levels: args.levels });
    }
    case "products_search":
      return catalogItems({ ...args, limit: args.limit ?? 20 });
    case "products_by_category":
      return catalogItems({ ...args, limit: args.limit ?? 20 });
    case "product_details": {
      validateChannel(args.channel);
      if (args.itemId === undefined || args.itemId === null || String(args.itemId).trim() === "") throw new Error("itemId не может быть пустым.");
      const id = encodeURIComponent(String(args.itemId));
      return lentaGet(`/catalog/v1/items/${id}`, { stores: args.storeId, channel: args.channel, retailBrand: brand(args) });
    }
    case "discounts": {
      const response = await catalogItems({ ...args, limit: args.limit ?? 50 });
      const minPct = Number(args.minDiscountPct ?? 0);
      const items = findItems(response).map((item) => ({ item, discount: discountEvidence(item) }))
        .filter(({ discount }) => discount.isDiscount && (minPct === 0 || (discount.pct !== undefined && discount.pct >= minPct)))
        .map(({ item, discount }) => ({ ...item, _discount: discount }));
      const scanned = findItems(response);
      return { source: "computed_from_catalog_fields", storeId: args.storeId, channel: args.channel, scanned: scanned.length, minDiscountPct: minPct, count: items.length, items, note: items.length ? undefined : "В просмотренной странице каталога не найдено товаров с явными полями скидки или промоцены." };
    }
    default:
      throw new Error(`Неизвестный инструмент: ${name}`);
  }
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/" && request.method === "GET") return new Response("Лента MCP server", { headers: { "content-type": "text/plain; charset=utf-8" } });
    if (url.pathname !== "/mcp") return json({ error: "Not found" }, 404);
    if (request.method !== "POST") return new Response("MCP endpoint accepts POST", { status: 405, headers: { allow: "POST" } });
    let message;
    try { message = await request.json(); } catch { return json(rpc(null, null, { code: -32700, message: "Invalid JSON" }), 400); }
    if (message.method === "notifications/initialized" || message.method === "notifications/cancelled") return new Response(null, { status: 202 });
    if (message.method === "initialize") {
      return json(rpc(message.id, { protocolVersion: message.params?.protocolVersion || "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "lenta-private-mcp", version: "1.0.0" }, instructions: "Инструменты Integration API Ленты. Для каталога указывай магазин и канал (cc самовывоз, lo доставка). Данные актуальны на момент запроса. Акции вычисляются по полям каталога, отдельного discounts endpoint нет." }));
    }
    if (message.method === "ping") return json(rpc(message.id, {}));
    if (message.method === "tools/list") return json(rpc(message.id, { tools }));
    if (message.method === "tools/call") {
      const name = message.params?.name;
      try {
        const result = await callTool(name, message.params?.arguments || {});
        return json(rpc(message.id, { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result, isError: false }));
      } catch (error) {
        return json(rpc(message.id, { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true }));
      }
    }
    return json(rpc(message.id ?? null, null, { code: -32601, message: `Method not found: ${message.method}` }), 404);
  },
};
