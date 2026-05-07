import type { Prisma } from "@prisma/client";

export type RichContentTextBlock = {
  type: "text";
  text: string;
};

export type RichContentImageBlock = {
  type: "image";
  sourceUrl: string;
  assetId?: string | null;
  alt?: string | null;
};

export type RichContentBlock = RichContentTextBlock | RichContentImageBlock;

const markdownImagePattern = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const bareImageUrlPattern = /https:\/\/[^\s<>)"'`]+/g;
const supportedBitmapExtensions = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

export function richTextToPlainText(blocks: readonly RichContentBlock[]) {
  return blocks
    .map((block) => {
      if (block.type === "text") {
        return block.text;
      }

      return block.alt?.trim() || "图片";
    })
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function textToRichContentBlocks(value: string | null | undefined): RichContentBlock[] {
  const text = value?.trim();

  if (!text) {
    return [];
  }

  const blocks: RichContentBlock[] = [];
  let cursor = 0;

  for (const match of text.matchAll(markdownImagePattern)) {
    const index = match.index ?? 0;

    pushTextBlock(blocks, text.slice(cursor, index));

    const alt = match[1]?.trim() || "图片";
    const sourceUrl = match[2]?.trim() ?? "";

    if (isSupportedImageSourceUrl(sourceUrl)) {
      blocks.push({ type: "image", sourceUrl, assetId: null, alt });
    } else {
      pushTextBlock(blocks, match[0]);
    }

    cursor = index + match[0].length;
  }

  pushTextBlock(blocks, text.slice(cursor));

  return splitBareImageUrls(blocks);
}

export function normalizeRichContentBlocks(value: unknown, fallbackText?: string | null): RichContentBlock[] {
  if (!Array.isArray(value)) {
    return textToRichContentBlocks(fallbackText);
  }

  const blocks: RichContentBlock[] = [];

  for (const item of value) {
    if (!isJsonObject(item) || typeof item.type !== "string") {
      continue;
    }

    if (item.type === "text" && typeof item.text === "string" && item.text.trim()) {
      blocks.push({ type: "text", text: item.text.trim() });
      continue;
    }

    if (item.type === "image") {
      const sourceUrl = typeof item.sourceUrl === "string" ? item.sourceUrl.trim() : "";
      const assetId = typeof item.assetId === "string" && item.assetId.trim() ? item.assetId.trim() : null;
      const alt = typeof item.alt === "string" && item.alt.trim() ? item.alt.trim() : "图片";

      if (assetId || isSupportedImageSourceUrl(sourceUrl)) {
        blocks.push({ type: "image", sourceUrl, assetId, alt });
      } else if (sourceUrl) {
        blocks.push({ type: "text", text: sourceUrl });
      }
    }
  }

  return blocks.length > 0 ? blocks : textToRichContentBlocks(fallbackText);
}

export function hasRichContentBlocks(value: unknown): value is RichContentBlock[] {
  return Array.isArray(value) && normalizeRichContentBlocks(value).length > 0;
}

export function toInputJsonValue(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) {
    return null;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function splitBareImageUrls(blocks: RichContentBlock[]) {
  const normalized: RichContentBlock[] = [];

  for (const block of blocks) {
    if (block.type === "image") {
      normalized.push(block);
      continue;
    }

    let cursor = 0;

    for (const match of block.text.matchAll(bareImageUrlPattern)) {
      const index = match.index ?? 0;
      const sourceUrl = trimTrailingUrlPunctuation(match[0]);

      if (!isSupportedImageSourceUrl(sourceUrl)) {
        continue;
      }

      pushTextBlock(normalized, block.text.slice(cursor, index));
      normalized.push({ type: "image", sourceUrl, assetId: null, alt: "图片" });
      cursor = index + match[0].length;
    }

    pushTextBlock(normalized, block.text.slice(cursor));
  }

  return normalized;
}

function pushTextBlock(blocks: RichContentBlock[], text: string) {
  if (!text) {
    return;
  }

  const previous = blocks.at(-1);

  if (!text.trim()) {
    if (previous?.type === "text") {
      previous.text = `${previous.text}${text}`;
    }

    return;
  }

  if (previous?.type === "text") {
    previous.text = `${previous.text}${text}`;
    return;
  }

  blocks.push({ type: "text", text });
}

function isSupportedImageSourceUrl(value: string) {
  try {
    const url = new URL(value);

    if (url.protocol !== "https:") {
      return false;
    }

    const extension = url.pathname.split(".").pop()?.toLowerCase() ?? "";

    return supportedBitmapExtensions.has(extension);
  } catch {
    return false;
  }
}

function trimTrailingUrlPunctuation(value: string) {
  return value.replace(/[.,;:!?，。！？；：]+$/u, "");
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
