"use client";

import { useState } from "react";
import { cn } from "@openexam/core/pixel-ui";
import { normalizeRichContentBlocks, type RichContentBlock } from "@openexam/core/rich-content";

type RichContentProps = {
  blocks?: unknown;
  fallback?: string | null;
  className?: string;
  textClassName?: string;
  inline?: boolean;
};

export function RichContent({ blocks, fallback, className, textClassName, inline = false }: RichContentProps) {
  const normalized = normalizeRichContentBlocks(blocks, fallback);

  if (normalized.length === 0) {
    return null;
  }

  const Container = inline ? "span" : "div";

  return (
    <Container className={cn(inline ? "inline-grid min-w-0 gap-2 align-top" : "grid gap-3", className)}>
      {normalized.map((block, index) =>
        block.type === "text" ? (
          <span key={`text-${index}`} className={cn("whitespace-pre-line break-words", textClassName)}>
            {block.text}
          </span>
        ) : (
          <RichImageBlock block={block} index={index} key={`image-${index}`} />
        )
      )}
    </Container>
  );
}

function RichImageBlock({ block, index }: { block: Extract<RichContentBlock, { type: "image" }>; index: number }) {
  const label = block.alt?.trim() || `图片 ${index + 1}`;

  if (block.assetId) {
    return (
      <img
        alt={label}
        className="max-h-[480px] max-w-full border-2 border-black bg-white object-contain"
        decoding="async"
        loading="lazy"
        src={`/assets/${encodeURIComponent(block.assetId)}`}
      />
    );
  }

  if (!block.sourceUrl) {
    return null;
  }

  return <ExternalImage alt={label} sourceUrl={block.sourceUrl} />;
}

function ExternalImage({ alt, sourceUrl }: { alt: string; sourceUrl: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="grid w-fit max-w-full gap-2 border-2 border-black bg-white p-3">
        <p className="text-sm font-bold text-[var(--muted)]">图片加载失败</p>
        <a
          className="pixel-button w-fit bg-white px-3 py-2 text-sm"
          href={sourceUrl}
          rel="noreferrer noopener"
          target="_blank"
        >
          查看原图{alt === "图片" ? "" : `：${alt}`}
        </a>
      </div>
    );
  }

  return (
    <img
      alt={alt}
      className="max-h-[480px] max-w-full border-2 border-black bg-white object-contain"
      decoding="async"
      loading="lazy"
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
      src={sourceUrl}
    />
  );
}
