import React, { useMemo } from "react";
import { qrPath } from "./qr.js";

export default function QrCode({ text, size = 120 }) {
  const { d, size: units } = useMemo(() => qrPath(text, 2), [text]);
  return <svg className="qr" width={size} height={size} viewBox={`0 0 ${units} ${units}`} role="img" aria-label={`QR code for ${text}`} shapeRendering="crispEdges">
    <rect width={units} height={units} fill="#fff" rx="1.2" />
    <path d={d} fill="#14122b" />
  </svg>;
}
