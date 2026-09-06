'use client';

/**
 * Renders a server-generated thumbnail SVG. The API only ever stores SVGs it
 * produced itself from numeric waypoints, and the string is additionally
 * checked here so a stray script tag can never be inlined.
 */
const SAFE_SVG = /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]*>(?:<(?:rect|path|circle)\b[^>]*\/>)*<\/svg>$/;

export function isSafeThumbnail(svg: string | null | undefined): svg is string {
  return typeof svg === 'string' && svg.length < 20000 && SAFE_SVG.test(svg) && !/on\w+=|<script|javascript:/i.test(svg);
}

export function TrackThumbnail({ svg }: { svg: string | null | undefined }) {
  if (!isSafeThumbnail(svg)) {
    return <div className="flex h-full w-full items-center justify-center text-xs text-muted">No preview</div>;
  }
  return <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}
