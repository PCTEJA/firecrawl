// First release of each SDK whose product model accepts `inStock: null`.
// Older releases parse it as an error or as false, so they keep receiving true.
const NULL_STOCK_SINCE: Record<string, readonly [number, number, number]> = {
  python: [4, 59, 0],
  js: [4, 56, 0],
  java: [1, 19, 0],
  go: [1, 17, 0],
  rust: [2, 22, 0],
  ruby: [1, 18, 0],
  php: [1, 17, 0],
  dotnet: [1, 16, 0],
};

function parseVersion(raw: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}

/**
 * Whether a request's client can read `inStock: null`. Origins are
 * `<lang>-sdk@<version>` or `<lang>-sdk.<package>@<version>`; anything that is
 * not one of the SDKs above (raw HTTP, integrations, MCP, CLI) gets null.
 */
export function acceptsNullStock(origin: string | null | undefined): boolean {
  const normalized = (origin ?? "").split("|")[0].trim().toLowerCase();
  const sdk = /^([a-z]+)-sdk(?:\.[^@]*)?(?:@(.*))?$/.exec(normalized);
  if (!sdk) return true;
  const since = NULL_STOCK_SINCE[sdk[1]];
  if (!since) return true;
  // A known SDK with a missing, prerelease or malformed version is treated as old.
  const version = parseVersion(sdk[2] ?? "");
  if (!version) return false;
  for (let i = 0; i < 3; i++) {
    if (version[i] !== since[i]) return version[i] > since[i];
  }
  return true;
}

/**
 * Shapes variant stock for the requesting client and drops the producer's
 * `legacyInStock` hint. Clients that can't read null get a boolean: the stated
 * value, else the producer's legacy value, else true (the pre-null default).
 */
export function projectProductStock<T extends { variants?: unknown }>(
  product: T,
  acceptsNull: boolean,
): T {
  if (!Array.isArray(product.variants)) return product;
  return {
    ...product,
    variants: product.variants.map(variant => {
      if (variant === null || typeof variant !== "object") return variant;
      const availability = (variant as { availability?: unknown }).availability;
      if (availability === null || typeof availability !== "object") {
        return acceptsNull
          ? variant
          : { ...variant, availability: { inStock: true } };
      }
      const { legacyInStock, ...rest } = availability as Record<
        string,
        unknown
      >;
      if (acceptsNull || typeof rest.inStock === "boolean") {
        return { ...variant, availability: rest };
      }
      const inStock = typeof legacyInStock === "boolean" ? legacyInStock : true;
      return { ...variant, availability: { ...rest, inStock } };
    }),
  };
}
