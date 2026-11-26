// SignMate's small icon set: 24 px grid, 2 px round strokes. Always shown next to a text label.
import React from "react";

const PATHS = {
  hand: "M8 13V5.5a1.5 1.5 0 0 1 3 0V11m0-6.5V4a1.5 1.5 0 0 1 3 0v7m0-5.5a1.5 1.5 0 0 1 3 0V12m0-4a1.5 1.5 0 0 1 3 0v6a7 7 0 0 1-7 7h-1.2a6 6 0 0 1-4.6-2.2L4.6 16a1.6 1.6 0 0 1 2.4-2.1L8 15",
  words: "M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v4H4zM14 15h6v4h-6z",
  sentence: "M4 7h16M4 12h11M4 17h7m9-2v4m0 0-2-2m2 2 2-2",
  reply: "M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-7l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 10h8M8 13h5",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  camera: "M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  speak: "M4 9.5v5h3.5L12 18V6L7.5 9.5zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11",
  undo: "M9 7 4.5 11.5 9 16M5 11.5h9.5a5 5 0 0 1 0 10H12",
  clear: "M6 6l12 12M18 6 6 18",
  check: "M5 12.5 10 17.5 19 7",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z",
  flip: "M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4",
  stop: "M7 7h10v10H7z",
  play: "M8 5.5v13l10-6.5z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  mic: "M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zM6 11.5a6 6 0 0 0 12 0M12 17.5V21",
  book: "M5 4.5h6a2 2 0 0 1 2 2V20a2 2 0 0 0-2-2H5zM19 4.5h-6a2 2 0 0 0-2 2V20a2 2 0 0 1 2-2h6z",
  chart: "M5 19V9M10 19V5M15 19v-7M20 19v-4M3 19.5h18",
  download: "M12 4v11m0 0-4-4m4 4 4-4M5 19.5h14",
  settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 13.5l1.6 1-2 3.4-1.8-.6a7.5 7.5 0 0 1-2 1.2L15 20.5h-4l-.4-2a7.5 7.5 0 0 1-2-1.2l-1.8.6-2-3.4 1.6-1a7.5 7.5 0 0 1 0-2.6l-1.6-1 2-3.4 1.8.6a7.5 7.5 0 0 1 2-1.2l.4-2h4l.4 2a7.5 7.5 0 0 1 2 1.2l1.8-.6 2 3.4-1.6 1a7.5 7.5 0 0 1 0 2.6z",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5h.01",
  chat: "M4 6h12v8H9l-4 3v-3H4zM16 9h4v8h-1v3l-3-3h-5v-3",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3.5 9h17M3.5 15h17M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
  sparkle: "M12 4l1.8 5.2L19 11l-5.2 1.8L12 18l-1.8-5.2L5 11l5.2-1.8z",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  back: "M19 12H5m5-5-5 5 5 5",
  expand: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  rotate: "M4 13a8 8 0 1 0 2.3-5.7L4 9.5M4 4.5v5h5",
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
  install: "M8 3.5h8a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1zM12 8v6m0 0-2.5-2.5M12 14l2.5-2.5M11 18h2",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  presentation: "M3.5 5h17v10h-17zM12 15v4M8 20h8",
};

export default function Icon({ name, size = 20, className = "" }) {
  const d = PATHS[name];
  if (!d) return null;
  return <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === "more" ? 3.2 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={d} /></svg>;
}

export function BrandMark({ size = 34 }) {
  // Two open hands meeting: SignMate's mark. Gradient from the theme.
  return <svg className="brand-mark" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
    <defs><linearGradient id="sm-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--indigo)" /><stop offset="1" stopColor="var(--pink)" /></linearGradient></defs>
    <rect width="40" height="40" rx="12" fill="url(#sm-grad)" />
    <path d="M13 27c-2.2-1.6-3.4-4-3.4-6.6V14a1.4 1.4 0 0 1 2.8 0v4.2M12.4 18V11a1.4 1.4 0 0 1 2.8 0v6.5M15.2 12.5a1.4 1.4 0 0 1 2.8 0V18M27 27c2.2-1.6 3.4-4 3.4-6.6V14a1.4 1.4 0 0 0-2.8 0v4.2M27.6 18V11a1.4 1.4 0 0 0-2.8 0v6.5M24.8 12.5a1.4 1.4 0 0 0-2.8 0V18M18 22.5c.6 1.2 1.2 1.8 2 1.8s1.4-.6 2-1.8" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
