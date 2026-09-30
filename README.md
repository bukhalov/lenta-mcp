# Лента MCP

Приватный MCP-сервер для открытого Integration API Ленты. Опубликован через OpenAI Sites; MCP endpoint: `POST /mcp`.

## Инструменты

- `stores` — список магазинов.
- `nearest_store` — ближайшие магазины по координатам.
- `categories` — категории выбранного магазина.
- `products_search` — поиск товаров.
- `product_details` — карточка товара по SKU.
- `products_by_category` — товары категории.
- `discounts` — вычисляемый фильтр каталога по ценам и полям акции. У API нет отдельного endpoint акций.

Корзины и операции заказа не реализованы.

## Источник данных

Спецификация: [lenta.com/llms.txt](https://lenta.com/llms.txt). API: `https://integration.api.lenta.com`. Для каталога нужны `storeId`, `channel` и `retailBrand`; цены и ассортимент зависят от канала.

## Сборка

Нужен Node.js и Bash; внешние npm-пакеты не используются.

```sh
bash scripts/build.sh
node scripts/validate-artifact.mjs
```

Сборка создаёт `dist/server/index.js` — Cloudflare Worker entry point.

## Структура

- `worker/index.js` — MCP transport и интеграция с API.
- `.openai/hosting.json` — Site project binding и MCP capability.
- `scripts/build.sh`, `scripts/validate-artifact.mjs` — сборка и проверка артефакта.
