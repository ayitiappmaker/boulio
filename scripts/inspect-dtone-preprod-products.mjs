#!/usr/bin/env node

const requiredEnvironment = [
  "DTONE_API_BASE_URL",
  "DTONE_API_USERNAME",
  "DTONE_API_PASSWORD",
];

const missing = requiredEnvironment.filter(
  (name) => !process.env[name]?.trim(),
);

if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const baseUrl = process.env.DTONE_API_BASE_URL.trim().replace(/\/+$/, "");
const parsedBaseUrl = new URL(baseUrl);

if (parsedBaseUrl.protocol !== "https:") {
  throw new Error("DTONE_API_BASE_URL must use HTTPS.");
}

const authorization = `Basic ${Buffer.from(
  `${process.env.DTONE_API_USERNAME.trim()}:${process.env.DTONE_API_PASSWORD.trim()}`,
).toString("base64")}`;

const operatorName =
  process.env.DTONE_OPERATOR_NAME?.trim() || "Digicel Haiti";

async function getCatalogPage(path, parameters) {
  if (path !== "/operators" && path !== "/products") {
    throw new Error(`Unsupported catalog path: ${path}`);
  }

  const url = new URL(`${baseUrl}${path}`);
  for (const [name, value] of Object.entries(parameters)) {
    url.searchParams.set(name, String(value));
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: authorization,
    },
  });

  if (!response.ok) {
    throw new Error(`DT One ${path} request failed with HTTP ${response.status}.`);
  }

  const body = await response.json();
  const records = Array.isArray(body)
    ? body
    : body?.items ?? body?.data ?? body?.results;

  if (!Array.isArray(records)) {
    throw new Error(`DT One ${path} response did not contain a product list.`);
  }

  return records;
}

const operators = await getCatalogPage("/operators", {
  country_iso_code: "HTI",
  page: 1,
  per_page: 100,
});

const matchingOperators = operators.filter((operator) =>
  String(operator.name ?? operator.operator?.name ?? "")
    .toLowerCase()
    .trim() === operatorName.toLowerCase(),
);

if (matchingOperators.length === 0) {
  console.log(`No ${operatorName} operator was returned for Haiti (HTI).`);
  process.exit(0);
}

const productTypes = ["RANGED_VALUE_RECHARGE", "FIXED_VALUE_RECHARGE"];
const products = [];

for (const operator of matchingOperators) {
  const operatorId = operator.id ?? operator.operator_id;
  if (!operatorId) continue;

  for (const type of productTypes) {
    const records = await getCatalogPage("/products", {
      country_iso_code: "HTI",
      operator_id: operatorId,
      type,
      page: 1,
      per_page: 100,
    });
    products.push(...records);
  }
}

const uniqueProducts = [
  ...new Map(products.map((product) => [product.id, product])).values(),
];

const summaries = uniqueProducts.map((product) => ({
  id: product.id,
  type: product.type,
  name: product.name,
  operator: product.operator,
  destination: product.destination,
  source: product.source,
  calculation_mode: product.calculation_mode,
  fixed_value: product.fixed_value,
  open_range: product.open_range,
  prices: product.prices,
  wholesale_price: product.wholesale_price,
}));

console.log(JSON.stringify(summaries, null, 2));
