/**
 * Temporary stylized SVG mockups (data URIs) for RelatedToolsGrid until
 * real OpusClip-style illustration assets are sourced.
 * Not production art - replace imageUrl with CDN/static assets later.
 */

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Dark tile + violet accents - viral hook generator mock. */
export const RELATED_TOOL_THUMB_VIRAL_HOOKS = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400" fill="none">
  <rect width="640" height="400" fill="#18181b"/>
  <rect x="48" y="56" width="544" height="288" rx="20" fill="#27272a"/>
  <rect x="72" y="88" width="220" height="16" rx="8" fill="#7c3aed"/>
  <rect x="72" y="124" width="320" height="12" rx="6" fill="#3f3f46"/>
  <rect x="72" y="148" width="280" height="12" rx="6" fill="#3f3f46"/>
  <rect x="72" y="172" width="300" height="12" rx="6" fill="#3f3f46"/>
  <rect x="72" y="220" width="160" height="40" rx="20" fill="#7c3aed"/>
  <text x="100" y="246" fill="white" font-family="system-ui,sans-serif" font-size="14" font-weight="700">Generate</text>
  <rect x="400" y="100" width="160" height="200" rx="16" fill="#09090b" stroke="#52525b"/>
  <rect x="420" y="120" width="120" height="12" rx="6" fill="#a78bfa"/>
  <rect x="420" y="148" width="120" height="8" rx="4" fill="#3f3f46"/>
  <rect x="420" y="168" width="100" height="8" rx="4" fill="#3f3f46"/>
  <rect x="420" y="188" width="110" height="8" rx="4" fill="#3f3f46"/>
  <circle cx="480" cy="250" r="22" fill="#7c3aed"/>
  <path d="M474 250 L486 250 M480 244 L480 256" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
</svg>
`);

/** Dark tile - viral reel finder mock (search + reel cards). */
export const RELATED_TOOL_THUMB_VIRAL_FINDER = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400" fill="none">
  <rect width="640" height="400" fill="#18181b"/>
  <rect x="48" y="56" width="544" height="288" rx="20" fill="#27272a"/>
  <rect x="72" y="84" width="360" height="44" rx="22" fill="#09090b" stroke="#52525b"/>
  <circle cx="100" cy="106" r="10" stroke="#a78bfa" stroke-width="2.5" fill="none"/>
  <path d="M107 113 L116 122" stroke="#a78bfa" stroke-width="2.5" stroke-linecap="round"/>
  <rect x="124" y="100" width="180" height="12" rx="6" fill="#52525b"/>
  <rect x="456" y="84" width="112" height="44" rx="22" fill="#7c3aed"/>
  <text x="478" y="111" fill="white" font-family="system-ui,sans-serif" font-size="14" font-weight="700">Search</text>
  <rect x="72" y="160" width="140" height="150" rx="14" fill="#09090b" stroke="#3f3f46"/>
  <rect x="92" y="180" width="100" height="70" rx="8" fill="#3f3f46"/>
  <rect x="92" y="266" width="80" height="10" rx="5" fill="#7c3aed"/>
  <rect x="92" y="284" width="60" height="8" rx="4" fill="#52525b"/>
  <rect x="232" y="160" width="140" height="150" rx="14" fill="#09090b" stroke="#3f3f46"/>
  <rect x="252" y="180" width="100" height="70" rx="8" fill="#3f3f46"/>
  <rect x="252" y="266" width="80" height="10" rx="5" fill="#7c3aed"/>
  <rect x="252" y="284" width="60" height="8" rx="4" fill="#52525b"/>
  <rect x="392" y="160" width="140" height="150" rx="14" fill="#09090b" stroke="#3f3f46"/>
  <rect x="412" y="180" width="100" height="70" rx="8" fill="#3f3f46"/>
  <rect x="412" y="266" width="80" height="10" rx="5" fill="#7c3aed"/>
  <rect x="412" y="284" width="60" height="8" rx="4" fill="#52525b"/>
</svg>
`);

/** Dark tile - AI coach mock (chat + script). */
export const RELATED_TOOL_THUMB_AI_COACH = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400" fill="none">
  <rect width="640" height="400" fill="#18181b"/>
  <rect x="48" y="56" width="544" height="288" rx="20" fill="#27272a"/>
  <rect x="72" y="88" width="240" height="64" rx="16" fill="#09090b"/>
  <rect x="88" y="104" width="160" height="10" rx="5" fill="#52525b"/>
  <rect x="88" y="124" width="120" height="10" rx="5" fill="#52525b"/>
  <rect x="200" y="172" width="260" height="72" rx="16" fill="#7c3aed"/>
  <rect x="220" y="192" width="180" height="10" rx="5" fill="white" fill-opacity="0.9"/>
  <rect x="220" y="212" width="140" height="10" rx="5" fill="white" fill-opacity="0.7"/>
  <rect x="72" y="268" width="300" height="48" rx="24" fill="#09090b" stroke="#52525b"/>
  <rect x="92" y="286" width="180" height="12" rx="6" fill="#3f3f46"/>
  <circle cx="340" cy="292" r="14" fill="#7c3aed"/>
  <path d="M334 292 L346 292 M340 286 L340 298" stroke="white" stroke-width="2" stroke-linecap="round"/>
</svg>
`);
