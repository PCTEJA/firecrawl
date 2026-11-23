import { describe, expect, it } from "vitest";
import { acceptsNullStock, projectProductStock } from "./product-stock-compat";

describe("acceptsNullStock", () => {
  it.each([
    ["python-sdk@4.57.0", false],
    ["python-sdk@4.58.0", false],
    ["python-sdk@4.59.0", true],
    ["python-sdk@4.59.1", true],
    ["python-sdk@5.0.0", true],
    ["python-sdk@4.30.3", false],
    ["python-sdk.some-agent@4.57.0", false],
    ["python-sdk.some-agent@4.59.0", true],
    ["js-sdk@4.54.0", false],
    ["js-sdk@4.55.0", false],
    ["js-sdk@4.56.0", true],
    ["js-sdk.bullmq@4.51.0", false],
    ["js-sdk.bullmq@4.56.0", true],
    ["js-sdk@0.1.0", false],
    ["js-sdk@1.0.1822", false],
    ["java-sdk@1.18.0", false],
    ["java-sdk@1.18.9", false],
    ["java-sdk@1.19.0", true],
    ["go-sdk@1.16.11", false],
    ["go-sdk@1.17.0", true],
    ["rust-sdk@2.21.10", false],
    ["rust-sdk@2.22.0", true],
    ["ruby-sdk@1.17.8", false],
    ["ruby-sdk@1.18.0", true],
    ["php-sdk@1.16.7", false],
    ["php-sdk@1.17.0", true],
    ["dotnet-sdk@1.15.3", false],
    ["dotnet-sdk@1.16.0", true],
  ])("%s -> %s", (origin, expected) => {
    expect(acceptsNullStock(origin)).toBe(expected);
  });

  it.each([
    "python-sdk",
    "python-sdk@",
    "python-sdk@unknown",
    "python-sdk@4.59.0-beta.1",
    "js-sdk@4.56.0rc1",
    "java-sdk@x.y.z",
  ])("treats a known SDK with an unusable version as old: %s", origin => {
    expect(acceptsNullStock(origin)).toBe(false);
  });

  it("normalizes case, whitespace and a trailing integration tag", () => {
    expect(acceptsNullStock(" Python-SDK@4.57.0 ")).toBe(false);
    expect(acceptsNullStock("js-sdk@4.24.0|cli")).toBe(false);
    expect(acceptsNullStock("python-sdk@4.59")).toBe(true);
  });

  it.each([
    undefined,
    null,
    "",
    "api",
    "api|n8n",
    "website",
    "mcp-server",
    "mcp-ua-claude-user@3.40.0",
    "cli.claude-code@1.29.0",
    "firecrawl-convex@1.0.0",
    "elixir-sdk@1.0.0",
    "xpython-sdk@1.0.0",
  ])("gives null to %s", origin => {
    expect(acceptsNullStock(origin)).toBe(true);
  });
});

describe("projectProductStock", () => {
  const product = {
    title: "T",
    url: "https://shop.test/p",
    variants: [
      { id: "a", availability: { inStock: true, text: "In stock" } },
      { id: "b", availability: { inStock: false } },
      { id: "c", availability: { inStock: null } },
      { id: "d", availability: { inStock: null, legacyInStock: false } },
      { id: "e", availability: { inStock: null, legacyInStock: true } },
      { id: "f", availability: { inStock: false, legacyInStock: true } },
      { id: "g", availability: {} },
      { id: "h", availability: null },
      { id: "i" },
      { id: "j", availability: { inStock: "yes" } },
    ],
  };

  it("gives old clients the stated value, else the legacy value, else true", () => {
    const out = projectProductStock(product, false);
    expect(out.variants.map(v => (v as any).availability)).toEqual([
      { inStock: true, text: "In stock" },
      { inStock: false },
      { inStock: true },
      { inStock: false },
      { inStock: true },
      { inStock: false },
      { inStock: true },
      { inStock: true },
      { inStock: true },
      { inStock: true },
    ]);
    expect(product.variants[3].availability).toEqual({
      inStock: null,
      legacyInStock: false,
    });
  });

  it("keeps null for new clients and never exposes legacyInStock", () => {
    const out = projectProductStock(product, true);
    expect(out.variants.map(v => (v as any).availability)).toEqual([
      { inStock: true, text: "In stock" },
      { inStock: false },
      { inStock: null },
      { inStock: null },
      { inStock: null },
      { inStock: false },
      {},
      null,
      undefined,
      { inStock: "yes" },
    ]);
    expect(JSON.stringify(out)).not.toContain("legacyInStock");
  });

  it("leaves a product without a variants array untouched", () => {
    const bare = { title: "T", url: "u" } as any;
    expect(projectProductStock(bare, false)).toBe(bare);
    expect(projectProductStock(bare, true)).toBe(bare);
  });
});
