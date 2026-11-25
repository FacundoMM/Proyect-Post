/* eslint-disable @next/next/no-img-element */

"use client";

type ProductImageCardProps = {
  alt: string;
  imageUrl: string | null;
  barcode: string;
};

export default function ProductImageCard({
  alt,
  imageUrl,
  barcode,
}: ProductImageCardProps) {
  const hasImage = Boolean(imageUrl);

  if (hasImage) {
    return (
      <div className="relative aspect-[4/3] overflow-hidden rounded-[22px] border border-[rgba(29,23,17,0.08)] bg-[rgba(255,255,255,0.8)]">
        <img
          src={imageUrl ?? ""}
          alt={alt}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div className="flex aspect-[4/3] items-center justify-center rounded-[22px] border border-[rgba(29,23,17,0.08)] bg-[linear-gradient(135deg,rgba(217,109,58,0.18),rgba(245,203,160,0.35))] px-6 text-center">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.28em] text-muted">sin imagen</p>
        <p className="font-mono text-sm font-semibold text-foreground">{barcode}</p>
      </div>
    </div>
  );
}
