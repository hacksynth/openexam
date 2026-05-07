import { describe, expect, it } from "vitest";
import { normalizeRichContentBlocks, richTextToPlainText, textToRichContentBlocks } from "@openexam/core/rich-content";

describe("rich content blocks", () => {
  it("extracts markdown images and bare bitmap URLs into image blocks", () => {
    expect(textToRichContentBlocks("题干 ![图1](https://example.com/a.png) 继续 https://cdn.example.com/b.webp。")).toEqual([
      { type: "text", text: "题干 " },
      { type: "image", sourceUrl: "https://example.com/a.png", assetId: null, alt: "图1" },
      { type: "text", text: " 继续 " },
      { type: "image", sourceUrl: "https://cdn.example.com/b.webp", assetId: null, alt: "图片" }
    ]);
  });

  it("downgrades unsupported image references to text", () => {
    expect(textToRichContentBlocks("![本地](./a.png) ![svg](https://example.com/a.svg) http://example.com/a.png")).toEqual([
      { type: "text", text: "![本地](./a.png) ![svg](https://example.com/a.svg) http://example.com/a.png" }
    ]);
  });

  it("normalizes provider blocks and falls back to extracted text", () => {
    expect(
      normalizeRichContentBlocks([
        { type: "text", text: "选项" },
        { type: "image", sourceUrl: "https://example.com/option.jpg", alt: "选项图" },
        { type: "image", sourceUrl: "ftp://bad.example.com/a.png" }
      ])
    ).toEqual([
      { type: "text", text: "选项" },
      { type: "image", sourceUrl: "https://example.com/option.jpg", assetId: null, alt: "选项图" },
      { type: "text", text: "ftp://bad.example.com/a.png" }
    ]);

    expect(normalizeRichContentBlocks(null, "答案 https://example.com/a.gif")).toEqual([
      { type: "text", text: "答案 " },
      { type: "image", sourceUrl: "https://example.com/a.gif", assetId: null, alt: "图片" }
    ]);
  });

  it("creates plain text fallback from rich blocks", () => {
    expect(
      richTextToPlainText([
        { type: "text", text: "观察" },
        { type: "image", sourceUrl: "https://example.com/a.png", alt: "时序图" },
        { type: "text", text: "作答" }
      ])
    ).toBe("观察时序图作答");
  });
});
