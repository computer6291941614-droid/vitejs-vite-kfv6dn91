import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  Scissors,
  Calculator,
  Boxes,
  FolderKanban,
  FileText,
  Plus,
  Trash2,
  Copy,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Sparkles,
  ShoppingCart,
  PackageCheck,
  Sliders,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  Archive,
  Download,
  Image as ImageIcon,
  MessageSquare,
  Tag,
  Upload,
  FileSpreadsheet,
  Building2,
  QrCode,
  Sun,
  Moon,
  Users,
  Search,
  RotateCw,
  X,
  Cloud,
  Smartphone,
  Monitor,
  LogIn,
  LogOut,
  WifiOff,
} from 'lucide-react';

// Safe primitive text helper to prevent React child object errors
const safeStr = (val) => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string' || typeof val === 'number') return String(val);
  return '';
};

// ============================================================================
// 0. SAFE OPTIONAL CLOUD INIT & PWA MANIFEST SETUP
// ============================================================================
let app = null;
let auth = null;
let db = null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'plyoptimize-pwa';

async function initOptionalFirebase() {
  try {
    if (typeof __firebase_config === 'undefined' || !__firebase_config)
      return null;
    const firebaseConfig = JSON.parse(__firebase_config);
    const fbAppMod = await import('firebase/app');
    const fbAuthMod = await import('firebase/auth');
    const fbStoreMod = await import('firebase/firestore');
    app = fbAppMod.initializeApp(firebaseConfig);
    auth = fbAuthMod.getAuth(app);
    db = fbStoreMod.getFirestore(app);
    return { fbAuthMod, fbStoreMod };
  } catch (err) {
    console.debug('Running in offline/local-first mode:', err);
    return null;
  }
}

function registerDynamicPwaManifestAndSw() {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined')
      return;
    const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#0a0a0a"/><path d="M128 192l128-64 128 64-128 64-128-64zm0 64l128 64 128-64m-256 64l128 64 128-64" stroke="#fbbf24" stroke-width="32" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const iconUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      iconSvg
    )}`;
    const manifestObj = {
      name: 'PLYOPTIMIZE — Ply Optimizer & Material Estimator',
      short_name: 'PLYOPTIMIZE',
      description:
        'Smart Buy Plywood Optimizer, 3D Parametric Builder & Material Estimator',
      start_url: './',
      display: 'standalone',
      background_color: '#0a0a0a',
      theme_color: '#fbbf24',
      icons: [
        { src: iconUrl, sizes: '192x192', type: 'image/svg+xml' },
        { src: iconUrl, sizes: '512x512', type: 'image/svg+xml' },
      ],
    };

    const manifestDataUrl = `data:application/manifest+json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(manifestObj)
    )}`;
    let manifestLink = document.querySelector('link[rel="manifest"]');
    if (!manifestLink) {
      manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      document.head.appendChild(manifestLink);
    }
    manifestLink.href = manifestDataUrl;
  } catch (err) {
    console.debug('PWA manifest setup note:', err);
  }
}

// ============================================================================
// 1. PRECISION MEASUREMENT PARSER & FORMATTER (Feet, Inches, Mixed e.g. 7' 6")
// ============================================================================
function parseMeasurement(input) {
  if (typeof input === 'number') return isNaN(input) ? 0 : Math.max(0, input);
  if (!input) return 0;
  const str = String(input).trim();
  if (!str) return 0;

  // Match patterns like: 7' 6", 7'6, 7', 24", 24, 7ft 6in, 7.5'
  const feetInchesRegex =
    /^(?:(\d+(?:\.\d+)?)\s*(?:'|ft|feet))?\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in|inches)?)?$/i;
  const match = str.match(feetInchesRegex);
  if (match && (match[1] !== undefined || match[2] !== undefined)) {
    const feet = parseFloat(match[1] || '0');
    const inches = parseFloat(match[2] || '0');
    return Math.round((feet * 12 + inches) * 1000) / 1000;
  }

  const fallback = parseFloat(str);
  return isNaN(fallback) ? 0 : Math.max(0, fallback);
}

function formatMeasurement(inchesValue, mode = 'mixed') {
  const val = Math.round((Number(inchesValue) || 0) * 100) / 100;
  if (mode === 'inches') return `${val}"`;
  if (mode === 'feet') {
    const ft = Math.round((val / 12) * 100) / 100;
    return `${ft}'`;
  }
  const feet = Math.floor(val / 12);
  const remInches = Math.round((val % 12) * 100) / 100;
  if (feet === 0) return `${remInches}"`;
  if (remInches === 0) return `${feet}' 0"`;
  return `${feet}' ${remInches}"`;
}

// ============================================================================
// 1D. EDGE BANDING SIDE CALCULATOR & SPREADSHEET (CSV / XLSX) HELPERS
// ============================================================================
const EDGE_BAND_MODES = {
  none: { label: 'No Edge Banding', short: 'None', edges: [] },
  '1L': { label: '1 Long Edge', short: '1L', edges: ['top'] },
  '1S': { label: '1 Short Edge', short: '1S', edges: ['left'] },
  '2L': { label: '2 Long Edges', short: '2L', edges: ['top', 'bottom'] },
  '2S': { label: '2 Short Edges', short: '2S', edges: ['left', 'right'] },
  '3S': {
    label: '3 Sides (1L + 2S)',
    short: '3-Side',
    edges: ['top', 'left', 'right'],
  },
  '4S': {
    label: 'All 4 Sides',
    short: '4-Side',
    edges: ['top', 'bottom', 'left', 'right'],
  },
};

function normalizeEdgeMode(raw) {
  if (!raw) return '4S';
  const s = String(raw).trim().toLowerCase();
  if (EDGE_BAND_MODES[raw]) return raw;
  if (s === 'none' || s.includes('no edge')) return 'none';
  if (s === '1l' || s.includes('1 long') || s.includes('front')) return '1L';
  if (s === '1s' || s.includes('1 short')) return '1S';
  if (s === '2l' || s.includes('2 long')) return '2L';
  if (s === '2s' || s.includes('2 short')) return '2S';
  if (s === '3s' || s.includes('3 side') || s.includes('3-side')) return '3S';
  return '4S';
}

function calcPanelEdgeInches(width, height, qty, edgeMode = '4S') {
  const mode = normalizeEdgeMode(edgeMode);
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  const q = Math.max(1, Number(qty) || 1);
  const longSide = Math.max(w, h);
  const shortSide = Math.min(w, h);

  let perPieceInches = 0;
  switch (mode) {
    case 'none':
      perPieceInches = 0;
      break;
    case '1L':
      perPieceInches = longSide;
      break;
    case '1S':
      perPieceInches = shortSide;
      break;
    case '2L':
      perPieceInches = 2 * longSide;
      break;
    case '2S':
      perPieceInches = 2 * shortSide;
      break;
    case '3S':
      perPieceInches = longSide + 2 * shortSide;
      break;
    case '4S':
    default:
      perPieceInches = 2 * (longSide + shortSide);
      break;
  }
  return perPieceInches * q;
}

function EdgeBandDiagram({ mode = '4S' }) {
  const norm = normalizeEdgeMode(mode);
  const active = EDGE_BAND_MODES[norm]?.edges || [];
  return (
    <svg
      width="28"
      height="20"
      viewBox="0 0 28 20"
      className="inline-block shrink-0"
      title={EDGE_BAND_MODES[norm]?.label}
    >
      <rect
        x="3"
        y="3"
        width="22"
        height="14"
        rx="1.5"
        fill="#171717"
        stroke="#525252"
        strokeWidth="1"
      />
      {active.includes('top') && (
        <line
          x1="2"
          y1="2.5"
          x2="26"
          y2="2.5"
          stroke="#fbbf24"
          strokeWidth="2.5"
        />
      )}
      {active.includes('bottom') && (
        <line
          x1="2"
          y1="17.5"
          x2="26"
          y2="17.5"
          stroke="#fbbf24"
          strokeWidth="2.5"
        />
      )}
      {active.includes('left') && (
        <line
          x1="2.5"
          y1="2"
          x2="2.5"
          y2="18"
          stroke="#fbbf24"
          strokeWidth="2.5"
        />
      )}
      {active.includes('right') && (
        <line
          x1="25.5"
          y1="2"
          x2="25.5"
          y2="18"
          stroke="#fbbf24"
          strokeWidth="2.5"
        />
      )}
    </svg>
  );
}

function parseCsvText(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return lines.map((line) => {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  });
}

function rowsToCsv(headers, rows) {
  const esc = (val) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  return [
    headers.map(esc).join(','),
    ...rows.map((r) => r.map(esc).join(',')),
  ].join('\n');
}

// ============================================================================
// 1A. WORKSHOP & OPTIMIZER DEFAULTS (MACHINE, MATERIAL, TRIM, OFFCUT, CURRENCY)
// ============================================================================
const FACTORY_WORKSHOP_DEFAULTS = {
  activeMachine: 'Panel Saw',
  activeMaterialProfile: '18mm Plywood',
  defaultKerf: 0.125,
  machineProfiles: {
    'Table Saw': {
      kerf: 0.125,
      trimLeft: 0.125,
      trimRight: 0.125,
      trimTop: 0.125,
      trimBottom: 0.125,
      allowRotation: true,
      splitDirection: 'auto',
      notes: 'Standard 1/8" rip/crosscut carbide blade',
    },
    'Panel Saw': {
      kerf: 0.125,
      trimLeft: 0,
      trimRight: 0,
      trimTop: 0,
      trimBottom: 0,
      allowRotation: true,
      splitDirection: 'auto',
      notes: 'Scoring + main blade sliding carriage precision',
    },
    'Circular Saw': {
      kerf: 0.1,
      trimLeft: 0.25,
      trimRight: 0.25,
      trimTop: 0.25,
      trimBottom: 0.25,
      allowRotation: true,
      splitDirection: 'horizontal',
      notes: 'Track / handheld plunge saw thin-kerf blade',
    },
    'CNC Router': {
      kerf: 0.25,
      trimLeft: 0.25,
      trimRight: 0.25,
      trimTop: 0.25,
      trimBottom: 0.25,
      allowRotation: true,
      splitDirection: 'auto',
      notes: '6mm (0.25") compression router bit nesting allowance',
    },
  },
  materialProfiles: {
    '18mm Plywood': {
      kerf: 0.125,
      trimLeft: 0,
      trimRight: 0,
      trimTop: 0,
      trimBottom: 0,
      minOffcutL: 18,
      minOffcutW: 12,
      minOffcutAreaSqFt: 1.5,
    },
    '18mm Block Board': {
      kerf: 0.125,
      trimLeft: 0,
      trimRight: 0,
      trimTop: 0,
      trimBottom: 0,
      minOffcutL: 24,
      minOffcutW: 12,
      minOffcutAreaSqFt: 2.0,
    },
    '8mm Plywood': {
      kerf: 0.1,
      trimLeft: 0,
      trimRight: 0,
      trimTop: 0,
      trimBottom: 0,
      minOffcutL: 18,
      minOffcutW: 12,
      minOffcutAreaSqFt: 1.5,
    },
    'MDF / HDHMR': {
      kerf: 0.125,
      trimLeft: 0.125,
      trimRight: 0.125,
      trimTop: 0.125,
      trimBottom: 0.125,
      minOffcutL: 16,
      minOffcutW: 10,
      minOffcutAreaSqFt: 1.1,
    },
    'Particle Board': {
      kerf: 0.15,
      trimLeft: 0.25,
      trimRight: 0.25,
      trimTop: 0.25,
      trimBottom: 0.25,
      minOffcutL: 24,
      minOffcutW: 14,
      minOffcutAreaSqFt: 2.3,
    },
  },
  trimLeft: 0,
  trimRight: 0,
  trimTop: 0,
  trimBottom: 0,
  minOffcutLength: 18,
  minOffcutWidth: 12,
  minOffcutAreaSqFt: 1.5,
  autoSaveReusableOffcuts: false,
  measurementMode: 'mixed', // 'mixed' | 'inches' | 'feet'
  currencySymbol: '₹',
  currencyLocale: 'en-IN',
  branding: {
    companyName: 'CREATIVE INTERIOR',
    tagline: 'Interior Manufacturing & Smart Material Estimation',
    gstin: '',
    phone: '',
    address: '',
    logoDataUrl: '',
    signatureDataUrl: '',
    stampDataUrl: '',
  },
};

function resolveEffectiveCutSettings(
  projectCutSettings = {},
  workshopSettings = FACTORY_WORKSHOP_DEFAULTS
) {
  const ws = { ...FACTORY_WORKSHOP_DEFAULTS, ...workshopSettings };
  const machine =
    ws.machineProfiles?.[ws.activeMachine] || ws.machineProfiles['Panel Saw'];
  const matProf =
    ws.materialProfiles?.[ws.activeMaterialProfile] ||
    ws.materialProfiles['18mm Plywood'];

  const kerf =
    projectCutSettings.kerf !== undefined && projectCutSettings.kerf !== null
      ? Number(projectCutSettings.kerf)
      : Number(machine.kerf ?? matProf.kerf ?? ws.defaultKerf ?? 0.125);

  const trimLeft = Number(
    projectCutSettings.trimLeft ?? ws.trimLeft ?? machine.trimLeft ?? 0
  );
  const trimRight = Number(
    projectCutSettings.trimRight ?? ws.trimRight ?? machine.trimRight ?? 0
  );
  const trimTop = Number(
    projectCutSettings.trimTop ?? ws.trimTop ?? machine.trimTop ?? 0
  );
  const trimBottom = Number(
    projectCutSettings.trimBottom ?? ws.trimBottom ?? machine.trimBottom ?? 0
  );

  return {
    kerf: Math.max(0, kerf),
    trimLeft: Math.max(0, trimLeft),
    trimRight: Math.max(0, trimRight),
    trimTop: Math.max(0, trimTop),
    trimBottom: Math.max(0, trimBottom),
    allowRotation:
      projectCutSettings.allowRotation ?? machine.allowRotation ?? true,
    splitDirection:
      projectCutSettings.splitDirection || machine.splitDirection || 'auto',
    minReusableW: Math.max(
      1,
      Number(
        projectCutSettings.minReusableW ??
          ws.minOffcutWidth ??
          matProf.minOffcutW ??
          12
      )
    ),
    minReusableH: Math.max(
      1,
      Number(
        projectCutSettings.minReusableH ??
          ws.minOffcutLength ??
          matProf.minOffcutL ??
          18
      )
    ),
    minReusableAreaSqFt: Math.max(
      0,
      Number(
        projectCutSettings.minReusableAreaSqFt ??
          ws.minOffcutAreaSqFt ??
          matProf.minOffcutAreaSqFt ??
          1.5
      )
    ),
    useStockFirst: Boolean(projectCutSettings.useStockFirst),
  };
}

// ============================================================================
// 1B. 3D PARAMETRIC FURNITURE TEMPLATES, FINISHES & CUT-LIST ENGINE
// ============================================================================
const PARAMETRIC_FURNITURE_PRESETS = {
  '2-Door Wardrobe': {
    width: 42,
    height: 84,
    depth: 24,
    plinth: 3,
    carcassMat: '18mm Plywood',
    backMat: '8mm Plywood',
    shutterMat: '18mm Block Board',
    partitions: 1,
    shelves: 4,
    drawers: 2,
    hangingRod: true,
    adjustableShelves: true,
    includeBack: true,
    shutterMode: 'hinged',
    shutterCount: 2,
    revealGap: 0.125,
    separateLoft: false,
    loftHeight: 18,
    outsideFinish: 'Natural Oak',
    insideFinish: 'Frosty White',
    laminateMode: 'double',
    edgeBandSpec: '2mm Matching PVC',
  },
  '3-Door Wardrobe': {
    width: 60,
    height: 84,
    depth: 24,
    plinth: 3,
    carcassMat: '18mm Plywood',
    backMat: '8mm Plywood',
    shutterMat: '18mm Block Board',
    partitions: 2,
    shelves: 6,
    drawers: 2,
    hangingRod: true,
    adjustableShelves: true,
    includeBack: true,
    shutterMode: 'hinged',
    shutterCount: 3,
    revealGap: 0.125,
    separateLoft: false,
    loftHeight: 18,
    outsideFinish: 'Warm Walnut',
    insideFinish: 'Frosty White',
    laminateMode: 'double',
    edgeBandSpec: '2mm Matching PVC',
  },
  '4-Door Wardrobe': {
    width: 78,
    height: 84,
    depth: 24,
    plinth: 3,
    carcassMat: '18mm Plywood',
    backMat: '8mm Plywood',
    shutterMat: '18mm Block Board',
    partitions: 3,
    shelves: 8,
    drawers: 4,
    hangingRod: true,
    adjustableShelves: true,
    includeBack: true,
    shutterMode: 'hinged',
    shutterCount: 4,
    revealGap: 0.125,
    separateLoft: false,
    loftHeight: 18,
    outsideFinish: 'Matte Cashmere',
    insideFinish: 'Frosty White',
    laminateMode: 'double',
    edgeBandSpec: '2mm Matching PVC',
  },
  'Sliding Wardrobe': {
    width: 72,
    height: 84,
    depth: 25,
    plinth: 3,
    carcassMat: '18mm Plywood',
    backMat: '8mm Plywood',
    shutterMat: '18mm Block Board',
    partitions: 1,
    shelves: 6,
    drawers: 2,
    hangingRod: true,
    adjustableShelves: true,
    includeBack: true,
    shutterMode: 'sliding',
    shutterCount: 2,
    revealGap: 0.125,
    separateLoft: false,
    loftHeight: 18,
    outsideFinish: 'Burma Teak',
    insideFinish: 'Frosty White',
    laminateMode: 'double',
    edgeBandSpec: '2mm Matching PVC',
  },
  'Wardrobe with Loft': {
    width: 48,
    height: 102,
    depth: 24,
    plinth: 3,
    carcassMat: '18mm Plywood',
    backMat: '8mm Plywood',
    shutterMat: '18mm Block Board',
    partitions: 1,
    shelves: 4,
    drawers: 2,
    hangingRod: true,
    adjustableShelves: true,
    includeBack: true,
    shutterMode: 'hinged',
    shutterCount: 2,
    revealGap: 0.125,
    separateLoft: true,
    loftHeight: 20,
    outsideFinish: 'Natural Oak',
    insideFinish: 'Frosty White',
    laminateMode: 'double',
    edgeBandSpec: '2mm Matching PVC',
  },
  'Modular Kitchen Base Unit': {
    width: 36,
    height: 34,
    depth: 22,
    plinth: 4,
    carcassMat: '18mm Plywood',
    backMat: '8mm Plywood',
    shutterMat: '18mm Plywood',
    partitions: 0,
    shelves: 1,
    drawers: 1,
    hangingRod: false,
    adjustableShelves: true,
    includeBack: true,
    shutterMode: 'hinged',
    shutterCount: 2,
    revealGap: 0.125,
    separateLoft: false,
    loftHeight: 0,
    outsideFinish: 'Alpine White',
    insideFinish: 'Frosty White',
    laminateMode: 'double',
    edgeBandSpec: '2mm Matching PVC',
  },
  'Kitchen Wall Cabinet': {
    width: 36,
    height: 30,
    depth: 13,
    plinth: 0,
    carcassMat: '18mm Plywood',
    backMat: '8mm Plywood',
    shutterMat: '18mm Plywood',
    partitions: 0,
    shelves: 2,
    drawers: 0,
    hangingRod: false,
    adjustableShelves: true,
    includeBack: true,
    shutterMode: 'hinged',
    shutterCount: 2,
    revealGap: 0.125,
    separateLoft: false,
    loftHeight: 0,
    outsideFinish: 'Matte Cashmere',
    insideFinish: 'Frosty White',
    laminateMode: 'double',
    edgeBandSpec: '2mm Matching PVC',
  },
  'Kitchen Tall Unit': {
    width: 24,
    height: 84,
    depth: 22,
    plinth: 4,
    carcassMat: '18mm Plywood',
    backMat: '8mm Plywood',
    shutterMat: '18mm Block Board',
    partitions: 0,
    shelves: 5,
    drawers: 2,
    hangingRod: false,
    adjustableShelves: true,
    includeBack: true,
    shutterMode: 'hinged',
    shutterCount: 1,
    revealGap: 0.125,
    separateLoft: false,
    loftHeight: 0,
    outsideFinish: 'Charcoal Slate',
    insideFinish: 'Frosty White',
    laminateMode: 'double',
    edgeBandSpec: '2mm Matching PVC',
  },
  'TV Unit': {
    width: 66,
    height: 22,
    depth: 16,
    plinth: 3,
    carcassMat: '18mm Plywood',
    backMat: '8mm Plywood',
    shutterMat: '18mm Block Board',
    partitions: 2,
    shelves: 1,
    drawers: 2,
    hangingRod: false,
    adjustableShelves: false,
    includeBack: true,
    shutterMode: 'hinged',
    shutterCount: 2,
    revealGap: 0.125,
    separateLoft: false,
    loftHeight: 0,
    outsideFinish: 'Warm Walnut',
    insideFinish: 'Charcoal Slate',
    laminateMode: 'double',
    edgeBandSpec: '2mm Matching PVC',
  },
  'Study Table': {
    width: 48,
    height: 30,
    depth: 24,
    plinth: 0,
    carcassMat: '18mm Plywood',
    backMat: '8mm Plywood',
    shutterMat: '18mm Block Board',
    partitions: 1,
    shelves: 1,
    drawers: 2,
    hangingRod: false,
    adjustableShelves: false,
    includeBack: true,
    shutterMode: 'hinged',
    shutterCount: 1,
    revealGap: 0.125,
    separateLoft: false,
    loftHeight: 0,
    outsideFinish: 'Natural Oak',
    insideFinish: 'Frosty White',
    laminateMode: 'double',
    edgeBandSpec: '2mm Matching PVC',
  },
  Bookshelf: {
    width: 36,
    height: 78,
    depth: 14,
    plinth: 3,
    carcassMat: '18mm Plywood',
    backMat: '8mm Plywood',
    shutterMat: '18mm Block Board',
    partitions: 1,
    shelves: 8,
    drawers: 0,
    hangingRod: false,
    adjustableShelves: true,
    includeBack: true,
    shutterMode: 'none',
    shutterCount: 0,
    revealGap: 0.125,
    separateLoft: false,
    loftHeight: 0,
    outsideFinish: 'Burma Teak',
    insideFinish: 'Burma Teak',
    laminateMode: 'double',
    edgeBandSpec: '2mm Matching PVC',
  },
  'Custom Furniture': {
    width: 48,
    height: 72,
    depth: 20,
    plinth: 3,
    carcassMat: '18mm Plywood',
    backMat: '8mm Plywood',
    shutterMat: '18mm Block Board',
    partitions: 1,
    shelves: 4,
    drawers: 2,
    hangingRod: false,
    adjustableShelves: true,
    includeBack: true,
    shutterMode: 'hinged',
    shutterCount: 2,
    revealGap: 0.125,
    separateLoft: false,
    loftHeight: 16,
    outsideFinish: 'Natural Oak',
    insideFinish: 'Frosty White',
    laminateMode: 'double',
    edgeBandSpec: '2mm Matching PVC',
  },
};

const FINISH_SWATCHES = {
  'Natural Oak': { hex: '#d8c3a5', grain: '#c4ab87', roughness: 0.65 },
  'Warm Walnut': { hex: '#7a5238', grain: '#5d3b26', roughness: 0.58 },
  'Matte Cashmere': { hex: '#d6cfc7', grain: '#cbc2b8', roughness: 0.78 },
  'Alpine White': { hex: '#f4f4f2', grain: '#e6e6e3', roughness: 0.55 },
  'Frosty White': { hex: '#ecece8', grain: '#dfdfd9', roughness: 0.65 },
  'Charcoal Slate': { hex: '#383c42', grain: '#2b2e33', roughness: 0.72 },
  'Burma Teak': { hex: '#a86b38', grain: '#8a5327', roughness: 0.6 },
};

function boardThicknessInches(matName) {
  if (!matName) return 0.709;
  const lower = matName.toLowerCase();
  if (lower.includes('25mm')) return 0.984;
  if (lower.includes('19mm')) return 0.748;
  if (lower.includes('18mm')) return 0.709;
  if (lower.includes('16mm')) return 0.63;
  if (lower.includes('12mm')) return 0.472;
  if (lower.includes('8mm')) return 0.315;
  if (lower.includes('6mm')) return 0.236;
  return 0.709;
}

function generateParametricFurnitureData(cfg) {
  const W = Math.max(12, Number(cfg.width) || 42);
  const H = Math.max(12, Number(cfg.height) || 84);
  const D = Math.max(8, Number(cfg.depth) || 24);
  const plinth = Math.max(0, Math.min(H - 8, Number(cfg.plinth) || 0));

  const tCarcass = boardThicknessInches(cfg.carcassMat);
  const tBack = cfg.includeBack ? boardThicknessInches(cfg.backMat) : 0;
  const tShutter =
    cfg.shutterMode !== 'none' ? boardThicknessInches(cfg.shutterMat) : 0;
  const gap = Math.max(0, Number(cfg.revealGap) || 0.125);

  const hasLoft = Boolean(cfg.separateLoft) && H > 48;
  const loftH = hasLoft
    ? Math.max(12, Math.min(H - plinth - 24, Number(cfg.loftHeight) || 18))
    : 0;
  const mainCarcassH = H - plinth - loftH;
  const boxDepth = Math.max(
    6,
    D - (cfg.shutterMode === 'sliding' ? 2.5 : tShutter)
  );
  const internalDepth = Math.max(4, boxDepth - tBack - 0.5);

  const partitions = Math.max(0, Math.min(6, Number(cfg.partitions) || 0));
  const numBays = partitions + 1;
  const internalW = Math.max(4, W - 2 * tCarcass);
  const bayW = Math.max(3, (internalW - partitions * tCarcass) / numBays);

  const panels = [];
  const addPanel = (
    name,
    length,
    width,
    qty,
    material,
    grainLock = true,
    edgeSides = '4-Side'
  ) => {
    const L = Math.round(Math.max(1, length) * 100) / 100;
    const Wd = Math.round(Math.max(1, width) * 100) / 100;
    const areaSqFt = Math.round(((L * Wd * qty) / 144) * 100) / 100;
    const edgeFeet = Math.round(((2 * (L + Wd) * qty) / 12) * 10) / 10;
    panels.push({
      id: `3dp-${panels.length + 1}`,
      name,
      length: L,
      width: Wd,
      qty,
      material,
      grainLock,
      laminateSpec:
        cfg.laminateMode === 'double'
          ? `${cfg.outsideFinish} / ${cfg.insideFinish}`
          : `${cfg.outsideFinish} (1-Side)`,
      edgeBandingSpec: `${cfg.edgeBandSpec} (${edgeSides})`,
      areaSqFt,
      edgeFeet,
    });
  };

  // 1. Main Carcass Left & Right Sides
  addPanel(
    'Carcass Side Panel (L/R)',
    mainCarcassH,
    boxDepth,
    2,
    cfg.carcassMat,
    true,
    'Front Edge'
  );

  // 2. Main Carcass Top & Bottom Horizontal Panels
  addPanel(
    'Carcass Top & Bottom Panel',
    internalW,
    boxDepth,
    2,
    cfg.carcassMat,
    false,
    'Front Edge'
  );

  // 3. Base Plinth / Skirting Strips
  if (plinth > 0) {
    addPanel(
      'Base Plinth Front/Back Skirting',
      internalW,
      plinth,
      2,
      cfg.carcassMat,
      false,
      'Top Edge'
    );
  }

  // 4. Internal Vertical Partitions
  const innerClearH = Math.max(6, mainCarcassH - 2 * tCarcass);
  if (partitions > 0) {
    addPanel(
      'Internal Vertical Partition',
      innerClearH,
      internalDepth,
      partitions,
      cfg.carcassMat,
      true,
      'Front Edge'
    );
  }

  // 5. Internal Shelves (Distributed across bays)
  const shelves = Math.max(0, Number(cfg.shelves) || 0);
  if (shelves > 0) {
    const shelfW = Math.max(3, bayW - (cfg.adjustableShelves ? 0.125 : 0));
    addPanel(
      cfg.adjustableShelves
        ? 'Adjustable Internal Shelf'
        : 'Fixed Internal Shelf',
      shelfW,
      Math.max(4, internalDepth - 0.5),
      shelves,
      cfg.carcassMat,
      false,
      'Front Edge'
    );
  }

  // 6. Internal Drawer Boxes & Fascia Fronts
  const drawers = Math.max(0, Number(cfg.drawers) || 0);
  if (drawers > 0) {
    const drawerOuterW = Math.max(6, bayW - 1.0); // 0.5" channel clearance each side
    const drawerH = 6.5;
    const drawerD = Math.max(8, Math.min(20, internalDepth - 1.5));
    addPanel(
      'Drawer Side Panels (L/R)',
      drawerD,
      drawerH,
      drawers * 2,
      cfg.carcassMat,
      false,
      'Top Edge'
    );
    addPanel(
      'Drawer Front/Back Sub-Box',
      Math.max(4, drawerOuterW - 2 * tCarcass),
      drawerH,
      drawers * 2,
      cfg.carcassMat,
      false,
      'Top Edge'
    );
    addPanel(
      'Drawer Fascia Front',
      drawerOuterW,
      drawerH + 0.75,
      drawers,
      cfg.shutterMat !== 'none' ? cfg.shutterMat : cfg.carcassMat,
      true,
      '4-Side'
    );
    if (cfg.includeBack) {
      addPanel(
        'Drawer Bottom Panel',
        Math.max(4, drawerOuterW - tCarcass),
        Math.max(6, drawerD - tCarcass),
        drawers,
        cfg.backMat,
        false,
        'None'
      );
    }
  }

  // 7. Overhead Loft Carcass & Shutters (when enabled)
  if (hasLoft) {
    addPanel(
      'Loft Side Panel (L/R)',
      loftH,
      boxDepth,
      2,
      cfg.carcassMat,
      true,
      'Front Edge'
    );
    addPanel(
      'Loft Top & Bottom Panel',
      internalW,
      boxDepth,
      2,
      cfg.carcassMat,
      false,
      'Front Edge'
    );
    if (partitions > 0) {
      addPanel(
        'Loft Internal Partition',
        Math.max(4, loftH - 2 * tCarcass),
        internalDepth,
        partitions,
        cfg.carcassMat,
        true,
        'Front Edge'
      );
    }
    if (cfg.includeBack) {
      addPanel(
        'Loft Back Panel',
        Math.max(4, loftH - 0.5),
        Math.max(4, W - 0.5),
        1,
        cfg.backMat,
        false,
        'None'
      );
    }
  }

  // 8. Main Carcass Back Panel
  if (cfg.includeBack) {
    addPanel(
      'Main Back Panel',
      Math.max(6, mainCarcassH - 0.5),
      Math.max(6, W - 0.5),
      1,
      cfg.backMat,
      false,
      'None'
    );
  }

  // 9. Front Shutters / Doors
  let singleShutterW = 0;
  let singleShutterH = 0;
  const shutterCount =
    cfg.shutterMode === 'none' ? 0 : Math.max(1, Number(cfg.shutterCount) || 2);

  if (cfg.shutterMode === 'hinged' && shutterCount > 0) {
    singleShutterH = Math.max(6, mainCarcassH - 2 * gap);
    singleShutterW = Math.max(4, (W - (shutterCount + 1) * gap) / shutterCount);
    addPanel(
      'Front Hinged Shutter',
      singleShutterH,
      singleShutterW,
      shutterCount,
      cfg.shutterMat,
      true,
      '4-Side 2mm'
    );
  } else if (cfg.shutterMode === 'sliding' && shutterCount > 0) {
    singleShutterH = Math.max(6, mainCarcassH - 2 * tCarcass - 0.75);
    const overlap = 1.5;
    singleShutterW = Math.max(
      6,
      (internalW + overlap * (shutterCount - 1)) / shutterCount
    );
    addPanel(
      'Sliding Door Shutter',
      singleShutterH,
      singleShutterW,
      shutterCount,
      cfg.shutterMat,
      true,
      '4-Side 2mm'
    );
  }

  if (hasLoft && cfg.shutterMode !== 'none' && shutterCount > 0) {
    const loftShutterH = Math.max(6, loftH - 2 * gap);
    const loftShutterW = Math.max(
      4,
      (W - (shutterCount + 1) * gap) / shutterCount
    );
    addPanel(
      'Loft Hinged Shutter',
      loftShutterH,
      loftShutterW,
      shutterCount,
      cfg.shutterMat,
      true,
      '4-Side 2mm'
    );
  }

  // Material-wise summary aggregation
  const byMaterialMap = {};
  panels.forEach((p) => {
    if (!byMaterialMap[p.material]) {
      byMaterialMap[p.material] = {
        material: p.material,
        pieces: 0,
        areaSqFt: 0,
        edgeFeet: 0,
      };
    }
    byMaterialMap[p.material].pieces += p.qty;
    byMaterialMap[p.material].areaSqFt =
      Math.round((byMaterialMap[p.material].areaSqFt + p.areaSqFt) * 10) / 10;
    byMaterialMap[p.material].edgeFeet =
      Math.round((byMaterialMap[p.material].edgeFeet + p.edgeFeet) * 10) / 10;
  });

  const totalPieces = panels.reduce((acc, p) => acc + p.qty, 0);
  const totalAreaSqFt =
    Math.round(panels.reduce((acc, p) => acc + p.areaSqFt, 0) * 10) / 10;
  const totalEdgeFeet = Math.ceil(
    panels.reduce((acc, p) => acc + p.edgeFeet, 0)
  );

  // Hardware estimates derived directly from parametric state
  const hingesPerDoor = mainCarcassH > 72 ? 4 : mainCarcassH > 48 ? 3 : 2;
  const estHinges =
    cfg.shutterMode === 'hinged'
      ? shutterCount * hingesPerDoor + (hasLoft ? shutterCount * 2 : 0)
      : 0;
  const estSlidingTracks = cfg.shutterMode === 'sliding' ? 1 : 0;
  const estHandles = shutterCount + (hasLoft ? shutterCount : 0) + drawers;
  const estChannels = drawers;

  return {
    panels,
    materialGroups: Object.values(byMaterialMap),
    totalPieces,
    totalAreaSqFt,
    totalEdgeFeet,
    metrics: {
      boxDepth: Math.round(boxDepth * 100) / 100,
      numBays,
      bayW: Math.round(bayW * 100) / 100,
      singleShutterH: Math.round(singleShutterH * 100) / 100,
      singleShutterW: Math.round(singleShutterW * 100) / 100,
      tCarcass,
      tBack,
      tShutter,
      mainCarcassH,
      loftH,
      hasLoft,
    },
    hardware: {
      hinges: estHinges,
      slidingTracks: estSlidingTracks,
      handles: estHandles,
      channels: estChannels,
      hangingRods: cfg.hangingRod ? numBays : 0,
    },
  };
}

// ============================================================================
// 1C. INTERACTIVE THREE.JS 3D PARAMETRIC FURNITURE VIEWPORT COMPONENT
// ============================================================================
function Furniture3DViewport({
  config,
  metrics,
  openAmount,
  explodeAmount,
  cameraPreset,
  showEdges,
  viewerBgTheme = 'dark',
  onCanvasReady,
}) {
  const mountRef = useRef(null);
  const sceneStateRef = useRef({
    scene: null,
    camera: null,
    renderer: null,
    gridHelper: null,
    furnitureGroup: null,
    doorPivots: [],
    slidingDoors: [],
    explodeParts: [],
    spherical: { radius: 135, theta: 0.42, phi: 1.38 },
    target: new THREE.Vector3(0, 42, 0),
    isDragging: false,
    prevMouse: { x: 0, y: 0 },
    animFrameId: null,
  });

  // Helper to generate procedural wood-grain / matte laminate texture
  const createFinishTexture = (finishName) => {
    const spec = FINISH_SWATCHES[finishName] || FINISH_SWATCHES['Natural Oak'];
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = spec.hex;
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = spec.grain;
    ctx.globalAlpha = 0.22;
    for (let i = 0; i < 90; i++) {
      const x = (i * 29) % 256;
      const w = 1 + (i % 3);
      ctx.fillRect(x, 0, w, 256);
    }
    ctx.globalAlpha = 0.08;
    for (let y = 0; y < 256; y += 8) {
      ctx.fillRect(0, y, 256, 1);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return { map: tex, roughness: spec.roughness };
  };

  // Initialize Three.js WebGL Scene once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 640;
    const height = container.clientHeight || 460;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#141416');
    scene.fog = new THREE.Fog('#141416', 240, 520);

    const camera = new THREE.PerspectiveCamera(40, width / height, 1, 1000);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    if (onCanvasReady) onCanvasReady(renderer.domElement);

    // Studio Lighting
    const hemiLight = new THREE.HemisphereLight('#ffffff', '#262626', 1.15);
    hemiLight.position.set(0, 200, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight('#fff8eb', 1.35);
    dirLight.position.set(90, 150, 110);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight('#fbbf24', 0.35);
    rimLight.position.set(-100, 80, -90);
    scene.add(rimLight);

    // Architectural Floor Grid
    const grid = new THREE.GridHelper(320, 32, '#3f3f46', '#27272a');
    grid.position.y = 0;
    scene.add(grid);

    const furnitureGroup = new THREE.Group();
    scene.add(furnitureGroup);

    const st = sceneStateRef.current;
    st.scene = scene;
    st.camera = camera;
    st.renderer = renderer;
    st.gridHelper = grid;
    st.furnitureGroup = furnitureGroup;

    // Camera position updater
    const updateCamera = () => {
      const { radius, theta, phi } = st.spherical;
      const clampedPhi = Math.max(0.15, Math.min(Math.PI / 2 - 0.02, phi));
      st.spherical.phi = clampedPhi;
      camera.position.x =
        st.target.x + radius * Math.sin(clampedPhi) * Math.sin(theta);
      camera.position.y = st.target.y + radius * Math.cos(clampedPhi);
      camera.position.z =
        st.target.z + radius * Math.sin(clampedPhi) * Math.cos(theta);
      camera.lookAt(st.target);
    };

    // Mouse & Touch Orbit Controls
    const dom = renderer.domElement;
    const onPointerDown = (e) => {
      st.isDragging = true;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      st.prevMouse = { x: clientX, y: clientY };
    };
    const onPointerMove = (e) => {
      if (!st.isDragging) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const dx = clientX - st.prevMouse.x;
      const dy = clientY - st.prevMouse.y;
      st.prevMouse = { x: clientX, y: clientY };
      st.spherical.theta -= dx * 0.008;
      st.spherical.phi -= dy * 0.008;
    };
    const onPointerUp = () => {
      st.isDragging = false;
    };
    const onWheel = (e) => {
      e.preventDefault();
      st.spherical.radius = Math.max(
        45,
        Math.min(340, st.spherical.radius + e.deltaY * 0.08)
      );
    };

    dom.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    dom.addEventListener('touchstart', onPointerDown, { passive: true });
    window.addEventListener('touchmove', onPointerMove, { passive: true });
    window.addEventListener('touchend', onPointerUp);
    dom.addEventListener('wheel', onWheel, { passive: false });

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || 640;
      const h = container.clientHeight || 460;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    const animate = () => {
      st.animFrameId = requestAnimationFrame(animate);
      updateCamera();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(st.animFrameId);
      dom.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      dom.removeEventListener('touchstart', onPointerDown);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('touchend', onPointerUp);
      dom.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    };
  }, []);

  // Update 3D Viewport Background & Floor Grid Colors (Dark vs Light Studio)
  useEffect(() => {
    const st = sceneStateRef.current;
    if (!st.scene) return;
    const isLight = viewerBgTheme === 'light';
    const bgHex = isLight ? '#f3f4f6' : '#141416';
    st.scene.background = new THREE.Color(bgHex);
    st.scene.fog = new THREE.Fog(bgHex, 240, 520);

    if (st.gridHelper) {
      st.scene.remove(st.gridHelper);
      st.gridHelper.geometry?.dispose?.();
      st.gridHelper.material?.dispose?.();
    }
    const newGrid = new THREE.GridHelper(
      320,
      32,
      isLight ? '#cbd5e1' : '#3f3f46',
      isLight ? '#e2e8f0' : '#27272a'
    );
    newGrid.position.y = 0;
    st.scene.add(newGrid);
    st.gridHelper = newGrid;
  }, [viewerBgTheme]);

  // Camera Preset Transitions (3/4, Front, Side, Top)
  useEffect(() => {
    const st = sceneStateRef.current;
    const maxDim = Math.max(
      config.width || 42,
      config.height || 84,
      config.depth || 24
    );
    st.target.set(0, (config.height || 84) * 0.5, 0);
    const baseDist = Math.max(95, maxDim * 1.55);

    if (cameraPreset === 'front') {
      st.spherical = { radius: baseDist, theta: 0, phi: Math.PI / 2 - 0.04 };
    } else if (cameraPreset === 'side') {
      st.spherical = {
        radius: baseDist,
        theta: Math.PI / 2,
        phi: Math.PI / 2 - 0.04,
      };
    } else if (cameraPreset === 'top') {
      st.spherical = { radius: baseDist * 1.1, theta: 0, phi: 0.16 };
    } else {
      st.spherical = { radius: baseDist, theta: 0.44, phi: 1.36 };
    }
  }, [cameraPreset, config.width, config.height, config.depth]);

  // Rebuild Parametric 3D Mesh Hierarchy whenever Dimensions, Materials or Edge toggle change
  useEffect(() => {
    const st = sceneStateRef.current;
    if (!st.furnitureGroup) return;

    while (st.furnitureGroup.children.length > 0) {
      st.furnitureGroup.remove(st.furnitureGroup.children[0]);
    }
    st.doorPivots = [];
    st.slidingDoors = [];
    st.explodeParts = [];

    const W = Math.max(12, Number(config.width) || 42);
    const H = Math.max(12, Number(config.height) || 84);
    const plinth = Math.max(0, Number(config.plinth) || 0);
    const {
      boxDepth,
      numBays,
      bayW,
      tCarcass,
      tBack,
      tShutter,
      mainCarcassH,
      loftH,
      hasLoft,
    } = metrics;
    const gap = Math.max(0, Number(config.revealGap) || 0.125);

    const outTex = createFinishTexture(config.outsideFinish);
    const inTex = createFinishTexture(config.insideFinish);

    const outerMat = new THREE.MeshStandardMaterial({
      map: outTex.map,
      roughness: outTex.roughness,
      metalness: 0.05,
    });
    const innerMat = new THREE.MeshStandardMaterial({
      map: inTex.map,
      roughness: inTex.roughness,
      metalness: 0.03,
    });
    const backMat = new THREE.MeshStandardMaterial({
      color: '#d6d3cd',
      roughness: 0.85,
    });
    const handleMat = new THREE.MeshStandardMaterial({
      color: '#1f2937',
      roughness: 0.3,
      metalness: 0.75,
    });
    const rodMat = new THREE.MeshStandardMaterial({
      color: '#d4d4d8',
      roughness: 0.25,
      metalness: 0.85,
    });

    const addBoxPart = (
      parent,
      w,
      h,
      d,
      x,
      y,
      z,
      mat,
      explodeDir = [0, 0, 0]
    ) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      if (showEdges) {
        const edgesGeo = new THREE.EdgesGeometry(geo);
        const lineMat = new THREE.LineBasicMaterial({
          color: '#18181b',
          transparent: true,
          opacity: 0.45,
        });
        const wire = new THREE.LineSegments(edgesGeo, lineMat);
        mesh.add(wire);
      }

      parent.add(mesh);
      st.explodeParts.push({
        mesh,
        basePos: new THREE.Vector3(x, y, z),
        dir: new THREE.Vector3(explodeDir[0], explodeDir[1], explodeDir[2]),
      });
      return mesh;
    };

    const zCenter = 0;
    const frontZ = boxDepth / 2;
    const backZ = -boxDepth / 2;

    // 1. Base Plinth
    if (plinth > 0) {
      addBoxPart(
        st.furnitureGroup,
        W - 2 * tCarcass,
        plinth,
        tCarcass,
        0,
        plinth / 2,
        frontZ - 1.5,
        outerMat,
        [0, -0.4, 0.3]
      );
      addBoxPart(
        st.furnitureGroup,
        W - 2 * tCarcass,
        plinth,
        tCarcass,
        0,
        plinth / 2,
        backZ + 1.5,
        innerMat,
        [0, -0.4, -0.3]
      );
    }

    // 2. Main Carcass Left & Right Side Panels
    const mainCenterY = plinth + mainCarcassH / 2;
    addBoxPart(
      st.furnitureGroup,
      tCarcass,
      mainCarcassH,
      boxDepth,
      -W / 2 + tCarcass / 2,
      mainCenterY,
      zCenter,
      outerMat,
      [-1, 0, 0]
    );
    addBoxPart(
      st.furnitureGroup,
      tCarcass,
      mainCarcassH,
      boxDepth,
      W / 2 - tCarcass / 2,
      mainCenterY,
      zCenter,
      outerMat,
      [1, 0, 0]
    );

    // 3. Main Carcass Top & Bottom Boards
    const internalW = W - 2 * tCarcass;
    addBoxPart(
      st.furnitureGroup,
      internalW,
      tCarcass,
      boxDepth,
      0,
      plinth + tCarcass / 2,
      zCenter,
      innerMat,
      [0, -0.5, 0]
    );
    addBoxPart(
      st.furnitureGroup,
      internalW,
      tCarcass,
      boxDepth,
      0,
      plinth + mainCarcassH - tCarcass / 2,
      zCenter,
      innerMat,
      [0, 0.6, 0]
    );

    // 4. Back Panel
    if (config.includeBack && tBack > 0) {
      addBoxPart(
        st.furnitureGroup,
        W - 0.5,
        mainCarcassH - 0.5,
        tBack,
        0,
        mainCenterY,
        backZ + tBack / 2,
        backMat,
        [0, 0, -1.2]
      );
    }

    // 5. Internal Partitions
    const partitions = Math.max(0, Number(config.partitions) || 0);
    const innerH = mainCarcassH - 2 * tCarcass;
    const innerD = boxDepth - tBack - 0.5;
    const innerZ = (frontZ + backZ + tBack) / 2;

    for (let p = 1; p <= partitions; p++) {
      const px = -W / 2 + tCarcass + p * bayW + (p - 0.5) * tCarcass;
      addBoxPart(
        st.furnitureGroup,
        tCarcass,
        innerH,
        innerD,
        px,
        mainCenterY,
        innerZ,
        innerMat,
        [0, 0, 0.25]
      );
    }

    // 6. Internal Shelves distributed across bays
    const shelves = Math.max(0, Number(config.shelves) || 0);
    for (let s = 0; s < shelves; s++) {
      const bayIdx = s % numBays;
      const tier = Math.floor(s / numBays) + 1;
      const tiersInBay = Math.ceil(shelves / numBays) + 1;
      const sy = plinth + tCarcass + (innerH * tier) / tiersInBay;
      const bx = -W / 2 + tCarcass + bayIdx * (bayW + tCarcass) + bayW / 2;
      addBoxPart(
        st.furnitureGroup,
        bayW - 0.15,
        tCarcass,
        innerD - 0.5,
        bx,
        sy,
        innerZ - 0.2,
        innerMat,
        [0, 0, 0.45]
      );
    }

    // 7. Hanging Rods inside bays
    if (config.hangingRod) {
      for (let b = 0; b < numBays; b++) {
        const bx = -W / 2 + tCarcass + b * (bayW + tCarcass) + bayW / 2;
        const rodY = plinth + mainCarcassH - tCarcass - 4;
        const rodGeo = new THREE.CylinderGeometry(0.45, 0.45, bayW - 0.4, 16);
        rodGeo.rotateZ(Math.PI / 2);
        const rodMesh = new THREE.Mesh(rodGeo, rodMat);
        rodMesh.position.set(bx, rodY, innerZ);
        st.furnitureGroup.add(rodMesh);
        st.explodeParts.push({
          mesh: rodMesh,
          basePos: new THREE.Vector3(bx, rodY, innerZ),
          dir: new THREE.Vector3(0, 0.2, 0.6),
        });
      }
    }

    // 8. Internal Drawers (bottom of bays)
    const drawers = Math.max(0, Number(config.drawers) || 0);
    for (let d = 0; d < drawers; d++) {
      const bayIdx = d % numBays;
      const stackIdx = Math.floor(d / numBays);
      const drawerH = 7.2;
      const dy =
        plinth + tCarcass + drawerH / 2 + stackIdx * (drawerH + 0.4) + 0.3;
      const bx = -W / 2 + tCarcass + bayIdx * (bayW + tCarcass) + bayW / 2;
      addBoxPart(
        st.furnitureGroup,
        bayW - 1,
        drawerH,
        innerD - 1.5,
        bx,
        dy,
        innerZ + 0.2,
        outerMat,
        [0, 0, 0.85]
      );
      // Drawer Pull
      addBoxPart(
        st.furnitureGroup,
        Math.min(8, bayW * 0.4),
        0.5,
        0.6,
        bx,
        dy + 1.5,
        frontZ - 0.4,
        handleMat,
        [0, 0, 0.95]
      );
    }

    // 9. Overhead Loft Box
    if (hasLoft) {
      const loftCenterY = plinth + mainCarcassH + loftH / 2;
      addBoxPart(
        st.furnitureGroup,
        tCarcass,
        loftH,
        boxDepth,
        -W / 2 + tCarcass / 2,
        loftCenterY,
        zCenter,
        outerMat,
        [-1, 0.6, 0]
      );
      addBoxPart(
        st.furnitureGroup,
        tCarcass,
        loftH,
        boxDepth,
        W / 2 - tCarcass / 2,
        loftCenterY,
        zCenter,
        outerMat,
        [1, 0.6, 0]
      );
      addBoxPart(
        st.furnitureGroup,
        internalW,
        tCarcass,
        boxDepth,
        0,
        plinth + mainCarcassH + tCarcass / 2,
        zCenter,
        innerMat,
        [0, 0.7, 0]
      );
      addBoxPart(
        st.furnitureGroup,
        internalW,
        tCarcass,
        boxDepth,
        0,
        H - tCarcass / 2,
        zCenter,
        innerMat,
        [0, 0.9, 0]
      );
      if (config.includeBack && tBack > 0) {
        addBoxPart(
          st.furnitureGroup,
          W - 0.5,
          loftH - 0.5,
          tBack,
          0,
          loftCenterY,
          backZ + tBack / 2,
          backMat,
          [0, 0.6, -1.2]
        );
      }
    }

    // 10. Front Shutters / Doors (Hinged or Sliding)
    const shutterCount =
      config.shutterMode === 'none'
        ? 0
        : Math.max(1, Number(config.shutterCount) || 2);
    if (config.shutterMode === 'hinged' && shutterCount > 0) {
      const sH = mainCarcassH - 2 * gap;
      const sW = (W - (shutterCount + 1) * gap) / shutterCount;
      const sY = plinth + mainCarcassH / 2;
      const sZ = frontZ + tShutter / 2 + 0.08;

      for (let i = 0; i < shutterCount; i++) {
        const openLeft = i % 2 === 0;
        const leftEdgeX = -W / 2 + gap + i * (sW + gap);
        const hingeX = openLeft ? leftEdgeX : leftEdgeX + sW;

        const pivot = new THREE.Group();
        pivot.position.set(hingeX, sY, sZ);
        st.furnitureGroup.add(pivot);

        const doorGeo = new THREE.BoxGeometry(sW, sH, tShutter);
        const doorMesh = new THREE.Mesh(doorGeo, outerMat);
        doorMesh.position.set(openLeft ? sW / 2 : -sW / 2, 0, 0);
        doorMesh.castShadow = true;
        doorMesh.receiveShadow = true;

        if (showEdges) {
          const eGeo = new THREE.EdgesGeometry(doorGeo);
          doorMesh.add(
            new THREE.LineSegments(
              eGeo,
              new THREE.LineBasicMaterial({
                color: '#18181b',
                transparent: true,
                opacity: 0.5,
              })
            )
          );
        }

        // Sleek Vertical Bar Handle
        const handleGeo = new THREE.BoxGeometry(
          0.45,
          Math.min(18, sH * 0.24),
          0.75
        );
        const handleMesh = new THREE.Mesh(handleGeo, handleMat);
        const handleOffsetX = openLeft ? sW / 2 - 1.4 : -sW / 2 + 1.4;
        handleMesh.position.set(handleOffsetX, 0, tShutter / 2 + 0.35);
        doorMesh.add(handleMesh);

        pivot.add(doorMesh);
        st.doorPivots.push({
          pivot,
          openLeft,
          basePos: new THREE.Vector3(hingeX, sY, sZ),
        });
      }
    } else if (config.shutterMode === 'sliding' && shutterCount > 0) {
      const sH = mainCarcassH - 2 * tCarcass - 0.75;
      const overlap = 1.5;
      const sW = (internalW + overlap * (shutterCount - 1)) / shutterCount;
      const sY = plinth + mainCarcassH / 2;

      for (let i = 0; i < shutterCount; i++) {
        const trackOffset = i % 2 === 0 ? 0.5 : -0.5;
        const baseX = -internalW / 2 + sW / 2 + i * (sW - overlap);
        const baseZ = frontZ - 0.9 + trackOffset;

        const doorGeo = new THREE.BoxGeometry(sW, sH, tShutter);
        const doorMesh = new THREE.Mesh(doorGeo, outerMat);
        doorMesh.position.set(baseX, sY, baseZ);
        doorMesh.castShadow = true;

        if (showEdges) {
          const eGeo = new THREE.EdgesGeometry(doorGeo);
          doorMesh.add(
            new THREE.LineSegments(
              eGeo,
              new THREE.LineBasicMaterial({
                color: '#18181b',
                transparent: true,
                opacity: 0.5,
              })
            )
          );
        }

        const handleGeo = new THREE.BoxGeometry(
          0.4,
          Math.min(20, sH * 0.28),
          0.35
        );
        const handleMesh = new THREE.Mesh(handleGeo, handleMat);
        handleMesh.position.set(
          i % 2 === 0 ? -sW / 2 + 1.2 : sW / 2 - 1.2,
          0,
          tShutter / 2 + 0.18
        );
        doorMesh.add(handleMesh);

        st.furnitureGroup.add(doorMesh);
        st.slidingDoors.push({
          mesh: doorMesh,
          baseX,
          slideDir: i % 2 === 0 ? 1 : -1,
          maxSlide: sW * 0.65,
          basePos: new THREE.Vector3(baseX, sY, baseZ),
        });
      }
    }

    // Loft Hinged Shutters
    if (hasLoft && config.shutterMode !== 'none' && shutterCount > 0) {
      const lH = loftH - 2 * gap;
      const lW = (W - (shutterCount + 1) * gap) / shutterCount;
      const lY = plinth + mainCarcassH + loftH / 2;
      const lZ = frontZ + tShutter / 2 + 0.08;

      for (let i = 0; i < shutterCount; i++) {
        const openLeft = i % 2 === 0;
        const leftEdgeX = -W / 2 + gap + i * (lW + gap);
        const hingeX = openLeft ? leftEdgeX : leftEdgeX + lW;

        const pivot = new THREE.Group();
        pivot.position.set(hingeX, lY, lZ);
        st.furnitureGroup.add(pivot);

        const doorGeo = new THREE.BoxGeometry(lW, lH, tShutter);
        const doorMesh = new THREE.Mesh(doorGeo, outerMat);
        doorMesh.position.set(openLeft ? lW / 2 : -lW / 2, 0, 0);
        if (showEdges) {
          doorMesh.add(
            new THREE.LineSegments(
              new THREE.EdgesGeometry(doorGeo),
              new THREE.LineBasicMaterial({
                color: '#18181b',
                transparent: true,
                opacity: 0.5,
              })
            )
          );
        }
        pivot.add(doorMesh);
        st.doorPivots.push({
          pivot,
          openLeft,
          basePos: new THREE.Vector3(hingeX, lY, lZ),
        });
      }
    }
  }, [config, metrics, showEdges]);

  // Apply Interactive Shutter Open % & Exploded Assembly % smoothly
  useEffect(() => {
    const st = sceneStateRef.current;
    const openRatio = Math.max(0, Math.min(1, openAmount / 100));
    const explodeDist = (Math.max(0, Math.min(100, explodeAmount)) / 100) * 14;

    st.doorPivots.forEach(({ pivot, openLeft, basePos }) => {
      const maxAngle = Math.PI * 0.52 * openRatio;
      pivot.rotation.y = openLeft ? -maxAngle : maxAngle;
      pivot.position.set(basePos.x, basePos.y, basePos.z + explodeDist * 1.35);
    });

    st.slidingDoors.forEach(({ mesh, baseX, slideDir, maxSlide, basePos }) => {
      mesh.position.set(
        baseX + slideDir * maxSlide * openRatio,
        basePos.y,
        basePos.z + explodeDist * 1.1
      );
    });

    st.explodeParts.forEach(({ mesh, basePos, dir }) => {
      mesh.position.set(
        basePos.x + dir.x * explodeDist,
        basePos.y + dir.y * explodeDist,
        basePos.z + dir.z * explodeDist
      );
    });
  }, [openAmount, explodeAmount, config, metrics, showEdges]);

  return (
    <div
      ref={mountRef}
      className="w-full h-[460px] rounded-2xl overflow-hidden cursor-grab active:cursor-grabbing"
    />
  );
}

// ============================================================================
// 2. INITIAL DEFAULT DATA, TEMPLATES & CATALOGS
// ============================================================================
const DEFAULT_AVAILABLE_SHEETS = [
  {
    id: 'sh-1',
    name: "8' × 4' Standard",
    width: 96,
    height: 48,
    price: 2200,
    active: true,
  },
  {
    id: 'sh-2',
    name: "7' × 4' Medium",
    width: 84,
    height: 48,
    price: 1900,
    active: true,
  },
  {
    id: 'sh-3',
    name: "6' × 4' Compact",
    width: 72,
    height: 48,
    price: 1650,
    active: true,
  },
  {
    id: 'sh-4',
    name: "8' × 3' Narrow",
    width: 96,
    height: 36,
    price: 1750,
    active: true,
  },
];

const FURNITURE_TEMPLATES = {
  Wardrobe: [
    {
      name: 'Carcase Left/Right Side',
      widthInput: '24"',
      heightInput: '7\' 0"',
      width: 24,
      height: 84,
      qty: 2,
      grainLock: true,
    },
    {
      name: 'Top / Bottom / Mid Partition',
      widthInput: '24"',
      heightInput: '46"',
      width: 24,
      height: 46,
      qty: 3,
      grainLock: false,
    },
    {
      name: 'Shelves',
      widthInput: '23.5"',
      heightInput: '22"',
      width: 23.5,
      height: 22,
      qty: 4,
      grainLock: false,
    },
    {
      name: 'Shutters / Doors',
      widthInput: '23"',
      heightInput: '6\' 10"',
      width: 23,
      height: 82,
      qty: 2,
      grainLock: true,
    },
    {
      name: 'Back Panel',
      widthInput: '47"',
      heightInput: '6\' 11"',
      width: 47,
      height: 83,
      qty: 1,
      grainLock: false,
    },
  ],
  'Modular Kitchen': [
    {
      name: 'Base Cabinet Sides',
      widthInput: '24"',
      heightInput: '30"',
      width: 24,
      height: 30,
      qty: 4,
      grainLock: false,
    },
    {
      name: 'Base Cabinet Bottom/Shelf',
      widthInput: '24"',
      heightInput: '34"',
      width: 24,
      height: 34,
      qty: 2,
      grainLock: false,
    },
    {
      name: 'Wall Cabinet Sides',
      widthInput: '12"',
      heightInput: '30"',
      width: 12,
      height: 30,
      qty: 4,
      grainLock: false,
    },
    {
      name: 'Wall Cabinet Tops/Bottoms',
      widthInput: '12"',
      heightInput: '34"',
      width: 12,
      height: 34,
      qty: 4,
      grainLock: false,
    },
    {
      name: 'Shutter / Doors',
      widthInput: '17.5"',
      heightInput: '29.5"',
      width: 17.5,
      height: 29.5,
      qty: 4,
      grainLock: true,
    },
  ],
  Bed: [
    {
      name: 'Headboard Main Panel',
      widthInput: '6\' 0"',
      heightInput: '4\' 0"',
      width: 72,
      height: 48,
      qty: 1,
      grainLock: true,
    },
    {
      name: 'Bed Frame Side Rails',
      widthInput: '6\' 8"',
      heightInput: '10"',
      width: 80,
      height: 10,
      qty: 2,
      grainLock: true,
    },
    {
      name: 'Bed Frame Head/Foot Board',
      widthInput: '6\' 0"',
      heightInput: '12"',
      width: 72,
      height: 12,
      qty: 2,
      grainLock: false,
    },
    {
      name: 'Platform Support',
      widthInput: '35"',
      heightInput: '5\' 10"',
      width: 35,
      height: 70,
      qty: 2,
      grainLock: false,
    },
  ],
  'TV Unit': [
    {
      name: 'Back Paneling',
      widthInput: '5\' 0"',
      heightInput: '40"',
      width: 60,
      height: 40,
      qty: 1,
      grainLock: true,
    },
    {
      name: 'Console Box Top/Bottom',
      widthInput: '16"',
      heightInput: '4\' 10"',
      width: 16,
      height: 58,
      qty: 2,
      grainLock: false,
    },
    {
      name: 'Console Dividers',
      widthInput: '15"',
      heightInput: '12"',
      width: 15,
      height: 12,
      qty: 3,
      grainLock: false,
    },
    {
      name: 'Flap Doors',
      widthInput: '18"',
      heightInput: '4\' 9"',
      width: 18,
      height: 57,
      qty: 2,
      grainLock: true,
    },
  ],
  'Study Table': [
    {
      name: 'Table Top',
      widthInput: '24"',
      heightInput: '4\' 0"',
      width: 24,
      height: 48,
      qty: 1,
      grainLock: true,
    },
    {
      name: 'Side Support Legs',
      widthInput: '24"',
      heightInput: '30"',
      width: 24,
      height: 30,
      qty: 2,
      grainLock: false,
    },
    {
      name: 'Modesty Panel / Back',
      widthInput: '46"',
      heightInput: '12"',
      width: 46,
      height: 12,
      qty: 1,
      grainLock: false,
    },
    {
      name: 'Drawer Box Panels',
      widthInput: '18"',
      heightInput: '16"',
      width: 18,
      height: 16,
      qty: 4,
      grainLock: false,
    },
  ],
  'Office Furniture': [
    {
      name: 'Executive Desk Top',
      widthInput: '2\' 6"',
      heightInput: '5\' 0"',
      width: 30,
      height: 60,
      qty: 1,
      grainLock: true,
    },
    {
      name: 'Pedestal Sides',
      widthInput: '20"',
      heightInput: '26"',
      width: 20,
      height: 26,
      qty: 2,
      grainLock: false,
    },
    {
      name: 'Pedestal Drawers',
      widthInput: '18"',
      heightInput: '18"',
      width: 18,
      height: 18,
      qty: 3,
      grainLock: false,
    },
  ],
  'Custom Furniture': [
    {
      name: 'Tall Side Panel',
      widthInput: '24"',
      heightInput: '6\' 0"',
      width: 24,
      height: 72,
      qty: 4,
      grainLock: false,
    },
    {
      name: 'Medium Shelf',
      widthInput: '18"',
      heightInput: '3\' 0"',
      width: 18,
      height: 36,
      qty: 6,
      grainLock: false,
    },
    {
      name: 'Narrow Strip',
      widthInput: '12"',
      heightInput: '4\' 0"',
      width: 12,
      height: 48,
      qty: 4,
      grainLock: false,
    },
    {
      name: 'Cabinet Door',
      widthInput: '30"',
      heightInput: '24"',
      width: 30,
      height: 24,
      qty: 5,
      grainLock: false,
    },
    {
      name: 'Small Drawer Front',
      widthInput: '15"',
      heightInput: '20"',
      width: 15,
      height: 20,
      qty: 8,
      grainLock: false,
    },
  ],
};

const DEFAULT_MATERIALS = [
  {
    id: 'm1',
    name: '18mm BWP Marine Plywood (Smart Buy Sync)',
    category: 'Plywood',
    unit: 'Optimized Sheets',
    price: 2200,
  },
  {
    id: 'm2',
    name: '1mm Decorative Laminate Sheet',
    category: 'Laminate',
    unit: 'Sheet (8x4 ft)',
    price: 1150,
  },
  {
    id: 'm3',
    name: '0.8mm Inner Balancing Laminate',
    category: 'Laminate',
    unit: 'Sheet (8x4 ft)',
    price: 650,
  },
  {
    id: 'm4',
    name: 'PVC Edge Banding Tape (22x0.8mm)',
    category: 'Edge Banding',
    unit: 'Running Feet',
    price: 12,
  },
  {
    id: 'm5',
    name: 'Hydraulic Soft-Close Hinge',
    category: 'Hardware',
    unit: 'Piece',
    price: 145,
  },
  {
    id: 'm6',
    name: 'Telescopic Soft-Close Channel (18")',
    category: 'Hardware',
    unit: 'Set',
    price: 680,
  },
  {
    id: 'm7',
    name: 'SS Profile / Mortise Handle',
    category: 'Hardware',
    unit: 'Piece',
    price: 220,
  },
  {
    id: 'm8',
    name: 'Wood Screws, Glue & Fasteners',
    category: 'Hardware',
    unit: 'Kit',
    price: 450,
  },
];

const PROJECT_STATUS_OPTIONS = [
  {
    value: 'Draft',
    badgeClass: 'bg-neutral-800 text-neutral-300 border-neutral-700',
    dotClass: 'bg-neutral-400',
  },
  {
    value: 'Quoted',
    badgeClass: 'bg-blue-500/15 text-blue-300 border-blue-500/40',
    dotClass: 'bg-blue-400',
  },
  {
    value: 'Approved',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    dotClass: 'bg-emerald-400',
  },
  {
    value: 'In Production',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    dotClass: 'bg-amber-400',
  },
  {
    value: 'Delivered',
    badgeClass: 'bg-purple-500/15 text-purple-300 border-purple-500/40',
    dotClass: 'bg-purple-400',
  },
];

const DEFAULT_LAMINATE_CONFIG = {
  outer: {
    brand: 'Greenlam / Merino',
    color: 'Natural Oak Textured',
    thickness: '1.0mm',
    sheetW: 96,
    sheetH: 48,
    price: 1150,
    grainLock: true,
  },
  inner: {
    brand: 'Merino Liner',
    color: 'Frosty White Matte',
    thickness: '0.8mm',
    sheetW: 96,
    sheetH: 48,
    price: 650,
    grainLock: false,
  },
};

function computeSmartLaminatePlan(
  panels = [],
  lamConfig = DEFAULT_LAMINATE_CONFIG,
  kerf = 0.125
) {
  const cfg = {
    outer: { ...DEFAULT_LAMINATE_CONFIG.outer, ...(lamConfig?.outer || {}) },
    inner: { ...DEFAULT_LAMINATE_CONFIG.inner, ...(lamConfig?.inner || {}) },
  };

  const outerPanels = [];
  const innerPanels = [];

  panels.forEach((p, idx) => {
    const w = Number(p.width) || 0;
    const h = Number(p.height) || 0;
    const q = Math.max(1, Number(p.qty) || 1);
    if (w <= 0 || h <= 0) return;

    const lowerName = (p.name || '').toLowerCase();
    const isBack = lowerName.includes('back');
    const isShutterOrFacade =
      lowerName.includes('shutter') ||
      lowerName.includes('door') ||
      lowerName.includes('fascia') ||
      lowerName.includes('front') ||
      lowerName.includes('headboard') ||
      lowerName.includes('top');
    const isCarcassSide =
      lowerName.includes('side') && !lowerName.includes('drawer');

    if (isBack) {
      // Back panel gets 1 inner liner face
      innerPanels.push({
        id: `lam-in-${idx}`,
        name: `${p.name} (Inner Face)`,
        width: w,
        height: h,
        qty: q,
        grainLock: cfg.inner.grainLock,
      });
    } else if (isShutterOrFacade) {
      // External shutters/facades: Outer decorative laminate outside + Inner white liner inside
      outerPanels.push({
        id: `lam-out-${idx}`,
        name: `${p.name} (Outer Face)`,
        width: w,
        height: h,
        qty: q,
        grainLock: cfg.outer.grainLock,
      });
      innerPanels.push({
        id: `lam-in-${idx}`,
        name: `${p.name} (Inner Backing)`,
        width: w,
        height: h,
        qty: q,
        grainLock: cfg.inner.grainLock,
      });
    } else if (isCarcassSide) {
      // Carcass sides: 1 visible outer side + 1 interior white side
      outerPanels.push({
        id: `lam-out-${idx}`,
        name: `${p.name} (Visible Outer)`,
        width: w,
        height: h,
        qty: q,
        grainLock: cfg.outer.grainLock,
      });
      innerPanels.push({
        id: `lam-in-${idx}`,
        name: `${p.name} (Interior Side)`,
        width: w,
        height: h,
        qty: q,
        grainLock: cfg.inner.grainLock,
      });
    } else {
      // Internal shelves, partitions, drawers: Both faces get inner white liner laminate
      innerPanels.push({
        id: `lam-in-${idx}`,
        name: `${p.name} (Both Sides)`,
        width: w,
        height: h,
        qty: q * 2,
        grainLock: cfg.inner.grainLock,
      });
    }
  });

  const packLaminateGroup = (panelList, spec, label) => {
    if (panelList.length === 0) {
      return {
        label,
        spec,
        sheetsCount: 0,
        sheets: [],
        totalCost: 0,
        netAreaSqFt: 0,
        wastePercent: 0,
      };
    }
    const sheetSpec = {
      id: `lam-sheet-${label}`,
      name: `${spec.brand} (${spec.thickness})`,
      width: Math.max(24, Number(spec.sheetW) || 96),
      height: Math.max(24, Number(spec.sheetH) || 48),
      price: Math.max(0, Number(spec.price) || 0),
    };
    const res = evaluatePurchaseStrategy(
      label,
      `${spec.brand} — ${spec.color}`,
      () => sheetSpec,
      panelList,
      [],
      {
        kerf,
        trim: 0,
        allowRotation: !spec.grainLock,
        splitDirection: 'auto',
        minReusableW: 12,
        minReusableH: 18,
      }
    );
    return {
      label,
      spec,
      sheetsCount: res.purchasedSheetsCount,
      sheets: res.sheets,
      totalCost: res.totalPurchaseCost,
      netAreaSqFt: res.totalUsableAreaSqFt,
      wastePercent: res.netWastePercent,
    };
  };

  const outerPlan = packLaminateGroup(
    outerPanels,
    cfg.outer,
    'Outer Decorative Laminate'
  );
  const innerPlan = packLaminateGroup(
    innerPanels,
    cfg.inner,
    'Inner White Liner Laminate'
  );

  return {
    config: cfg,
    outer: outerPlan,
    inner: innerPlan,
    totalSheets: outerPlan.sheetsCount + innerPlan.sheetsCount,
    totalCost: outerPlan.totalCost + innerPlan.totalCost,
  };
}

function buildSuggestedHardwareList(
  panels = [],
  sheetsCount = 1,
  furnitureType = 'Wardrobe',
  prices = {}
) {
  const totalPanels = panels.reduce((s, p) => s + (Number(p.qty) || 1), 0);
  const shutterPanels = panels.filter(
    (p) =>
      (p.name || '').toLowerCase().includes('shutter') ||
      (p.name || '').toLowerCase().includes('door')
  );
  const shutterCount =
    shutterPanels.reduce((s, p) => s + (Number(p.qty) || 1), 0) ||
    Math.max(2, Math.ceil(totalPanels / 6));
  const drawerPanels = panels.filter((p) =>
    (p.name || '').toLowerCase().includes('drawer')
  );
  const estDrawers =
    drawerPanels.length > 0
      ? Math.max(
          1,
          Math.ceil(
            drawerPanels.reduce((s, p) => s + (Number(p.qty) || 1), 0) / 4
          )
        )
      : furnitureType === 'Modular Kitchen'
      ? 4
      : 2;
  const isWardrobe = (furnitureType || '').toLowerCase().includes('wardrobe');

  return [
    {
      id: 'hw-soft-hinge',
      name: 'Soft-Close Hydraulic Hinges',
      qty: shutterCount * 3,
      unit: 'Pcs',
      rate: prices.hinge ?? 145,
    },
    {
      id: 'hw-std-hinge',
      name: 'Standard Butt / Regular Hinges',
      qty: 0,
      unit: 'Pcs',
      rate: 75,
    },
    {
      id: 'hw-tele-channel',
      name: 'Telescopic Soft-Close Channels (18")',
      qty: estDrawers,
      unit: 'Sets',
      rate: prices.channel ?? 680,
    },
    {
      id: 'hw-drawer-channel',
      name: 'Standard Roller Drawer Channels',
      qty: 0,
      unit: 'Sets',
      rate: 280,
    },
    {
      id: 'hw-handles',
      name: 'SS Profile / Cabinet Handles',
      qty: shutterCount + estDrawers,
      unit: 'Pcs',
      rate: prices.handle ?? 220,
    },
    {
      id: 'hw-locks',
      name: 'Multipurpose Cupboard Locks',
      qty: Math.max(1, Math.ceil(shutterCount / 2)),
      unit: 'Pcs',
      rate: 180,
    },
    {
      id: 'hw-mag-catch',
      name: 'Heavy-Duty Magnetic Catches',
      qty: shutterCount,
      unit: 'Pcs',
      rate: 35,
    },
    {
      id: 'hw-hang-rod',
      name: 'Oval SS Hanging Rods with Brackets',
      qty: isWardrobe ? 2 : 0,
      unit: 'Sets',
      rate: 320,
    },
    {
      id: 'hw-brackets',
      name: 'L-Brackets & Shelf Support Pins',
      qty: Math.max(8, totalPanels * 2),
      unit: 'Pcs',
      rate: 12,
    },
    {
      id: 'hw-screws',
      name: 'Wood Screws, Minifix & Adhesives Kit',
      qty: Math.max(1, Math.ceil(sheetsCount / 3)),
      unit: 'Kits',
      rate: prices.screw ?? 450,
    },
  ];
}

// ============================================================================
// 3. 2D GUILLOTINE SHEET PACKING & MULTI-SIZE SMART BUY OPTIMIZATION ENGINE
// ============================================================================
function packPanelsIntoSingleSheet(sheetSpec, panelsQueue, settings) {
  const {
    kerf = 0.125,
    trim = 0,
    trimLeft,
    trimRight,
    trimTop,
    trimBottom,
    allowRotation = true,
    splitDirection = 'auto',
    minReusableW = 12,
    minReusableH = 12,
    minReusableAreaSqFt = 0,
  } = settings;

  const tL = trimLeft !== undefined ? Number(trimLeft) : Number(trim);
  const tR = trimRight !== undefined ? Number(trimRight) : Number(trim);
  const tT = trimTop !== undefined ? Number(trimTop) : Number(trim);
  const tB = trimBottom !== undefined ? Number(trimBottom) : Number(trim);

  const usableW = Math.max(0, sheetSpec.width - (tL + tR));
  const usableH = Math.max(0, sheetSpec.height - (tT + tB));

  let freeRects = [{ x: tL, y: tT, w: usableW, h: usableH }];
  const placedRects = [];
  const cutSteps = [];
  const remainingQueue = [];
  let kerfLossSqIn = 0;

  for (const panel of panelsQueue) {
    let bestRectIdx = -1;
    let bestOri = null;
    let bestScore = Infinity;

    const orientations = [{ w: panel.w, h: panel.h, rotated: false }];
    // Standard plywood grain runs along the longer sheet axis (e.g. 96" in 96"x48").
    // Allow aligning the panel's longer dimension along the sheet's longer axis even when Grain is Locked,
    // or full rotation when Grain is Free.
    const alignsWithSheetGrain =
      (panel.h >= panel.w && sheetSpec.width >= sheetSpec.height) ||
      (panel.w >= panel.h && sheetSpec.height >= sheetSpec.width);

    if (
      (allowRotation && !panel.grainLock && panel.w !== panel.h) ||
      (panel.grainLock && alignsWithSheetGrain && panel.w !== panel.h)
    ) {
      orientations.push({ w: panel.h, h: panel.w, rotated: true });
    }

    for (let i = 0; i < freeRects.length; i++) {
      const fr = freeRects[i];
      for (const ori of orientations) {
        if (ori.w <= fr.w + 0.001 && ori.h <= fr.h + 0.001) {
          // Best Short Side Fit (BSSF) heuristic
          const remW = fr.w - ori.w;
          const remH = fr.h - ori.h;
          const score = Math.min(remW, remH) * 1000 + Math.max(remW, remH);
          if (score < bestScore) {
            bestScore = score;
            bestRectIdx = i;
            bestOri = ori;
          }
        }
      }
    }

    if (bestRectIdx !== -1 && bestOri) {
      const fr = freeRects[bestRectIdx];
      placedRects.push({
        ...panel,
        x: fr.x,
        y: fr.y,
        w: bestOri.w,
        h: bestOri.h,
        rotated: bestOri.rotated,
      });

      // Record guillotine cut sequence
      cutSteps.push({
        step: cutSteps.length + 1,
        panelName: panel.name,
        cutDim: `${bestOri.w}" × ${bestOri.h}"`,
        pos: `X:${fr.x.toFixed(1)}", Y:${fr.y.toFixed(1)}"`,
        rotated: bestOri.rotated,
      });

      // Guillotine split remaining free rectangle
      freeRects.splice(bestRectIdx, 1);
      const remW = Math.max(0, fr.w - bestOri.w - kerf);
      const remH = Math.max(0, fr.h - bestOri.h - kerf);
      kerfLossSqIn += kerf * (bestOri.w + bestOri.h);

      // Decide horizontal vs vertical guillotine split
      let splitHorizontally = splitDirection === 'horizontal';
      if (splitDirection === 'auto') {
        // Split along the axis that leaves the larger contiguous offcut
        splitHorizontally = remW * fr.h < fr.w * remH;
      }

      if (splitHorizontally) {
        if (remW > 0.5 && bestOri.h > 0.5) {
          freeRects.push({
            x: fr.x + bestOri.w + kerf,
            y: fr.y,
            w: remW,
            h: bestOri.h,
          });
        }
        if (fr.w > 0.5 && remH > 0.5) {
          freeRects.push({
            x: fr.x,
            y: fr.y + bestOri.h + kerf,
            w: fr.w,
            h: remH,
          });
        }
      } else {
        if (remW > 0.5 && fr.h > 0.5) {
          freeRects.push({
            x: fr.x + bestOri.w + kerf,
            y: fr.y,
            w: remW,
            h: fr.h,
          });
        }
        if (bestOri.w > 0.5 && remH > 0.5) {
          freeRects.push({
            x: fr.x,
            y: fr.y + bestOri.h + kerf,
            w: bestOri.w,
            h: remH,
          });
        }
      }

      // Sort freeRects by area ascending so smaller gaps get filled first
      freeRects.sort((a, b) => a.w * a.h - b.w * b.h);
    } else {
      remainingQueue.push(panel);
    }
  }

  // Classify free rectangles into Reusable Offcuts vs Non-Reusable Scrap
  const reusableOffcuts = [];
  const nonReusableScrap = [];

  freeRects.forEach((r, idx) => {
    const areaSqFt = Math.round(((r.w * r.h) / 144) * 100) / 100;
    const fitsDims =
      (r.w >= minReusableW && r.h >= minReusableH) ||
      (r.w >= minReusableH && r.h >= minReusableW);
    const fitsArea = areaSqFt >= minReusableAreaSqFt;

    if (fitsDims && fitsArea) {
      reusableOffcuts.push({
        id: `offcut-${idx}-${Math.round(r.x)}-${Math.round(r.y)}`,
        w: Math.round(r.w * 100) / 100,
        h: Math.round(r.h * 100) / 100,
        areaSqFt,
        status: 'Reusable',
      });
    } else if (r.w > 0.1 && r.h > 0.1) {
      nonReusableScrap.push({
        id: `scrap-${idx}-${Math.round(r.x)}-${Math.round(r.y)}`,
        w: Math.round(r.w * 100) / 100,
        h: Math.round(r.h * 100) / 100,
        areaSqFt,
        status: 'Non-Reusable',
      });
    }
  });

  const usedArea = placedRects.reduce((sum, p) => sum + p.w * p.h, 0);
  const totalSheetArea = sheetSpec.width * sheetSpec.height;
  const trimLossSqIn = Math.max(0, totalSheetArea - usableW * usableH);
  const reusableArea = reusableOffcuts.reduce((sum, o) => sum + o.w * o.h, 0);
  const clampedKerfLossSqIn = Math.min(
    kerfLossSqIn,
    Math.max(0, totalSheetArea - usedArea - trimLossSqIn - reusableArea)
  );

  return {
    sheetSpec,
    placedRects,
    freeRects,
    reusableOffcuts,
    nonReusableScrap,
    cutSteps,
    remainingQueue,
    usedArea,
    totalSheetArea,
    reusableArea,
    trimLossSqIn,
    kerfLossSqIn: clampedKerfLossSqIn,
  };
}

function evaluatePurchaseStrategy(
  strategyName,
  description,
  sheetSelectorFn,
  allPanels,
  inventoryStock,
  settings
) {
  // Expand panels with quantities
  let unplaced = [];
  allPanels.forEach((p, idx) => {
    const q = Math.max(1, Number(p.qty) || 1);
    const w = Number(p.width) || 0;
    const h = Number(p.height) || 0;
    if (w > 0 && h > 0) {
      for (let i = 0; i < q; i++) {
        unplaced.push({
          uid: `p-${idx}-${i}`,
          name: p.name || `Panel ${idx + 1}`,
          w,
          h,
          grainLock: Boolean(p.grainLock),
        });
      }
    }
  });

  // Sort panels by area descending (First Fit Decreasing)
  unplaced.sort((a, b) => b.w * b.h - a.w * a.h);

  const usedSheets = [];
  let availableInventory = settings.useStockFirst ? [...inventoryStock] : [];
  let impossiblePanels = [];
  let safetyCounter = 0;

  while (unplaced.length > 0 && safetyCounter < 150) {
    safetyCounter++;

    // 1. Check if an inventory stock sheet can fit at least one remaining panel
    let chosenSheet = null;
    let isFromStock = false;

    if (availableInventory.length > 0) {
      for (let sIdx = 0; sIdx < availableInventory.length; sIdx++) {
        const stockItem = availableInventory[sIdx];
        const testPack = packPanelsIntoSingleSheet(
          {
            id: stockItem.id,
            name: `Stock Offcut (${stockItem.w}"×${stockItem.h}")`,
            width: stockItem.w,
            height: stockItem.h,
            price: 0,
          },
          unplaced,
          settings
        );
        if (testPack.placedRects.length > 0) {
          chosenSheet = {
            id: stockItem.id,
            name: `Existing Stock (${stockItem.w}"×${stockItem.h}")`,
            width: stockItem.w,
            height: stockItem.h,
            price: 0,
          };
          isFromStock = true;
          availableInventory.splice(sIdx, 1);
          break;
        }
      }
    }

    // 2. Otherwise pick a purchasable sheet according to strategy
    if (!chosenSheet) {
      chosenSheet = sheetSelectorFn(unplaced, usedSheets.length);
    }

    if (!chosenSheet) {
      impossiblePanels = [...unplaced];
      break;
    }

    const packResult = packPanelsIntoSingleSheet(
      chosenSheet,
      unplaced,
      settings
    );

    if (packResult.placedRects.length === 0) {
      // Selected sheet couldn't fit any remaining panel; mark impossible if no larger sheet exists
      impossiblePanels = [...unplaced];
      break;
    }

    usedSheets.push({
      sheetIndex: usedSheets.length + 1,
      isFromStock,
      ...packResult,
    });

    unplaced = packResult.remainingQueue;
  }

  // Aggregate metrics
  const totalPurchaseCost = usedSheets.reduce(
    (sum, s) => sum + (s.isFromStock ? 0 : Number(s.sheetSpec.price || 0)),
    0
  );
  const totalSheetArea = usedSheets.reduce(
    (sum, s) => sum + s.totalSheetArea,
    0
  );
  const totalUsablePanelArea = usedSheets.reduce(
    (sum, s) => sum + s.usedArea,
    0
  );
  const totalReusableArea = usedSheets.reduce(
    (sum, s) => sum + s.reusableArea,
    0
  );
  const totalTrimLossArea = usedSheets.reduce(
    (sum, s) => sum + (s.trimLossSqIn || 0),
    0
  );
  const totalKerfLossArea = usedSheets.reduce(
    (sum, s) => sum + (s.kerfLossSqIn || 0),
    0
  );
  const netWastageArea = Math.max(
    0,
    totalSheetArea - totalUsablePanelArea - totalReusableArea
  );
  const unusableOffcutArea = Math.max(
    0,
    netWastageArea - totalTrimLossArea - totalKerfLossArea
  );
  const grossWastageArea = Math.max(0, totalSheetArea - totalUsablePanelArea);

  const grossWastePercent =
    totalSheetArea > 0
      ? Math.round((grossWastageArea / totalSheetArea) * 1000) / 10
      : 0;
  const netWastePercent =
    totalSheetArea > 0
      ? Math.round((netWastageArea / totalSheetArea) * 1000) / 10
      : 0;
  const efficiencyPercent =
    totalSheetArea > 0
      ? Math.round((totalUsablePanelArea / totalSheetArea) * 1000) / 10
      : 0;

  // Group sheets by size for Purchase Order summary
  const purchaseSummaryMap = {};
  usedSheets.forEach((s) => {
    if (s.isFromStock) return;
    const key = `${s.sheetSpec.width}x${s.sheetSpec.height}-${s.sheetSpec.price}`;
    if (!purchaseSummaryMap[key]) {
      purchaseSummaryMap[key] = {
        name: s.sheetSpec.name,
        width: s.sheetSpec.width,
        height: s.sheetSpec.height,
        unitPrice: Number(s.sheetSpec.price),
        qty: 0,
        subtotal: 0,
      };
    }
    purchaseSummaryMap[key].qty += 1;
    purchaseSummaryMap[key].subtotal += Number(s.sheetSpec.price);
  });

  const allReusableOffcuts = usedSheets.flatMap((s) =>
    s.reusableOffcuts.map((o) => ({ ...o, fromSheet: s.sheetIndex }))
  );

  return {
    id: strategyName.toLowerCase().replace(/\s+/g, '-'),
    strategyName,
    description,
    feasible: impossiblePanels.length === 0 && usedSheets.length > 0,
    impossiblePanels,
    sheets: usedSheets,
    totalSheetsCount: usedSheets.length,
    purchasedSheetsCount: usedSheets.filter((s) => !s.isFromStock).length,
    stockSheetsUsedCount: usedSheets.filter((s) => s.isFromStock).length,
    totalPurchaseCost,
    totalSheetAreaSqFt: Math.round((totalSheetArea / 144) * 100) / 100,
    totalUsableAreaSqFt: Math.round((totalUsablePanelArea / 144) * 100) / 100,
    totalReusableAreaSqFt: Math.round((totalReusableArea / 144) * 100) / 100,
    trimLossAreaSqFt: Math.round((totalTrimLossArea / 144) * 100) / 100,
    kerfLossAreaSqFt: Math.round((totalKerfLossArea / 144) * 100) / 100,
    unusableScrapAreaSqFt: Math.round((unusableOffcutArea / 144) * 100) / 100,
    grossWastageAreaSqFt: Math.round((grossWastageArea / 144) * 100) / 100,
    netWastageAreaSqFt: Math.round((netWastageArea / 144) * 100) / 100,
    grossWastePercent,
    netWastePercent,
    efficiencyPercent,
    purchaseBreakdown: Object.values(purchaseSummaryMap),
    allReusableOffcuts,
  };
}

function runSmartBuyEngine(panels, availableSheets, inventoryStock, settings) {
  const activeSheets = availableSheets.filter(
    (s) => s.active && s.width > 0 && s.height > 0
  );
  if (activeSheets.length === 0 || panels.length === 0) {
    return { options: [], recommended: null };
  }

  // Helper to check if a sheet can physically fit the largest remaining panel
  const canFitAnyPanel = (sheet, remPanels) => {
    const {
      trim = 0,
      trimLeft,
      trimRight,
      trimTop,
      trimBottom,
      allowRotation = true,
    } = settings;
    const tL = trimLeft !== undefined ? Number(trimLeft) : Number(trim);
    const tR = trimRight !== undefined ? Number(trimRight) : Number(trim);
    const tT = trimTop !== undefined ? Number(trimTop) : Number(trim);
    const tB = trimBottom !== undefined ? Number(trimBottom) : Number(trim);
    const uw = sheet.width - (tL + tR);
    const uh = sheet.height - (tT + tB);
    return remPanels.some((p) => {
      const normalFit = p.w <= uw + 0.001 && p.h <= uh + 0.001;
      const alignsWithSheetGrain =
        (p.h >= p.w && sheet.width >= sheet.height) ||
        (p.w >= p.h && sheet.height >= sheet.width);
      const rotFit =
        ((allowRotation && !p.grainLock) ||
          (p.grainLock && alignsWithSheetGrain)) &&
        p.h <= uw + 0.001 &&
        p.w <= uh + 0.001;
      return normalFit || rotFit;
    });
  };

  // STRATEGY A: Smart Hybrid Cost-Optimal Mix (Evaluates every valid sheet size on remaining queue and picks lowest cost-per-panel-area packed)
  const hybridSelector = (remPanels) => {
    const valid = activeSheets.filter((s) => canFitAnyPanel(s, remPanels));
    if (valid.length === 0) return null;

    let bestSheet = valid[0];
    let bestMetric = Infinity;

    for (const candidate of valid) {
      const sim = packPanelsIntoSingleSheet(candidate, remPanels, settings);
      if (sim.placedRects.length === 0) continue;

      // Score combines cost per sq.in of placed panels + penalty for unutilized leftover waste
      const costPerSqIn = (Number(candidate.price) || 1) / sim.usedArea;
      const wasteRatio =
        (sim.totalSheetArea - sim.usedArea - sim.reusableArea * 0.5) /
        sim.totalSheetArea;
      const score = costPerSqIn * (1 + wasteRatio * 0.35);

      if (score < bestMetric) {
        bestMetric = score;
        bestSheet = candidate;
      }
    }
    return bestSheet;
  };

  // STRATEGY B: Maximum Yield / Largest Sheet First (Minimizes total sheet count & cuts)
  const largestFirstSelector = (remPanels) => {
    const valid = activeSheets
      .filter((s) => canFitAnyPanel(s, remPanels))
      .sort((a, b) => b.width * b.height - a.width * a.height);
    return valid[0] || null;
  };

  // STRATEGY C: Compact / Minimum Offcut Waste (Prefers smallest sheet that fits remaining panels to minimize scrap)
  const compactWasteSelector = (remPanels) => {
    const valid = activeSheets
      .filter((s) => canFitAnyPanel(s, remPanels))
      .sort((a, b) => a.width * a.height - b.width * b.height);
    return valid[0] || null;
  };

  // STRATEGY D: Lowest Unit Sheet Price Priority
  const lowestPriceSelector = (remPanels) => {
    const valid = activeSheets
      .filter((s) => canFitAnyPanel(s, remPanels))
      .sort((a, b) => Number(a.price) - Number(b.price));
    return valid[0] || null;
  };

  const rawOptions = [
    evaluatePurchaseStrategy(
      'Option A: Smart Hybrid Mix',
      'Dynamically blends large & compact sheet sizes per batch for lowest total cost and minimal scrap.',
      hybridSelector,
      panels,
      inventoryStock,
      settings
    ),
    evaluatePurchaseStrategy(
      'Option B: Standard Full-Sheet Priority',
      "Prioritizes largest available sheets (e.g., 8'×4') for fewer cuts and large continuous offcuts.",
      largestFirstSelector,
      panels,
      inventoryStock,
      settings
    ),
    evaluatePurchaseStrategy(
      'Option C: Compact Zero-Waste Fit',
      "Matches smaller panels to compact sheet sizes (e.g., 6'×4', 7'×4') to eliminate dead offcuts.",
      compactWasteSelector,
      panels,
      inventoryStock,
      settings
    ),
    evaluatePurchaseStrategy(
      'Option D: Economy Sheet First',
      'Prioritizes lowest unit-cost sheets that accommodate remaining panel dimensions.',
      lowestPriceSelector,
      panels,
      inventoryStock,
      settings
    ),
  ];

  // Deduplicate identical purchase plans while keeping distinct comparisons
  const uniqueOptions = [];
  const seenSignatures = new Set();
  for (const opt of rawOptions) {
    const sig = `${opt.totalPurchaseCost}-${opt.totalSheetsCount}-${opt.netWastePercent}`;
    if (!seenSignatures.has(sig) || uniqueOptions.length < 2) {
      seenSignatures.add(sig);
      uniqueOptions.push(opt);
    }
  }

  // Recommend best feasible option by lowest total cost, tie-breaking by lowest net waste %
  const feasibleOptions = uniqueOptions.filter((o) => o.feasible);
  feasibleOptions.sort((a, b) => {
    if (Math.abs(a.totalPurchaseCost - b.totalPurchaseCost) > 1) {
      return a.totalPurchaseCost - b.totalPurchaseCost;
    }
    return a.netWastePercent - b.netWastePercent;
  });

  const recommended = feasibleOptions[0] || uniqueOptions[0] || null;

  return {
    options: uniqueOptions,
    recommended,
  };
}

// ============================================================================
// 4. MAIN APPLICATION COMPONENT
// ============================================================================
export default function App() {
  const [activeTab, setActiveTab] = useState('smartbuy');
  const [themeMode, setThemeMode] = useState(
    () => localStorage.getItem('ply_optimizer_theme_v1') || 'dark'
  );

  // PWA Install Prompt, Online Status & Splash Screen State
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null);
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [showPwaGuideModal, setShowPwaGuideModal] = useState(false);
  const [showSplashScreen, setShowSplashScreen] = useState(true);

  // Cloud Authentication & Synchronization State (Firebase)
  const [cloudUser, setCloudUser] = useState(null);
  const [cloudSyncStatus, setCloudSyncStatus] = useState('local-only'); // 'local-only' | 'syncing' | 'synced' | 'error'
  const [lastCloudSyncTime, setLastCloudSyncTime] = useState(null);
  const [autoCloudSync, setAutoCloudSync] = useState(
    () => localStorage.getItem('ply_auto_cloud_sync_v1') !== 'false'
  );
  const [showCloudModal, setShowCloudModal] = useState(false);
  const [authMode, setAuthMode] = useState('signin'); // 'signin' | 'signup'
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const isRemoteSnapshotApplyingRef = useRef(false);

  const [workshopSettings, setWorkshopSettings] = useState(() => {
    const saved = localStorage.getItem('ply_optimizer_workshop_defaults_v1');
    if (saved) {
      try {
        return { ...FACTORY_WORKSHOP_DEFAULTS, ...JSON.parse(saved) };
      } catch (e) {
        console.error(e);
      }
    }
    return FACTORY_WORKSHOP_DEFAULTS;
  });
  const [draftSettings, setDraftSettings] = useState(workshopSettings);
  const [unitDisplay, setUnitDisplay] = useState(
    () => workshopSettings.measurementMode || 'mixed'
  );
  const [currency, setCurrency] = useState(
    () => workshopSettings.currencySymbol || '₹'
  );
  const [notification, setNotification] = useState(null);
  const [highlightCutLines, setHighlightCutLines] = useState(true);
  const [showHavePlyModal, setShowHavePlyModal] = useState(false);
  const [ownPlyInput, setOwnPlyInput] = useState({
    widthInput: '8\' 0"',
    heightInput: '4\' 0"',
    qty: 1,
  });
  const [isEditingQuotePdf, setIsEditingQuotePdf] = useState(false);

  // 3D Parametric Builder Interactive Viewport Controls
  const [openShutterPct, setOpenShutterPct] = useState(12);
  const [explodePct, setExplodePct] = useState(0);
  const [cameraPreset3D, setCameraPreset3D] = useState('3/4');
  const [showEdges3D, setShowEdges3D] = useState(true);
  const [viewer3DBgTheme, setViewer3DBgTheme] = useState('dark');
  const [showControls3D, setShowControls3D] = useState(true);
  const [showCutListPreview3D, setShowCutListPreview3D] = useState(true);
  const [selectedMaterialFilter3D, setSelectedMaterialFilter3D] =
    useState('ALL');
  const threeCanvasRef = useRef(null);

  // Reusable Leftover Inventory (Persisted across projects)
  const [inventoryStock, setInventoryStock] = useState(() => {
    const saved = localStorage.getItem('ply_optimizer_stock_v2');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return [
      {
        id: 'stk-1',
        w: 48,
        h: 36,
        source: 'Previous Wardrobe Offcut',
        date: '2026-11-12',
      },
    ];
  });

  // Client & Supplier Address Book State (Declared before Cloud Sync effects)
  const [contacts, setContacts] = useState(() => {
    const saved = localStorage.getItem('ply_optimizer_contacts_v1');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return {
      clients: [
        {
          id: 'cli-1',
          name: 'Mr. & Mrs. Sharma',
          company: 'Sharma Residence',
          phone: '+91 98201 11223',
          whatsapp: '+91 98201 11223',
          email: 'sharma.home@example.com',
          address: 'B-402, Emerald Towers, Bandra West, Mumbai',
          gstin: '',
          notes: 'Prefers Natural Oak finish & soft-close hardware',
        },
      ],
      suppliers: [
        {
          id: 'sup-1',
          name: 'Rajesh Patel',
          company: 'Royal Timbers & Plywood Depot',
          phone: '+91 98201 44510',
          whatsapp: '+91 98201 44510',
          email: 'orders@royaltimbers.in',
          address: 'Plot 14, Timber Market, GIDC',
          gstin: '27AAACR5055K1Z2',
          categories: 'BWP Plywood, Block Board, Laminates, Edge Banding',
          notes: 'Same-day tempo delivery for 5+ sheets',
        },
      ],
    };
  });

  // Projects State
  const [projects, setProjects] = useState(() => {
    const saved = localStorage.getItem('ply_optimizer_projects_v2');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return [
      {
        id: 'proj-1',
        name: 'Modular Wardrobe & Storage',
        client: 'Mr. & Mrs. Sharma',
        supplierName: 'Royal Timbers & Plywood Depot',
        supplierPhone: '+91 98201 44510',
        date: new Date().toISOString().split('T')[0],
        furnitureType: 'Custom Furniture',
        panels: [...FURNITURE_TEMPLATES['Custom Furniture']].map((p, i) => ({
          id: `init-p-${i}`,
          ...p,
        })),
        availableSheets: [...DEFAULT_AVAILABLE_SHEETS],
        cutSettings: {
          kerf: 0.125,
          trim: 0,
          allowRotation: true,
          splitDirection: 'auto',
          minReusableW: 12,
          minReusableH: 18,
          useStockFirst: false,
        },
        cuttingLaborPerSheet: 120,
        carpentryLaborCost: 4500,
        transportCost: 850,
        wastagePercent: 5,
        profitPercent: 20,
        materials: [...DEFAULT_MATERIALS],
        parametric3D: {
          presetName: '2-Door Wardrobe',
          ...PARAMETRIC_FURNITURE_PRESETS['2-Door Wardrobe'],
          customOverrides: null,
        },
      },
    ];
  });

  const [currentProjectId, setCurrentProjectId] = useState(
    projects[0]?.id || 'proj-1'
  );
  const currentProject =
    projects.find((p) => p.id === currentProjectId) || projects[0];

  useEffect(() => {
    localStorage.setItem('ply_optimizer_projects_v2', JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    localStorage.setItem(
      'ply_optimizer_stock_v2',
      JSON.stringify(inventoryStock)
    );
  }, [inventoryStock]);

  useEffect(() => {
    localStorage.setItem('ply_optimizer_theme_v1', themeMode);
  }, [themeMode]);

  useEffect(() => {
    localStorage.setItem('ply_auto_cloud_sync_v1', String(autoCloudSync));
  }, [autoCloudSync]);

  // Initialize PWA Manifest, Service Worker, Install Listener & Splash Timer
  useEffect(() => {
    registerDynamicPwaManifestAndSw();
    const splashTimer = setTimeout(() => setShowSplashScreen(false), 750);

    try {
      if (
        window.matchMedia &&
        window.matchMedia('(display-mode: standalone)').matches
      ) {
        setIsAppInstalled(true);
      }
    } catch (_) {}

    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };
    const onAppInstalled = () => {
      setIsAppInstalled(true);
      setDeferredInstallPrompt(null);
      showNotification('PLYOPTIMIZE installed as a standalone app!');
    };
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      clearTimeout(splashTimer);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Initialize Firebase Authentication Safely (Works with or without Firebase SDK)
  const fbModulesRef = useRef(null);
  useEffect(() => {
    let unsub = null;
    initOptionalFirebase().then(async (mods) => {
      if (!mods || !auth) return;
      fbModulesRef.current = mods;
      const { fbAuthMod } = mods;
      try {
        if (
          typeof __initial_auth_token !== 'undefined' &&
          __initial_auth_token
        ) {
          await fbAuthMod.signInWithCustomToken(auth, __initial_auth_token);
        } else if (!auth.currentUser) {
          await fbAuthMod.signInAnonymously(auth);
        }
      } catch (err) {
        console.debug('Cloud auth init note:', err);
      }
      unsub = fbAuthMod.onAuthStateChanged(auth, (u) => {
        setCloudUser(u || null);
        if (!u) setCloudSyncStatus('local-only');
      });
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  // Real-Time Firestore Listener for Cross-Device Sync
  useEffect(() => {
    if (!db || !cloudUser || !autoCloudSync || !fbModulesRef.current) return;
    const { doc, onSnapshot } = fbModulesRef.current.fbStoreMod;
    const workspaceDocRef = doc(
      db,
      'artifacts',
      appId,
      'users',
      cloudUser.uid,
      'workspace',
      'mainState'
    );
    const unsub = onSnapshot(
      workspaceDocRef,
      (snap) => {
        if (snap.exists()) {
          const remote = snap.data();
          if (
            remote &&
            Array.isArray(remote.projects) &&
            remote.projects.length > 0
          ) {
            isRemoteSnapshotApplyingRef.current = true;
            setProjects(remote.projects);
            if (Array.isArray(remote.inventoryStock))
              setInventoryStock(remote.inventoryStock);
            if (remote.contacts) setContacts(remote.contacts);
            if (remote.workshopSettings) {
              const mergedWs = {
                ...FACTORY_WORKSHOP_DEFAULTS,
                ...remote.workshopSettings,
              };
              setWorkshopSettings(mergedWs);
              setDraftSettings(mergedWs);
            }
            setLastCloudSyncTime(new Date().toLocaleTimeString());
            setCloudSyncStatus('synced');
            setTimeout(() => {
              isRemoteSnapshotApplyingRef.current = false;
            }, 400);
          }
        }
      },
      (err) => {
        console.debug('Firestore sync listener warning:', err);
        setCloudSyncStatus('error');
      }
    );
    return () => unsub();
  }, [cloudUser, autoCloudSync]);

  // Push Local Workspace Changes Safely to Cloud (Preserves LocalStorage First)
  const pushWorkspaceToCloud = async (showToast = false) => {
    if (!db || !cloudUser || !fbModulesRef.current) {
      if (showToast) showNotification('Sign in to Cloud Sync first.');
      return;
    }
    try {
      setCloudSyncStatus('syncing');
      const { doc, setDoc } = fbModulesRef.current.fbStoreMod;
      const workspaceDocRef = doc(
        db,
        'artifacts',
        appId,
        'users',
        cloudUser.uid,
        'workspace',
        'mainState'
      );
      await setDoc(
        workspaceDocRef,
        {
          projects,
          inventoryStock,
          contacts,
          workshopSettings,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      setLastCloudSyncTime(new Date().toLocaleTimeString());
      setCloudSyncStatus('synced');
      if (showToast)
        showNotification(
          'All projects, prices, stock & settings synced to Cloud!'
        );
    } catch (err) {
      console.debug('Cloud push error:', err);
      setCloudSyncStatus('error');
      if (showToast)
        showNotification(
          'Cloud sync paused (offline or size limit). Local data is safe.'
        );
    }
  };

  // Debounced Auto-Cloud Sync when Projects, Stock, Contacts or Settings update
  useEffect(() => {
    if (
      !db ||
      !cloudUser ||
      !autoCloudSync ||
      isRemoteSnapshotApplyingRef.current
    )
      return;
    const timer = setTimeout(() => {
      pushWorkspaceToCloud(false);
    }, 1800);
    return () => clearTimeout(timer);
  }, [
    projects,
    inventoryStock,
    contacts,
    workshopSettings,
    cloudUser,
    autoCloudSync,
  ]);

  const handleInstallPwaClick = async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice?.outcome === 'accepted') {
        setDeferredInstallPrompt(null);
      }
    } else {
      setShowPwaGuideModal(true);
    }
  };

  const handleEmailAuthSubmit = async (e) => {
    e.preventDefault();
    if (!auth || !fbModulesRef.current) {
      setAuthError(
        'Cloud service not configured in this preview environment. Local storage & JSON Backup work offline.'
      );
      return;
    }
    const { createUserWithEmailAndPassword, signInWithEmailAndPassword } =
      fbModulesRef.current.fbAuthMod;
    setAuthError('');
    setAuthBusy(true);
    try {
      if (authMode === 'signup') {
        await createUserWithEmailAndPassword(
          auth,
          authEmail.trim(),
          authPassword
        );
        showNotification(
          'Cloud account created! Syncing your local projects...'
        );
      } else {
        await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword);
        showNotification(
          'Signed in! Synchronizing projects across your PC & Android...'
        );
      }
      setAuthEmail('');
      setAuthPassword('');
    } catch (err) {
      setAuthError(
        err?.message || 'Authentication failed. Check email and password.'
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const showNotification = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3200);
  };

  const updateCurrentProject = (updates) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === currentProjectId ? { ...p, ...updates } : p))
    );
  };

  // Run Smart Buy Engine automatically whenever panels, available sheets, or settings change
  const smartBuyResults = useMemo(() => {
    const effectiveSettings = resolveEffectiveCutSettings(
      currentProject.cutSettings || {},
      workshopSettings
    );
    return runSmartBuyEngine(
      currentProject.panels || [],
      currentProject.availableSheets || DEFAULT_AVAILABLE_SHEETS,
      inventoryStock,
      effectiveSettings
    );
  }, [
    currentProject.panels,
    currentProject.availableSheets,
    currentProject.cutSettings,
    inventoryStock,
    workshopSettings,
  ]);

  // Active chosen strategy (defaults to Smart Buy recommended plan)
  const activePlan = useMemo(() => {
    if (currentProject.selectedStrategyId) {
      const found = smartBuyResults.options.find(
        (o) => o.id === currentProject.selectedStrategyId
      );
      if (found) return found;
    }
    return smartBuyResults.recommended || smartBuyResults.options[0] || null;
  }, [currentProject.selectedStrategyId, smartBuyResults]);

  useEffect(() => {
    localStorage.setItem('ply_optimizer_contacts_v1', JSON.stringify(contacts));
  }, [contacts]);

  // JSON Backup & Restore Modal State
  const [restorePreview, setRestorePreview] = useState(null);
  const [projectStatusFilter, setProjectStatusFilter] = useState('ALL');
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [selectedLamPreviewTab, setSelectedLamPreviewTab] = useState('outer');

  // Multi-Room & Multi-Furniture Units State & Helpers
  const [selectedRoomUnitId, setSelectedRoomUnitId] = useState('ALL');
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('Master Bedroom Wardrobe');
  const [newRoomPreset, setNewRoomPreset] = useState('Wardrobe');

  // Workshop Panel Labels & Stickers Modal State
  const [showLabelsModal, setShowLabelsModal] = useState(false);
  const [labelSizePreset, setLabelSizePreset] = useState('a4-grid'); // 'a4-grid' | 'thermal-4x2' | 'compact-3x2'
  const [includeLabelQr, setIncludeLabelQr] = useState(true);
  const [labelFilterIdx, setLabelFilterIdx] = useState('ALL');

  // CSV & Excel Import / Export Modal State
  const [showSpreadsheetModal, setShowSpreadsheetModal] = useState(false);
  const [spreadsheetTab, setSpreadsheetTab] = useState('export'); // 'export' | 'import'
  const [importTargetType, setImportTargetType] = useState('panels'); // 'panels' | 'materials'
  const [importedHeaders, setImportedHeaders] = useState([]);
  const [importedRows, setImportedRows] = useState([]);
  const [columnMap, setColumnMap] = useState({
    name: 0,
    width: 1,
    height: 2,
    qty: 3,
    material: 4,
    edgeMode: 5,
  });
  const [importValidationErrors, setImportValidationErrors] = useState([]);

  const projectRoomUnits = useMemo(() => {
    if (
      Array.isArray(currentProject.roomUnits) &&
      currentProject.roomUnits.length > 0
    ) {
      return currentProject.roomUnits;
    }
    return [
      {
        id: 'unit-default',
        name: currentProject.furnitureType || 'Main Furniture Unit',
        furnitureType: currentProject.furnitureType || 'Custom Furniture',
        panels: currentProject.panels || [],
      },
    ];
  }, [
    currentProject.roomUnits,
    currentProject.furnitureType,
    currentProject.panels,
  ]);

  const handleAddRoomUnit = () => {
    const tpl =
      FURNITURE_TEMPLATES[newRoomPreset] || FURNITURE_TEMPLATES['Wardrobe'];
    const unitId = `unit-${Date.now()}`;
    const unitPanels = tpl.map((p, idx) => ({
      id: `${unitId}-p-${idx}`,
      ...p,
      roomUnitId: unitId,
      roomUnitName: newRoomName.trim() || newRoomPreset,
      materialType: '18mm Plywood',
      edgeMode: p.name.toLowerCase().includes('back')
        ? 'none'
        : p.name.toLowerCase().includes('shutter')
        ? '4S'
        : '1L',
    }));

    const baseUnits =
      Array.isArray(currentProject.roomUnits) &&
      currentProject.roomUnits.length > 0
        ? currentProject.roomUnits
        : [
            {
              id: 'unit-default',
              name: currentProject.furnitureType || 'Main Unit',
              furnitureType: currentProject.furnitureType || 'Custom Furniture',
              panels: (currentProject.panels || []).map((p) => ({
                ...p,
                roomUnitId: 'unit-default',
                roomUnitName: currentProject.furnitureType || 'Main Unit',
              })),
            },
          ];

    const nextUnits = [
      ...baseUnits,
      {
        id: unitId,
        name: newRoomName.trim() || newRoomPreset,
        furnitureType: newRoomPreset,
        panels: unitPanels,
      },
    ];
    const combinedPanels = nextUnits.flatMap((u) => u.panels);
    updateCurrentProject({
      roomUnits: nextUnits,
      panels: combinedPanels,
      selectedStrategyId: null,
    });
    setSelectedRoomUnitId(unitId);
    setShowRoomModal(false);
    showNotification(
      `Added "${newRoomName.trim() || newRoomPreset}" (${
        unitPanels.length
      } panel groups) to project!`
    );
  };

  const handleOptimizeEntireProject = () => {
    const allPanels = projectRoomUnits.flatMap((u) =>
      (u.panels || []).map((p) => ({
        ...p,
        name: p.name.startsWith('[') ? p.name : `[${u.name}] ${p.name}`,
      }))
    );
    if (allPanels.length === 0) {
      showNotification('Add at least one furniture unit or panel first.');
      return;
    }
    updateCurrentProject({
      panels: allPanels,
      selectedStrategyId: null,
      cutSettings: { ...currentProject.cutSettings, useStockFirst: true },
    });
    setSelectedRoomUnitId('ALL');
    showNotification(
      `Optimized entire project across ${projectRoomUnits.length} furniture unit(s) with shared offcut reuse!`
    );
  };

  // Active 3D Parametric Builder Configuration & Live Calculated Cut List
  const active3DConfig = useMemo(() => {
    return (
      currentProject.parametric3D || {
        presetName: '2-Door Wardrobe',
        ...PARAMETRIC_FURNITURE_PRESETS['2-Door Wardrobe'],
        customOverrides: null,
      }
    );
  }, [currentProject.parametric3D]);

  const parametric3DOutput = useMemo(() => {
    const generated = generateParametricFurnitureData(active3DConfig);
    if (
      Array.isArray(active3DConfig.customOverrides) &&
      active3DConfig.customOverrides.length > 0
    ) {
      const panels = active3DConfig.customOverrides.map((p) => {
        const L = Math.max(1, Number(p.length) || 1);
        const Wd = Math.max(1, Number(p.width) || 1);
        const qty = Math.max(1, Number(p.qty) || 1);
        const areaSqFt = Math.round(((L * Wd * qty) / 144) * 100) / 100;
        const edgeFeet = Math.round(((2 * (L + Wd) * qty) / 12) * 10) / 10;
        return { ...p, length: L, width: Wd, qty, areaSqFt, edgeFeet };
      });
      const byMat = {};
      panels.forEach((p) => {
        if (!byMat[p.material])
          byMat[p.material] = {
            material: p.material,
            pieces: 0,
            areaSqFt: 0,
            edgeFeet: 0,
          };
        byMat[p.material].pieces += p.qty;
        byMat[p.material].areaSqFt =
          Math.round((byMat[p.material].areaSqFt + p.areaSqFt) * 10) / 10;
        byMat[p.material].edgeFeet =
          Math.round((byMat[p.material].edgeFeet + p.edgeFeet) * 10) / 10;
      });
      return {
        ...generated,
        panels,
        materialGroups: Object.values(byMat),
        totalPieces: panels.reduce((s, p) => s + p.qty, 0),
        totalAreaSqFt:
          Math.round(panels.reduce((s, p) => s + p.areaSqFt, 0) * 10) / 10,
        totalEdgeFeet: Math.ceil(panels.reduce((s, p) => s + p.edgeFeet, 0)),
      };
    }
    return generated;
  }, [active3DConfig]);

  const updateParametric3D = (updates, resetOverrides = true) => {
    updateCurrentProject({
      parametric3D: {
        ...active3DConfig,
        ...updates,
        customOverrides: resetOverrides ? null : active3DConfig.customOverrides,
      },
    });
  };

  // Connect 3D Builder -> Plywood Optimizer & Material Estimator
  const handleSend3DToOptimizerAndEstimator = (
    targetTab = 'smartbuy',
    materialFilter = 'ALL'
  ) => {
    const sourcePanels = parametric3DOutput.panels.filter(
      (p) => materialFilter === 'ALL' || p.material === materialFilter
    );
    if (sourcePanels.length === 0) {
      showNotification('No panels available to transfer.');
      return;
    }

    // 1. Transfer panels with dimensions, quantities, grain lock & material tag into Optimizer
    const transferredPanels = sourcePanels.map((p, idx) => ({
      id: `3d-opt-${Date.now()}-${idx}`,
      name: `[${p.material}] ${p.name}`,
      widthInput: formatMeasurement(p.width, unitDisplay),
      heightInput: formatMeasurement(p.length, unitDisplay),
      width: p.width,
      height: p.length,
      qty: p.qty,
      grainLock: Boolean(p.grainLock),
      materialType: p.material,
      edgeMode: p.edgeBandingSpec?.toLowerCase().includes('none')
        ? 'none'
        : p.edgeBandingSpec?.toLowerCase().includes('front')
        ? '1L'
        : '4S',
    }));

    // 2. Sync material catalog entries in Material Estimator (Block Board, Back Panel, Edge Banding, Hardware)
    const existingMats = [...(currentProject.materials || DEFAULT_MATERIALS)];
    parametric3DOutput.materialGroups.forEach((grp) => {
      const alreadyExists = existingMats.some((m) =>
        m.name.toLowerCase().includes(grp.material.toLowerCase())
      );
      if (!alreadyExists && grp.material !== '18mm Plywood') {
        existingMats.push({
          id: `mat-3d-${Date.now()}-${grp.material.replace(/\s+/g, '')}`,
          name: `${grp.material} Sheet (8' × 4' — ${grp.areaSqFt} sq.ft req.)`,
          category: grp.material.toLowerCase().includes('block')
            ? 'Block Board'
            : 'Plywood',
          unit: 'Sheet (8x4 ft)',
          price: grp.material.toLowerCase().includes('8mm') ? 1250 : 2100,
        });
      }
    });

    updateCurrentProject({
      furnitureType: active3DConfig.presetName || currentProject.furnitureType,
      selectedStrategyId: null,
      panels: transferredPanels,
      materials: existingMats,
    });

    setActiveTab(targetTab);
    showNotification(
      `Sent ${parametric3DOutput.totalPieces} 3D panels (${parametric3DOutput.materialGroups.length} material types) to Ply Optimizer & Material Estimator!`
    );
  };

  // Generate 3D Parametric Specification & Cut-List PDF
  const handleDownload3DBuilderPdf = () => {
    const panels = parametric3DOutput.panels;
    const groups = parametric3DOutput.materialGroups;
    const canvasW = 1100;
    const canvasH = Math.max(1520, 960 + panels.length * 36);
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const pad = 60;
    let y = 70;

    ctx.textAlign = 'left';
    ctx.fillStyle = '#d97706';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('3D PARAMETRIC FURNITURE CAD SPECIFICATION', pad, y);
    y += 32;
    ctx.fillStyle = '#171717';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(
      `${active3DConfig.presetName} — Manufacturing Cut List`,
      pad,
      y
    );

    ctx.textAlign = 'right';
    ctx.fillStyle = '#525252';
    ctx.font = '14px sans-serif';
    ctx.fillText(`Project: ${currentProject.name}`, canvasW - pad, y - 14);
    ctx.fillText(`Date: ${currentProject.date}`, canvasW - pad, y + 8);

    y += 26;
    ctx.strokeStyle = '#171717';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(canvasW - pad, y);
    ctx.stroke();

    // Embed live 3D Viewport snapshot if available
    y += 22;
    const snapshotH = 310;
    ctx.fillStyle = '#141416';
    ctx.fillRect(pad, y, 480, snapshotH);
    if (threeCanvasRef.current) {
      try {
        ctx.drawImage(threeCanvasRef.current, pad, y, 480, snapshotH);
      } catch (err) {
        console.error(err);
      }
    }

    // Right-hand Parametric Summary Box
    const infoX = pad + 505;
    const infoW = canvasW - pad - infoX;
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(infoX, y, infoW, snapshotH);
    ctx.strokeStyle = '#e5e5e5';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(infoX, y, infoW, snapshotH);

    let iy = y + 32;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#171717';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('Overall Parametric Dimensions', infoX + 22, iy);

    const specs = [
      `Outer Size: ${formatMeasurement(
        active3DConfig.width,
        unitDisplay
      )} W × ${formatMeasurement(
        active3DConfig.height,
        unitDisplay
      )} H × ${formatMeasurement(active3DConfig.depth, unitDisplay)} D`,
      `Base Plinth: ${formatMeasurement(
        active3DConfig.plinth,
        unitDisplay
      )} | Carcass Depth: ${parametric3DOutput.metrics.boxDepth}"`,
      `Carcass Board: ${active3DConfig.carcassMat} | Back: ${active3DConfig.backMat}`,
      `Shutters: ${active3DConfig.shutterCount}× ${active3DConfig.shutterMat} (${active3DConfig.shutterMode})`,
      `Finish: ${active3DConfig.outsideFinish} / ${active3DConfig.insideFinish}`,
      `Hardware: ${parametric3DOutput.hardware.hinges} Hinges, ${parametric3DOutput.hardware.channels} Channels, ${parametric3DOutput.hardware.handles} Handles`,
      `Total Cut Pieces: ${parametric3DOutput.totalPieces} pcs (${parametric3DOutput.totalAreaSqFt} sq.ft)`,
    ];
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#404040';
    specs.forEach((line) => {
      iy += 34;
      ctx.fillText(line, infoX + 22, iy);
    });

    // Material-Wise Breakdown Strip
    y += snapshotH + 34;
    ctx.fillStyle = '#171717';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('Material-Wise Board & Area Breakdown', pad, y);
    y += 16;
    groups.forEach((g, idx) => {
      const gx = pad + idx * 326;
      ctx.fillStyle = '#fffbeb';
      ctx.fillRect(gx, y, 312, 62);
      ctx.strokeStyle = '#fcd34d';
      ctx.strokeRect(gx, y, 312, 62);
      ctx.fillStyle = '#92400e';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(g.material.toUpperCase(), gx + 14, y + 22);
      ctx.fillStyle = '#171717';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(
        `${g.pieces} pcs  •  ${g.areaSqFt} sq.ft  •  ${g.edgeFeet} ft edge`,
        gx + 14,
        y + 46
      );
    });

    // Complete Panel Breakdown Table
    y += 96;
    ctx.fillStyle = '#171717';
    ctx.fillRect(pad, y, canvasW - pad * 2, 36);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('COMPONENT NAME', pad + 14, y + 23);
    ctx.fillText('LENGTH × WIDTH', pad + 310, y + 23);
    ctx.fillText('QTY', pad + 515, y + 23);
    ctx.fillText('MATERIAL', pad + 585, y + 23);
    ctx.textAlign = 'right';
    ctx.fillText('AREA / EDGE', canvasW - pad - 14, y + 23);
    y += 36;

    panels.forEach((p) => {
      y += 32;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#171717';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(p.name, pad + 14, y);
      ctx.font = '13px sans-serif';
      ctx.fillStyle = '#404040';
      ctx.fillText(`${p.length}" × ${p.width}"`, pad + 310, y);
      ctx.font = 'bold 13px sans-serif';
      ctx.fillStyle = '#171717';
      ctx.fillText(String(p.qty), pad + 515, y);
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#b45309';
      ctx.fillText(p.material, pad + 585, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#525252';
      ctx.fillText(
        `${p.areaSqFt} sq.ft | ${p.edgeFeet} ft`,
        canvasW - pad - 14,
        y
      );

      ctx.strokeStyle = '#e5e5e5';
      ctx.beginPath();
      ctx.moveTo(pad, y + 10);
      ctx.lineTo(canvasW - pad, y + 10);
      ctx.stroke();
    });

    const filename = `${active3DConfig.presetName
      .toLowerCase()
      .replace(/\s+/g, '-')}-3d-cutlist.pdf`;
    saveCanvasAsPdf(
      canvas,
      filename,
      'Downloaded 3D Parametric Furniture Cut-List PDF!'
    );
  };

  // Integrated Material & Financial Estimator (Synced directly with Smart Buy)
  const estimates = useMemo(() => {
    const sheetsCount = activePlan ? activePlan.purchasedSheetsCount : 0;
    const plywoodCost = activePlan ? activePlan.totalPurchaseCost : 0;
    const avgPlyPrice = sheetsCount > 0 ? plywoodCost / sheetsCount : 2200;

    // Total panels & exact Edge Banding length based on per-panel Edge Banding Side Selector
    let totalEdgeInches = 0;
    let totalPanelsCount = 0;
    const edgeTypeCounts = {
      none: 0,
      '1L': 0,
      '1S': 0,
      '2L': 0,
      '2S': 0,
      '3S': 0,
      '4S': 0,
    };
    (currentProject.panels || []).forEach((p) => {
      const q = Number(p.qty) || 1;
      const w = Number(p.width) || 0;
      const h = Number(p.height) || 0;
      const mode = normalizeEdgeMode(
        p.edgeMode || (p.name?.toLowerCase().includes('back') ? 'none' : '4S')
      );
      totalPanelsCount += q;
      edgeTypeCounts[mode] = (edgeTypeCounts[mode] || 0) + q;
      totalEdgeInches += calcPanelEdgeInches(w, h, q, mode);
    });

    const edgeBandingFeet = Math.ceil(totalEdgeInches / 12);
    const laminateSheetsCount = Math.ceil(sheetsCount * 1.15);

    const getMatPrice = (keyword, fallback) => {
      const found = (currentProject.materials || []).find(
        (m) =>
          m.name.toLowerCase().includes(keyword.toLowerCase()) ||
          m.category.toLowerCase().includes(keyword.toLowerCase())
      );
      return found ? Number(found.price) : fallback;
    };

    const lamPrice = getMatPrice('Decorative Laminate', 1150);
    const edgePrice = getMatPrice('Edge Banding', 12);
    const hingePrice = getMatPrice('Hinge', 145);
    const channelPrice = getMatPrice('Channel', 680);
    const handlePrice = getMatPrice('Handle', 220);
    const screwPrice = getMatPrice('Screws', 450);

    // Smart Laminate Sheet Estimator (Outer Decorative vs Inner White Liner 2D Packing)
    const laminatePlan = computeSmartLaminatePlan(
      currentProject.panels || [],
      currentProject.laminateConfig || DEFAULT_LAMINATE_CONFIG,
      Number(
        currentProject.cutSettings?.kerf ??
          workshopSettings.defaultKerf ??
          0.125
      )
    );
    const smartLaminateSheetsCount = laminatePlan.totalSheets;
    const smartLaminateCost = laminatePlan.totalCost;

    // Hardware Quantity & Rate Customizer (Preserves manual overrides unless recalculated)
    const suggestedHardware = buildSuggestedHardwareList(
      currentProject.panels || [],
      sheetsCount,
      currentProject.furnitureType,
      {
        hinge: hingePrice,
        channel: channelPrice,
        handle: handlePrice,
        screw: screwPrice,
      }
    );
    const activeHardwareList =
      Array.isArray(currentProject.customHardware) &&
      currentProject.customHardware.length > 0
        ? currentProject.customHardware
        : suggestedHardware;

    const computedHardwareItems = activeHardwareList.map((item) => ({
      ...item,
      qty: Math.max(0, Number(item.qty) || 0),
      rate: Math.max(0, Number(item.rate ?? item.price) || 0),
      price: Math.max(0, Number(item.rate ?? item.price) || 0),
      total: Math.round(
        Math.max(0, Number(item.qty) || 0) *
          Math.max(0, Number(item.rate ?? item.price) || 0)
      ),
    }));

    const edgeBandingCost = edgeBandingFeet * edgePrice;
    const hardwareCost = computedHardwareItems.reduce(
      (sum, h) => sum + h.total,
      0
    );

    const rawMaterialSubtotal =
      plywoodCost + smartLaminateCost + edgeBandingCost + hardwareCost;
    const cuttingMachineCost =
      (activePlan ? activePlan.totalSheetsCount : 0) *
      (Number(currentProject.cuttingLaborPerSheet) || 0);
    const carpentryLabor = Number(currentProject.carpentryLaborCost) || 0;
    const transportCost = Number(currentProject.transportCost) || 0;
    const wastageBufferAmt =
      rawMaterialSubtotal *
      ((Number(currentProject.wastagePercent) || 0) / 100);

    const totalCostBeforeProfit =
      rawMaterialSubtotal +
      cuttingMachineCost +
      carpentryLabor +
      transportCost +
      wastageBufferAmt;
    const profitAmt =
      totalCostBeforeProfit *
      ((Number(currentProject.profitPercent) || 0) / 100);
    const taxableQuotation = totalCostBeforeProfit + profitAmt;

    // Configurable GST / Tax Calculation
    const gstEnabled =
      currentProject.gstEnabled !== undefined
        ? Boolean(currentProject.gstEnabled)
        : false;
    const gstPercent =
      currentProject.gstPercent !== undefined
        ? Number(currentProject.gstPercent)
        : 18;
    const gstAmount = gstEnabled
      ? Math.round(taxableQuotation * (gstPercent / 100))
      : 0;
    const finalQuotation = taxableQuotation + gstAmount;

    // Payment Milestones Calculation
    const milestones =
      Array.isArray(currentProject.milestones) &&
      currentProject.milestones.length > 0
        ? currentProject.milestones
        : [
            {
              id: 'ms-1',
              label: 'Advance on Order Confirmation',
              percent: 50,
              paid: false,
            },
            {
              id: 'ms-2',
              label: 'On Material Delivery at Site',
              percent: 40,
              paid: false,
            },
            {
              id: 'ms-3',
              label: 'On Final Handover & Inspection',
              percent: 10,
              paid: false,
            },
          ];
    const milestonePercentTotal = milestones.reduce(
      (s, m) => s + (Number(m.percent) || 0),
      0
    );
    const computedMilestones = milestones.map((m) => ({
      ...m,
      amount: Math.round((finalQuotation * (Number(m.percent) || 0)) / 100),
    }));

    // Savings compared to highest-cost alternative option
    const maxOptionCost = smartBuyResults.options.reduce(
      (max, o) =>
        o.feasible && o.totalPurchaseCost > max ? o.totalPurchaseCost : max,
      plywoodCost
    );
    const smartBuySavings = Math.max(0, maxOptionCost - plywoodCost);

    return {
      sheetsCount,
      plywoodCost,
      avgPlyPrice,
      laminatePlan,
      laminateSheetsCount: smartLaminateSheetsCount,
      laminateCost: smartLaminateCost,
      lamPrice,
      edgeBandingFeet,
      edgeBandingCost,
      edgePrice,
      edgeTypeCounts,
      hardwareItems: computedHardwareItems,
      suggestedHardware,
      hardwareCost,
      rawMaterialSubtotal,
      cuttingMachineCost,
      carpentryLabor,
      transportCost,
      wastageBufferAmt,
      totalCostBeforeProfit,
      profitAmt,
      taxableQuotation,
      gstEnabled,
      gstPercent,
      gstAmount,
      finalQuotation,
      milestones: computedMilestones,
      milestonePercentTotal,
      smartBuySavings,
      totalPanelsCount,
    };
  }, [activePlan, currentProject, smartBuyResults.options]);

  // Handlers
  const handleCreateNewProject = () => {
    const newId = 'proj-' + Date.now();
    const newProj = {
      id: newId,
      name: 'New Interior Project',
      status: 'Draft',
      client: 'Client Name',
      supplierName: 'Royal Timbers & Plywood Depot',
      supplierPhone: '+91 98201 44510',
      date: new Date().toISOString().split('T')[0],
      furnitureType: 'Wardrobe',
      panels: [...FURNITURE_TEMPLATES['Wardrobe']].map((p, i) => ({
        id: `np-${Date.now()}-${i}`,
        ...p,
      })),
      availableSheets: [...DEFAULT_AVAILABLE_SHEETS],
      laminateConfig: JSON.parse(JSON.stringify(DEFAULT_LAMINATE_CONFIG)),
      customHardware: null,
      cutSettings: {
        kerf: workshopSettings.defaultKerf,
        trimLeft: workshopSettings.trimLeft,
        trimRight: workshopSettings.trimRight,
        trimTop: workshopSettings.trimTop,
        trimBottom: workshopSettings.trimBottom,
        allowRotation: true,
        splitDirection: 'auto',
        minReusableW: workshopSettings.minOffcutWidth,
        minReusableH: workshopSettings.minOffcutLength,
        minReusableAreaSqFt: workshopSettings.minOffcutAreaSqFt,
        useStockFirst: false,
      },
      selectedStrategyId: null,
      cuttingLaborPerSheet: 120,
      carpentryLaborCost: 4500,
      transportCost: 850,
      wastagePercent: 5,
      profitPercent: 20,
      materials: [...DEFAULT_MATERIALS],
    };
    setProjects([newProj, ...projects]);
    setCurrentProjectId(newId);
    showNotification('Created new Smart Buy project!');
  };

  // JSON Backup & Restore Handlers
  const handleExportJsonBackup = () => {
    const payload = {
      app: 'PLYOPTIMIZE',
      version: '2.5',
      exportedAt: new Date().toISOString(),
      projects,
      inventoryStock,
      workshopSettings,
      contacts,
    };
    const jsonStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plyoptimize-backup-${
      new Date().toISOString().split('T')[0]
    }.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    showNotification(
      `Exported full JSON backup (${projects.length} project(s), stock & branding)!`
    );
  };

  const handleSelectRestoreFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.target?.result || '{}'));
        if (
          !parsed ||
          !Array.isArray(parsed.projects) ||
          parsed.projects.length === 0
        ) {
          showNotification('Invalid backup file: No valid projects found.');
          return;
        }
        setRestorePreview({
          fileName: file.name,
          exportedAt: parsed.exportedAt || 'Unknown date',
          projectsCount: parsed.projects.length,
          stockCount: Array.isArray(parsed.inventoryStock)
            ? parsed.inventoryStock.length
            : 0,
          clientsCount: Array.isArray(parsed.contacts?.clients)
            ? parsed.contacts.clients.length
            : 0,
          suppliersCount: Array.isArray(parsed.contacts?.suppliers)
            ? parsed.contacts.suppliers.length
            : 0,
          hasBranding: Boolean(
            parsed.workshopSettings?.branding?.logoDataUrl ||
              parsed.workshopSettings?.branding?.signatureDataUrl
          ),
          data: parsed,
        });
      } catch (err) {
        showNotification(
          'Error reading JSON backup file. Ensure it is valid JSON.'
        );
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExecuteRestore = (mode = 'merge') => {
    if (!restorePreview?.data) return;
    const d = restorePreview.data;

    if (mode === 'replace') {
      setProjects(d.projects);
      setCurrentProjectId(d.projects[0].id);
      if (Array.isArray(d.inventoryStock)) setInventoryStock(d.inventoryStock);
      if (d.workshopSettings) {
        const mergedWs = {
          ...FACTORY_WORKSHOP_DEFAULTS,
          ...d.workshopSettings,
        };
        setWorkshopSettings(mergedWs);
        setDraftSettings(mergedWs);
        localStorage.setItem(
          'ply_optimizer_workshop_defaults_v1',
          JSON.stringify(mergedWs)
        );
      }
      if (d.contacts) setContacts(d.contacts);
      showNotification(
        `Restored ${d.projects.length} project(s) (Replaced existing data).`
      );
    } else {
      // Merge without duplicates
      const existingIds = new Set(projects.map((p) => p.id));
      const incoming = d.projects.map((p, idx) =>
        existingIds.has(p.id)
          ? {
              ...p,
              id: `${p.id}-restored-${Date.now()}-${idx}`,
              name: `${p.name} (Restored)`,
            }
          : p
      );
      setProjects([...incoming, ...projects]);

      if (Array.isArray(d.inventoryStock)) {
        const stockIds = new Set(inventoryStock.map((s) => s.id));
        const newStock = d.inventoryStock.filter((s) => !stockIds.has(s.id));
        setInventoryStock([...newStock, ...inventoryStock]);
      }
      if (d.contacts) {
        const cliIds = new Set((contacts.clients || []).map((c) => c.id));
        const supIds = new Set((contacts.suppliers || []).map((s) => s.id));
        setContacts({
          clients: [
            ...(d.contacts.clients || []).filter((c) => !cliIds.has(c.id)),
            ...(contacts.clients || []),
          ],
          suppliers: [
            ...(d.contacts.suppliers || []).filter((s) => !supIds.has(s.id)),
            ...(contacts.suppliers || []),
          ],
        });
      }
      if (
        d.workshopSettings &&
        !workshopSettings.branding?.logoDataUrl &&
        d.workshopSettings.branding?.logoDataUrl
      ) {
        const mergedWs = {
          ...workshopSettings,
          branding: d.workshopSettings.branding,
        };
        setWorkshopSettings(mergedWs);
        setDraftSettings(mergedWs);
        localStorage.setItem(
          'ply_optimizer_workshop_defaults_v1',
          JSON.stringify(mergedWs)
        );
      }
      showNotification(`Merged ${incoming.length} backup project(s) safely!`);
    }
    setRestorePreview(null);
  };

  const handleDuplicateProject = (proj) => {
    const newId = 'proj-' + Date.now();
    const dup = {
      ...proj,
      id: newId,
      name: `${proj.name} (Copy)`,
      date: new Date().toISOString().split('T')[0],
    };
    setProjects([dup, ...projects]);
    setCurrentProjectId(newId);
    showNotification('Project duplicated!');
  };

  const handleDeleteProject = (id) => {
    if (projects.length <= 1) {
      showNotification('At least one active project is required.');
      return;
    }
    const filtered = projects.filter((p) => p.id !== id);
    setProjects(filtered);
    if (currentProjectId === id) setCurrentProjectId(filtered[0].id);
    showNotification('Project deleted.');
  };

  const handleTemplateChange = (type) => {
    const tpl = FURNITURE_TEMPLATES[type] || FURNITURE_TEMPLATES['Wardrobe'];
    updateCurrentProject({
      furnitureType: type,
      selectedStrategyId: null,
      panels: tpl.map((p, idx) => ({ id: `tpl-${Date.now()}-${idx}`, ...p })),
    });
    showNotification(`Loaded ${type} panel dimensions`);
  };

  const handleSaveOffcutsToStock = (offcuts) => {
    if (!offcuts || offcuts.length === 0) return;
    const newItems = offcuts.map((o, idx) => ({
      id: `stk-${Date.now()}-${idx}`,
      w: o.w,
      h: o.h,
      source: `${currentProject.name} (Sheet #${o.fromSheet})`,
      date: new Date().toISOString().split('T')[0],
    }));
    setInventoryStock((prev) => [...newItems, ...prev]);
    showNotification(
      `Saved ${newItems.length} reusable offcut(s) to Stock Inventory!`
    );
  };

  const handleAddOwnPly = () => {
    const w = parseMeasurement(ownPlyInput.widthInput);
    const h = parseMeasurement(ownPlyInput.heightInput);
    const count = Math.max(1, Number(ownPlyInput.qty) || 1);
    if (w <= 0 || h <= 0) {
      showNotification('Please enter valid plywood width and height.');
      return;
    }
    const newSheets = Array.from({ length: count }, (_, idx) => ({
      id: `stk-own-${Date.now()}-${idx}`,
      w,
      h,
      source: 'Existing Ply on Hand',
      date: new Date().toISOString().split('T')[0],
    }));
    setInventoryStock((prev) => [...newSheets, ...prev]);
    updateCurrentProject({
      cutSettings: { ...currentProject.cutSettings, useStockFirst: true },
    });
    setShowHavePlyModal(false);
    showNotification(
      `Added ${count} existing ply sheet(s) (${formatMeasurement(
        w,
        unitDisplay
      )} × ${formatMeasurement(h, unitDisplay)}) & enabled Stock First!`
    );
  };

  // Export Cutting Diagrams as high-resolution PNG, JPG, or PDF
  const handleExportCuttingDiagrams = (format, sheetIndexFilter = null) => {
    if (!activePlan || !activePlan.sheets || activePlan.sheets.length === 0)
      return;

    const sheetsToExport = sheetIndexFilter
      ? activePlan.sheets.filter((s) => s.sheetIndex === sheetIndexFilter)
      : activePlan.sheets;

    const scale = 8; // High-DPI rendering scale (8px per inch)
    const padX = 48;
    const headerH = 85;
    const sheetGap = 65;

    const maxSheetW = Math.max(
      ...sheetsToExport.map((s) => s.sheetSpec.width * scale)
    );
    const canvasW = Math.max(820, maxSheetW + padX * 2);

    let totalH = 95; // Top report banner height
    sheetsToExport.forEach((s) => {
      totalH += headerH + s.sheetSpec.height * scale + sheetGap;
    });

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = totalH;
    const ctx = canvas.getContext('2d');

    // Background (Dark theme for PNG, crisp dark/white compatible for JPG)
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvasW, totalH);

    // Report Header
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(
      `PLYOPTIMIZE — ${currentProject.name.toUpperCase()}`,
      padX,
      42
    );

    ctx.fillStyle = '#a3a3a3';
    ctx.font = '14px sans-serif';
    ctx.fillText(
      `Plan: ${activePlan.strategyName}  |  Yield: ${activePlan.efficiencyPercent}%  |  Kerf: ${currentProject.cutSettings?.kerf}"`,
      padX,
      68
    );

    let cursorY = 95;
    const panelFills = [
      { fill: 'rgba(251, 191, 36, 0.25)', stroke: '#fbbf24' },
      { fill: 'rgba(52, 211, 153, 0.25)', stroke: '#34d399' },
      { fill: 'rgba(192, 132, 252, 0.25)', stroke: '#c084fc' },
      { fill: 'rgba(251, 113, 133, 0.25)', stroke: '#fb7185' },
      { fill: 'rgba(34, 211, 238, 0.25)', stroke: '#22d3ee' },
    ];

    sheetsToExport.forEach((sheet) => {
      const sw = sheet.sheetSpec.width * scale;
      const sh = sheet.sheetSpec.height * scale;

      // Sheet Title & Dimensions
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(
        `SHEET #${sheet.sheetIndex} ${sheet.isFromStock ? '(STOCK)' : ''}`,
        padX,
        cursorY + 24
      );

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(
        `${sheet.sheetSpec.name} — ${formatMeasurement(
          sheet.sheetSpec.width,
          unitDisplay
        )} × ${formatMeasurement(sheet.sheetSpec.height, unitDisplay)} (${
          sheet.placedRects.length
        } Cuts)`,
        padX,
        cursorY + 50
      );

      const boardX = padX;
      const boardY = cursorY + headerH - 15;

      // Sheet Base Board
      ctx.fillStyle = '#171717';
      ctx.fillRect(boardX, boardY, sw, sh);
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)';
      ctx.lineWidth = 2;
      ctx.strokeRect(boardX, boardY, sw, sh);

      // Draw Reusable Offcuts
      sheet.reusableOffcuts.forEach((off) => {
        const fr = sheet.freeRects.find(
          (f) => Math.abs(f.w - off.w) < 0.05 && Math.abs(f.h - off.h) < 0.05
        );
        if (!fr) return;
        const ox = boardX + fr.x * scale;
        const oy = boardY + fr.y * scale;
        const ow = fr.w * scale;
        const oh = fr.h * scale;

        ctx.save();
        ctx.fillStyle = 'rgba(59, 130, 246, 0.14)';
        ctx.fillRect(ox, oy, ow, oh);
        ctx.strokeStyle = '#60a5fa';
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(ox, oy, ow, oh);
        ctx.restore();

        ctx.fillStyle = '#93c5fd';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`Reusable ${off.w}"×${off.h}"`, ox + ow / 2, oy + oh / 2);
      });

      // Draw Cut Panels
      sheet.placedRects.forEach((rect, rIdx) => {
        const rx = boardX + rect.x * scale;
        const ry = boardY + rect.y * scale;
        const rw = rect.w * scale;
        const rh = rect.h * scale;
        const style = panelFills[rIdx % panelFills.length];

        ctx.fillStyle = style.fill;
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeStyle = style.stroke;
        ctx.lineWidth = 2;
        ctx.strokeRect(rx, ry, rw, rh);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(
          `${rect.w}"×${rect.h}"${rect.rotated ? ' ↻' : ''}`,
          rx + rw / 2,
          ry + rh / 2 - (rh > 45 ? 10 : 0)
        );

        if (rh > 45 && rw > 60) {
          ctx.fillStyle = '#e5e5e5';
          ctx.font = '12px sans-serif';
          ctx.fillText(rect.name.slice(0, 22), rx + rw / 2, ry + rh / 2 + 12);
        }
      });

      // Highlight Saw Cut Lines in Export if enabled
      if (highlightCutLines) {
        sheet.placedRects.forEach((rect) => {
          const rx = boardX + rect.x * scale;
          const ry = boardY + rect.y * scale;
          const rw = rect.w * scale;
          const rh = rect.h * scale;

          ctx.save();
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 3;
          ctx.setLineDash([8, 5]);
          if (rect.x + rect.w < sheet.sheetSpec.width - 0.1) {
            ctx.beginPath();
            ctx.moveTo(rx + rw, ry);
            ctx.lineTo(rx + rw, ry + rh);
            ctx.stroke();
          }
          if (rect.y + rect.h < sheet.sheetSpec.height - 0.1) {
            ctx.beginPath();
            ctx.moveTo(rx, ry + rh);
            ctx.lineTo(rx + rw, ry + rh);
            ctx.stroke();
          }
          ctx.restore();
        });
      }

      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      cursorY += headerH + sh + sheetGap;
    });

    if (format === 'pdf') {
      // Build a genuine, standalone PDF file embedding the rendered JPEG image
      const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.92);
      const base64Data = jpegDataUrl.split(',')[1];
      const binaryStr = atob(base64Data);
      const imgBytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        imgBytes[i] = binaryStr.charCodeAt(i);
      }

      // Fit image onto A4 portrait page (595.28 x 841.89 pt) with margins
      const pageW = 595.28;
      const pageH = 841.89;
      const margin = 30;
      const maxW = pageW - margin * 2;
      const maxH = pageH - margin * 2;
      const ratio = Math.min(maxW / canvas.width, maxH / canvas.height);
      const drawW = canvas.width * ratio;
      const drawH = canvas.height * ratio;
      const offsetX = (pageW - drawW) / 2;
      const offsetY = pageH - margin - drawH;

      const enc = new TextEncoder();
      const chunks = [];
      let byteLength = 0;
      const offsets = [0];

      const pushStr = (s) => {
        const b = enc.encode(s);
        chunks.push(b);
        byteLength += b.length;
      };
      const pushBytes = (b) => {
        chunks.push(b);
        byteLength += b.length;
      };

      pushStr('%PDF-1.4\n');

      offsets[1] = byteLength;
      pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

      offsets[2] = byteLength;
      pushStr('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

      offsets[3] = byteLength;
      pushStr(
        `3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im0 4 0 R >> >> /MediaBox [0 0 ${pageW.toFixed(
          2
        )} ${pageH.toFixed(2)}] /Contents 5 0 R >>\nendobj\n`
      );

      offsets[4] = byteLength;
      pushStr(
        `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgBytes.length} >>\nstream\n`
      );
      pushBytes(imgBytes);
      pushStr('\nendstream\nendobj\n');

      const contentStream = `q\n${drawW.toFixed(2)} 0 0 ${drawH.toFixed(
        2
      )} ${offsetX.toFixed(2)} ${offsetY.toFixed(2)} cm\n/Im0 Do\nQ\n`;
      offsets[5] = byteLength;
      pushStr(
        `5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`
      );

      const xrefStart = byteLength;
      pushStr('xref\n0 6\n0000000000 65535 f \n');
      for (let i = 1; i <= 5; i++) {
        pushStr(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
      }
      pushStr(
        `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
      );

      const pdfBlob = new Blob(chunks, { type: 'application/pdf' });
      const pdfUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      const suffix = sheetIndexFilter
        ? `sheet-${sheetIndexFilter}`
        : 'all-sheets';
      link.download = `${currentProject.name
        .toLowerCase()
        .replace(/\s+/g, '-')}-cutting-diagram-${suffix}.pdf`;
      link.href = pdfUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 2000);
      showNotification('Downloaded PDF Cutting Diagram!');
      return;
    }

    const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const dataUrl = canvas.toDataURL(mime, 0.95);
    const link = document.createElement('a');
    const suffix = sheetIndexFilter
      ? `sheet-${sheetIndexFilter}`
      : 'all-sheets';
    link.download = `${currentProject.name
      .toLowerCase()
      .replace(/\s+/g, '-')}-cutting-diagram-${suffix}.${format}`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification(`Downloaded ${format.toUpperCase()} Cutting Diagram!`);
  };

  // Helper to package a canvas into a downloadable single-page A4 PDF
  const saveCanvasAsPdf = (canvas, filename, successMsg) => {
    const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.94);
    const base64Data = jpegDataUrl.split(',')[1];
    const binaryStr = atob(base64Data);
    const imgBytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      imgBytes[i] = binaryStr.charCodeAt(i);
    }

    const pageW = 595.28;
    const pageH = 841.89;
    const margin = 28;
    const maxW = pageW - margin * 2;
    const maxH = pageH - margin * 2;
    const ratio = Math.min(maxW / canvas.width, maxH / canvas.height);
    const drawW = canvas.width * ratio;
    const drawH = canvas.height * ratio;
    const offsetX = (pageW - drawW) / 2;
    const offsetY = pageH - margin - drawH;

    const enc = new TextEncoder();
    const chunks = [];
    let byteLength = 0;
    const offsets = [0];

    const pushStr = (s) => {
      const b = enc.encode(s);
      chunks.push(b);
      byteLength += b.length;
    };
    const pushBytes = (b) => {
      chunks.push(b);
      byteLength += b.length;
    };

    pushStr('%PDF-1.4\n');
    offsets[1] = byteLength;
    pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    offsets[2] = byteLength;
    pushStr('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
    offsets[3] = byteLength;
    pushStr(
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im0 4 0 R >> >> /MediaBox [0 0 ${pageW.toFixed(
        2
      )} ${pageH.toFixed(2)}] /Contents 5 0 R >>\nendobj\n`
    );
    offsets[4] = byteLength;
    pushStr(
      `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgBytes.length} >>\nstream\n`
    );
    pushBytes(imgBytes);
    pushStr('\nendstream\nendobj\n');

    const contentStream = `q\n${drawW.toFixed(2)} 0 0 ${drawH.toFixed(
      2
    )} ${offsetX.toFixed(2)} ${offsetY.toFixed(2)} cm\n/Im0 Do\nQ\n`;
    offsets[5] = byteLength;
    pushStr(
      `5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`
    );

    const xrefStart = byteLength;
    pushStr('xref\n0 6\n0000000000 65535 f \n');
    for (let i = 1; i <= 5; i++) {
      pushStr(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
    }
    pushStr(
      `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
    );

    const pdfBlob = new Blob(chunks, { type: 'application/pdf' });
    const pdfUrl = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.download = filename;
    link.href = pdfUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(pdfUrl), 2000);
    showNotification(successMsg);
  };

  // Direct PDF generator for Client Quotation & Cutting Summary Report
  const handleDownloadQuotationPdf = (modeOverride = null) => {
    if (!activePlan) return;
    const panels = currentProject.panels || [];
    const qMeta = currentProject.quotationMeta || {};
    const brand =
      workshopSettings.branding || FACTORY_WORKSHOP_DEFAULTS.branding;
    const includeDiagrams =
      modeOverride === 'workshop'
        ? true
        : modeOverride === 'client'
        ? false
        : Boolean(qMeta.includeCuttingDiagrams);

    const studioTitle =
      qMeta.studioTitle || brand.companyName || 'CREATIVE INTERIOR';
    const studioSubtitle =
      qMeta.studioSubtitle ||
      brand.tagline ||
      'Interior Manufacturing & Smart Material Estimation';
    const docHeading =
      modeOverride === 'workshop'
        ? 'WORKSHOP CUTTING REPORT'
        : qMeta.docHeading || 'PROJECT QUOTATION';
    const quoteNo =
      qMeta.quoteNumber || `QT-${currentProject.id.slice(-5).toUpperCase()}`;
    const deliveryTimeline = qMeta.deliveryTimeline || '15–21 Working Days';
    const quoteNotes = qMeta.notes || '';
    const customPlyLabel =
      qMeta.plyLabel ||
      `Optimized Plywood (${activePlan.purchaseBreakdown
        .map((b) => `${b.qty}× ${b.name}`)
        .join(', ')})`;
    const customLamLabel =
      qMeta.lamLabel ||
      `Laminate Sheets (${estimates.laminateSheetsCount}) & Edge Banding (${estimates.edgeBandingFeet} ft)`;
    const customHwLabel = qMeta.hwLabel || 'Hardware & Accessories';
    const customLaborLabel =
      qMeta.laborLabel || 'Cutting Machine, Carpentry Labor & Transport';
    const customMarginLabel =
      qMeta.marginLabel ||
      `Wastage Buffer (${currentProject.wastagePercent}%) & Contractor Margin (${currentProject.profitPercent}%)`;

    const extraDiagramsH = includeDiagrams
      ? activePlan.sheets.length * 240 + 80
      : 0;
    const milestonesH = estimates.milestones.length * 32 + 70;
    const canvasW = 1100;
    const canvasH = Math.max(
      1520,
      960 +
        panels.length * 40 +
        milestonesH +
        extraDiagramsH +
        (quoteNotes ? 90 : 0)
    );
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const pad = 64;
    let y = 76;

    // Header
    ctx.textAlign = 'left';
    ctx.fillStyle = '#171717';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(studioTitle, pad, y);
    ctx.textAlign = 'right';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(docHeading, canvasW - pad, y);

    y += 26;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#737373';
    ctx.font = '15px sans-serif';
    ctx.fillText(studioSubtitle, pad, y);
    ctx.textAlign = 'right';
    ctx.fillText(
      `Quote #: ${quoteNo}  |  Date: ${currentProject.date}`,
      canvasW - pad,
      y
    );

    if (brand.gstin || brand.phone) {
      y += 20;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#525252';
      ctx.font = '12px sans-serif';
      ctx.fillText(
        `${brand.gstin ? `GSTIN: ${brand.gstin}  ` : ''}${
          brand.phone ? `•  Ph: ${brand.phone}` : ''
        }`,
        pad,
        y
      );
    }

    y += 26;
    ctx.strokeStyle = '#e5e5e5';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(canvasW - pad, y);
    ctx.stroke();

    // Client & Plan Box
    y += 24;
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(pad, y, canvasW - pad * 2, 110);
    ctx.strokeStyle = '#e5e5e5';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(pad, y, canvasW - pad * 2, 110);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#a3a3a3';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('PREPARED FOR', pad + 24, y + 28);
    ctx.fillStyle = '#171717';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(currentProject.client || 'Client', pad + 24, y + 56);
    ctx.fillStyle = '#525252';
    ctx.font = '14px sans-serif';
    ctx.fillText(
      `${currentProject.name} (${currentProject.furnitureType}) • Delivery: ${deliveryTimeline}`,
      pad + 24,
      y + 82
    );

    ctx.textAlign = 'right';
    ctx.fillStyle = '#a3a3a3';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('OPTIMIZATION PLAN', canvasW - pad - 24, y + 28);
    ctx.fillStyle = '#d97706';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(activePlan.strategyName, canvasW - pad - 24, y + 56);
    ctx.fillStyle = '#525252';
    ctx.font = '14px sans-serif';
    ctx.fillText(
      `${activePlan.purchasedSheetsCount} Sheets • ${activePlan.efficiencyPercent}% Material Yield`,
      canvasW - pad - 24,
      y + 82
    );

    // Section 1: Panel Cutting Schedule
    y += 148;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#171717';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('1. Panel & Furniture Cutting Schedule', pad, y);

    y += 28;
    ctx.fillStyle = '#737373';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('COMPONENT', pad, y);
    ctx.fillText('DIMENSIONS', pad + 390, y);
    ctx.textAlign = 'center';
    ctx.fillText('QTY', pad + 640, y);
    ctx.fillText('EDGE BAND', pad + 770, y);
    ctx.textAlign = 'right';
    ctx.fillText('GRAIN', canvasW - pad, y);

    y += 14;
    ctx.strokeStyle = '#d4d4d4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(canvasW - pad, y);
    ctx.stroke();

    panels.forEach((p) => {
      y += 35;
      const eMode = normalizeEdgeMode(p.edgeMode || '4S');
      ctx.textAlign = 'left';
      ctx.fillStyle = '#171717';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(p.name.slice(0, 38), pad, y);
      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#404040';
      ctx.fillText(
        `${formatMeasurement(p.width, unitDisplay)} × ${formatMeasurement(
          p.height,
          unitDisplay
        )}`,
        pad + 390,
        y
      );
      ctx.textAlign = 'center';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillStyle = '#171717';
      ctx.fillText(String(p.qty), pad + 640, y);
      ctx.font = '13px sans-serif';
      ctx.fillStyle = '#b45309';
      ctx.fillText(EDGE_BAND_MODES[eMode]?.short || '4-Side', pad + 770, y);
      ctx.textAlign = 'right';
      ctx.font = '13px sans-serif';
      ctx.fillStyle = '#737373';
      ctx.fillText(p.grainLock ? 'Locked' : 'Rotatable', canvasW - pad, y);

      ctx.strokeStyle = '#f5f5f5';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad, y + 11);
      ctx.lineTo(canvasW - pad, y + 11);
      ctx.stroke();
    });

    // Section 2: Complete Cost Breakdown + GST
    y += 54;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#171717';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('2. Complete Cost & Tax Breakdown', pad, y);

    const costRows = [
      {
        label: customPlyLabel,
        val: `${currency}${estimates.plywoodCost.toLocaleString()}`,
      },
      {
        label: customLamLabel,
        val: `${currency}${(
          estimates.laminateCost + estimates.edgeBandingCost
        ).toLocaleString()}`,
      },
      {
        label: customHwLabel,
        val: `${currency}${estimates.hardwareCost.toLocaleString()}`,
      },
      {
        label: customLaborLabel,
        val: `${currency}${(
          estimates.cuttingMachineCost +
          estimates.carpentryLabor +
          estimates.transportCost
        ).toLocaleString()}`,
      },
      {
        label: customMarginLabel,
        val: `${currency}${Math.round(
          estimates.wastageBufferAmt + estimates.profitAmt
        ).toLocaleString()}`,
      },
    ];

    if (estimates.gstEnabled) {
      costRows.push({
        label: `Taxable Project Subtotal`,
        val: `${currency}${Math.round(
          estimates.taxableQuotation
        ).toLocaleString()}`,
      });
      costRows.push({
        label: `GST / Tax (${estimates.gstPercent}%)`,
        val: `${currency}${Math.round(estimates.gstAmount).toLocaleString()}`,
      });
    }

    costRows.forEach((row) => {
      y += 38;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#404040';
      ctx.font = '14px sans-serif';
      ctx.fillText(row.label, pad, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#171717';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(row.val, canvasW - pad, y);

      ctx.strokeStyle = '#e5e5e5';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad, y + 12);
      ctx.lineTo(canvasW - pad, y + 12);
      ctx.stroke();
    });

    // Final Total Row
    y += 24;
    ctx.strokeStyle = '#171717';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(canvasW - pad, y);
    ctx.stroke();

    y += 38;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#171717';
    ctx.font = 'bold 21px sans-serif';
    ctx.fillText(
      estimates.gstEnabled
        ? `Total Final Quotation (Incl. ${estimates.gstPercent}% GST)`
        : 'Total Final Quotation',
      pad,
      y
    );
    ctx.textAlign = 'right';
    ctx.fillStyle = '#d97706';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(
      `${currency}${Math.round(estimates.finalQuotation).toLocaleString()}`,
      canvasW - pad,
      y
    );

    // Section 3: Advance Payment & Milestone Schedule
    y += 46;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#171717';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('3. Payment Milestone Schedule', pad, y);

    estimates.milestones.forEach((ms) => {
      y += 30;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#404040';
      ctx.font = '13px sans-serif';
      ctx.fillText(
        `• ${ms.label} (${ms.percent}%) — [${ms.paid ? 'PAID' : 'PENDING'}]`,
        pad + 10,
        y
      );
      ctx.textAlign = 'right';
      ctx.fillStyle = '#171717';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(
        `${currency}${ms.amount.toLocaleString()}`,
        canvasW - pad,
        y
      );
    });

    // Optional Section 4: Embedded Cutting Diagrams (when Include Cutting Diagrams is toggled ON)
    if (includeDiagrams) {
      y += 48;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#171717';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(
        `4. Workshop Plywood Cutting Layouts (Waste: ${activePlan.netWastePercent}% | Yield: ${activePlan.efficiencyPercent}%)`,
        pad,
        y
      );
      y += 18;
      activePlan.sheets.forEach((sh) => {
        const sScale = Math.min(
          440 / sh.sheetSpec.width,
          195 / sh.sheetSpec.height
        );
        const bw = sh.sheetSpec.width * sScale;
        const bh = sh.sheetSpec.height * sScale;
        ctx.fillStyle = '#fafafa';
        ctx.fillRect(pad, y, canvasW - pad * 2, bh + 30);
        ctx.strokeStyle = '#d4d4d4';
        ctx.strokeRect(pad, y, canvasW - pad * 2, bh + 30);

        ctx.fillStyle = '#171717';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(
          `Sheet #${sh.sheetIndex}: ${sh.sheetSpec.name} (${sh.placedRects.length} panels)`,
          pad + 14,
          y + 20
        );

        const ox = pad + 320;
        const oy = y + 14;
        ctx.fillStyle = '#262626';
        ctx.fillRect(ox, oy, bw, bh);
        sh.placedRects.forEach((r) => {
          ctx.fillStyle = 'rgba(251, 191, 36, 0.35)';
          ctx.fillRect(
            ox + r.x * sScale,
            oy + r.y * sScale,
            r.w * sScale,
            r.h * sScale
          );
          ctx.strokeStyle = '#d97706';
          ctx.strokeRect(
            ox + r.x * sScale,
            oy + r.y * sScale,
            r.w * sScale,
            r.h * sScale
          );
        });
        y += bh + 42;
      });
    }

    if (quoteNotes) {
      y += 38;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#737373';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('TERMS & NOTES', pad, y);
      y += 20;
      ctx.fillStyle = '#404040';
      ctx.font = '13px sans-serif';
      ctx.fillText(quoteNotes.slice(0, 135), pad, y);
    }

    // Authorized Signatory Footer
    y += 46;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#525252';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(`Authorized Signatory — ${studioTitle}`, canvasW - pad, y);

    const filename = `${currentProject.name
      .toLowerCase()
      .replace(/\s+/g, '-')}-${
      modeOverride === 'workshop' ? 'workshop-cutting-report' : 'quotation'
    }.pdf`;
    saveCanvasAsPdf(
      canvas,
      filename,
      modeOverride === 'workshop'
        ? 'Downloaded Workshop Cutting Report PDF!'
        : 'Downloaded Client Quotation PDF!'
    );
  };

  // WhatsApp Quote Summary Generator & Share Handler
  const generateWhatsAppQuoteText = () => {
    const qMeta = currentProject.quotationMeta || {};
    const brand =
      workshopSettings.branding || FACTORY_WORKSHOP_DEFAULTS.branding;
    const studio =
      qMeta.studioTitle || brand.companyName || 'CREATIVE INTERIOR';
    const quoteNo =
      qMeta.quoteNumber || `QT-${currentProject.id.slice(-5).toUpperCase()}`;
    const delivery = qMeta.deliveryTimeline || '15–21 Working Days';

    const lines = [
      `*${studio}* — Quotation Summary (${quoteNo})`,
      `----------------------------------------`,
      `CLIENT: ${currentProject.client}`,
      `PROJECT: ${currentProject.name} (${currentProject.furnitureType})`,
      `STATUS: ${currentProject.status || 'Draft'}`,
      `----------------------------------------`,
      `PLYWOOD PLAN: ${activePlan?.strategyName || 'Smart Buy'} (${
        estimates.sheetsCount
      } Sheets)`,
      `OUTER LAMINATE: ${estimates.laminatePlan.outer.sheetsCount} Sheets (${estimates.laminatePlan.outer.spec.brand})`,
      `INNER LINER: ${estimates.laminatePlan.inner.sheetsCount} Sheets (${estimates.laminatePlan.inner.spec.thickness})`,
      `EDGE BANDING: ${estimates.edgeBandingFeet} Running Ft`,
      `----------------------------------------`,
      `RAW MATERIALS: ${currency}${estimates.rawMaterialSubtotal.toLocaleString()}`,
      `LABOR & CUTTING: ${currency}${(
        estimates.cuttingMachineCost +
        estimates.carpentryLabor +
        estimates.transportCost
      ).toLocaleString()}`,
      ...(estimates.gstEnabled
        ? [
            `GST (${estimates.gstPercent}%): ${currency}${Math.round(
              estimates.gstAmount
            ).toLocaleString()}`,
          ]
        : []),
      `FINAL QUOTATION: ${currency}${Math.round(
        estimates.finalQuotation
      ).toLocaleString()}`,
      `EST. DELIVERY: ${delivery}`,
      `----------------------------------------`,
      `Reply YES to confirm order.`,
    ];
    return lines.join('\n');
  };

  const handleCopyWhatsAppSummary = () => {
    const msg = generateWhatsAppQuoteText();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(msg);
    }
    showNotification('Copied WhatsApp Quote Summary to clipboard!');
  };

  const handleShareViaWhatsApp = () => {
    const msg = encodeURIComponent(generateWhatsAppQuoteText());
    window.open(`https://wa.me/?text=${msg}`, '_blank', 'noopener,noreferrer');
  };

  // CSV & Excel (.xlsx / SpreadsheetML) Export & Import Handlers
  const handleExportSpreadsheet = (datasetType, format = 'csv') => {
    let title = 'Report';
    let headers = [];
    let rows = [];

    if (datasetType === 'panels') {
      title = 'Furniture_Panels';
      headers = [
        'Panel Name',
        'Room / Unit',
        'Width (in)',
        'Height (in)',
        'Qty',
        'Material',
        'Edge Banding',
        'Grain Lock',
      ];
      rows = (currentProject.panels || []).map((p) => [
        p.name,
        p.roomUnitName || currentProject.furnitureType,
        p.width,
        p.height,
        p.qty,
        p.materialType || '18mm Plywood',
        EDGE_BAND_MODES[normalizeEdgeMode(p.edgeMode || '4S')]?.label ||
          'All 4 Sides',
        p.grainLock ? 'Yes' : 'No',
      ]);
    } else if (datasetType === 'cutting') {
      title = 'Plywood_Cutting_List';
      headers = [
        'Sheet #',
        'Sheet Size',
        'Panel Name',
        'Cut Width (in)',
        'Cut Height (in)',
        'Rotated',
        'Position',
      ];
      rows = (activePlan?.sheets || []).flatMap((sh) =>
        sh.placedRects.map((r) => [
          sh.sheetIndex,
          sh.sheetSpec.name,
          r.name,
          r.w,
          r.h,
          r.rotated ? 'Yes (90°)' : 'No',
          `X:${r.x.toFixed(1)}, Y:${r.y.toFixed(1)}`,
        ])
      );
    } else if (datasetType === 'materials') {
      title = 'Material_Estimate';
      headers = ['Item Name', 'Category', 'Unit', 'Unit Price'];
      rows = (currentProject.materials || DEFAULT_MATERIALS).map((m, idx) => [
        m.name,
        m.category,
        m.unit,
        idx === 0 ? Math.round(estimates.avgPlyPrice) : m.price,
      ]);
    } else if (datasetType === 'hardware') {
      title = 'Hardware_Requirements';
      headers = [
        'Hardware Item',
        'Quantity',
        'Unit',
        'Unit Rate',
        'Total Cost',
      ];
      rows = estimates.hardwareItems.map((h) => [
        h.name,
        h.qty,
        h.unit,
        h.price,
        h.total,
      ]);
    } else if (datasetType === 'edgebanding') {
      title = 'Edge_Banding_Report';
      headers = [
        'Panel Name',
        'Dimensions',
        'Qty',
        'Selected Edge Sides',
        'Total Running Feet',
      ];
      rows = (currentProject.panels || []).map((p) => {
        const mode = normalizeEdgeMode(p.edgeMode || '4S');
        const ft =
          Math.round(
            (calcPanelEdgeInches(p.width, p.height, p.qty, mode) / 12) * 10
          ) / 10;
        return [
          p.name,
          `${p.width}" × ${p.height}"`,
          p.qty,
          EDGE_BAND_MODES[mode]?.label,
          ft,
        ];
      });
    } else if (datasetType === 'purchaseorder') {
      title = 'Purchase_Order';
      headers = [
        'Sheet Description',
        'Width (in)',
        'Height (in)',
        'Qty',
        'Unit Price',
        'Subtotal',
      ];
      rows = (activePlan?.purchaseBreakdown || []).map((b) => [
        b.name,
        b.width,
        b.height,
        b.qty,
        b.unitPrice,
        b.subtotal,
      ]);
    }

    if (format === 'xlsx') {
      // Generate Excel-compatible SpreadsheetML XML (.xlsx / .xls)
      const xmlRows = [headers, ...rows]
        .map(
          (r) =>
            `<Row>${r
              .map((cell) => {
                const isNum = typeof cell === 'number' && !isNaN(cell);
                return `<Cell><Data ss:Type="${
                  isNum ? 'Number' : 'String'
                }">${String(cell ?? '')
                  .replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')}</Data></Cell>`;
              })
              .join('')}</Row>`
        )
        .join('');
      const xml = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="${title}"><Table>${xmlRows}</Table></Worksheet></Workbook>`;
      const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentProject.name
        .toLowerCase()
        .replace(/\s+/g, '-')}-${title}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      showNotification(`Exported ${title}.xlsx!`);
    } else {
      const csv = rowsToCsv(headers, rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentProject.name
        .toLowerCase()
        .replace(/\s+/g, '-')}-${title}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      showNotification(`Exported ${title}.csv!`);
    }
  };

  const handleSpreadsheetFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = String(ev.target?.result || '');
      let parsed = [];
      if (content.includes('<Row>') && content.includes('<Data')) {
        // Parse SpreadsheetML XML (.xlsx)
        const doc = new DOMParser().parseFromString(content, 'text/xml');
        const rowEls = Array.from(doc.getElementsByTagName('Row'));
        parsed = rowEls.map((rEl) =>
          Array.from(rEl.getElementsByTagName('Data')).map((dEl) =>
            (dEl.textContent || '').trim()
          )
        );
      } else {
        parsed = parseCsvText(content);
      }
      if (parsed.length < 2) {
        setImportValidationErrors([
          'File must contain a header row and at least one data row.',
        ]);
        return;
      }
      setImportedHeaders(parsed[0]);
      setImportedRows(parsed.slice(1));
      setImportValidationErrors([]);
      showNotification(
        `Loaded ${parsed.length - 1} rows from ${file.name}. Map columns below.`
      );
    };
    reader.readAsText(file);
  };

  const handleConfirmSpreadsheetImport = () => {
    const errors = [];
    if (importTargetType === 'panels') {
      const newPanels = [];
      importedRows.forEach((row, rIdx) => {
        const name = row[columnMap.name] || `Imported Panel ${rIdx + 1}`;
        const w = parseMeasurement(row[columnMap.width]);
        const h = parseMeasurement(row[columnMap.height]);
        const q = Math.max(1, parseInt(row[columnMap.qty], 10) || 1);
        const mat = row[columnMap.material] || '18mm Plywood';
        const edgeMode = normalizeEdgeMode(row[columnMap.edgeMode]);
        if (w <= 0 || h <= 0) {
          errors.push(`Row ${rIdx + 2} ("${name}"): Invalid width or height.`);
          return;
        }
        newPanels.push({
          id: `imp-${Date.now()}-${rIdx}`,
          name,
          widthInput: formatMeasurement(w, unitDisplay),
          heightInput: formatMeasurement(h, unitDisplay),
          width: w,
          height: h,
          qty: q,
          materialType: mat,
          edgeMode,
          grainLock: false,
        });
      });
      if (errors.length > 0) {
        setImportValidationErrors(errors);
        return;
      }
      updateCurrentProject({
        panels: [...(currentProject.panels || []), ...newPanels],
        selectedStrategyId: null,
      });
      setShowSpreadsheetModal(false);
      showNotification(`Imported ${newPanels.length} validated panel rows!`);
    } else {
      const newMats = [];
      importedRows.forEach((row, rIdx) => {
        const name = row[columnMap.name];
        const category = row[columnMap.material] || 'Hardware';
        const unit = row[columnMap.width] || 'Piece';
        const price = parseFloat(row[columnMap.qty]);
        if (!name || isNaN(price) || price < 0) {
          errors.push(`Row ${rIdx + 2}: Missing item name or invalid price.`);
          return;
        }
        newMats.push({
          id: `imp-mat-${Date.now()}-${rIdx}`,
          name,
          category,
          unit,
          price,
        });
      });
      if (errors.length > 0) {
        setImportValidationErrors(errors);
        return;
      }
      updateCurrentProject({
        materials: [
          ...(currentProject.materials || DEFAULT_MATERIALS),
          ...newMats,
        ],
      });
      setShowSpreadsheetModal(false);
      showNotification(`Imported ${newMats.length} material items!`);
    }
  };

  // Direct PDF generator for Supplier Purchase Order
  const handleDownloadPurchaseOrderPdf = () => {
    if (!activePlan) return;
    const plyRows = activePlan.purchaseBreakdown || [];
    const hwRows = estimates.hardwareItems || [];
    const canvasW = 1100;
    const canvasH = Math.max(1450, 900 + (plyRows.length + hwRows.length) * 42);
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const pad = 64;
    let y = 72;

    ctx.textAlign = 'left';
    ctx.fillStyle = '#d97706';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('MATERIAL PROCUREMENT', pad, y);
    y += 34;
    ctx.fillStyle = '#171717';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText('PURCHASE ORDER', pad, y);

    ctx.textAlign = 'right';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(
      `PO-${currentProject.id.slice(-6).toUpperCase()}`,
      canvasW - pad,
      y - 16
    );
    ctx.fillStyle = '#525252';
    ctx.font = '14px sans-serif';
    ctx.fillText(`Date: ${currentProject.date}`, canvasW - pad, y + 8);

    y += 28;
    ctx.strokeStyle = '#171717';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(canvasW - pad, y);
    ctx.stroke();

    // Vendor Box
    y += 26;
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(pad, y, canvasW - pad * 2, 100);
    ctx.strokeStyle = '#e5e5e5';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(pad, y, canvasW - pad * 2, 100);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#a3a3a3';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('VENDOR / SUPPLIER', pad + 24, y + 28);
    ctx.fillStyle = '#171717';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(
      currentProject.supplierName || 'Authorized Plywood Supplier',
      pad + 24,
      y + 54
    );
    ctx.fillStyle = '#525252';
    ctx.font = '14px sans-serif';
    ctx.fillText(currentProject.supplierPhone || '', pad + 24, y + 78);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#a3a3a3';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('DELIVERY REFERENCE', canvasW - pad - 24, y + 28);
    ctx.fillStyle = '#171717';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText(currentProject.name, canvasW - pad - 24, y + 54);
    ctx.fillStyle = '#525252';
    ctx.font = '14px sans-serif';
    ctx.fillText(
      `Client: ${currentProject.client}`,
      canvasW - pad - 24,
      y + 78
    );

    // Table 1: Plywood Sheets
    y += 140;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#171717';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText(
      `1. Optimized Plywood Sheets Order (${activePlan.strategyName})`,
      pad,
      y
    );

    y += 18;
    ctx.fillStyle = '#171717';
    ctx.fillRect(pad, y, canvasW - pad * 2, 40);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('SHEET DESCRIPTION', pad + 18, y + 25);
    ctx.fillText('DIMENSIONS', pad + 340, y + 25);
    ctx.textAlign = 'center';
    ctx.fillText('QTY', pad + 600, y + 25);
    ctx.textAlign = 'right';
    ctx.fillText('UNIT PRICE', pad + 780, y + 25);
    ctx.fillText(`TOTAL (${currency})`, canvasW - pad - 18, y + 25);
    y += 40;

    plyRows.forEach((row) => {
      y += 38;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#171717';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText(row.name, pad + 18, y);
      ctx.font = '15px sans-serif';
      ctx.fillStyle = '#404040';
      ctx.fillText(
        `${formatMeasurement(row.width, unitDisplay)} × ${formatMeasurement(
          row.height,
          unitDisplay
        )}`,
        pad + 340,
        y
      );
      ctx.textAlign = 'center';
      ctx.fillStyle = '#171717';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText(String(row.qty), pad + 600, y);
      ctx.textAlign = 'right';
      ctx.font = '15px sans-serif';
      ctx.fillText(
        `${currency}${row.unitPrice.toLocaleString()}`,
        pad + 780,
        y
      );
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText(
        `${currency}${row.subtotal.toLocaleString()}`,
        canvasW - pad - 18,
        y
      );

      ctx.strokeStyle = '#e5e5e5';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad, y + 12);
      ctx.lineTo(canvasW - pad, y + 12);
      ctx.stroke();
    });

    y += 14;
    ctx.fillStyle = '#fffbeb';
    ctx.fillRect(pad, y, canvasW - pad * 2, 44);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#171717';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('Total Plywood Order', pad + 18, y + 28);
    ctx.textAlign = 'center';
    ctx.fillText(
      `${activePlan.purchasedSheetsCount} Sheets`,
      pad + 600,
      y + 28
    );
    ctx.textAlign = 'right';
    ctx.fillStyle = '#b45309';
    ctx.fillText(
      `${currency}${activePlan.totalPurchaseCost.toLocaleString()}`,
      canvasW - pad - 18,
      y + 28
    );

    // Table 2: Laminates & Hardware
    y += 86;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#171717';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText('2. Accompanying Laminates, Edge Banding & Hardware', pad, y);

    const extraRows = [
      {
        name: "Decorative Laminate Sheets (8' × 4')",
        qty: `${estimates.laminateSheetsCount} Sheets`,
        total: estimates.laminateCost,
      },
      {
        name: 'Matching PVC Edge Banding Tape',
        qty: `${estimates.edgeBandingFeet} Running Ft`,
        total: estimates.edgeBandingCost,
      },
      ...hwRows.map((h) => ({
        name: h.name,
        qty: `${h.qty} ${h.unit}`,
        total: h.total,
      })),
    ];

    y += 18;
    extraRows.forEach((item) => {
      y += 38;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#171717';
      ctx.font = '15px sans-serif';
      ctx.fillText(item.name, pad + 18, y);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#404040';
      ctx.fillText(item.qty, pad + 600, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#171717';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText(
        `${currency}${item.total.toLocaleString()}`,
        canvasW - pad - 18,
        y
      );

      ctx.strokeStyle = '#e5e5e5';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad, y + 12);
      ctx.lineTo(canvasW - pad, y + 12);
      ctx.stroke();
    });

    y += 18;
    ctx.fillStyle = '#171717';
    ctx.fillRect(pad, y, canvasW - pad * 2, 48);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText('Grand Total Material Procurement', pad + 18, y + 30);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 19px sans-serif';
    ctx.fillText(
      `${currency}${estimates.rawMaterialSubtotal.toLocaleString()}`,
      canvasW - pad - 18,
      y + 30
    );

    const filename = `${currentProject.name
      .toLowerCase()
      .replace(/\s+/g, '-')}-purchase-order.pdf`;
    saveCanvasAsPdf(
      canvas,
      filename,
      'Downloaded Supplier Purchase Order PDF!'
    );
  };

  // Direct PNG & PDF generator for Smart Buy Synced Material Estimator
  const handleDownloadMaterialEstimator = (format) => {
    const mats = currentProject.materials || DEFAULT_MATERIALS;
    const canvasW = 1100;
    const canvasH = Math.max(1050, 560 + mats.length * 46);
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const pad = 56;
    let y = 64;

    // Header
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('PLYOPTIMIZE — MATERIAL ESTIMATOR REPORT', pad, y);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#a3a3a3';
    ctx.font = '14px sans-serif';
    ctx.fillText(`Date: ${currentProject.date}`, canvasW - pad, y);

    y += 28;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e5e5e5';
    ctx.font = '15px sans-serif';
    ctx.fillText(
      `Project: ${currentProject.name}  |  Client: ${
        currentProject.client
      }  |  Plan: ${activePlan?.strategyName || 'Smart Buy'}`,
      pad,
      y
    );

    // 4 Summary Cards
    y += 32;
    const cardGap = 16;
    const cardW = (canvasW - pad * 2 - cardGap * 3) / 4;
    const cardH = 104;
    const summaryCards = [
      {
        title: 'PLYWOOD (SMART BUY)',
        color: '#fbbf24',
        value: `${estimates.sheetsCount} Sheets`,
        sub: `Total: ${currency}${estimates.plywoodCost.toLocaleString()}`,
      },
      {
        title: 'LAMINATE SHEETS',
        color: '#60a5fa',
        value: `${estimates.laminateSheetsCount} Sheets`,
        sub: `Total: ${currency}${estimates.laminateCost.toLocaleString()}`,
      },
      {
        title: 'PVC EDGE BANDING',
        color: '#34d399',
        value: `${estimates.edgeBandingFeet} Ft`,
        sub: `Total: ${currency}${estimates.edgeBandingCost.toLocaleString()}`,
      },
      {
        title: 'HARDWARE & FITTINGS',
        color: '#c084fc',
        value: `${currency}${estimates.hardwareCost.toLocaleString()}`,
        sub: 'Hinges, Channels, Handles',
      },
    ];

    summaryCards.forEach((c, idx) => {
      const cx = pad + idx * (cardW + cardGap);
      ctx.fillStyle = '#171717';
      ctx.fillRect(cx, y, cardW, cardH);
      ctx.strokeStyle = idx === 0 ? 'rgba(251, 191, 36, 0.45)' : '#262626';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx, y, cardW, cardH);

      ctx.textAlign = 'left';
      ctx.fillStyle = c.color;
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(c.title, cx + 16, y + 26);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText(c.value, cx + 16, y + 60);

      ctx.fillStyle = '#a3a3a3';
      ctx.font = '12px sans-serif';
      ctx.fillText(c.sub, cx + 16, y + 84);
    });

    // Material Rate Table
    y += cardH + 40;
    ctx.fillStyle = '#171717';
    ctx.fillRect(pad, y, canvasW - pad * 2, 42);
    ctx.fillStyle = '#a3a3a3';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('MATERIAL / HARDWARE ITEM', pad + 18, y + 26);
    ctx.fillText('CATEGORY', pad + 470, y + 26);
    ctx.fillText('UNIT', pad + 650, y + 26);
    ctx.textAlign = 'right';
    ctx.fillText(`UNIT RATE (${currency})`, canvasW - pad - 18, y + 26);
    y += 42;

    mats.forEach((mat, idx) => {
      y += 42;
      const rate =
        idx === 0 ? Math.round(estimates.avgPlyPrice) : Number(mat.price);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(mat.name, pad + 18, y);

      ctx.fillStyle = '#d4d4d4';
      ctx.font = '13px sans-serif';
      ctx.fillText(mat.category, pad + 470, y);

      ctx.fillStyle = '#a3a3a3';
      ctx.fillText(mat.unit, pad + 650, y);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(
        `${currency}${rate.toLocaleString()}`,
        canvasW - pad - 18,
        y
      );

      ctx.strokeStyle = '#262626';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad, y + 14);
      ctx.lineTo(canvasW - pad, y + 14);
      ctx.stroke();
    });

    // Total Raw Material Footer
    y += 28;
    ctx.fillStyle = '#171717';
    ctx.fillRect(pad, y, canvasW - pad * 2, 52);
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(pad, y, canvasW - pad * 2, 52);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('Estimated Total Raw Material Cost', pad + 20, y + 32);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(
      `${currency}${estimates.rawMaterialSubtotal.toLocaleString()}`,
      canvasW - pad - 20,
      y + 32
    );

    const baseFilename = `${currentProject.name
      .toLowerCase()
      .replace(/\s+/g, '-')}-material-estimator`;
    if (format === 'pdf') {
      saveCanvasAsPdf(
        canvas,
        `${baseFilename}.pdf`,
        'Downloaded Material Estimator PDF!'
      );
    } else {
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `${baseFilename}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showNotification('Downloaded Material Estimator PNG!');
    }
  };

  // ==========================================================================
  // RENDER UI
  // ==========================================================================
  return (
    <div
      className={`min-h-screen bg-neutral-950 text-neutral-100 flex font-sans selection:bg-amber-400 selection:text-neutral-950 ${
        themeMode === 'light' ? 'ply-light-theme' : ''
      }`}
    >
      {themeMode === 'light' && (
        <style>{`
          .ply-light-theme {
            background-color: #f4f4f5 !important;
            color: #18181b !important;
          }
          .ply-light-theme .bg-neutral-950,
          .ply-light-theme .bg-neutral-950\\/90,
          .ply-light-theme .bg-neutral-950\\/70,
          .ply-light-theme .bg-neutral-950\\/60,
          .ply-light-theme .bg-neutral-950\\/50,
          .ply-light-theme .bg-neutral-950\\/40 {
            background-color: #f8fafc !important;
          }
          .ply-light-theme .bg-neutral-900,
          .ply-light-theme .bg-neutral-900\\/90,
          .ply-light-theme .bg-neutral-900\\/80 {
            background-color: #ffffff !important;
          }
          .ply-light-theme .bg-neutral-800,
          .ply-light-theme .bg-neutral-800\\/70,
          .ply-light-theme .hover\\:bg-neutral-800:hover,
          .ply-light-theme .hover\\:bg-neutral-700:hover {
            background-color: #f1f5f9 !important;
          }
          .ply-light-theme .from-neutral-900,
          .ply-light-theme .via-neutral-900,
          .ply-light-theme .to-neutral-800 {
            --tw-gradient-from: #ffffff !important;
            --tw-gradient-via: #ffffff !important;
            --tw-gradient-to: #fef3c7 !important;
          }
          .ply-light-theme .border-neutral-800,
          .ply-light-theme .border-neutral-800\\/80,
          .ply-light-theme .border-neutral-800\\/60,
          .ply-light-theme .border-neutral-700,
          .ply-light-theme .divide-neutral-800\\/60 > :not([hidden]) ~ :not([hidden]) {
            border-color: #e2e8f0 !important;
          }
          .ply-light-theme .text-white,
          .ply-light-theme .text-neutral-100,
          .ply-light-theme .text-neutral-200 {
            color: #0f172a !important;
          }
          .ply-light-theme .text-neutral-300 {
            color: #334155 !important;
          }
          .ply-light-theme .text-neutral-400 {
            color: #64748b !important;
          }
          .ply-light-theme .text-amber-400,
          .ply-light-theme .text-amber-300 {
            color: #b45309 !important;
          }
          .ply-light-theme .text-emerald-400 {
            color: #047857 !important;
          }
          .ply-light-theme .text-blue-400,
          .ply-light-theme .text-blue-300 {
            color: #1d4ed8 !important;
          }
          .ply-light-theme .bg-amber-400 {
            background-color: #fbbf24 !important;
            color: #09090b !important;
          }
          .ply-light-theme .bg-amber-400 span,
          .ply-light-theme .bg-amber-400 svg {
            color: #09090b !important;
          }
          .ply-light-theme .smart-buy-hero .hero-white-text {
            color: #ffffff !important;
          }
          .ply-light-theme .smart-buy-hero .hero-sub-text {
            color: #e5e7eb !important;
          }
          .ply-light-theme .smart-buy-hero .hero-savings-badge {
            color: #fde68a !important;
          }
        `}</style>
      )}

      {/* Toast Notification */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 bg-amber-400 text-neutral-950 px-5 py-3 rounded-xl shadow-2xl font-bold flex items-center gap-3 border border-amber-200">
          <CheckCircle2 className="w-5 h-5 text-neutral-950 shrink-0" />
          <span className="text-sm">{notification}</span>
        </div>
      )}

      {/* Branded PWA Splash Screen (Displayed briefly on app launch) */}
      {showSplashScreen && (
        <div className="fixed inset-0 z-[70] bg-neutral-950 flex flex-col items-center justify-center gap-4 transition-opacity">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-300 to-amber-600 flex items-center justify-center shadow-2xl shadow-amber-500/30 animate-pulse">
            <Layers className="w-11 h-11 text-neutral-950 stroke-[2.5]" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-black tracking-widest text-white">
              PLYOPTIMIZE
            </h1>
            <p className="text-xs font-bold tracking-widest uppercase text-amber-400 mt-1">
              Smart Buy • 3D CAD • Cloud Sync
            </p>
          </div>
        </div>
      )}

      {/* SIDEBAR NAVIGATION */}
      <aside className="w-72 bg-neutral-900 border-r border-neutral-800 flex-col justify-between hidden md:flex sticky top-0 h-screen print:hidden">
        <div>
          {/* Brand Logo */}
          <div className="p-6 border-b border-neutral-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-300 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Layers className="w-6 h-6 text-neutral-950 stroke-[2.5]" />
            </div>
            <div>
              <h1 className="font-black tracking-wider text-lg text-white">
                PLYOPTIMIZE
              </h1>
              <p className="text-[11px] text-amber-400 font-bold tracking-widest uppercase">
                Smart Buy & Estimator
              </p>
            </div>
          </div>

          {/* Active Project Selector */}
          <div className="p-4 border-b border-neutral-800 bg-neutral-950/50">
            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-1.5">
              Active Project
            </label>
            <select
              value={currentProjectId}
              onChange={(e) => setCurrentProjectId(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-neutral-100 font-semibold focus:outline-none focus:border-amber-400 transition"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Navigation Menu */}
          <nav className="p-3.5 space-y-1">
            {[
              {
                id: 'smartbuy',
                label: 'Smart Buy Planner',
                badge: 'AI',
                icon: Sparkles,
              },
              {
                id: 'builder3d',
                label: '3D Furniture Builder',
                badge: '3D',
                icon: Layers,
              },
              { id: 'optimizer', label: 'Cutting Diagrams', icon: Scissors },
              {
                id: 'stock',
                label: 'Leftover Stock Bank',
                badge: inventoryStock.length,
                icon: Archive,
              },
              { id: 'estimator', label: 'Material Estimator', icon: Boxes },
              { id: 'calculator', label: 'Cost Calculator', icon: Calculator },
              {
                id: 'purchaseorder',
                label: 'Purchase Order',
                icon: ShoppingCart,
              },
              { id: 'report', label: 'Client Quotation PDF', icon: FileText },
              {
                id: 'contacts',
                label: 'Contact Management',
                badge:
                  (contacts.clients?.length || 0) +
                  (contacts.suppliers?.length || 0),
                icon: Users,
              },
              {
                id: 'projects',
                label: 'Projects & History',
                icon: FolderKanban,
              },
              { id: 'settings', label: 'Workshop Defaults', icon: Sliders },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-xs transition-all ${
                    isActive
                      ? 'bg-amber-400 text-neutral-950 font-bold shadow-lg shadow-amber-500/15'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-800/70'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={`w-4 h-4 ${
                        isActive ? 'text-neutral-950' : 'text-neutral-400'
                      }`}
                    />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                        isActive
                          ? 'bg-neutral-950 text-amber-400'
                          : 'bg-amber-400/15 text-amber-400'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Unit & Currency Preferences + New Project */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-950/60 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex bg-neutral-800 p-0.5 rounded-lg border border-neutral-700 flex-1">
              <button
                onClick={() => setUnitDisplay('mixed')}
                className={`flex-1 py-1 text-[10px] font-bold rounded-md transition ${
                  unitDisplay === 'mixed'
                    ? 'bg-amber-400 text-neutral-950'
                    : 'text-neutral-400'
                }`}
              >
                Ft & In
              </button>
              <button
                onClick={() => setUnitDisplay('inches')}
                className={`flex-1 py-1 text-[10px] font-bold rounded-md transition ${
                  unitDisplay === 'inches'
                    ? 'bg-amber-400 text-neutral-950'
                    : 'text-neutral-400'
                }`}
              >
                Inches
              </button>
              <button
                onClick={() => setUnitDisplay('feet')}
                className={`flex-1 py-1 text-[10px] font-bold rounded-md transition ${
                  unitDisplay === 'feet'
                    ? 'bg-amber-400 text-neutral-950'
                    : 'text-neutral-400'
                }`}
              >
                Feet
              </button>
            </div>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1 text-xs font-bold text-amber-400 focus:outline-none"
            >
              <option value="₹">₹ INR</option>
              <option value="$">$ USD</option>
              <option value="€">€ EUR</option>
              <option value="£">£ GBP</option>
              <option value="AED">AED</option>
            </select>
          </div>

          <button
            onClick={handleCreateNewProject}
            className="w-full bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-neutral-950 font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition transform active:scale-95 text-xs"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>New Project</span>
          </button>
        </div>
      </aside>

      {/* MAIN WORKSPACE */}
      <main className="flex-1 flex flex-col min-h-screen overflow-x-hidden">
        {/* Top Bar */}
        <header className="min-h-20 bg-neutral-900/90 backdrop-blur-md border-b border-neutral-800 px-4 md:px-6 py-2 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-40 print:hidden">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="md:hidden w-9 h-9 rounded-lg bg-amber-400 flex items-center justify-center text-neutral-950 font-black">
              PO
            </div>
            <div>
              <h2 className="text-sm md:text-base font-bold text-white flex items-center gap-2">
                <span>{currentProject.name}</span>
                <span className="hidden sm:inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/20">
                  {currentProject.furnitureType}
                </span>
              </h2>
              <p className="text-[11px] text-neutral-400">
                Client:{' '}
                <span className="text-neutral-200 font-medium">
                  {currentProject.client}
                </span>{' '}
                •{' '}
                <span className="text-amber-400 font-semibold">
                  {estimates.totalPanelsCount} Panels
                </span>
              </p>
            </div>

            {/* Project Status Tracker Pill */}
            {(() => {
              const currentStatus = currentProject.status || 'Draft';
              const stMeta =
                PROJECT_STATUS_OPTIONS.find((s) => s.value === currentStatus) ||
                PROJECT_STATUS_OPTIONS[0];
              return (
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-extrabold ${stMeta.badgeClass}`}
                >
                  <span className={`w-2 h-2 rounded-full ${stMeta.dotClass}`} />
                  <select
                    value={currentStatus}
                    onChange={(e) => {
                      updateCurrentProject({ status: e.target.value });
                      showNotification(
                        `Project status updated to "${e.target.value}"`
                      );
                    }}
                    title="Change Project Status"
                    className="bg-transparent focus:outline-none cursor-pointer font-extrabold text-xs"
                  >
                    {PROJECT_STATUS_OPTIONS.map((opt) => (
                      <option
                        key={opt.value}
                        value={opt.value}
                        className="bg-neutral-900 text-white"
                      >
                        {opt.value}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })()}

            {/* Dark / Light Theme Switcher */}
            <div className="flex items-center bg-neutral-800 p-1 rounded-xl border border-neutral-700">
              <button
                onClick={() => setThemeMode('dark')}
                title="Switch to Black & Gold Dark Theme"
                className={`px-2 py-1 rounded-lg text-xs font-extrabold flex items-center gap-1 transition ${
                  themeMode === 'dark'
                    ? 'bg-amber-400 text-neutral-950 shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Dark</span>
              </button>
              <button
                onClick={() => setThemeMode('light')}
                title="Switch to White & Gold Light Theme"
                className={`px-2 py-1 rounded-lg text-xs font-extrabold flex items-center gap-1 transition ${
                  themeMode === 'light'
                    ? 'bg-amber-400 text-neutral-950 shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Light</span>
              </button>
            </div>

            {/* Responsive Logo & Digital Signature Upload Controls (Visible on md+ laptops & desktops) */}
            <div className="flex items-center gap-1.5 bg-neutral-800/80 px-2 py-1 rounded-xl border border-neutral-700">
              {/* Company Logo Upload + Thumbnail + Clear (×) */}
              <div className="flex items-center gap-1">
                <label
                  title="Upload or replace Company Logo for Quotations & PDFs"
                  className={`cursor-pointer px-2.5 py-1 rounded-lg text-xs font-extrabold flex items-center gap-1.5 border transition ${
                    workshopSettings.branding?.logoDataUrl
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                      : 'bg-neutral-900 hover:bg-neutral-700 text-amber-400 border-neutral-700'
                  }`}
                >
                  {workshopSettings.branding?.logoDataUrl ? (
                    <img
                      src={workshopSettings.branding.logoDataUrl}
                      alt="Logo"
                      className="w-4 h-4 rounded object-contain bg-white"
                    />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {workshopSettings.branding?.logoDataUrl
                      ? 'Logo'
                      : 'Upload Logo'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        const dataUrl = String(reader.result || '');
                        const updated = {
                          ...workshopSettings,
                          branding: {
                            ...(workshopSettings.branding ||
                              FACTORY_WORKSHOP_DEFAULTS.branding),
                            logoDataUrl: dataUrl,
                          },
                        };
                        setWorkshopSettings(updated);
                        setDraftSettings(updated);
                        localStorage.setItem(
                          'ply_optimizer_workshop_defaults_v1',
                          JSON.stringify(updated)
                        );
                        showNotification(
                          'Company Logo saved & applied to all PDFs!'
                        );
                      };
                      reader.readAsDataURL(file);
                      e.target.value = '';
                    }}
                  />
                </label>
                {workshopSettings.branding?.logoDataUrl && (
                  <button
                    onClick={() => {
                      const updated = {
                        ...workshopSettings,
                        branding: {
                          ...(workshopSettings.branding ||
                            FACTORY_WORKSHOP_DEFAULTS.branding),
                          logoDataUrl: '',
                        },
                      };
                      setWorkshopSettings(updated);
                      setDraftSettings(updated);
                      localStorage.setItem(
                        'ply_optimizer_workshop_defaults_v1',
                        JSON.stringify(updated)
                      );
                      showNotification('Removed Company Logo.');
                    }}
                    title="Clear Logo"
                    className="p-1 rounded-md bg-neutral-900 hover:bg-red-500/20 text-neutral-400 hover:text-red-400 border border-neutral-700"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Digital Signature Upload + Thumbnail + Clear (×) */}
              <div className="flex items-center gap-1">
                <label
                  title="Upload or replace Digital Signature for Quotations & PDFs"
                  className={`cursor-pointer px-2.5 py-1 rounded-lg text-xs font-extrabold flex items-center gap-1.5 border transition ${
                    workshopSettings.branding?.signatureDataUrl
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                      : 'bg-neutral-900 hover:bg-neutral-700 text-amber-400 border-neutral-700'
                  }`}
                >
                  {workshopSettings.branding?.signatureDataUrl ? (
                    <img
                      src={workshopSettings.branding.signatureDataUrl}
                      alt="Sign"
                      className="w-4 h-4 rounded object-contain bg-white"
                    />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {workshopSettings.branding?.signatureDataUrl
                      ? 'Signature'
                      : 'Digital Signature'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        const dataUrl = String(reader.result || '');
                        const updated = {
                          ...workshopSettings,
                          branding: {
                            ...(workshopSettings.branding ||
                              FACTORY_WORKSHOP_DEFAULTS.branding),
                            signatureDataUrl: dataUrl,
                          },
                        };
                        setWorkshopSettings(updated);
                        setDraftSettings(updated);
                        localStorage.setItem(
                          'ply_optimizer_workshop_defaults_v1',
                          JSON.stringify(updated)
                        );
                        showNotification(
                          'Digital Signature saved & applied to all PDFs!'
                        );
                      };
                      reader.readAsDataURL(file);
                      e.target.value = '';
                    }}
                  />
                </label>
                {workshopSettings.branding?.signatureDataUrl && (
                  <button
                    onClick={() => {
                      const updated = {
                        ...workshopSettings,
                        branding: {
                          ...(workshopSettings.branding ||
                            FACTORY_WORKSHOP_DEFAULTS.branding),
                          signatureDataUrl: '',
                        },
                      };
                      setWorkshopSettings(updated);
                      setDraftSettings(updated);
                      localStorage.setItem(
                        'ply_optimizer_workshop_defaults_v1',
                        JSON.stringify(updated)
                      );
                      showNotification('Removed Digital Signature.');
                    }}
                    title="Clear Digital Signature"
                    className="p-1 rounded-md bg-neutral-900 hover:bg-red-500/20 text-neutral-400 hover:text-red-400 border border-neutral-700"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* JSON Backup & Restore Controls */}
            <div className="flex items-center gap-1.5 bg-neutral-800/80 px-2 py-1 rounded-xl border border-neutral-700">
              <button
                onClick={handleExportJsonBackup}
                title="Download full JSON backup of all projects, stock, contacts & branding"
                className="px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-700 text-blue-300 border border-neutral-700 text-xs font-extrabold flex items-center gap-1 transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Backup</span>
              </button>
              <label
                title="Restore projects & settings from a JSON backup file"
                className="cursor-pointer px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-700 text-amber-300 border border-neutral-700 text-xs font-extrabold flex items-center gap-1 transition"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Restore</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleSelectRestoreFile}
                />
              </label>
            </div>

            {/* Cloud Sync & PC / Android Install App Controls */}
            <div className="flex items-center gap-1.5 bg-neutral-800/80 px-2 py-1 rounded-xl border border-neutral-700">
              <button
                onClick={() => setShowCloudModal(true)}
                title="Cloud Login & Cross-Device Sync (PC & Android)"
                className={`px-2.5 py-1 rounded-lg text-xs font-extrabold flex items-center gap-1.5 border transition ${
                  cloudUser && !cloudUser.isAnonymous
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                    : 'bg-neutral-900 hover:bg-neutral-700 text-amber-300 border-neutral-700'
                }`}
              >
                {isOnline ? (
                  <Cloud className="w-3.5 h-3.5" />
                ) : (
                  <WifiOff className="w-3.5 h-3.5 text-red-400" />
                )}
                <span>
                  {!isOnline
                    ? 'Offline'
                    : cloudUser && !cloudUser.isAnonymous
                    ? 'Cloud Synced'
                    : 'Cloud Login'}
                </span>
              </button>

              {!isAppInstalled && (
                <button
                  onClick={handleInstallPwaClick}
                  title="Install PLYOPTIMIZE on Windows PC or Android Phone"
                  className="px-2.5 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-neutral-950 text-xs font-black flex items-center gap-1 shadow-sm transition"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Install App</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden xl:block text-right border-r border-neutral-800 pr-3">
              <span className="text-[10px] text-neutral-400 uppercase tracking-widest block font-semibold">
                Optimal Plywood Buy
              </span>
              <span className="text-sm font-black text-emerald-400">
                {currency}
                {estimates.plywoodCost.toLocaleString()} (
                {estimates.sheetsCount} Sheets)
              </span>
            </div>
            <div className="hidden sm:block text-right">
              <span className="text-[10px] text-neutral-400 uppercase tracking-widest block font-semibold">
                Project Quotation
              </span>
              <span className="text-sm font-black text-amber-400">
                {currency}
                {estimates.finalQuotation.toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}
              </span>
            </div>
            <button
              onClick={() => setActiveTab('purchaseorder')}
              className="bg-amber-400 hover:bg-amber-300 text-neutral-950 px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-md transition"
            >
              <ShoppingCart className="w-4 h-4" />
              <span className="hidden sm:inline">Purchase Order</span>
            </button>
          </div>
        </header>

        {/* Mobile Tab Switcher */}
        <div className="md:hidden flex overflow-x-auto bg-neutral-900 border-b border-neutral-800 px-3 py-2 gap-2 print:hidden">
          {[
            { id: 'smartbuy', label: 'Smart Buy' },
            { id: 'builder3d', label: '3D Builder' },
            { id: 'optimizer', label: 'Cut Layouts' },
            { id: 'stock', label: 'Stock Bank' },
            { id: 'estimator', label: 'Materials' },
            { id: 'calculator', label: 'Costing' },
            { id: 'purchaseorder', label: 'PO' },
            { id: 'report', label: 'Quote PDF' },
            { id: 'contacts', label: 'Contacts' },
            { id: 'projects', label: 'Projects' },
            { id: 'settings', label: 'Settings' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition ${
                activeTab === tab.id
                  ? 'bg-amber-400 text-neutral-950'
                  : 'text-neutral-400 bg-neutral-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* CONTENT CONTAINER */}
        <div className="flex-1 p-5 md:p-8 max-w-7xl w-full mx-auto">
          {/* ====================================================================
              TAB 1: SMART BUY – INTELLIGENT PLYWOOD PURCHASE PLANNER
             ==================================================================== */}
          {activeTab === 'smartbuy' && (
            <div className="space-y-8">
              {/* Top Executive Smart Buy Recommendation Banner */}
              {activePlan ? (
                <div className="smart-buy-hero relative overflow-hidden bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-800 border border-amber-400/30 rounded-3xl p-6 md:p-8 shadow-2xl">
                  <div className="absolute -right-12 -top-12 w-80 h-80 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />
                  <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="space-y-2 max-w-2xl">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider bg-amber-400 text-neutral-950 px-3 py-1 rounded-full">
                          <Sparkles className="w-3.5 h-3.5" /> Recommended
                          Purchase Plan
                        </span>
                        <span className="text-xs font-bold text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-3 py-1 rounded-full">
                          {activePlan.strategyName}
                        </span>
                        {estimates.smartBuySavings > 0 && (
                          <span className="hero-savings-badge text-xs font-bold text-amber-300 bg-amber-400/10 border border-amber-400/20 px-3 py-1 rounded-full">
                            Saves {currency}
                            {estimates.smartBuySavings.toLocaleString()} vs
                            standard plan
                          </span>
                        )}
                      </div>

                      <h2 className="hero-white-text text-2xl md:text-3xl font-black text-white pt-1">
                        {activePlan.feasible
                          ? `Buy ${activePlan.purchaseBreakdown
                              .map(
                                (b) =>
                                  `${b.qty}× (${formatMeasurement(
                                    b.width,
                                    unitDisplay
                                  )} × ${formatMeasurement(
                                    b.height,
                                    unitDisplay
                                  )})`
                              )
                              .join(' + ')}`
                          : 'Some panels exceed available plywood sheet sizes!'}
                      </h2>
                      <p className="hero-sub-text text-xs md:text-sm text-neutral-400">
                        {activePlan.description} Verified with 2D guillotine
                        packing, {currentProject.cutSettings?.kerf}" blade kerf,
                        and {currentProject.cutSettings?.trim}" edge trim.
                      </p>
                    </div>

                    {/* Key Recommendation KPIs */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-3 shrink-0">
                      <div className="bg-neutral-950/90 border border-neutral-800 px-4 py-3 rounded-2xl">
                        <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold block">
                          Total Plywood Cost
                        </span>
                        <span className="text-xl font-black text-amber-400">
                          {currency}
                          {activePlan.totalPurchaseCost.toLocaleString()}
                        </span>
                      </div>
                      <div className="bg-neutral-950/90 border border-neutral-800 px-4 py-3 rounded-2xl">
                        <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold block">
                          Sheets to Purchase
                        </span>
                        <span className="text-xl font-black text-white">
                          {activePlan.purchasedSheetsCount}{' '}
                          <span className="text-xs font-normal text-neutral-400">
                            Sheets
                          </span>
                        </span>
                      </div>
                      <div className="bg-neutral-950/90 border border-neutral-800 px-4 py-3 rounded-2xl">
                        <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold block">
                          Net Scrap Waste
                        </span>
                        <span
                          className={`text-xl font-black ${
                            activePlan.netWastePercent <= 15
                              ? 'text-emerald-400'
                              : 'text-amber-400'
                          }`}
                        >
                          {activePlan.netWastePercent}%
                        </span>
                      </div>
                      <div className="bg-neutral-950/90 border border-neutral-800 px-4 py-3 rounded-2xl">
                        <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold block">
                          Reusable Offcuts
                        </span>
                        <span className="text-xl font-black text-blue-400">
                          {activePlan.totalReusableAreaSqFt} sq.ft
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Impossible Panel Warning Banner */}
                  {!activePlan.feasible &&
                    activePlan.impossiblePanels.length > 0 && (
                      <div className="mt-5 p-4 rounded-2xl bg-red-500/15 border border-red-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-red-200 text-xs">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-bold text-red-300">
                              Oversized Panel Alert:
                            </p>
                            <p>
                              The following panel(s) cannot fit on any active
                              plywood sheet size (accounting for{' '}
                              {currentProject.cutSettings?.trim || 0}" edge
                              trim):{' '}
                              {activePlan.impossiblePanels
                                .map(
                                  (p) =>
                                    `${p.name} (${formatMeasurement(
                                      p.w,
                                      unitDisplay
                                    )} × ${formatMeasurement(
                                      p.h,
                                      unitDisplay
                                    )})`
                                )
                                .join(', ')}
                              .
                            </p>
                          </div>
                        </div>
                        {(currentProject.cutSettings?.trim || 0) > 0 && (
                          <button
                            onClick={() => {
                              updateCurrentProject({
                                cutSettings: {
                                  ...currentProject.cutSettings,
                                  trim: 0,
                                },
                              });
                              showNotification(
                                'Edge trim set to 0" — full-sheet panels now fit!'
                              );
                            }}
                            className="bg-red-500 hover:bg-red-400 text-white font-extrabold px-3.5 py-2 rounded-xl text-xs whitespace-nowrap shrink-0 shadow transition"
                          >
                            Set Edge Trim to 0"
                          </button>
                        )}
                      </div>
                    )}
                </div>
              ) : null}

              {/* STEP 1 & 2: REQUIRED PANELS & AVAILABLE PLYWOOD SHEETS */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* LEFT 7 COLS: Required Furniture Panel Dimensions */}
                <div className="lg:col-span-7 bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-lg flex flex-col justify-between">
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2.5">
                          <h3 className="text-base font-bold text-white flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-amber-400 text-neutral-950 font-black text-xs flex items-center justify-center">
                              1
                            </span>
                            <span>Required Furniture Panels</span>
                          </h3>
                          <button
                            onClick={() => setShowHavePlyModal((prev) => !prev)}
                            className={`px-3 py-1 rounded-full text-xs font-extrabold flex items-center gap-1.5 border transition ${
                              currentProject.cutSettings?.useStockFirst &&
                              inventoryStock.length > 0
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm shadow-emerald-500/10'
                                : 'bg-neutral-800 hover:bg-neutral-700 text-amber-400 border-amber-400/40'
                            }`}
                          >
                            <PackageCheck className="w-3.5 h-3.5" />
                            <span>
                              I Have Ply
                              {currentProject.cutSettings?.useStockFirst &&
                              inventoryStock.length > 0
                                ? ` (${inventoryStock.length} Active)`
                                : ''}
                            </span>
                          </button>
                        </div>
                        <p className="text-xs text-neutral-400 mt-0.5">
                          Enter mixed feet & inches (e.g.{' '}
                          <code className="text-amber-400">7' 6"</code>,{' '}
                          <code className="text-amber-400">24"</code>, or{' '}
                          <code className="text-amber-400">48</code>).
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => setActiveTab('optimizer')}
                          className="bg-neutral-800 hover:bg-neutral-700 text-amber-400 border border-amber-400/40 font-bold px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition"
                        >
                          <Scissors className="w-3.5 h-3.5" />
                          <span>Cutting Diagrams</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setShowLabelsModal(true)}
                          className="bg-neutral-800 hover:bg-neutral-700 text-emerald-400 border border-emerald-500/40 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition"
                        >
                          <Tag className="w-3.5 h-3.5" />
                          <span>Panel Labels</span>
                        </button>
                        <button
                          onClick={() => setShowSpreadsheetModal(true)}
                          className="bg-neutral-800 hover:bg-neutral-700 text-blue-400 border border-blue-500/40 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                          <span>CSV / Excel</span>
                        </button>
                        <select
                          value={currentProject.furnitureType}
                          onChange={(e) => handleTemplateChange(e.target.value)}
                          className="bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-1.5 text-xs font-bold text-amber-400 focus:outline-none"
                        >
                          {Object.keys(FURNITURE_TEMPLATES).map((t) => (
                            <option key={t} value={t}>
                              {t} Preset
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => {
                            const updated = [
                              ...(currentProject.panels || []),
                              {
                                id: 'p-' + Date.now(),
                                name: 'Custom Panel',
                                widthInput: '24"',
                                heightInput: '36"',
                                width: 24,
                                height: 36,
                                qty: 2,
                                grainLock: false,
                                edgeMode: '4S',
                              },
                            ];
                            updateCurrentProject({ panels: updated });
                          }}
                          className="bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1 transition"
                        >
                          <Plus className="w-3.5 h-3.5 stroke-[3]" />
                          <span>Add Panel</span>
                        </button>
                      </div>
                    </div>

                    {/* Multi-Room & Multi-Furniture Units Bar */}
                    <div className="mb-4 p-3 rounded-xl bg-neutral-950 border border-neutral-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400 mr-1">
                          Project Units:
                        </span>
                        <button
                          onClick={() => setSelectedRoomUnitId('ALL')}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                            selectedRoomUnitId === 'ALL'
                              ? 'bg-amber-400 text-neutral-950 border-amber-300'
                              : 'bg-neutral-900 text-neutral-300 border-neutral-800 hover:text-white'
                          }`}
                        >
                          All Units ({projectRoomUnits.length})
                        </button>
                        {projectRoomUnits.map((u) => (
                          <button
                            key={u.id}
                            onClick={() => setSelectedRoomUnitId(u.id)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                              selectedRoomUnitId === u.id
                                ? 'bg-amber-400 text-neutral-950 border-amber-300'
                                : 'bg-neutral-900 text-neutral-300 border-neutral-800 hover:text-white'
                            }`}
                          >
                            {u.name}
                          </button>
                        ))}
                        <button
                          onClick={() => setShowRoomModal((prev) => !prev)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-neutral-800 hover:bg-neutral-700 text-amber-400 border border-amber-400/30 flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> Add Furniture Unit
                        </button>
                      </div>
                      {projectRoomUnits.length > 1 && (
                        <button
                          onClick={handleOptimizeEntireProject}
                          className="bg-gradient-to-r from-emerald-400 to-emerald-500 hover:from-emerald-300 hover:to-emerald-400 text-neutral-950 font-black px-3 py-1 rounded-lg text-[11px] flex items-center gap-1 shadow transition"
                        >
                          <Sparkles className="w-3 h-3" /> Optimize Entire
                          Project
                        </button>
                      )}
                    </div>

                    {showRoomModal && (
                      <div className="mb-4 p-3.5 rounded-xl bg-neutral-950 border border-amber-400/40 flex flex-wrap items-end gap-2.5 text-xs">
                        <div className="flex-1 min-w-[160px]">
                          <label className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">
                            Room / Furniture Unit Name
                          </label>
                          <input
                            type="text"
                            value={newRoomName}
                            onChange={(e) => setNewRoomName(e.target.value)}
                            placeholder="e.g. Master Bedroom Wardrobe"
                            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-white font-bold"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">
                            Furniture Preset
                          </label>
                          <select
                            value={newRoomPreset}
                            onChange={(e) => setNewRoomPreset(e.target.value)}
                            className="bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-amber-400 font-bold"
                          >
                            {Object.keys(FURNITURE_TEMPLATES).map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button
                          onClick={handleAddRoomUnit}
                          className="bg-amber-400 hover:bg-amber-300 text-neutral-950 font-black px-3.5 py-1.5 rounded-lg"
                        >
                          + Add to Project
                        </button>
                      </div>
                    )}

                    {/* Quick "I Already Have Plywood" Input Bar */}
                    {showHavePlyModal && (
                      <div className="mb-4 p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/40 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-extrabold text-emerald-300 flex items-center gap-1.5">
                            <PackageCheck className="w-4 h-4" /> Enter Plywood
                            Sheets You Already Have
                          </span>
                          <button
                            onClick={() => setShowHavePlyModal(false)}
                            className="text-[11px] text-neutral-400 hover:text-white font-bold"
                          >
                            Close
                          </button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 items-end text-xs">
                          <div>
                            <label className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">
                              Sheet Width
                            </label>
                            <input
                              type="text"
                              value={ownPlyInput.widthInput}
                              onChange={(e) =>
                                setOwnPlyInput({
                                  ...ownPlyInput,
                                  widthInput: e.target.value,
                                })
                              }
                              placeholder="e.g. 8' 0&quot; or 96"
                              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-white font-bold focus:border-emerald-400 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">
                              Sheet Height
                            </label>
                            <input
                              type="text"
                              value={ownPlyInput.heightInput}
                              onChange={(e) =>
                                setOwnPlyInput({
                                  ...ownPlyInput,
                                  heightInput: e.target.value,
                                })
                              }
                              placeholder="e.g. 4' 0&quot; or 48"
                              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-white font-bold focus:border-emerald-400 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">
                              Qty on Hand
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={ownPlyInput.qty}
                              onChange={(e) =>
                                setOwnPlyInput({
                                  ...ownPlyInput,
                                  qty: Number(e.target.value),
                                })
                              }
                              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-white font-bold focus:border-emerald-400 focus:outline-none"
                            />
                          </div>
                          <button
                            onClick={handleAddOwnPly}
                            className="bg-emerald-400 hover:bg-emerald-300 text-neutral-950 font-black py-1.5 px-3 rounded-lg text-xs transition shadow"
                          >
                            + Use My Ply
                          </button>
                        </div>
                        {inventoryStock.length > 0 && (
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-emerald-500/20 text-[11px] text-neutral-300">
                            <span>
                              Available on hand:{' '}
                              <strong className="text-emerald-300">
                                {inventoryStock
                                  .map(
                                    (s) =>
                                      `${formatMeasurement(
                                        s.w,
                                        unitDisplay
                                      )}×${formatMeasurement(s.h, unitDisplay)}`
                                  )
                                  .join(', ')}
                              </strong>
                            </span>
                            <label className="flex items-center gap-1.5 font-bold text-emerald-300 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={
                                  currentProject.cutSettings?.useStockFirst ||
                                  false
                                }
                                onChange={(e) =>
                                  updateCurrentProject({
                                    cutSettings: {
                                      ...currentProject.cutSettings,
                                      useStockFirst: e.target.checked,
                                    },
                                  })
                                }
                                className="accent-emerald-400"
                              />
                              <span>Use Before Buying</span>
                            </label>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-neutral-800 text-neutral-400 uppercase tracking-wider">
                            <th className="py-2.5 px-2">Panel Name</th>
                            <th className="py-2.5 px-2">Width</th>
                            <th className="py-2.5 px-2">Height</th>
                            <th className="py-2.5 px-2 w-16">Qty</th>
                            <th className="py-2.5 px-2">Edge Banding</th>
                            <th
                              className="py-2.5 px-2 text-center"
                              title="Lock grain direction (prevent 90° rotation)"
                            >
                              Grain
                            </th>
                            <th className="py-2.5 px-1 text-right"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800/60">
                          {(currentProject.panels || [])
                            .filter(
                              (p) =>
                                selectedRoomUnitId === 'ALL' ||
                                p.roomUnitId === selectedRoomUnitId
                            )
                            .map((panel, idx) => {
                              const realIdx = (
                                currentProject.panels || []
                              ).findIndex((item) => item.id === panel.id);
                              const targetIdx = realIdx !== -1 ? realIdx : idx;
                              const activeEdgeMode = normalizeEdgeMode(
                                panel.edgeMode ||
                                  (panel.name?.toLowerCase().includes('back')
                                    ? 'none'
                                    : '4S')
                              );
                              return (
                                <tr
                                  key={panel.id || idx}
                                  className="hover:bg-neutral-800/30"
                                >
                                  <td className="py-2 px-2">
                                    <input
                                      type="text"
                                      value={panel.name}
                                      onChange={(e) => {
                                        const updated = [
                                          ...currentProject.panels,
                                        ];
                                        updated[targetIdx].name =
                                          e.target.value;
                                        updateCurrentProject({
                                          panels: updated,
                                        });
                                      }}
                                      className="w-full min-w-[120px] bg-neutral-800 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-white font-medium focus:border-amber-400 focus:outline-none"
                                    />
                                  </td>
                                  <td className="py-2 px-2">
                                    <input
                                      type="text"
                                      value={
                                        panel.widthInput ?? `${panel.width}"`
                                      }
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        const parsed = parseMeasurement(raw);
                                        const updated = [
                                          ...currentProject.panels,
                                        ];
                                        updated[targetIdx].widthInput = raw;
                                        if (parsed > 0)
                                          updated[targetIdx].width = parsed;
                                        updateCurrentProject({
                                          panels: updated,
                                        });
                                      }}
                                      onBlur={() => {
                                        const updated = [
                                          ...currentProject.panels,
                                        ];
                                        updated[targetIdx].widthInput =
                                          formatMeasurement(
                                            updated[targetIdx].width,
                                            unitDisplay
                                          );
                                        updateCurrentProject({
                                          panels: updated,
                                        });
                                      }}
                                      className="w-24 bg-neutral-800 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-amber-300 font-bold focus:border-amber-400 focus:outline-none"
                                    />
                                  </td>
                                  <td className="py-2 px-2">
                                    <input
                                      type="text"
                                      value={
                                        panel.heightInput ?? `${panel.height}"`
                                      }
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        const parsed = parseMeasurement(raw);
                                        const updated = [
                                          ...currentProject.panels,
                                        ];
                                        updated[targetIdx].heightInput = raw;
                                        if (parsed > 0)
                                          updated[targetIdx].height = parsed;
                                        updateCurrentProject({
                                          panels: updated,
                                        });
                                      }}
                                      onBlur={() => {
                                        const updated = [
                                          ...currentProject.panels,
                                        ];
                                        updated[targetIdx].heightInput =
                                          formatMeasurement(
                                            updated[targetIdx].height,
                                            unitDisplay
                                          );
                                        updateCurrentProject({
                                          panels: updated,
                                        });
                                      }}
                                      className="w-24 bg-neutral-800 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-amber-300 font-bold focus:border-amber-400 focus:outline-none"
                                    />
                                  </td>
                                  <td className="py-2 px-2">
                                    <input
                                      type="number"
                                      min="1"
                                      value={panel.qty}
                                      onChange={(e) => {
                                        const updated = [
                                          ...currentProject.panels,
                                        ];
                                        updated[targetIdx].qty = Math.max(
                                          1,
                                          Number(e.target.value)
                                        );
                                        updateCurrentProject({
                                          panels: updated,
                                        });
                                      }}
                                      className="w-16 bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1.5 text-white font-bold focus:border-amber-400 focus:outline-none"
                                    />
                                  </td>
                                  <td className="py-2 px-2">
                                    <div className="flex items-center gap-1.5">
                                      <EdgeBandDiagram mode={activeEdgeMode} />
                                      <select
                                        value={activeEdgeMode}
                                        onChange={(e) => {
                                          const updated = [
                                            ...currentProject.panels,
                                          ];
                                          updated[targetIdx].edgeMode =
                                            e.target.value;
                                          updateCurrentProject({
                                            panels: updated,
                                          });
                                        }}
                                        className="bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1 text-[11px] font-bold text-neutral-200 focus:border-amber-400 focus:outline-none"
                                      >
                                        {Object.entries(EDGE_BAND_MODES).map(
                                          ([k, v]) => (
                                            <option key={k} value={k}>
                                              {v.label}
                                            </option>
                                          )
                                        )}
                                      </select>
                                    </div>
                                  </td>
                                  <td className="py-2 px-2 text-center">
                                    <button
                                      onClick={() => {
                                        const updated = [
                                          ...currentProject.panels,
                                        ];
                                        updated[targetIdx].grainLock =
                                          !updated[targetIdx].grainLock;
                                        updateCurrentProject({
                                          panels: updated,
                                        });
                                      }}
                                      title={
                                        panel.grainLock
                                          ? 'Grain Locked (No Rotation)'
                                          : 'Free Rotation Allowed'
                                      }
                                      className={`px-2 py-1 rounded text-[10px] font-bold border transition ${
                                        panel.grainLock
                                          ? 'bg-amber-400/20 text-amber-400 border-amber-400/40'
                                          : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                                      }`}
                                    >
                                      {panel.grainLock ? 'Locked' : 'Free'}
                                    </button>
                                  </td>
                                  <td className="py-2 px-1 text-right">
                                    <button
                                      onClick={() => {
                                        const updated =
                                          currentProject.panels.filter(
                                            (_, i) => i !== targetIdx
                                          );
                                        updateCurrentProject({
                                          panels: updated,
                                        });
                                      }}
                                      className="text-neutral-500 hover:text-red-400 p-1 transition"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-4 pt-3 border-t border-neutral-800 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-400">
                      <span>
                        Total Cut Pieces:{' '}
                        <strong className="text-white">
                          {estimates.totalPanelsCount}
                        </strong>
                      </span>
                      <span>
                        PVC Edge Banding:{' '}
                        <strong className="text-emerald-400">
                          {estimates.edgeBandingFeet} ft ({currency}
                          {estimates.edgeBandingCost.toLocaleString()})
                        </strong>
                      </span>
                      <span>
                        Net Panel Area:{' '}
                        <strong className="text-amber-400">
                          {activePlan?.totalUsableAreaSqFt || 0} sq.ft
                        </strong>
                      </span>
                    </div>
                  </div>

                  {/* Wastage Breakdown Strip */}
                  {activePlan && (
                    <div className="mt-4 pt-3 border-t border-neutral-800 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                      <div className="bg-neutral-950 px-2.5 py-1.5 rounded-lg border border-neutral-800">
                        <span className="text-neutral-500 block">
                          Kerf Loss
                        </span>
                        <strong className="text-amber-400">
                          {activePlan.kerfLossAreaSqFt || 0} sq.ft
                        </strong>
                      </div>
                      <div className="bg-neutral-950 px-2.5 py-1.5 rounded-lg border border-neutral-800">
                        <span className="text-neutral-500 block">
                          Edge Trim Loss
                        </span>
                        <strong className="text-orange-400">
                          {activePlan.trimLossAreaSqFt || 0} sq.ft
                        </strong>
                      </div>
                      <div className="bg-neutral-950 px-2.5 py-1.5 rounded-lg border border-neutral-800">
                        <span className="text-neutral-500 block">
                          Unusable Scrap
                        </span>
                        <strong className="text-red-400">
                          {activePlan.unusableScrapAreaSqFt || 0} sq.ft
                        </strong>
                      </div>
                      <div className="bg-neutral-950 px-2.5 py-1.5 rounded-lg border border-neutral-800">
                        <span className="text-neutral-500 block">
                          Reusable Offcuts
                        </span>
                        <strong className="text-blue-400">
                          {activePlan.totalReusableAreaSqFt || 0} sq.ft
                        </strong>
                      </div>
                    </div>
                  )}
                </div>

                {/* RIGHT 5 COLS: Available Plywood Sheet Sizes & Prices + Cutting Allowances */}
                <div className="lg:col-span-5 space-y-6">
                  {/* Available Sheets & Supplier Prices */}
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-lg">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-base font-bold text-white flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-amber-400 text-neutral-950 font-black text-xs flex items-center justify-center">
                            2
                          </span>
                          <span>Available Plywood Sizes & Rates</span>
                        </h3>
                        <p className="text-xs text-neutral-400 mt-0.5">
                          Toggle or add market sheet sizes to compare.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          const updated = [
                            ...(currentProject.availableSheets ||
                              DEFAULT_AVAILABLE_SHEETS),
                            {
                              id: 'sh-' + Date.now(),
                              name: 'Custom Sheet',
                              width: 84,
                              height: 36,
                              price: 1550,
                              active: true,
                            },
                          ];
                          updateCurrentProject({ availableSheets: updated });
                        }}
                        className="bg-neutral-800 hover:bg-neutral-700 text-amber-400 border border-neutral-700 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Size</span>
                      </button>
                    </div>

                    <div className="space-y-2.5">
                      {(
                        currentProject.availableSheets ||
                        DEFAULT_AVAILABLE_SHEETS
                      ).map((sh, idx) => (
                        <div
                          key={sh.id}
                          className={`p-3 rounded-xl border transition flex items-center justify-between gap-2 ${
                            sh.active
                              ? 'bg-neutral-950 border-neutral-700'
                              : 'bg-neutral-950/40 border-neutral-800/60 opacity-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={sh.active}
                              onChange={(e) => {
                                const updated = [
                                  ...currentProject.availableSheets,
                                ];
                                updated[idx].active = e.target.checked;
                                updateCurrentProject({
                                  availableSheets: updated,
                                });
                              }}
                              className="w-4 h-4 accent-amber-400 rounded cursor-pointer"
                            />
                            <div>
                              <input
                                type="text"
                                value={sh.name}
                                onChange={(e) => {
                                  const updated = [
                                    ...currentProject.availableSheets,
                                  ];
                                  updated[idx].name = e.target.value;
                                  updateCurrentProject({
                                    availableSheets: updated,
                                  });
                                }}
                                className="bg-transparent text-xs font-bold text-white focus:outline-none w-28"
                              />
                              <div className="flex items-center gap-1 text-[11px] text-neutral-400 mt-0.5">
                                <input
                                  type="number"
                                  value={sh.width}
                                  onChange={(e) => {
                                    const updated = [
                                      ...currentProject.availableSheets,
                                    ];
                                    updated[idx].width = Number(e.target.value);
                                    updateCurrentProject({
                                      availableSheets: updated,
                                    });
                                  }}
                                  className="w-11 bg-neutral-800 rounded px-1.5 py-0.5 text-neutral-200 font-semibold"
                                />
                                <span>×</span>
                                <input
                                  type="number"
                                  value={sh.height}
                                  onChange={(e) => {
                                    const updated = [
                                      ...currentProject.availableSheets,
                                    ];
                                    updated[idx].height = Number(
                                      e.target.value
                                    );
                                    updateCurrentProject({
                                      availableSheets: updated,
                                    });
                                  }}
                                  className="w-11 bg-neutral-800 rounded px-1.5 py-0.5 text-neutral-200 font-semibold"
                                />
                                <span>in</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="flex items-center bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1">
                              <span className="text-xs text-amber-400 font-bold mr-1">
                                {currency}
                              </span>
                              <input
                                type="number"
                                value={sh.price}
                                onChange={(e) => {
                                  const updated = [
                                    ...currentProject.availableSheets,
                                  ];
                                  updated[idx].price = Number(e.target.value);
                                  updateCurrentProject({
                                    availableSheets: updated,
                                  });
                                }}
                                className="w-16 bg-transparent text-xs font-extrabold text-white focus:outline-none"
                              />
                            </div>
                            <button
                              onClick={() => {
                                const updated =
                                  currentProject.availableSheets.filter(
                                    (_, i) => i !== idx
                                  );
                                updateCurrentProject({
                                  availableSheets: updated,
                                });
                              }}
                              className="text-neutral-500 hover:text-red-400 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Cutting Engine Precision Settings */}
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-lg">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5" /> Cutting & Offcut
                        Rules
                      </h4>
                      <label className="flex items-center gap-2 text-xs font-bold text-emerald-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={
                            currentProject.cutSettings?.useStockFirst || false
                          }
                          onChange={(e) =>
                            updateCurrentProject({
                              cutSettings: {
                                ...currentProject.cutSettings,
                                useStockFirst: e.target.checked,
                              },
                            })
                          }
                          className="accent-emerald-400 rounded"
                        />
                        <span>Use Stock First ({inventoryStock.length})</span>
                      </label>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <label className="text-[10px] text-neutral-400 font-bold uppercase block mb-1">
                          Blade Kerf (in)
                        </label>
                        <input
                          type="number"
                          step="0.0625"
                          value={currentProject.cutSettings?.kerf ?? 0.125}
                          onChange={(e) =>
                            updateCurrentProject({
                              cutSettings: {
                                ...currentProject.cutSettings,
                                kerf: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-white font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-neutral-400 font-bold uppercase block mb-1">
                          Edge Trim (in)
                        </label>
                        <input
                          type="number"
                          step="0.125"
                          value={
                            currentProject.cutSettings?.trimLeft ??
                            currentProject.cutSettings?.trim ??
                            0
                          }
                          onChange={(e) => {
                            const v = Math.max(0, Number(e.target.value));
                            updateCurrentProject({
                              cutSettings: {
                                ...currentProject.cutSettings,
                                trim: v,
                                trimLeft: v,
                                trimRight: v,
                                trimTop: v,
                                trimBottom: v,
                              },
                            });
                          }}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-white font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-neutral-400 font-bold uppercase block mb-1">
                          Cut Direction
                        </label>
                        <select
                          value={
                            currentProject.cutSettings?.splitDirection || 'auto'
                          }
                          onChange={(e) =>
                            updateCurrentProject({
                              cutSettings: {
                                ...currentProject.cutSettings,
                                splitDirection: e.target.value,
                              },
                            })
                          }
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1.5 text-white font-bold"
                        >
                          <option value="auto">Smart Auto</option>
                          <option value="horizontal">Horizontal</option>
                          <option value="vertical">Vertical</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* STEP 3: INTELLIGENT PURCHASE STRATEGY COMPARISON */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-lg">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-amber-400 text-neutral-950 font-black text-xs flex items-center justify-center">
                        3
                      </span>
                      <span>Intelligent Purchase Option Comparison</span>
                    </h3>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      Click any strategy card below to inspect its exact 2D
                      guillotine cutting layout and update your Purchase Order.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab('optimizer')}
                    className="bg-neutral-800 hover:bg-neutral-700 text-amber-400 border border-amber-400/30 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 self-start"
                  >
                    <span>Inspect Visual Cutting Diagrams</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {smartBuyResults.options.map((opt) => {
                    const isRecommended =
                      smartBuyResults.recommended?.id === opt.id;
                    const isSelected = activePlan?.id === opt.id;

                    return (
                      <div
                        key={opt.id}
                        onClick={() =>
                          updateCurrentProject({ selectedStrategyId: opt.id })
                        }
                        className={`cursor-pointer rounded-2xl p-5 border transition-all flex flex-col justify-between relative ${
                          isSelected
                            ? 'bg-neutral-950 border-amber-400 ring-2 ring-amber-400/20 shadow-xl'
                            : 'bg-neutral-950/70 border-neutral-800 hover:border-neutral-700'
                        }`}
                      >
                        {isRecommended && (
                          <span className="absolute -top-3 right-4 bg-amber-400 text-neutral-950 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full shadow">
                            Best Value
                          </span>
                        )}

                        <div>
                          <h4 className="text-sm font-extrabold text-white pr-12">
                            {opt.strategyName}
                          </h4>
                          <p className="text-[11px] text-neutral-400 mt-1 line-clamp-2">
                            {opt.description}
                          </p>

                          <div className="mt-4 pt-3 border-t border-neutral-800/80 space-y-2">
                            <div className="flex justify-between items-baseline">
                              <span className="text-xs text-neutral-400">
                                Purchase Cost:
                              </span>
                              <span className="text-lg font-black text-amber-400">
                                {currency}
                                {opt.totalPurchaseCost.toLocaleString()}
                              </span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-neutral-400">
                                Sheets Needed:
                              </span>
                              <span className="font-bold text-white">
                                {opt.purchasedSheetsCount} Buy{' '}
                                {opt.stockSheetsUsedCount > 0
                                  ? `+ ${opt.stockSheetsUsedCount} Stock`
                                  : ''}
                              </span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-neutral-400">
                                Net Scrap Waste:
                              </span>
                              <span
                                className={`font-bold ${
                                  opt.netWastePercent <= 15
                                    ? 'text-emerald-400'
                                    : 'text-amber-300'
                                }`}
                              >
                                {opt.netWastePercent}% ({opt.netWastageAreaSqFt}{' '}
                                sq.ft)
                              </span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-neutral-400">
                                Reusable Offcuts:
                              </span>
                              <span className="font-bold text-blue-400">
                                {opt.totalReusableAreaSqFt} sq.ft
                              </span>
                            </div>
                          </div>

                          {/* Sheet Breakdown Pills */}
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {opt.purchaseBreakdown.map((b, i) => (
                              <span
                                key={i}
                                className="text-[10px] font-bold bg-neutral-800 text-neutral-200 px-2 py-0.5 rounded-md border border-neutral-700"
                              >
                                {b.qty}× {b.name}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-neutral-800/80 flex items-center justify-between text-xs font-bold">
                          <span
                            className={
                              isSelected ? 'text-amber-400' : 'text-neutral-400'
                            }
                          >
                            {isSelected ? '✓ Active Plan' : 'Select Plan'}
                          </span>
                          <ChevronRight
                            className={`w-4 h-4 ${
                              isSelected ? 'text-amber-400' : 'text-neutral-500'
                            }`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ====================================================================
              TAB 2: 3D PARAMETRIC FURNITURE BUILDER
             ==================================================================== */}
          {activeTab === 'builder3d' && (
            <div className="space-y-6">
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-lg flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-black text-white">
                      3D Parametric Furniture Builder
                    </h2>
                    <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-amber-400 text-neutral-950">
                      Interactive CAD
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400 mt-1">
                    Configure parametric dimensions, carcass & shutter boards,
                    finishes, and send exact cut sizes directly to Smart Buy &
                    Material Estimator.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleDownload3DBuilderPdf}
                    className="bg-neutral-800 hover:bg-neutral-700 text-neutral-100 border border-neutral-700 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5"
                  >
                    <FileText className="w-4 h-4 text-amber-400" />
                    <span>Export 3D Spec PDF</span>
                  </button>
                  <button
                    onClick={() =>
                      handleSend3DToOptimizerAndEstimator(
                        'optimizer',
                        selectedMaterialFilter3D
                      )
                    }
                    className="bg-neutral-800 hover:bg-neutral-700 text-amber-400 border border-amber-400/40 font-extrabold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5"
                  >
                    <Scissors className="w-4 h-4" />
                    <span>Send & View Cutting Diagrams</span>
                  </button>
                  <button
                    onClick={() =>
                      handleSend3DToOptimizerAndEstimator(
                        'smartbuy',
                        selectedMaterialFilter3D
                      )
                    }
                    className="bg-amber-400 hover:bg-amber-300 text-neutral-950 font-black px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-lg"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Send to Ply Optimizer</span>
                  </button>
                </div>
              </div>

              {/* Presets Strip */}
              <div className="flex flex-wrap items-center gap-2">
                {Object.keys(PARAMETRIC_FURNITURE_PRESETS).map((preset) => (
                  <button
                    key={preset}
                    onClick={() => {
                      updateParametric3D({
                        presetName: preset,
                        ...PARAMETRIC_FURNITURE_PRESETS[preset],
                      });
                      showNotification(`Loaded 3D preset: ${preset}`);
                    }}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition ${
                      active3DConfig.presetName === preset
                        ? 'bg-amber-400 text-neutral-950 border-amber-300 shadow'
                        : 'bg-neutral-900 text-neutral-300 border-neutral-800 hover:border-neutral-700'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left 5 Cols: Parametric Controls */}
                <div className="lg:col-span-5 space-y-5">
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-4 text-xs">
                    <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider">
                      1. Outer Dimensions & Plinth
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { key: 'width', label: 'Width (in)' },
                        { key: 'height', label: 'Height (in)' },
                        { key: 'depth', label: 'Depth (in)' },
                        { key: 'plinth', label: 'Base Plinth (in)' },
                      ].map((dim) => (
                        <div key={dim.key}>
                          <div className="flex justify-between mb-1">
                            <label className="text-[10px] font-bold text-neutral-400 uppercase">
                              {dim.label}
                            </label>
                            <span className="text-[11px] font-bold text-amber-400">
                              {safeStr(
                                formatMeasurement(
                                  active3DConfig[dim.key],
                                  unitDisplay
                                )
                              )}
                            </span>
                          </div>
                          <input
                            type="number"
                            value={Number(active3DConfig[dim.key]) || 0}
                            onChange={(e) =>
                              updateParametric3D({
                                [dim.key]: Math.max(0, Number(e.target.value)),
                              })
                            }
                            className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-white font-bold"
                          />
                        </div>
                      ))}
                    </div>

                    {/* Quick Add / Adjust Partitions Control */}
                    <div className="pt-2 border-t border-neutral-800 flex items-center justify-between gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-neutral-400 uppercase block">
                          Add Partitions (Vertical)
                        </label>
                        <span className="text-[11px] text-amber-400 font-bold">
                          {Number(active3DConfig.partitions || 0) + 1} Internal
                          Bays
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            updateParametric3D({
                              partitions: Math.max(
                                0,
                                Number(active3DConfig.partitions || 0) - 1
                              ),
                            })
                          }
                          className="w-8 h-8 rounded-xl bg-neutral-950 hover:bg-neutral-800 border border-neutral-700 text-white font-black text-sm flex items-center justify-center"
                          title="Remove Partition"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="0"
                          max="6"
                          value={active3DConfig.partitions}
                          onChange={(e) =>
                            updateParametric3D({
                              partitions: Math.max(
                                0,
                                Math.min(6, Number(e.target.value))
                              ),
                            })
                          }
                          className="w-16 text-center bg-neutral-950 border border-neutral-700 rounded-xl px-2 py-1.5 text-white font-bold"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateParametric3D({
                              partitions: Math.min(
                                6,
                                Number(active3DConfig.partitions || 0) + 1
                              ),
                            })
                          }
                          className="w-8 h-8 rounded-xl bg-amber-400 hover:bg-amber-300 text-neutral-950 font-black text-sm flex items-center justify-center"
                          title="Add Partition"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-4 text-xs">
                    <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider">
                      3. Shutters & Laminate Finish
                    </h3>
                    <div className="grid grid-cols-3 gap-2">
                      {['hinged', 'sliding', 'none'].map((mode) => (
                        <button
                          key={mode}
                          onClick={() =>
                            updateParametric3D({ shutterMode: mode })
                          }
                          className={`py-2 rounded-xl font-bold capitalize border ${
                            active3DConfig.shutterMode === mode
                              ? 'bg-amber-400 text-neutral-950 border-amber-300'
                              : 'bg-neutral-950 text-neutral-300 border-neutral-800'
                          }`}
                        >
                          {mode === 'none' ? 'No Shutters' : `${mode} Doors`}
                        </button>
                      ))}
                    </div>
                    {active3DConfig.shutterMode !== 'none' && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">
                            Shutter Count
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="8"
                            value={active3DConfig.shutterCount}
                            onChange={(e) =>
                              updateParametric3D({
                                shutterCount: Math.max(
                                  1,
                                  Number(e.target.value)
                                ),
                              })
                            }
                            className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-white font-bold"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">
                            Shutter Material
                          </label>
                          <select
                            value={active3DConfig.shutterMat}
                            onChange={(e) =>
                              updateParametric3D({ shutterMat: e.target.value })
                            }
                            className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-white font-bold"
                          >
                            <option value="18mm Block Board">
                              18mm Block Board
                            </option>
                            <option value="18mm Plywood">18mm Plywood</option>
                            <option value="18mm HDHMR">18mm HDHMR</option>
                          </select>
                        </div>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {Object.entries(FINISH_SWATCHES).map(([finName, sw]) => (
                        <button
                          key={finName}
                          onClick={() =>
                            updateParametric3D({ outsideFinish: finName })
                          }
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 border ${
                            active3DConfig.outsideFinish === finName
                              ? 'border-amber-400 bg-neutral-800 text-white'
                              : 'border-neutral-800 bg-neutral-950 text-neutral-400'
                          }`}
                        >
                          <span
                            className="w-3 h-3 rounded-full border border-black/30"
                            style={{ backgroundColor: sw.hex }}
                          />
                          <span>{finName}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right 7 Cols: Interactive 3D CAD Viewport & Cut List */}
                <div className="lg:col-span-7 space-y-5">
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 relative shadow-xl">
                    {/* Top Viewport Overlay Controls */}
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs">
                      <div className="flex items-center gap-1.5">
                        {['3/4', 'front', 'side', 'top'].map((view) => (
                          <button
                            key={view}
                            onClick={() => setCameraPreset3D(view)}
                            className={`px-2.5 py-1 rounded-lg font-bold uppercase text-[10px] border ${
                              cameraPreset3D === view
                                ? 'bg-amber-400 text-neutral-950 border-amber-300'
                                : 'bg-neutral-800 text-neutral-300 border-neutral-700'
                            }`}
                          >
                            {view}
                          </button>
                        ))}
                        <button
                          onClick={() => setShowEdges3D((prev) => !prev)}
                          className={`px-2.5 py-1 rounded-lg font-bold text-[10px] border ${
                            showEdges3D
                              ? 'bg-neutral-800 text-amber-400 border-amber-400/40'
                              : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                          }`}
                        >
                          Edges
                        </button>
                      </div>

                      {/* 3D Viewer Dark / Light Background Switcher */}
                      <div className="flex items-center bg-neutral-800 p-0.5 rounded-lg border border-neutral-700">
                        <button
                          onClick={() => setViewer3DBgTheme('dark')}
                          className={`px-2 py-1 rounded-md text-[10px] font-extrabold flex items-center gap-1 ${
                            viewer3DBgTheme === 'dark'
                              ? 'bg-amber-400 text-neutral-950'
                              : 'text-neutral-400'
                          }`}
                        >
                          <Moon className="w-3 h-3" /> Dark
                        </button>
                        <button
                          onClick={() => setViewer3DBgTheme('light')}
                          className={`px-2 py-1 rounded-md text-[10px] font-extrabold flex items-center gap-1 ${
                            viewer3DBgTheme === 'light'
                              ? 'bg-amber-400 text-neutral-950'
                              : 'text-neutral-400'
                          }`}
                        >
                          <Sun className="w-3 h-3" /> Light
                        </button>
                      </div>
                    </div>

                    <Furniture3DViewport
                      config={active3DConfig}
                      metrics={parametric3DOutput.metrics}
                      openAmount={openShutterPct}
                      explodeAmount={explodePct}
                      cameraPreset={cameraPreset3D}
                      showEdges={showEdges3D}
                      viewerBgTheme={viewer3DBgTheme}
                      onCanvasReady={(el) => {
                        threeCanvasRef.current = el;
                      }}
                    />

                    {/* Bottom Interactive Sliders */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3 pt-3 border-t border-neutral-800 text-xs">
                      <div>
                        <div className="flex justify-between font-bold text-neutral-300 mb-1">
                          <span>Open Shutters</span>
                          <span className="text-amber-400">
                            {openShutterPct}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={openShutterPct}
                          onChange={(e) =>
                            setOpenShutterPct(Number(e.target.value))
                          }
                          className="w-full accent-amber-400"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between font-bold text-neutral-300 mb-1">
                          <span>Explode Assembly</span>
                          <span className="text-blue-400">{explodePct}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={explodePct}
                          onChange={(e) =>
                            setExplodePct(Number(e.target.value))
                          }
                          className="w-full accent-blue-400"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Live Material-Separated Cut List Breakdown */}
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-lg space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-bold text-white">
                          Live Parametric Cut List (
                          {parametric3DOutput.totalPieces} Pieces •{' '}
                          {parametric3DOutput.totalAreaSqFt} sq.ft)
                        </h4>
                        <p className="text-[11px] text-neutral-400">
                          Automatically recalculated from your 3D furniture
                          dimensions.
                        </p>
                      </div>
                      <select
                        value={selectedMaterialFilter3D}
                        onChange={(e) =>
                          setSelectedMaterialFilter3D(e.target.value)
                        }
                        className="bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-1.5 text-xs font-bold text-amber-400"
                      >
                        <option value="ALL">
                          All Materials ({parametric3DOutput.totalPieces} pcs)
                        </option>
                        {parametric3DOutput.materialGroups.map((g) => (
                          <option key={g.material} value={g.material}>
                            {g.material} ({g.pieces} pcs)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {parametric3DOutput.materialGroups.map((g) => (
                        <div
                          key={g.material}
                          className="bg-neutral-950 border border-neutral-800 p-3 rounded-xl text-xs"
                        >
                          <span className="text-[10px] font-black text-amber-400 uppercase">
                            {g.material}
                          </span>
                          <div className="text-base font-black text-white mt-0.5">
                            {g.pieces} Pieces
                          </div>
                          <div className="text-[11px] text-neutral-400">
                            {g.areaSqFt} sq.ft • {g.edgeFeet} ft edge
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ====================================================================
              TAB 3: VISUAL CUTTING DIAGRAMS & GUILLOTINE SEQUENCING
             ==================================================================== */}
          {activeTab === 'optimizer' && (
            <div className="space-y-6">
              {!activePlan ||
              !activePlan.sheets ||
              activePlan.sheets.length === 0 ? (
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-10 text-center space-y-4">
                  <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
                  <h3 className="text-lg font-bold text-white">
                    No Cutting Layouts Available Yet
                  </h3>
                  <p className="text-xs text-neutral-400 max-w-md mx-auto">
                    Add furniture panels in Smart Buy Planner (or reduce edge
                    trim if a panel exceeds sheet size) to generate visual 2D
                    cutting layouts.
                  </p>
                  <button
                    onClick={() => setActiveTab('smartbuy')}
                    className="bg-amber-400 hover:bg-amber-300 text-neutral-950 font-extrabold px-5 py-2.5 rounded-xl text-xs"
                  >
                    Go to Smart Buy Planner
                  </button>
                </div>
              ) : (
                <>
                  {/* Top Summary & Export Toolbar */}
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-lg">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-black text-white">
                          2D Guillotine Cutting Diagrams
                        </h3>
                        <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-amber-400/15 text-amber-400 border border-amber-400/30">
                          {activePlan.strategyName}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-400 mt-1">
                        Total Sheets:{' '}
                        <strong className="text-white">
                          {activePlan.totalSheetsCount}
                        </strong>{' '}
                        • Yield Efficiency:{' '}
                        <strong className="text-emerald-400">
                          {activePlan.efficiencyPercent}%
                        </strong>{' '}
                        • Net Waste:{' '}
                        <strong className="text-amber-400">
                          {activePlan.netWastePercent}%
                        </strong>{' '}
                        • Kerf:{' '}
                        <strong className="text-white">
                          {currentProject.cutSettings?.kerf ?? 0.125}"
                        </strong>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setHighlightCutLines((prev) => !prev)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 border transition ${
                          highlightCutLines
                            ? 'bg-amber-400/20 text-amber-300 border-amber-400/50 shadow-sm'
                            : 'bg-neutral-800 text-neutral-300 border-neutral-700'
                        }`}
                      >
                        <Scissors className="w-3.5 h-3.5" />
                        <span>
                          Cut Lines: {highlightCutLines ? 'ON' : 'OFF'}
                        </span>
                      </button>

                      {activePlan.allReusableOffcuts.length > 0 && (
                        <button
                          onClick={() =>
                            handleSaveOffcutsToStock(
                              activePlan.allReusableOffcuts
                            )
                          }
                          className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 font-extrabold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition"
                        >
                          <Archive className="w-3.5 h-3.5" />
                          <span>
                            Save {activePlan.allReusableOffcuts.length} Reusable
                            Offcuts
                          </span>
                        </button>
                      )}

                      <button
                        onClick={() => handleExportCuttingDiagrams('png')}
                        className="bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5"
                      >
                        <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                        <span>PNG</span>
                      </button>
                      <button
                        onClick={() => handleExportCuttingDiagrams('jpg')}
                        className="bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5"
                      >
                        <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                        <span>JPG</span>
                      </button>
                      <button
                        onClick={() => handleExportCuttingDiagrams('pdf')}
                        className="bg-amber-400 hover:bg-amber-300 text-neutral-950 font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download All PDF</span>
                      </button>
                    </div>
                  </div>

                  {/* Sheet-by-Sheet Visual Diagrams */}
                  <div className="space-y-6">
                    {activePlan.sheets.map((sheet) => {
                      const svgScale = Math.min(
                        760 / sheet.sheetSpec.width,
                        360 / sheet.sheetSpec.height
                      );
                      const svgW = sheet.sheetSpec.width * svgScale;
                      const svgH = sheet.sheetSpec.height * svgScale;
                      const colors = [
                        { fill: 'rgba(251, 191, 36, 0.22)', stroke: '#fbbf24' },
                        { fill: 'rgba(52, 211, 153, 0.22)', stroke: '#34d399' },
                        {
                          fill: 'rgba(192, 132, 252, 0.22)',
                          stroke: '#c084fc',
                        },
                        {
                          fill: 'rgba(251, 113, 133, 0.22)',
                          stroke: '#fb7185',
                        },
                        { fill: 'rgba(34, 211, 238, 0.22)', stroke: '#22d3ee' },
                      ];

                      return (
                        <div
                          key={sheet.sheetIndex}
                          className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-lg space-y-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="bg-amber-400 text-neutral-950 font-black text-xs px-2.5 py-0.5 rounded-full">
                                  SHEET #{sheet.sheetIndex}
                                </span>
                                <h4 className="text-base font-extrabold text-white">
                                  {sheet.sheetSpec.name} —{' '}
                                  {formatMeasurement(
                                    sheet.sheetSpec.width,
                                    unitDisplay
                                  )}{' '}
                                  ×{' '}
                                  {formatMeasurement(
                                    sheet.sheetSpec.height,
                                    unitDisplay
                                  )}
                                </h4>
                                {sheet.isFromStock && (
                                  <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                    Existing Stock
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-neutral-400 mt-1">
                                Placed Panels:{' '}
                                <strong className="text-white">
                                  {sheet.placedRects.length}
                                </strong>{' '}
                                • Reusable Offcuts:{' '}
                                <strong className="text-blue-400">
                                  {sheet.reusableOffcuts.length}
                                </strong>
                              </p>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() =>
                                  setHighlightCutLines((prev) => !prev)
                                }
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                                  highlightCutLines
                                    ? 'bg-amber-400/20 text-amber-300 border-amber-400/50'
                                    : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                                }`}
                              >
                                Cut Lines
                              </button>
                              <button
                                onClick={() =>
                                  handleExportCuttingDiagrams(
                                    'png',
                                    sheet.sheetIndex
                                  )
                                }
                                className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 px-3 py-1.5 rounded-lg text-xs font-bold"
                              >
                                PNG
                              </button>
                              <button
                                onClick={() =>
                                  handleExportCuttingDiagrams(
                                    'jpg',
                                    sheet.sheetIndex
                                  )
                                }
                                className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 px-3 py-1.5 rounded-lg text-xs font-bold"
                              >
                                JPG
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                            {/* Interactive SVG Board Layout */}
                            <div className="xl:col-span-8 bg-neutral-950 border border-neutral-800 rounded-2xl p-4 overflow-x-auto flex justify-center">
                              <svg
                                width={svgW}
                                height={svgH}
                                className="rounded-lg border-2 border-amber-400/60 bg-neutral-900"
                              >
                                {/* Reusable Offcut Zones */}
                                {sheet.reusableOffcuts.map((off, oIdx) => {
                                  const fr = sheet.freeRects.find(
                                    (f) =>
                                      Math.abs(f.w - off.w) < 0.05 &&
                                      Math.abs(f.h - off.h) < 0.05
                                  );
                                  if (!fr) return null;
                                  return (
                                    <g key={`off-${oIdx}`}>
                                      <rect
                                        x={fr.x * svgScale}
                                        y={fr.y * svgScale}
                                        width={fr.w * svgScale}
                                        height={fr.h * svgScale}
                                        fill="rgba(59, 130, 246, 0.14)"
                                        stroke="#60a5fa"
                                        strokeDasharray="5 3"
                                        strokeWidth="1.5"
                                      />
                                      {fr.w * svgScale > 65 &&
                                        fr.h * svgScale > 24 && (
                                          <text
                                            x={(fr.x + fr.w / 2) * svgScale}
                                            y={(fr.y + fr.h / 2) * svgScale}
                                            textAnchor="middle"
                                            dominantBaseline="middle"
                                            fill="#93c5fd"
                                            fontSize="10"
                                            fontWeight="bold"
                                          >
                                            Offcut {off.w}"×{off.h}"
                                          </text>
                                        )}
                                    </g>
                                  );
                                })}

                                {/* Placed Furniture Panels */}
                                {sheet.placedRects.map((rect, rIdx) => {
                                  const st = colors[rIdx % colors.length];
                                  const rw = rect.w * svgScale;
                                  const rh = rect.h * svgScale;
                                  return (
                                    <g key={`rect-${rIdx}`}>
                                      <rect
                                        x={rect.x * svgScale}
                                        y={rect.y * svgScale}
                                        width={rw}
                                        height={rh}
                                        fill={st.fill}
                                        stroke={st.stroke}
                                        strokeWidth="1.75"
                                      />
                                      {rw > 42 && rh > 20 && (
                                        <text
                                          x={(rect.x + rect.w / 2) * svgScale}
                                          y={
                                            (rect.y + rect.h / 2) * svgScale -
                                            (rh > 38 ? 6 : 0)
                                          }
                                          textAnchor="middle"
                                          dominantBaseline="middle"
                                          fill="#ffffff"
                                          fontSize="11"
                                          fontWeight="bold"
                                        >
                                          {rect.w}"×{rect.h}"
                                          {rect.rotated ? ' ↻' : ''}
                                        </text>
                                      )}
                                      {rw > 56 && rh > 38 && (
                                        <text
                                          x={(rect.x + rect.w / 2) * svgScale}
                                          y={
                                            (rect.y + rect.h / 2) * svgScale + 9
                                          }
                                          textAnchor="middle"
                                          dominantBaseline="middle"
                                          fill="#d4d4d4"
                                          fontSize="9.5"
                                        >
                                          {rect.name.slice(0, 20)}
                                        </text>
                                      )}
                                    </g>
                                  );
                                })}

                                {/* Highlighted Guillotine Saw-Cut Lines */}
                                {highlightCutLines &&
                                  sheet.placedRects.map((rect, cIdx) => {
                                    const rx = rect.x * svgScale;
                                    const ry = rect.y * svgScale;
                                    const rw = rect.w * svgScale;
                                    const rh = rect.h * svgScale;
                                    return (
                                      <g key={`cut-${cIdx}`}>
                                        {rect.x + rect.w <
                                          sheet.sheetSpec.width - 0.1 && (
                                          <line
                                            x1={rx + rw}
                                            y1={ry}
                                            x2={rx + rw}
                                            y2={ry + rh}
                                            stroke="#f59e0b"
                                            strokeWidth="2.5"
                                            strokeDasharray="6 4"
                                          />
                                        )}
                                        {rect.y + rect.h <
                                          sheet.sheetSpec.height - 0.1 && (
                                          <line
                                            x1={rx}
                                            y1={ry + rh}
                                            x2={rx + rw}
                                            y2={ry + rh}
                                            stroke="#f59e0b"
                                            strokeWidth="2.5"
                                            strokeDasharray="6 4"
                                          />
                                        )}
                                      </g>
                                    );
                                  })}
                              </svg>
                            </div>

                            {/* Step-by-Step Saw Cutting Sequence */}
                            <div className="xl:col-span-4 bg-neutral-950 border border-neutral-800 rounded-2xl p-4 space-y-2.5 text-xs">
                              <h5 className="font-black uppercase tracking-wider text-amber-400">
                                Cutting Sequence
                              </h5>
                              <div className="max-h-72 overflow-y-auto divide-y divide-neutral-800/70">
                                {sheet.cutSteps.map((st) => (
                                  <div
                                    key={st.step}
                                    className="py-2 flex items-center justify-between gap-2"
                                  >
                                    <div>
                                      <span className="font-black text-amber-400 mr-1.5">
                                        #{st.step}
                                      </span>
                                      <span className="font-bold text-white">
                                        {st.panelName}
                                      </span>
                                      <span className="text-[11px] text-neutral-400 block">
                                        {st.pos}
                                      </span>
                                    </div>
                                    <span className="font-extrabold text-emerald-400 whitespace-nowrap">
                                      {st.cutDim}
                                      {st.rotated ? ' ↻' : ''}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ====================================================================
              TAB 3B: LEFTOVER STOCK BANK
             ==================================================================== */}
          {activeTab === 'stock' && (
            <div className="space-y-6">
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-white">
                    Workshop Leftover & Stock Inventory
                  </h3>
                  <p className="text-xs text-neutral-400">
                    Manage usable offcut plywood sheets. Enable "Use Stock
                    First" in Smart Buy to consume these before purchasing new
                    full sheets.
                  </p>
                </div>
                <button
                  onClick={() => setShowHavePlyModal(true)}
                  className="bg-amber-400 hover:bg-amber-300 text-neutral-950 font-extrabold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  <span>Add Stock Sheet</span>
                </button>
              </div>

              {showHavePlyModal && (
                <div className="bg-neutral-900 border border-emerald-500/40 rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 items-end text-xs">
                  <div>
                    <label className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">
                      Width
                    </label>
                    <input
                      type="text"
                      value={ownPlyInput.widthInput}
                      onChange={(e) =>
                        setOwnPlyInput({
                          ...ownPlyInput,
                          widthInput: e.target.value,
                        })
                      }
                      className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-2 text-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">
                      Height
                    </label>
                    <input
                      type="text"
                      value={ownPlyInput.heightInput}
                      onChange={(e) =>
                        setOwnPlyInput({
                          ...ownPlyInput,
                          heightInput: e.target.value,
                        })
                      }
                      className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-2 text-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">
                      Quantity
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={ownPlyInput.qty}
                      onChange={(e) =>
                        setOwnPlyInput({
                          ...ownPlyInput,
                          qty: Number(e.target.value),
                        })
                      }
                      className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-2 text-white font-bold"
                    />
                  </div>
                  <button
                    onClick={handleAddOwnPly}
                    className="bg-emerald-400 hover:bg-emerald-300 text-neutral-950 font-black py-2 px-4 rounded-lg text-xs"
                  >
                    + Save to Stock Bank
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {inventoryStock.map((item) => (
                  <div
                    key={item.id}
                    className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 flex items-center justify-between gap-3"
                  >
                    <div>
                      <span className="text-[10px] font-black uppercase text-blue-400">
                        Reusable Stock Sheet
                      </span>
                      <div className="text-lg font-black text-white mt-0.5">
                        {formatMeasurement(item.w, unitDisplay)} ×{' '}
                        {formatMeasurement(item.h, unitDisplay)}
                      </div>
                      <p className="text-xs text-neutral-400 mt-1">
                        {item.source} •{' '}
                        {Math.round(((item.w * item.h) / 144) * 100) / 100}{' '}
                        sq.ft
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setInventoryStock(
                          inventoryStock.filter((s) => s.id !== item.id)
                        );
                        showNotification('Removed stock item.');
                      }}
                      className="p-2 bg-neutral-800 hover:bg-red-500/20 text-neutral-400 hover:text-red-400 rounded-xl"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ====================================================================
              TAB 7: CLIENT QUOTATION PDF & WHATSAPP SHARE TOOLBAR
             ==================================================================== */}
          {activeTab === 'report' &&
            activePlan &&
            (() => {
              const qMeta = currentProject.quotationMeta || {};
              const brand =
                workshopSettings.branding || FACTORY_WORKSHOP_DEFAULTS.branding;
              const studioTitle =
                qMeta.studioTitle || brand.companyName || 'CREATIVE INTERIOR';
              const studioSubtitle =
                qMeta.studioSubtitle ||
                brand.tagline ||
                'Interior Manufacturing & Smart Material Estimation';
              const docHeading = qMeta.docHeading || 'PROJECT QUOTATION';
              const quoteNo =
                qMeta.quoteNumber ||
                `QT-${currentProject.id.slice(-5).toUpperCase()}`;

              return (
                <div className="space-y-6">
                  {/* Quotation Action Toolbar */}
                  <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-2xl space-y-3 print:hidden">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-xs font-bold text-neutral-300">
                        Client-facing Quotation & Cutting Summary Report
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={handleCopyWhatsAppSummary}
                          className="bg-neutral-800 hover:bg-neutral-700 text-emerald-400 border border-emerald-500/30 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Summary</span>
                        </button>
                        <button
                          onClick={handleShareViaWhatsApp}
                          className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-extrabold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>WhatsApp Summary</span>
                        </button>
                        <button
                          onClick={() =>
                            updateCurrentProject({
                              quotationMeta: {
                                ...qMeta,
                                includeCuttingDiagrams:
                                  !qMeta.includeCuttingDiagrams,
                              },
                            })
                          }
                          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${
                            qMeta.includeCuttingDiagrams
                              ? 'bg-amber-400/20 text-amber-300 border-amber-400/40'
                              : 'bg-neutral-800 text-neutral-300 border-neutral-700'
                          }`}
                        >
                          <Scissors className="w-3.5 h-3.5" />
                          <span>Include Cutting Diagrams</span>
                        </button>
                        <label className="flex items-center gap-1.5 bg-neutral-800 border border-neutral-700 px-3 py-2 rounded-xl text-xs font-bold text-white cursor-pointer">
                          <input
                            type="checkbox"
                            checked={estimates.gstEnabled}
                            onChange={(e) =>
                              updateCurrentProject({
                                gstEnabled: e.target.checked,
                              })
                            }
                            className="accent-amber-400"
                          />
                          <span>GST ({estimates.gstPercent}%)</span>
                        </label>
                        <button
                          onClick={() => setIsEditingQuotePdf((prev) => !prev)}
                          className="bg-neutral-800 hover:bg-neutral-700 text-amber-400 border border-amber-400/40 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5"
                        >
                          <Sliders className="w-3.5 h-3.5" />
                          <span>
                            {isEditingQuotePdf ? 'Done Editing' : 'Edit PDF'}
                          </span>
                        </button>
                        <button
                          onClick={() => handleDownloadQuotationPdf()}
                          className="bg-amber-400 hover:bg-amber-300 text-neutral-950 font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download Quotation PDF</span>
                        </button>
                      </div>
                    </div>

                    {isEditingQuotePdf && (
                      <div className="pt-3 border-t border-neutral-800 grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                          <label className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">
                            Studio Name
                          </label>
                          <input
                            type="text"
                            value={studioTitle}
                            onChange={(e) =>
                              updateCurrentProject({
                                quotationMeta: {
                                  ...qMeta,
                                  studioTitle: e.target.value,
                                },
                              })
                            }
                            className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-white font-bold"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">
                            Client Name
                          </label>
                          <input
                            type="text"
                            value={currentProject.client}
                            onChange={(e) =>
                              updateCurrentProject({ client: e.target.value })
                            }
                            className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-white font-bold"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">
                            Delivery Timeline
                          </label>
                          <input
                            type="text"
                            value={
                              qMeta.deliveryTimeline || '15–21 Working Days'
                            }
                            onChange={(e) =>
                              updateCurrentProject({
                                quotationMeta: {
                                  ...qMeta,
                                  deliveryTimeline: e.target.value,
                                },
                              })
                            }
                            className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-white font-bold"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">
                            GST Rate (%)
                          </label>
                          <input
                            type="number"
                            value={estimates.gstPercent}
                            onChange={(e) =>
                              updateCurrentProject({
                                gstPercent: Number(e.target.value),
                                gstEnabled: true,
                              })
                            }
                            className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-amber-400 font-bold"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Printable Client Quotation Sheet */}
                  <div className="bg-white text-neutral-900 rounded-3xl p-8 md:p-12 shadow-2xl max-w-4xl mx-auto">
                    <div className="flex justify-between items-start border-b border-neutral-200 pb-6 mb-6">
                      <div className="flex items-center gap-3.5">
                        {brand.logoDataUrl && (
                          <img
                            src={brand.logoDataUrl}
                            alt="Studio Logo"
                            className="h-14 w-auto object-contain rounded"
                          />
                        )}
                        <div>
                          <h1 className="text-2xl md:text-3xl font-black text-neutral-900">
                            {studioTitle}
                          </h1>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            {studioSubtitle}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <h2 className="text-xl font-black text-neutral-900">
                          {docHeading}
                        </h2>
                        <p className="text-xs text-neutral-500 mt-1">
                          Quote #: {quoteNo} • Date: {currentProject.date}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8 bg-neutral-50 p-5 rounded-2xl border border-neutral-200 text-xs">
                      <div>
                        <span className="font-bold text-neutral-400 uppercase block mb-1">
                          Prepared For
                        </span>
                        <p className="font-black text-lg text-neutral-900">
                          {currentProject.client}
                        </p>
                        <p className="text-neutral-600 mt-0.5">
                          {currentProject.name} ({currentProject.furnitureType})
                          • Delivery:{' '}
                          {qMeta.deliveryTimeline || '15–21 Working Days'}
                        </p>
                      </div>
                      <div className="sm:text-right">
                        <span className="font-bold text-neutral-400 uppercase block mb-1">
                          Optimization Plan
                        </span>
                        <p className="font-black text-base text-amber-600">
                          {activePlan.strategyName}
                        </p>
                        <p className="text-neutral-600 mt-0.5">
                          {activePlan.purchasedSheetsCount} Sheets •{' '}
                          {activePlan.efficiencyPercent}% Material Yield
                        </p>
                      </div>
                    </div>

                    <h3 className="font-black text-xs uppercase tracking-wider text-neutral-800 mb-3">
                      1. Panel & Furniture Cutting Schedule
                    </h3>
                    <table className="w-full text-left text-xs border-collapse mb-8">
                      <thead>
                        <tr className="border-b-2 border-neutral-300 text-neutral-500 uppercase">
                          <th className="py-2.5">Component</th>
                          <th className="py-2.5">Dimensions</th>
                          <th className="py-2.5 text-center">Qty</th>
                          <th className="py-2.5 text-center">Edge Band</th>
                          <th className="py-2.5 text-right">Grain</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-200">
                        {(currentProject.panels || []).map((p, idx) => {
                          const eMode = normalizeEdgeMode(p.edgeMode || '4S');
                          return (
                            <tr key={idx}>
                              <td className="py-2.5 font-bold text-neutral-900">
                                {p.name}
                              </td>
                              <td className="py-2.5 text-neutral-700">
                                {formatMeasurement(p.width, unitDisplay)} ×{' '}
                                {formatMeasurement(p.height, unitDisplay)}
                              </td>
                              <td className="py-2.5 text-center font-black">
                                {p.qty}
                              </td>
                              <td className="py-2.5 text-center font-bold text-amber-700">
                                {EDGE_BAND_MODES[eMode]?.short || '4-Side'}
                              </td>
                              <td className="py-2.5 text-right text-neutral-500">
                                {p.grainLock ? 'Locked' : 'Rotatable'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    <h3 className="font-black text-xs uppercase tracking-wider text-neutral-800 mb-3">
                      2. Complete Cost & Tax Breakdown
                    </h3>
                    <div className="space-y-2.5 text-xs border-t border-neutral-200 pt-3 mb-6">
                      <div className="flex justify-between py-1">
                        <span className="text-neutral-600">
                          Optimized Plywood ({estimates.sheetsCount} Sheets)
                        </span>
                        <span className="font-bold">
                          {currency}
                          {estimates.plywoodCost.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-neutral-600">
                          Outer & Inner Laminate (
                          {estimates.laminateSheetsCount} Sheets) & Edge Banding
                          ({estimates.edgeBandingFeet} ft)
                        </span>
                        <span className="font-bold">
                          {currency}
                          {(
                            estimates.laminateCost + estimates.edgeBandingCost
                          ).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-neutral-600">
                          Hardware & Accessories
                        </span>
                        <span className="font-bold">
                          {currency}
                          {estimates.hardwareCost.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-neutral-600">
                          Cutting Machine, Carpentry Labor & Transport
                        </span>
                        <span className="font-bold">
                          {currency}
                          {(
                            estimates.cuttingMachineCost +
                            estimates.carpentryLabor +
                            estimates.transportCost
                          ).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-neutral-600">
                          Wastage Buffer ({currentProject.wastagePercent}%) &
                          Contractor Margin ({currentProject.profitPercent}%)
                        </span>
                        <span className="font-bold">
                          {currency}
                          {Math.round(
                            estimates.wastageBufferAmt + estimates.profitAmt
                          ).toLocaleString()}
                        </span>
                      </div>
                      {estimates.gstEnabled && (
                        <div className="flex justify-between py-1 text-amber-700 font-bold">
                          <span>GST / Tax ({estimates.gstPercent}%)</span>
                          <span>
                            {currency}
                            {Math.round(estimates.gstAmount).toLocaleString()}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between items-center pt-3 border-t-2 border-neutral-900 text-base font-black">
                        <span>Total Final Quotation</span>
                        <span className="text-xl text-amber-600">
                          {currency}
                          {Math.round(
                            estimates.finalQuotation
                          ).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Optional Embedded Cutting Layouts */}
                    {qMeta.includeCuttingDiagrams && (
                      <div className="mt-6 pt-6 border-t border-neutral-200 space-y-3">
                        <h3 className="font-black text-xs uppercase tracking-wider text-neutral-800">
                          3. Workshop Plywood Cutting Diagrams
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {activePlan.sheets.map((sh) => {
                            const sScale = Math.min(
                              340 / sh.sheetSpec.width,
                              160 / sh.sheetSpec.height
                            );
                            return (
                              <div
                                key={sh.sheetIndex}
                                className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-xs"
                              >
                                <div className="font-bold text-neutral-800 mb-1.5">
                                  Sheet #{sh.sheetIndex}: {sh.sheetSpec.name} (
                                  {sh.placedRects.length} cuts)
                                </div>
                                <svg
                                  width={sh.sheetSpec.width * sScale}
                                  height={sh.sheetSpec.height * sScale}
                                  className="bg-neutral-900 rounded"
                                >
                                  {sh.placedRects.map((r, rIdx) => (
                                    <rect
                                      key={rIdx}
                                      x={r.x * sScale}
                                      y={r.y * sScale}
                                      width={r.w * sScale}
                                      height={r.h * sScale}
                                      fill="rgba(251, 191, 36, 0.35)"
                                      stroke="#f59e0b"
                                      strokeWidth="1"
                                    />
                                  ))}
                                </svg>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Signature Footer */}
                    <div className="flex justify-between items-end pt-8 mt-8 border-t border-neutral-200 text-xs text-neutral-500">
                      <div>
                        <p className="font-bold text-neutral-800">
                          Payment Terms:
                        </p>
                        <p>
                          {estimates.milestones
                            .map((m) => `${m.percent}% ${m.label}`)
                            .join(' • ')}
                        </p>
                      </div>
                      <div className="text-right">
                        {brand.signatureDataUrl && (
                          <img
                            src={brand.signatureDataUrl}
                            alt="Signature"
                            className="h-12 ml-auto mb-1 object-contain"
                          />
                        )}
                        <p className="font-bold text-neutral-800">
                          Authorized Signatory — {studioTitle}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

          {/* ====================================================================
              TAB 4: INTEGRATED MATERIAL ESTIMATOR (SMART LAMINATE + HARDWARE CUSTOMIZER)
             ==================================================================== */}
          {activeTab === 'estimator' &&
            (() => {
              const lamCfg =
                currentProject.laminateConfig || DEFAULT_LAMINATE_CONFIG;
              const updateLamSide = (side, patch) => {
                updateCurrentProject({
                  laminateConfig: {
                    ...lamCfg,
                    [side]: { ...lamCfg[side], ...patch },
                  },
                });
              };
              const activeLamPreview =
                selectedLamPreviewTab === 'outer'
                  ? estimates.laminatePlan.outer
                  : estimates.laminatePlan.inner;

              return (
                <div className="space-y-8">
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-lg">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                      <div>
                        <h3 className="text-lg font-bold text-white">
                          Smart Buy Synced Material Estimator
                        </h3>
                        <p className="text-xs text-neutral-400">
                          Plywood, dual Outer/Inner Laminate 2D sheet nesting,
                          Edge Banding & Hardware quantities synced with your
                          project.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <button
                          onClick={() => handleDownloadMaterialEstimator('png')}
                          className="bg-neutral-800 hover:bg-neutral-700 text-neutral-100 border border-neutral-700 hover:border-amber-400 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition"
                        >
                          <ImageIcon className="w-4 h-4 text-amber-400" />
                          <span>Download PNG</span>
                        </button>
                        <button
                          onClick={() => handleDownloadMaterialEstimator('pdf')}
                          className="bg-neutral-800 hover:bg-neutral-700 text-neutral-100 border border-neutral-700 hover:border-amber-400 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition"
                        >
                          <FileText className="w-4 h-4 text-emerald-400" />
                          <span>Download PDF</span>
                        </button>
                        <button
                          onClick={() => setShowSpreadsheetModal(true)}
                          className="bg-neutral-800 hover:bg-neutral-700 text-blue-400 border border-blue-500/40 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition"
                        >
                          <FileSpreadsheet className="w-4 h-4" />
                          <span>CSV / Excel</span>
                        </button>
                        <button
                          onClick={() => {
                            const updated = [
                              ...(currentProject.materials ||
                                DEFAULT_MATERIALS),
                              {
                                id: 'mat-' + Date.now(),
                                name: 'Custom Board / Accessory',
                                category: 'Custom',
                                unit: 'Piece',
                                price: 150,
                              },
                            ];
                            updateCurrentProject({ materials: updated });
                          }}
                          className="bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5"
                        >
                          <Plus className="w-4 h-4 stroke-[3]" />
                          <span>Add Custom Material</span>
                        </button>
                      </div>
                    </div>

                    {/* Auto-Calculated Summary Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                      <div className="bg-neutral-950 border border-amber-400/30 p-4 rounded-xl">
                        <span className="text-[11px] font-bold text-amber-400 uppercase">
                          Plywood (Smart Buy)
                        </span>
                        <div className="text-2xl font-black text-white mt-1">
                          {estimates.sheetsCount} Sheets
                        </div>
                        <p className="text-xs text-neutral-400 mt-1">
                          Total: {currency}
                          {estimates.plywoodCost.toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-neutral-950 border border-blue-500/30 p-4 rounded-xl">
                        <span className="text-[11px] font-bold text-blue-400 uppercase">
                          Outer + Inner Laminate
                        </span>
                        <div className="text-2xl font-black text-white mt-1">
                          {estimates.laminatePlan.outer.sheetsCount} +{' '}
                          {estimates.laminatePlan.inner.sheetsCount} Sheets
                        </div>
                        <p className="text-xs text-neutral-400 mt-1">
                          Total: {currency}
                          {estimates.laminateCost.toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-neutral-950 border border-neutral-800 p-4 rounded-xl">
                        <span className="text-[11px] font-bold text-emerald-400 uppercase">
                          PVC Edge Banding
                        </span>
                        <div className="text-2xl font-black text-white mt-1">
                          {estimates.edgeBandingFeet} Ft
                        </div>
                        <p className="text-xs text-neutral-400 mt-1">
                          Total: {currency}
                          {estimates.edgeBandingCost.toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-neutral-950 border border-neutral-800 p-4 rounded-xl">
                        <span className="text-[11px] font-bold text-purple-400 uppercase">
                          Hardware & Fittings
                        </span>
                        <div className="text-2xl font-black text-white mt-1">
                          {currency}
                          {estimates.hardwareCost.toLocaleString()}
                        </div>
                        <p className="text-xs text-neutral-400 mt-1">
                          {
                            estimates.hardwareItems.filter((h) => h.qty > 0)
                              .length
                          }{' '}
                          Active Line Items
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* SMART LAMINATE SHEET ESTIMATOR (OUTER DECORATIVE VS INNER WHITE LINER) */}
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-lg space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h3 className="text-base font-bold text-white flex items-center gap-2">
                          <Layers className="w-5 h-5 text-blue-400" />
                          <span>
                            Smart Laminate Sheet Estimator (2D Sheet Nesting)
                          </span>
                        </h3>
                        <p className="text-xs text-neutral-400">
                          Calculates actual sheet counts & cutting layouts
                          separately for Outer Decorative Laminate and 0.8mm
                          Inner White Liner.
                        </p>
                      </div>
                      <span className="text-xs font-black px-3 py-1.5 rounded-xl bg-blue-500/15 text-blue-300 border border-blue-500/30">
                        Combined Laminate Cost: {currency}
                        {estimates.laminateCost.toLocaleString()}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* A. Outer Decorative Laminate */}
                      <div className="bg-neutral-950 border border-amber-400/30 rounded-2xl p-5 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                              Category A • External Faces
                            </span>
                            <h4 className="text-sm font-extrabold text-white">
                              Outer Decorative Laminate
                            </h4>
                          </div>
                          <div className="text-right">
                            <span className="text-lg font-black text-amber-400">
                              {estimates.laminatePlan.outer.sheetsCount} Sheets
                            </span>
                            <span className="text-[11px] text-neutral-400 block">
                              {currency}
                              {estimates.laminatePlan.outer.totalCost.toLocaleString()}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                          <div>
                            <label className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">
                              Brand
                            </label>
                            <input
                              type="text"
                              value={lamCfg.outer.brand}
                              onChange={(e) =>
                                updateLamSide('outer', {
                                  brand: e.target.value,
                                })
                              }
                              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-white font-bold"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">
                              Colour / Finish
                            </label>
                            <input
                              type="text"
                              value={lamCfg.outer.color}
                              onChange={(e) =>
                                updateLamSide('outer', {
                                  color: e.target.value,
                                })
                              }
                              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-white font-bold"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">
                              Thickness
                            </label>
                            <input
                              type="text"
                              value={lamCfg.outer.thickness}
                              onChange={(e) =>
                                updateLamSide('outer', {
                                  thickness: e.target.value,
                                })
                              }
                              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-amber-300 font-bold"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">
                              Sheet W × H (in)
                            </label>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                value={lamCfg.outer.sheetW}
                                onChange={(e) =>
                                  updateLamSide('outer', {
                                    sheetW: Number(e.target.value),
                                  })
                                }
                                className="w-1/2 bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-1.5 text-white font-bold"
                              />
                              <input
                                type="number"
                                value={lamCfg.outer.sheetH}
                                onChange={(e) =>
                                  updateLamSide('outer', {
                                    sheetH: Number(e.target.value),
                                  })
                                }
                                className="w-1/2 bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-1.5 text-white font-bold"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">
                              Rate / Sheet ({currency})
                            </label>
                            <input
                              type="number"
                              value={lamCfg.outer.price}
                              onChange={(e) =>
                                updateLamSide('outer', {
                                  price: Number(e.target.value),
                                })
                              }
                              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-amber-400 font-extrabold"
                            />
                          </div>
                          <div className="flex items-end">
                            <label className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 w-full cursor-pointer font-bold text-neutral-200">
                              <input
                                type="checkbox"
                                checked={Boolean(lamCfg.outer.grainLock)}
                                onChange={(e) =>
                                  updateLamSide('outer', {
                                    grainLock: e.target.checked,
                                  })
                                }
                                className="accent-amber-400"
                              />
                              <span>Grain Lock</span>
                            </label>
                          </div>
                        </div>
                      </div>

                      {/* B. Inner White Liner Laminate */}
                      <div className="bg-neutral-950 border border-blue-500/30 rounded-2xl p-5 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-blue-400">
                              Category B • Interior Carcass
                            </span>
                            <h4 className="text-sm font-extrabold text-white">
                              Inner White Liner Laminate
                            </h4>
                          </div>
                          <div className="text-right">
                            <span className="text-lg font-black text-blue-400">
                              {estimates.laminatePlan.inner.sheetsCount} Sheets
                            </span>
                            <span className="text-[11px] text-neutral-400 block">
                              {currency}
                              {estimates.laminatePlan.inner.totalCost.toLocaleString()}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                          <div>
                            <label className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">
                              Brand
                            </label>
                            <input
                              type="text"
                              value={lamCfg.inner.brand}
                              onChange={(e) =>
                                updateLamSide('inner', {
                                  brand: e.target.value,
                                })
                              }
                              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-white font-bold"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">
                              Colour / Finish
                            </label>
                            <input
                              type="text"
                              value={lamCfg.inner.color}
                              onChange={(e) =>
                                updateLamSide('inner', {
                                  color: e.target.value,
                                })
                              }
                              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-white font-bold"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">
                              Thickness
                            </label>
                            <input
                              type="text"
                              value={lamCfg.inner.thickness}
                              onChange={(e) =>
                                updateLamSide('inner', {
                                  thickness: e.target.value,
                                })
                              }
                              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-blue-300 font-bold"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">
                              Sheet W × H (in)
                            </label>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                value={lamCfg.inner.sheetW}
                                onChange={(e) =>
                                  updateLamSide('inner', {
                                    sheetW: Number(e.target.value),
                                  })
                                }
                                className="w-1/2 bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-1.5 text-white font-bold"
                              />
                              <input
                                type="number"
                                value={lamCfg.inner.sheetH}
                                onChange={(e) =>
                                  updateLamSide('inner', {
                                    sheetH: Number(e.target.value),
                                  })
                                }
                                className="w-1/2 bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-1.5 text-white font-bold"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">
                              Rate / Sheet ({currency})
                            </label>
                            <input
                              type="number"
                              value={lamCfg.inner.price}
                              onChange={(e) =>
                                updateLamSide('inner', {
                                  price: Number(e.target.value),
                                })
                              }
                              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-blue-400 font-extrabold"
                            />
                          </div>
                          <div className="flex items-end">
                            <label className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 w-full cursor-pointer font-bold text-neutral-200">
                              <input
                                type="checkbox"
                                checked={Boolean(lamCfg.inner.grainLock)}
                                onChange={(e) =>
                                  updateLamSide('inner', {
                                    grainLock: e.target.checked,
                                  })
                                }
                                className="accent-blue-400"
                              />
                              <span>Grain Lock</span>
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Separate Laminate Cutting Layouts Viewer */}
                    <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSelectedLamPreviewTab('outer')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition ${
                              selectedLamPreviewTab === 'outer'
                                ? 'bg-amber-400 text-neutral-950'
                                : 'bg-neutral-800 text-neutral-300'
                            }`}
                          >
                            Outer Decorative Layout (
                            {estimates.laminatePlan.outer.sheetsCount} Sheets)
                          </button>
                          <button
                            onClick={() => setSelectedLamPreviewTab('inner')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition ${
                              selectedLamPreviewTab === 'inner'
                                ? 'bg-blue-400 text-neutral-950'
                                : 'bg-neutral-800 text-neutral-300'
                            }`}
                          >
                            Inner Liner Layout (
                            {estimates.laminatePlan.inner.sheetsCount} Sheets)
                          </button>
                        </div>
                        <span className="text-xs text-neutral-400">
                          Net Surface:{' '}
                          <strong className="text-white">
                            {activeLamPreview.netAreaSqFt} sq.ft
                          </strong>{' '}
                          • Scrap:{' '}
                          <strong className="text-amber-400">
                            {activeLamPreview.wastePercent}%
                          </strong>
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {activeLamPreview.sheets.map((sh) => {
                          const sScale = Math.min(
                            260 / sh.sheetSpec.width,
                            130 / sh.sheetSpec.height
                          );
                          return (
                            <div
                              key={sh.sheetIndex}
                              className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-xs"
                            >
                              <div className="font-bold text-neutral-200 mb-1.5">
                                Laminate Sheet #{sh.sheetIndex} (
                                {sh.placedRects.length} pieces)
                              </div>
                              <svg
                                width={sh.sheetSpec.width * sScale}
                                height={sh.sheetSpec.height * sScale}
                                className="bg-neutral-950 rounded border border-neutral-700"
                              >
                                {sh.placedRects.map((r, rIdx) => (
                                  <g key={rIdx}>
                                    <rect
                                      x={r.x * sScale}
                                      y={r.y * sScale}
                                      width={r.w * sScale}
                                      height={r.h * sScale}
                                      fill={
                                        selectedLamPreviewTab === 'outer'
                                          ? 'rgba(251, 191, 36, 0.25)'
                                          : 'rgba(96, 165, 250, 0.25)'
                                      }
                                      stroke={
                                        selectedLamPreviewTab === 'outer'
                                          ? '#fbbf24'
                                          : '#60a5fa'
                                      }
                                      strokeWidth="1"
                                    />
                                  </g>
                                ))}
                              </svg>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* HARDWARE QUANTITY & RATE CUSTOMIZER */}
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-lg space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h3 className="text-base font-bold text-white flex items-center gap-2">
                          <Sliders className="w-5 h-5 text-purple-400" />
                          <span>Hardware Quantity & Rate Customizer</span>
                        </h3>
                        <p className="text-xs text-neutral-400">
                          Manual quantity or rate edits are preserved
                          automatically when panels change. Click Recalculate
                          Suggested to reset from design.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => {
                            updateCurrentProject({
                              customHardware: estimates.suggestedHardware,
                            });
                            showNotification(
                              'Recalculated suggested hardware quantities from current furniture panels!'
                            );
                          }}
                          className="bg-neutral-800 hover:bg-neutral-700 text-amber-400 border border-amber-400/40 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                          <span>Recalculate Suggested</span>
                        </button>
                        <button
                          onClick={() => {
                            const baseList = [...estimates.hardwareItems];
                            baseList.push({
                              id: 'hw-custom-' + Date.now(),
                              name: 'Custom Hardware Fitting',
                              qty: 2,
                              unit: 'Pcs',
                              rate: 120,
                              price: 120,
                              total: 240,
                            });
                            updateCurrentProject({ customHardware: baseList });
                          }}
                          className="bg-amber-400 hover:bg-amber-300 text-neutral-950 font-extrabold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5 stroke-[3]" />
                          <span>Add Custom Hardware</span>
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-neutral-800 text-neutral-400 uppercase tracking-wider">
                            <th className="py-2.5 px-3">Hardware Item Name</th>
                            <th className="py-2.5 px-3 w-24">Qty</th>
                            <th className="py-2.5 px-3 w-24">Unit</th>
                            <th className="py-2.5 px-3 w-28">
                              Rate ({currency})
                            </th>
                            <th className="py-2.5 px-3 text-right">
                              Total ({currency})
                            </th>
                            <th className="py-2.5 px-2 text-right"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800/60">
                          {estimates.hardwareItems.map((hw, idx) => (
                            <tr
                              key={hw.id || idx}
                              className="hover:bg-neutral-800/30"
                            >
                              <td className="py-2 px-3">
                                <input
                                  type="text"
                                  value={hw.name}
                                  onChange={(e) => {
                                    const next = [...estimates.hardwareItems];
                                    next[idx] = {
                                      ...next[idx],
                                      name: e.target.value,
                                    };
                                    updateCurrentProject({
                                      customHardware: next,
                                    });
                                  }}
                                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-white font-semibold"
                                />
                              </td>
                              <td className="py-2 px-3">
                                <input
                                  type="number"
                                  min="0"
                                  value={hw.qty}
                                  onChange={(e) => {
                                    const next = [...estimates.hardwareItems];
                                    next[idx] = {
                                      ...next[idx],
                                      qty: Math.max(0, Number(e.target.value)),
                                    };
                                    updateCurrentProject({
                                      customHardware: next,
                                    });
                                  }}
                                  className="w-20 bg-neutral-800 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-white font-extrabold"
                                />
                              </td>
                              <td className="py-2 px-3">
                                <input
                                  type="text"
                                  value={hw.unit}
                                  onChange={(e) => {
                                    const next = [...estimates.hardwareItems];
                                    next[idx] = {
                                      ...next[idx],
                                      unit: e.target.value,
                                    };
                                    updateCurrentProject({
                                      customHardware: next,
                                    });
                                  }}
                                  className="w-20 bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1.5 text-neutral-300 font-semibold"
                                />
                              </td>
                              <td className="py-2 px-3">
                                <input
                                  type="number"
                                  min="0"
                                  value={hw.rate}
                                  onChange={(e) => {
                                    const next = [...estimates.hardwareItems];
                                    const val = Math.max(
                                      0,
                                      Number(e.target.value)
                                    );
                                    next[idx] = {
                                      ...next[idx],
                                      rate: val,
                                      price: val,
                                    };
                                    updateCurrentProject({
                                      customHardware: next,
                                    });
                                  }}
                                  className="w-24 bg-neutral-800 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-amber-400 font-extrabold"
                                />
                              </td>
                              <td className="py-2 px-3 text-right font-black text-white">
                                {currency}
                                {hw.total.toLocaleString()}
                              </td>
                              <td className="py-2 px-2 text-right">
                                <button
                                  onClick={() => {
                                    const next = estimates.hardwareItems.filter(
                                      (_, i) => i !== idx
                                    );
                                    updateCurrentProject({
                                      customHardware: next,
                                    });
                                  }}
                                  className="text-neutral-500 hover:text-red-400 p-1"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-neutral-950 font-black text-sm border-t border-neutral-800">
                            <td colSpan="4" className="py-3 px-3 text-white">
                              Total Hardware & Accessories Cost
                            </td>
                            <td className="py-3 px-3 text-right text-purple-400">
                              {currency}
                              {estimates.hardwareCost.toLocaleString()}
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* Editable Price Catalog (Board & Rate Reference) */}
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-lg">
                    <h3 className="text-sm font-bold text-white mb-4">
                      Board & Base Rate Schedule
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-neutral-800 text-neutral-400 uppercase tracking-wider">
                            <th className="py-3 px-3">
                              Material / Hardware Item
                            </th>
                            <th className="py-3 px-3">Category</th>
                            <th className="py-3 px-3">Unit</th>
                            <th className="py-3 px-3">
                              Unit Rate ({currency})
                            </th>
                            <th className="py-3 px-3 text-right">Remove</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800/60">
                          {(currentProject.materials || DEFAULT_MATERIALS).map(
                            (mat, idx) => (
                              <tr
                                key={mat.id || idx}
                                className="hover:bg-neutral-800/30"
                              >
                                <td className="py-2.5 px-3">
                                  <input
                                    type="text"
                                    value={mat.name}
                                    onChange={(e) => {
                                      const updated = [
                                        ...currentProject.materials,
                                      ];
                                      updated[idx].name = e.target.value;
                                      updateCurrentProject({
                                        materials: updated,
                                      });
                                    }}
                                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-white font-medium"
                                  />
                                </td>
                                <td className="py-2.5 px-3">
                                  <span className="px-2 py-1 rounded bg-neutral-800 text-neutral-300 font-semibold">
                                    {mat.category}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-neutral-400">
                                  {mat.unit}
                                </td>
                                <td className="py-2.5 px-3">
                                  <input
                                    type="number"
                                    value={
                                      idx === 0
                                        ? Math.round(estimates.avgPlyPrice)
                                        : mat.price
                                    }
                                    disabled={idx === 0}
                                    onChange={(e) => {
                                      const updated = [
                                        ...currentProject.materials,
                                      ];
                                      updated[idx].price = Number(
                                        e.target.value
                                      );
                                      updateCurrentProject({
                                        materials: updated,
                                      });
                                    }}
                                    className="w-28 bg-neutral-800 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-amber-400 font-bold disabled:opacity-60"
                                  />
                                </td>
                                <td className="py-2.5 px-3 text-right">
                                  {idx !== 0 && (
                                    <button
                                      onClick={() => {
                                        const updated =
                                          currentProject.materials.filter(
                                            (_, i) => i !== idx
                                          );
                                        updateCurrentProject({
                                          materials: updated,
                                        });
                                      }}
                                      className="text-neutral-400 hover:text-red-400 p-1.5"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            )
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()}

          {/* ====================================================================
              TAB 5: COST CALCULATOR (INCLUDING CUTTING & MACHINE LABOR)
             ==================================================================== */}
          {activeTab === 'calculator' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1 bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-lg space-y-5">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-amber-400" />
                  <span>Labor & Margin Settings</span>
                </h3>

                <div className="space-y-4 text-xs">
                  <div>
                    <label className="font-bold text-neutral-400 uppercase block mb-1.5">
                      CNC / Panel Saw Cutting Rate per Sheet ({currency})
                    </label>
                    <input
                      type="number"
                      value={currentProject.cuttingLaborPerSheet ?? 120}
                      onChange={(e) =>
                        updateCurrentProject({
                          cuttingLaborPerSheet: Number(e.target.value),
                        })
                      }
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-sm text-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-neutral-400 uppercase block mb-1.5">
                      Carpentry & Assembly Labor ({currency})
                    </label>
                    <input
                      type="number"
                      value={currentProject.carpentryLaborCost ?? 4500}
                      onChange={(e) =>
                        updateCurrentProject({
                          carpentryLaborCost: Number(e.target.value),
                        })
                      }
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-sm text-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-neutral-400 uppercase block mb-1.5">
                      Transportation & Unloading ({currency})
                    </label>
                    <input
                      type="number"
                      value={currentProject.transportCost ?? 850}
                      onChange={(e) =>
                        updateCurrentProject({
                          transportCost: Number(e.target.value),
                        })
                      }
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-sm text-white font-bold"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-neutral-400 uppercase block mb-1.5">
                        Wastage Buffer (%)
                      </label>
                      <input
                        type="number"
                        value={currentProject.wastagePercent ?? 5}
                        onChange={(e) =>
                          updateCurrentProject({
                            wastagePercent: Number(e.target.value),
                          })
                        }
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-sm text-white font-bold"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-neutral-400 uppercase block mb-1.5">
                        Profit Margin (%)
                      </label>
                      <input
                        type="number"
                        value={currentProject.profitPercent ?? 20}
                        onChange={(e) =>
                          updateCurrentProject({
                            profitPercent: Number(e.target.value),
                          })
                        }
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-sm text-emerald-400 font-bold"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-2 bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-lg flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white mb-5">
                    Complete Project Cost & Profit Breakdown
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between py-2 border-b border-neutral-800">
                      <span className="text-neutral-400">
                        Smart Buy Plywood ({estimates.sheetsCount} Sheets)
                      </span>
                      <span className="font-bold text-white">
                        {currency}
                        {estimates.plywoodCost.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-neutral-800">
                      <span className="text-neutral-400">
                        Laminates & Edge Banding
                      </span>
                      <span className="font-bold text-white">
                        {currency}
                        {(
                          estimates.laminateCost + estimates.edgeBandingCost
                        ).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-neutral-800">
                      <span className="text-neutral-400">
                        Hardware & Fittings
                      </span>
                      <span className="font-bold text-white">
                        {currency}
                        {estimates.hardwareCost.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-neutral-800">
                      <span className="text-neutral-400">
                        Panel Saw Cutting Cost (
                        {activePlan?.totalSheetsCount || 0} Sheets × {currency}
                        {currentProject.cuttingLaborPerSheet})
                      </span>
                      <span className="font-bold text-white">
                        {currency}
                        {estimates.cuttingMachineCost.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-neutral-800">
                      <span className="text-neutral-400">
                        Carpentry Labor & Transport
                      </span>
                      <span className="font-bold text-white">
                        {currency}
                        {(
                          estimates.carpentryLabor + estimates.transportCost
                        ).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-neutral-800">
                      <span className="text-neutral-400">
                        Contingency / Wastage Buffer (
                        {currentProject.wastagePercent}%)
                      </span>
                      <span className="font-bold text-white">
                        {currency}
                        {estimates.wastageBufferAmt.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-neutral-800">
                      <span className="text-neutral-400">
                        Net Profit Margin ({currentProject.profitPercent}%)
                      </span>
                      <span className="font-bold text-emerald-400">
                        {currency}
                        {estimates.profitAmt.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-5 border-t border-neutral-800 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <span className="text-xs text-neutral-400 uppercase font-bold block">
                      Final Client Quotation
                    </span>
                    <span className="text-3xl font-black text-amber-400">
                      {currency}
                      {estimates.finalQuotation.toLocaleString()}
                    </span>
                  </div>
                  <button
                    onClick={() => setActiveTab('report')}
                    className="bg-amber-400 hover:bg-amber-300 text-neutral-950 font-extrabold px-6 py-3 rounded-xl text-xs flex items-center gap-2 shadow-lg"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Open Client PDF Quotation</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ====================================================================
              TAB 6: PURCHASE ORDER GENERATOR (SUPPLIER READY & PRINTABLE)
             ==================================================================== */}
          {activeTab === 'purchaseorder' && activePlan && (
            <div className="space-y-6">
              <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-2xl space-y-3 print:hidden">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-neutral-400 font-bold">
                      Saved Supplier:
                    </span>
                    <select
                      value=""
                      onChange={(e) => {
                        const sup = (contacts.suppliers || []).find(
                          (s) => s.id === e.target.value
                        );
                        if (sup) {
                          updateCurrentProject({
                            supplierName: sup.company || sup.name,
                            supplierPhone: `${sup.phone}${
                              sup.gstin ? ` | GSTIN: ${sup.gstin}` : ''
                            }`,
                            supplierAddress: sup.address || '',
                          });
                          showNotification(
                            `Auto-filled supplier "${sup.company || sup.name}"!`
                          );
                        }
                      }}
                      className="bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-1.5 text-amber-400 font-bold"
                    >
                      <option value="">
                        -- Select from Supplier Address Book --
                      </option>
                      {(contacts.suppliers || []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.company || s.name} ({s.phone})
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleDownloadPurchaseOrderPdf}
                    className="bg-amber-400 hover:bg-amber-300 text-neutral-950 font-extrabold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 shrink-0"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Purchase Order PDF</span>
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Supplier / Timber Merchant Name"
                    value={currentProject.supplierName || ''}
                    onChange={(e) =>
                      updateCurrentProject({ supplierName: e.target.value })
                    }
                    className="bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2 text-xs text-white font-semibold"
                  />
                  <input
                    type="text"
                    placeholder="Supplier Contact / GST"
                    value={currentProject.supplierPhone || ''}
                    onChange={(e) =>
                      updateCurrentProject({ supplierPhone: e.target.value })
                    }
                    className="bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2 text-xs text-white font-semibold"
                  />
                </div>
              </div>

              {/* Printable Purchase Order Sheet */}
              <div className="bg-white text-neutral-900 rounded-3xl p-8 md:p-12 shadow-2xl max-w-4xl mx-auto print:shadow-none">
                <div className="flex justify-between items-start border-b-2 border-neutral-900 pb-6 mb-6">
                  <div>
                    <span className="text-xs font-black uppercase tracking-widest text-amber-600">
                      Material Procurement
                    </span>
                    <h1 className="text-3xl font-black text-neutral-900 mt-1">
                      PURCHASE ORDER
                    </h1>
                    <p className="text-xs text-neutral-500 mt-1">
                      Generated by PLYOPTIMIZE Smart Buy Engine
                    </p>
                  </div>
                  <div className="text-right text-xs text-neutral-600 space-y-1">
                    <p className="font-bold text-neutral-900 text-sm">
                      PO-{currentProject.id.slice(-6).toUpperCase()}
                    </p>
                    <p>Date: {currentProject.date}</p>
                    <p>Project: {currentProject.name}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 mb-8 bg-neutral-50 p-5 rounded-2xl border border-neutral-200 text-xs">
                  <div>
                    <span className="font-bold text-neutral-400 uppercase block mb-1">
                      Vendor / Supplier
                    </span>
                    <p className="font-black text-base text-neutral-900">
                      {currentProject.supplierName ||
                        'Authorized Plywood Supplier'}
                    </p>
                    <p className="text-neutral-600 mt-0.5">
                      {currentProject.supplierPhone}
                    </p>
                  </div>
                  <div>
                    <span className="font-bold text-neutral-400 uppercase block mb-1">
                      Delivery Reference
                    </span>
                    <p className="font-bold text-sm text-neutral-900">
                      {currentProject.name}
                    </p>
                    <p className="text-neutral-600 mt-0.5">
                      Client: {currentProject.client}
                    </p>
                  </div>
                </div>

                <h3 className="font-bold text-sm uppercase tracking-wider text-neutral-800 mb-3">
                  1. Optimized Plywood Sheets Order ({activePlan.strategyName})
                </h3>
                <table className="w-full text-left text-xs border-collapse mb-8">
                  <thead>
                    <tr className="bg-neutral-900 text-white uppercase">
                      <th className="py-3 px-4 rounded-tl-lg">
                        Sheet Description
                      </th>
                      <th className="py-3 px-4">Dimensions</th>
                      <th className="py-3 px-4 text-center">Qty</th>
                      <th className="py-3 px-4 text-right">Unit Price</th>
                      <th className="py-3 px-4 text-right rounded-tr-lg">
                        Total ({currency})
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 border border-neutral-200">
                    {activePlan.purchaseBreakdown.map((row, idx) => (
                      <tr key={idx}>
                        <td className="py-3 px-4 font-bold text-neutral-900">
                          {row.name}
                        </td>
                        <td className="py-3 px-4 text-neutral-700">
                          {formatMeasurement(row.width, unitDisplay)} ×{' '}
                          {formatMeasurement(row.height, unitDisplay)}
                        </td>
                        <td className="py-3 px-4 text-center font-black">
                          {row.qty}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {currency}
                          {row.unitPrice.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right font-bold">
                          {currency}
                          {row.subtotal.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-amber-50 font-black text-sm border border-neutral-200">
                      <td colSpan="2" className="py-3 px-4 text-neutral-900">
                        Total Plywood Order
                      </td>
                      <td className="py-3 px-4 text-center">
                        {activePlan.purchasedSheetsCount} Sheets
                      </td>
                      <td className="py-3 px-4"></td>
                      <td className="py-3 px-4 text-right text-amber-700">
                        {currency}
                        {activePlan.totalPurchaseCost.toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>

                <h3 className="font-bold text-sm uppercase tracking-wider text-neutral-800 mb-3">
                  2. Accompanying Laminates, Edge Banding & Hardware
                </h3>
                <table className="w-full text-left text-xs border-collapse mb-8">
                  <thead>
                    <tr className="bg-neutral-100 text-neutral-700 uppercase border border-neutral-200">
                      <th className="py-2.5 px-4">Item Description</th>
                      <th className="py-2.5 px-4 text-center">Estimated Qty</th>
                      <th className="py-2.5 px-4 text-right">
                        Est. Total ({currency})
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 border border-neutral-200">
                    <tr>
                      <td className="py-2.5 px-4 font-semibold">
                        Decorative Laminate Sheets (8' × 4')
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        {estimates.laminateSheetsCount} Sheets
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold">
                        {currency}
                        {estimates.laminateCost.toLocaleString()}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 font-semibold">
                        Matching PVC Edge Banding Tape
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        {estimates.edgeBandingFeet} Running Ft
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold">
                        {currency}
                        {estimates.edgeBandingCost.toLocaleString()}
                      </td>
                    </tr>
                    {estimates.hardwareItems.map((h, i) => (
                      <tr key={i}>
                        <td className="py-2.5 px-4 font-semibold">{h.name}</td>
                        <td className="py-2.5 px-4 text-center">
                          {h.qty} {h.unit}
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold">
                          {currency}
                          {h.total.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-neutral-900 text-white font-black text-sm">
                      <td colSpan="2" className="py-3.5 px-4">
                        Grand Total Material Procurement
                      </td>
                      <td className="py-3.5 px-4 text-right text-amber-400">
                        {currency}
                        {estimates.rawMaterialSubtotal.toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>

                <div className="flex justify-between items-end pt-6 border-t border-neutral-200 text-xs text-neutral-500">
                  <div>
                    <p className="font-bold text-neutral-800">
                      Optimization Verification:
                    </p>
                    <p>
                      Yield Efficiency: {activePlan.efficiencyPercent}% | Net
                      Scrap: {activePlan.netWastePercent}%
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="w-44 border-b border-neutral-400 mb-1 h-8" />
                    <p className="font-bold text-neutral-800">Approved By</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ====================================================================
              TAB 7B: CONTACT MANAGEMENT (CLIENT & SUPPLIER ADDRESS BOOK)
             ==================================================================== */}
          {activeTab === 'contacts' &&
            (() => {
              const q = contactSearchQuery.trim().toLowerCase();
              const filteredClients = (contacts.clients || []).filter(
                (c) =>
                  !q ||
                  (c.name || '').toLowerCase().includes(q) ||
                  (c.company || '').toLowerCase().includes(q) ||
                  (c.phone || '').toLowerCase().includes(q) ||
                  (c.address || '').toLowerCase().includes(q)
              );
              const filteredSuppliers = (contacts.suppliers || []).filter(
                (s) =>
                  !q ||
                  (s.name || '').toLowerCase().includes(q) ||
                  (s.company || '').toLowerCase().includes(q) ||
                  (s.categories || '').toLowerCase().includes(q) ||
                  (s.phone || '').toLowerCase().includes(q)
              );

              return (
                <div className="space-y-6">
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-black text-white flex items-center gap-2">
                        <Users className="w-5 h-5 text-amber-400" />
                        <span>
                          Contact Management — Client & Supplier Address Book
                        </span>
                      </h2>
                      <p className="text-xs text-neutral-400 mt-0.5">
                        Save repeat interior clients, architects, and plywood
                        dealers to auto-fill Quotations & Purchase Orders in one
                        click.
                      </p>
                    </div>
                    <div className="relative w-full sm:w-72">
                      <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={contactSearchQuery}
                        onChange={(e) => setContactSearchQuery(e.target.value)}
                        placeholder="Search clients, suppliers, GSTIN..."
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* A. CLIENT ADDRESS BOOK */}
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-lg space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                          Category A
                        </span>
                        <h3 className="text-base font-bold text-white">
                          Client Address Book ({filteredClients.length})
                        </h3>
                      </div>
                      <button
                        onClick={() => {
                          const newCli = {
                            id: 'cli-' + Date.now(),
                            name: 'New Interior Client',
                            company: '',
                            phone: '+91 ',
                            whatsapp: '+91 ',
                            email: '',
                            address: '',
                            gstin: '',
                            notes: '',
                          };
                          setContacts({
                            ...contacts,
                            clients: [newCli, ...(contacts.clients || [])],
                          });
                          showNotification('Added new client record.');
                        }}
                        className="bg-amber-400 hover:bg-amber-300 text-neutral-950 font-extrabold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5"
                      >
                        <Plus className="w-4 h-4 stroke-[3]" />
                        <span>Add New Client</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredClients.map((cli, idx) => (
                        <div
                          key={cli.id}
                          className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 space-y-3 text-xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 space-y-1">
                              <input
                                type="text"
                                value={cli.name}
                                onChange={(e) => {
                                  const next = contacts.clients.map((item) =>
                                    item.id === cli.id
                                      ? { ...item, name: e.target.value }
                                      : item
                                  );
                                  setContacts({ ...contacts, clients: next });
                                }}
                                placeholder="Client Full Name"
                                className="w-full bg-transparent text-sm font-black text-white border-b border-transparent focus:border-amber-400 focus:outline-none"
                              />
                              <input
                                type="text"
                                value={cli.company || ''}
                                onChange={(e) => {
                                  const next = contacts.clients.map((item) =>
                                    item.id === cli.id
                                      ? { ...item, company: e.target.value }
                                      : item
                                  );
                                  setContacts({ ...contacts, clients: next });
                                }}
                                placeholder="Company / Site Name"
                                className="w-full bg-transparent text-xs text-neutral-400 border-b border-transparent focus:border-amber-400 focus:outline-none"
                              />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => {
                                  updateCurrentProject({
                                    client: cli.name,
                                    clientPhone: cli.phone,
                                    clientAddress: cli.address,
                                    clientGstin: cli.gstin,
                                  });
                                  showNotification(
                                    `Applied "${cli.name}" to active project & quotation!`
                                  );
                                }}
                                className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 px-2.5 py-1 rounded-lg font-extrabold text-[11px]"
                              >
                                Use in Quote
                              </button>
                              <button
                                onClick={() => {
                                  setContacts({
                                    ...contacts,
                                    clients: contacts.clients.filter(
                                      (item) => item.id !== cli.id
                                    ),
                                  });
                                  showNotification('Client removed.');
                                }}
                                className="p-1.5 text-neutral-500 hover:text-red-400"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={cli.phone || ''}
                              onChange={(e) => {
                                const next = contacts.clients.map((item) =>
                                  item.id === cli.id
                                    ? { ...item, phone: e.target.value }
                                    : item
                                );
                                setContacts({ ...contacts, clients: next });
                              }}
                              placeholder="Phone Number"
                              className="bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-200"
                            />
                            <input
                              type="text"
                              value={cli.whatsapp || ''}
                              onChange={(e) => {
                                const next = contacts.clients.map((item) =>
                                  item.id === cli.id
                                    ? { ...item, whatsapp: e.target.value }
                                    : item
                                );
                                setContacts({ ...contacts, clients: next });
                              }}
                              placeholder="WhatsApp Number"
                              className="bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-emerald-300"
                            />
                            <input
                              type="email"
                              value={cli.email || ''}
                              onChange={(e) => {
                                const next = contacts.clients.map((item) =>
                                  item.id === cli.id
                                    ? { ...item, email: e.target.value }
                                    : item
                                );
                                setContacts({ ...contacts, clients: next });
                              }}
                              placeholder="Email Address"
                              className="bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-200"
                            />
                            <input
                              type="text"
                              value={cli.gstin || ''}
                              onChange={(e) => {
                                const next = contacts.clients.map((item) =>
                                  item.id === cli.id
                                    ? { ...item, gstin: e.target.value }
                                    : item
                                );
                                setContacts({ ...contacts, clients: next });
                              }}
                              placeholder="Client GSTIN (Optional)"
                              className="bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-amber-300"
                            />
                          </div>
                          <input
                            type="text"
                            value={cli.address || ''}
                            onChange={(e) => {
                              const next = contacts.clients.map((item) =>
                                item.id === cli.id
                                  ? { ...item, address: e.target.value }
                                  : item
                              );
                              setContacts({ ...contacts, clients: next });
                            }}
                            placeholder="Site / Billing Address"
                            className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-300"
                          />
                          <input
                            type="text"
                            value={cli.notes || ''}
                            onChange={(e) => {
                              const next = contacts.clients.map((item) =>
                                item.id === cli.id
                                  ? { ...item, notes: e.target.value }
                                  : item
                              );
                              setContacts({ ...contacts, clients: next });
                            }}
                            placeholder="Design notes / preferences..."
                            className="w-full bg-neutral-900/60 border border-neutral-800 rounded-lg px-2.5 py-1 text-neutral-400 text-[11px]"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* B. SUPPLIER ADDRESS BOOK */}
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-lg space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-blue-400">
                          Category B
                        </span>
                        <h3 className="text-base font-bold text-white">
                          Supplier & Dealer Address Book (
                          {filteredSuppliers.length})
                        </h3>
                      </div>
                      <button
                        onClick={() => {
                          const newSup = {
                            id: 'sup-' + Date.now(),
                            name: 'Contact Person',
                            company: 'New Timber & Plywood Dealer',
                            phone: '+91 ',
                            whatsapp: '+91 ',
                            email: '',
                            address: '',
                            gstin: '',
                            categories: 'Plywood, Laminates, Hardware',
                            notes: '',
                          };
                          setContacts({
                            ...contacts,
                            suppliers: [newSup, ...(contacts.suppliers || [])],
                          });
                          showNotification('Added new supplier record.');
                        }}
                        className="bg-blue-500 hover:bg-blue-400 text-neutral-950 font-extrabold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5"
                      >
                        <Plus className="w-4 h-4 stroke-[3]" />
                        <span>Add New Supplier</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredSuppliers.map((sup) => (
                        <div
                          key={sup.id}
                          className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 space-y-3 text-xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 space-y-1">
                              <input
                                type="text"
                                value={sup.company}
                                onChange={(e) => {
                                  const next = contacts.suppliers.map((item) =>
                                    item.id === sup.id
                                      ? { ...item, company: e.target.value }
                                      : item
                                  );
                                  setContacts({ ...contacts, suppliers: next });
                                }}
                                placeholder="Supplier / Timber Shop Name"
                                className="w-full bg-transparent text-sm font-black text-white border-b border-transparent focus:border-blue-400 focus:outline-none"
                              />
                              <input
                                type="text"
                                value={sup.name || ''}
                                onChange={(e) => {
                                  const next = contacts.suppliers.map((item) =>
                                    item.id === sup.id
                                      ? { ...item, name: e.target.value }
                                      : item
                                  );
                                  setContacts({ ...contacts, suppliers: next });
                                }}
                                placeholder="Sales Representative Name"
                                className="w-full bg-transparent text-xs text-neutral-400 border-b border-transparent focus:border-blue-400 focus:outline-none"
                              />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => {
                                  updateCurrentProject({
                                    supplierName: sup.company || sup.name,
                                    supplierPhone: `${sup.phone}${
                                      sup.gstin ? ` | GSTIN: ${sup.gstin}` : ''
                                    }`,
                                    supplierAddress: sup.address || '',
                                  });
                                  setActiveTab('purchaseorder');
                                  showNotification(
                                    `Auto-filled supplier "${
                                      sup.company || sup.name
                                    }" in Purchase Order!`
                                  );
                                }}
                                className="bg-amber-400/20 hover:bg-amber-400/30 text-amber-300 border border-amber-400/40 px-2.5 py-1 rounded-lg font-extrabold text-[11px]"
                              >
                                Use in PO
                              </button>
                              <button
                                onClick={() => {
                                  setContacts({
                                    ...contacts,
                                    suppliers: contacts.suppliers.filter(
                                      (item) => item.id !== sup.id
                                    ),
                                  });
                                  showNotification('Supplier removed.');
                                }}
                                className="p-1.5 text-neutral-500 hover:text-red-400"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={sup.phone || ''}
                              onChange={(e) => {
                                const next = contacts.suppliers.map((item) =>
                                  item.id === sup.id
                                    ? { ...item, phone: e.target.value }
                                    : item
                                );
                                setContacts({ ...contacts, suppliers: next });
                              }}
                              placeholder="Contact Number"
                              className="bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-200"
                            />
                            <input
                              type="text"
                              value={sup.gstin || ''}
                              onChange={(e) => {
                                const next = contacts.suppliers.map((item) =>
                                  item.id === sup.id
                                    ? { ...item, gstin: e.target.value }
                                    : item
                                );
                                setContacts({ ...contacts, suppliers: next });
                              }}
                              placeholder="Supplier GSTIN"
                              className="bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-amber-300"
                            />
                          </div>
                          <input
                            type="text"
                            value={sup.categories || ''}
                            onChange={(e) => {
                              const next = contacts.suppliers.map((item) =>
                                item.id === sup.id
                                  ? { ...item, categories: e.target.value }
                                  : item
                              );
                              setContacts({ ...contacts, suppliers: next });
                            }}
                            placeholder="Material Categories (e.g. Plywood, Laminates, Hardware)"
                            className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-blue-300 font-semibold"
                          />
                          <input
                            type="text"
                            value={sup.address || ''}
                            onChange={(e) => {
                              const next = contacts.suppliers.map((item) =>
                                item.id === sup.id
                                  ? { ...item, address: e.target.value }
                                  : item
                              );
                              setContacts({ ...contacts, suppliers: next });
                            }}
                            placeholder="Shop / Warehouse Address"
                            className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-300"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}

          {/* ====================================================================
              TAB 8: PROJECT MANAGEMENT & HISTORY (WITH STATUS FILTERING & CLIENT SELECT)
             ==================================================================== */}
          {activeTab === 'projects' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-white">
                    Saved Projects & History
                  </h3>
                  <p className="text-xs text-neutral-400">
                    Manage, edit, filter by stage, duplicate, or switch between
                    interior projects.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-800 p-1 rounded-xl text-xs">
                    {['ALL', ...PROJECT_STATUS_OPTIONS.map((s) => s.value)].map(
                      (st) => (
                        <button
                          key={st}
                          onClick={() => setProjectStatusFilter(st)}
                          className={`px-2.5 py-1 rounded-lg font-bold transition ${
                            projectStatusFilter === st
                              ? 'bg-amber-400 text-neutral-950'
                              : 'text-neutral-400 hover:text-white'
                          }`}
                        >
                          {st}
                        </button>
                      )
                    )}
                  </div>
                  <button
                    onClick={handleCreateNewProject}
                    className="bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4 stroke-[3]" />
                    <span>New Project</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects
                  .filter(
                    (proj) =>
                      projectStatusFilter === 'ALL' ||
                      (proj.status || 'Draft') === projectStatusFilter
                  )
                  .map((proj) => {
                    const isCurrent = proj.id === currentProjectId;
                    const pStatus = proj.status || 'Draft';
                    const stMeta =
                      PROJECT_STATUS_OPTIONS.find((s) => s.value === pStatus) ||
                      PROJECT_STATUS_OPTIONS[0];
                    return (
                      <div
                        key={proj.id}
                        className={`bg-neutral-900 rounded-2xl p-6 border transition flex flex-col justify-between ${
                          isCurrent
                            ? 'border-amber-400 shadow-lg shadow-amber-500/10'
                            : 'border-neutral-800'
                        }`}
                      >
                        <div>
                          <div className="flex justify-between items-center gap-2 mb-3">
                            <span className="text-[11px] font-bold uppercase px-2.5 py-1 rounded-full bg-neutral-800 text-amber-400">
                              {proj.furnitureType}
                            </span>
                            <select
                              value={pStatus}
                              onChange={(e) =>
                                setProjects(
                                  projects.map((p) =>
                                    p.id === proj.id
                                      ? { ...p, status: e.target.value }
                                      : p
                                  )
                                )
                              }
                              className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border cursor-pointer focus:outline-none ${stMeta.badgeClass}`}
                            >
                              {PROJECT_STATUS_OPTIONS.map((opt) => (
                                <option
                                  key={opt.value}
                                  value={opt.value}
                                  className="bg-neutral-900 text-white"
                                >
                                  {opt.value}
                                </option>
                              ))}
                            </select>
                          </div>
                          <input
                            type="text"
                            value={proj.name}
                            onChange={(e) =>
                              setProjects(
                                projects.map((p) =>
                                  p.id === proj.id
                                    ? { ...p, name: e.target.value }
                                    : p
                                )
                              )
                            }
                            className="text-base font-bold text-white bg-transparent border-b border-transparent hover:border-neutral-700 focus:border-amber-400 focus:outline-none w-full mb-1"
                          />
                          <div className="flex items-center gap-1.5 mb-4">
                            <input
                              type="text"
                              value={proj.client}
                              onChange={(e) =>
                                setProjects(
                                  projects.map((p) =>
                                    p.id === proj.id
                                      ? { ...p, client: e.target.value }
                                      : p
                                  )
                                )
                              }
                              className="text-xs text-neutral-400 bg-transparent border-b border-transparent hover:border-neutral-700 focus:border-amber-400 focus:outline-none flex-1"
                            />
                            {(contacts.clients || []).length > 0 && (
                              <select
                                value=""
                                onChange={(e) => {
                                  const c = contacts.clients.find(
                                    (item) => item.id === e.target.value
                                  );
                                  if (c) {
                                    setProjects(
                                      projects.map((p) =>
                                        p.id === proj.id
                                          ? { ...p, client: c.name }
                                          : p
                                      )
                                    );
                                  }
                                }}
                                title="Pick from Client Address Book"
                                className="bg-neutral-800 border border-neutral-700 rounded px-1.5 py-0.5 text-[10px] text-amber-400 font-bold"
                              >
                                <option value="">Pick Client</option>
                                {contacts.clients.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        </div>

                        <div className="pt-4 border-t border-neutral-800 flex items-center justify-between gap-2">
                          <button
                            onClick={() => {
                              setCurrentProjectId(proj.id);
                              setActiveTab('smartbuy');
                            }}
                            className="flex-1 bg-neutral-800 hover:bg-amber-400 hover:text-neutral-950 text-white font-bold py-2 rounded-xl text-xs transition"
                          >
                            Open Project
                          </button>
                          <button
                            onClick={() => handleDuplicateProject(proj)}
                            title="Duplicate Project"
                            className="p-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl transition"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteProject(proj.id)}
                            title="Delete Project"
                            className="p-2 bg-neutral-800 hover:bg-red-500/20 text-neutral-400 hover:text-red-400 rounded-xl transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* ====================================================================
              TAB 9: WORKSHOP & OPTIMIZER DEFAULTS – FULL SETTINGS UPGRADE
             ==================================================================== */}
          {activeTab === 'settings' &&
            (() => {
              const activeMachineObj =
                draftSettings.machineProfiles?.[draftSettings.activeMachine] ||
                FACTORY_WORKSHOP_DEFAULTS.machineProfiles['Panel Saw'];
              const activeMaterialObj =
                draftSettings.materialProfiles?.[
                  draftSettings.activeMaterialProfile
                ] || FACTORY_WORKSHOP_DEFAULTS.materialProfiles['18mm Plywood'];

              const sampleW = 96;
              const sampleH = 48;
              const usableW = Math.max(
                0,
                sampleW -
                  (Number(draftSettings.trimLeft || 0) +
                    Number(draftSettings.trimRight || 0))
              );
              const usableH = Math.max(
                0,
                sampleH -
                  (Number(draftSettings.trimTop || 0) +
                    Number(draftSettings.trimBottom || 0))
              );

              const handleSaveWorkshopSettings = () => {
                const sanitized = {
                  ...draftSettings,
                  defaultKerf: Math.max(
                    0,
                    Number(draftSettings.defaultKerf) || 0
                  ),
                  trimLeft: Math.max(0, Number(draftSettings.trimLeft) || 0),
                  trimRight: Math.max(0, Number(draftSettings.trimRight) || 0),
                  trimTop: Math.max(0, Number(draftSettings.trimTop) || 0),
                  trimBottom: Math.max(
                    0,
                    Number(draftSettings.trimBottom) || 0
                  ),
                  minOffcutLength: Math.max(
                    1,
                    Number(draftSettings.minOffcutLength) || 6
                  ),
                  minOffcutWidth: Math.max(
                    1,
                    Number(draftSettings.minOffcutWidth) || 6
                  ),
                  minOffcutAreaSqFt: Math.max(
                    0,
                    Number(draftSettings.minOffcutAreaSqFt) || 0
                  ),
                };
                setWorkshopSettings(sanitized);
                setDraftSettings(sanitized);
                localStorage.setItem(
                  'ply_optimizer_workshop_defaults_v1',
                  JSON.stringify(sanitized)
                );
                setUnitDisplay(sanitized.measurementMode || 'mixed');
                setCurrency(sanitized.currencySymbol || '₹');

                // Immediately apply saved defaults to the active project's optimizer rules
                updateCurrentProject({
                  cutSettings: {
                    ...currentProject.cutSettings,
                    kerf: sanitized.defaultKerf,
                    trimLeft: sanitized.trimLeft,
                    trimRight: sanitized.trimRight,
                    trimTop: sanitized.trimTop,
                    trimBottom: sanitized.trimBottom,
                    allowRotation: activeMachineObj.allowRotation,
                    splitDirection: activeMachineObj.splitDirection,
                    minReusableW: sanitized.minOffcutWidth,
                    minReusableH: sanitized.minOffcutLength,
                    minReusableAreaSqFt: sanitized.minOffcutAreaSqFt,
                  },
                });

                if (
                  sanitized.autoSaveReusableOffcuts &&
                  activePlan?.allReusableOffcuts?.length > 0
                ) {
                  handleSaveOffcutsToStock(activePlan.allReusableOffcuts);
                }

                showNotification(
                  'Workshop & Optimizer Defaults saved and applied to calculations!'
                );
              };

              const handleRestoreFactoryDefaults = () => {
                setDraftSettings(FACTORY_WORKSHOP_DEFAULTS);
                setWorkshopSettings(FACTORY_WORKSHOP_DEFAULTS);
                localStorage.setItem(
                  'ply_optimizer_workshop_defaults_v1',
                  JSON.stringify(FACTORY_WORKSHOP_DEFAULTS)
                );
                setUnitDisplay(FACTORY_WORKSHOP_DEFAULTS.measurementMode);
                setCurrency(FACTORY_WORKSHOP_DEFAULTS.currencySymbol);
                updateCurrentProject({
                  cutSettings: {
                    ...currentProject.cutSettings,
                    kerf: FACTORY_WORKSHOP_DEFAULTS.defaultKerf,
                    trim: 0,
                    trimLeft: 0,
                    trimRight: 0,
                    trimTop: 0,
                    trimBottom: 0,
                    allowRotation: true,
                    splitDirection: 'auto',
                    minReusableW: FACTORY_WORKSHOP_DEFAULTS.minOffcutWidth,
                    minReusableH: FACTORY_WORKSHOP_DEFAULTS.minOffcutLength,
                    minReusableAreaSqFt:
                      FACTORY_WORKSHOP_DEFAULTS.minOffcutAreaSqFt,
                  },
                });
                showNotification('Restored Factory Workshop Defaults!');
              };

              return (
                <div className="space-y-6">
                  {/* Page Header & Restore Factory Defaults */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-black text-white">
                        Workshop & Optimizer Defaults
                      </h2>
                      <p className="text-xs text-neutral-400 mt-1">
                        Configure machine profiles, saw blade kerf, 4-side edge
                        trimming, offcut classification, measurement format, and
                        currency.
                      </p>
                    </div>
                    <button
                      onClick={handleRestoreFactoryDefaults}
                      className="bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border border-neutral-700 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 self-start transition"
                    >
                      <RefreshCw className="w-4 h-4 text-amber-400" />
                      <span>Restore Factory Defaults</span>
                    </button>
                  </div>

                  {/* 1. MACHINE PROFILES (Table Saw, Panel Saw, Circular Saw, CNC Router) */}
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-lg space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-400">
                          <Sliders className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-white">
                            Cutting Machine Profile
                          </h3>
                          <p className="text-xs text-neutral-400">
                            Select your active workshop machine to load its
                            dedicated kerf, trim, and split rules.
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-400/15 text-amber-400 border border-amber-400/30">
                        Active: {draftSettings.activeMachine}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {Object.entries(draftSettings.machineProfiles).map(
                        ([mName, mSpec]) => {
                          const isSelected =
                            draftSettings.activeMachine === mName;
                          return (
                            <button
                              key={mName}
                              onClick={() =>
                                setDraftSettings({
                                  ...draftSettings,
                                  activeMachine: mName,
                                  defaultKerf: mSpec.kerf,
                                  trimLeft: mSpec.trimLeft,
                                  trimRight: mSpec.trimRight,
                                  trimTop: mSpec.trimTop,
                                  trimBottom: mSpec.trimBottom,
                                })
                              }
                              className={`text-left p-4 rounded-xl border transition ${
                                isSelected
                                  ? 'bg-neutral-950 border-amber-400 ring-2 ring-amber-400/20'
                                  : 'bg-neutral-950/60 border-neutral-800 hover:border-neutral-700'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-extrabold text-sm text-white">
                                  {mName}
                                </span>
                                {isSelected && (
                                  <CheckCircle2 className="w-4 h-4 text-amber-400" />
                                )}
                              </div>
                              <p className="text-[11px] text-neutral-400 line-clamp-2 mb-2">
                                {mSpec.notes}
                              </p>
                              <div className="flex items-center gap-2 text-[11px] font-bold text-amber-400">
                                <span>Kerf: {mSpec.kerf}"</span>
                                <span>•</span>
                                <span>Trim: {mSpec.trimLeft}"</span>
                              </div>
                            </button>
                          );
                        }
                      )}
                    </div>

                    {/* Active Machine Custom Tuning */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-neutral-800 text-xs">
                      <div>
                        <label className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">
                          {draftSettings.activeMachine} Blade Kerf (in)
                        </label>
                        <input
                          type="number"
                          step="0.005"
                          min="0"
                          value={activeMachineObj.kerf}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value));
                            setDraftSettings({
                              ...draftSettings,
                              defaultKerf: val,
                              machineProfiles: {
                                ...draftSettings.machineProfiles,
                                [draftSettings.activeMachine]: {
                                  ...activeMachineObj,
                                  kerf: val,
                                },
                              },
                            });
                          }}
                          className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-white font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">
                          Default Cutting Split Direction
                        </label>
                        <select
                          value={activeMachineObj.splitDirection}
                          onChange={(e) => {
                            setDraftSettings({
                              ...draftSettings,
                              machineProfiles: {
                                ...draftSettings.machineProfiles,
                                [draftSettings.activeMachine]: {
                                  ...activeMachineObj,
                                  splitDirection: e.target.value,
                                },
                              },
                            });
                          }}
                          className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-white font-bold"
                        >
                          <option value="auto">Smart Guillotine Auto</option>
                          <option value="horizontal">
                            Horizontal Rip First
                          </option>
                          <option value="vertical">
                            Vertical Crosscut First
                          </option>
                        </select>
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2.5 bg-neutral-950 border border-neutral-800 px-3.5 py-2.5 rounded-xl w-full cursor-pointer font-bold text-neutral-200">
                          <input
                            type="checkbox"
                            checked={Boolean(activeMachineObj.allowRotation)}
                            onChange={(e) => {
                              setDraftSettings({
                                ...draftSettings,
                                machineProfiles: {
                                  ...draftSettings.machineProfiles,
                                  [draftSettings.activeMachine]: {
                                    ...activeMachineObj,
                                    allowRotation: e.target.checked,
                                  },
                                },
                              });
                            }}
                            className="accent-amber-400 rounded"
                          />
                          <span>Allow 90° Panel Rotation on Machine</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* 2. SAW BLADE KERF SETTINGS (Presets + Decimal + Material-wise) */}
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-lg space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-400">
                        <Scissors className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-white">
                          Default Saw Blade Kerf
                        </h3>
                        <p className="text-xs text-neutral-400">
                          Material loss consumed per saw pass (applied
                          automatically in guillotine packing).
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div>
                        <label className="font-bold text-neutral-400 uppercase block mb-1.5">
                          Kerf in Inches (Default: 0.125" for 1/8" circular saw
                          blade)
                        </label>
                        <input
                          type="number"
                          step="0.005"
                          min="0"
                          value={draftSettings.defaultKerf}
                          onChange={(e) =>
                            setDraftSettings({
                              ...draftSettings,
                              defaultKerf: Math.max(0, Number(e.target.value)),
                            })
                          }
                          className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-2.5 text-sm text-white font-extrabold focus:border-amber-400 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="font-bold text-neutral-400 uppercase block mb-1.5">
                          Equivalent in Millimeters
                        </label>
                        <div className="w-full bg-neutral-950/70 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-amber-400 font-bold">
                          {(
                            Math.round(
                              (Number(draftSettings.defaultKerf) || 0) *
                                25.4 *
                                1000
                            ) / 1000
                          ).toFixed(3)}{' '}
                          mm
                        </div>
                      </div>
                    </div>

                    {/* Kerf Quick Presets */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-xs font-bold text-neutral-400 mr-1">
                        Kerf Quick Presets:
                      </span>
                      {[0.08, 0.1, 0.12, 0.125, 0.15, 0.2, 0.25].map(
                        (preset) => {
                          const active =
                            Math.abs(
                              Number(draftSettings.defaultKerf) - preset
                            ) < 0.0001;
                          return (
                            <button
                              key={preset}
                              onClick={() =>
                                setDraftSettings({
                                  ...draftSettings,
                                  defaultKerf: preset,
                                })
                              }
                              className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold border transition ${
                                active
                                  ? 'bg-amber-400 text-neutral-950 border-amber-300 shadow'
                                  : 'bg-neutral-950 text-neutral-300 border-neutral-800 hover:border-neutral-700'
                              }`}
                            >
                              {preset}"
                            </button>
                          );
                        }
                      )}
                    </div>

                    {/* Material-Wise Kerf & Trim Profile Selector */}
                    <div className="pt-4 border-t border-neutral-800 grid grid-cols-1 md:grid-cols-3 gap-4 items-end text-xs">
                      <div>
                        <label className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">
                          Material-Wise Preset
                        </label>
                        <select
                          value={draftSettings.activeMaterialProfile}
                          onChange={(e) => {
                            const matKey = e.target.value;
                            const mp = draftSettings.materialProfiles[matKey];
                            setDraftSettings({
                              ...draftSettings,
                              activeMaterialProfile: matKey,
                              defaultKerf: mp.kerf,
                              trimLeft: mp.trimLeft,
                              trimRight: mp.trimRight,
                              trimTop: mp.trimTop,
                              trimBottom: mp.trimBottom,
                              minOffcutLength: mp.minOffcutL,
                              minOffcutWidth: mp.minOffcutW,
                              minOffcutAreaSqFt: mp.minOffcutAreaSqFt,
                            });
                          }}
                          className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-white font-bold"
                        >
                          {Object.keys(draftSettings.materialProfiles).map(
                            (m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            )
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">
                          {draftSettings.activeMaterialProfile} Kerf (in)
                        </label>
                        <input
                          type="number"
                          step="0.005"
                          value={activeMaterialObj.kerf}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value));
                            setDraftSettings({
                              ...draftSettings,
                              defaultKerf: val,
                              materialProfiles: {
                                ...draftSettings.materialProfiles,
                                [draftSettings.activeMaterialProfile]: {
                                  ...activeMaterialObj,
                                  kerf: val,
                                },
                              },
                            });
                          }}
                          className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-white font-bold"
                        />
                      </div>
                      <div className="text-[11px] text-neutral-400 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2">
                        Selecting a material profile loads its recommended kerf,
                        edge trim & minimum reusable offcut rules.
                      </div>
                    </div>
                  </div>

                  {/* 3. DEFAULT EDGE TRIM ALLOWANCE (Left, Right, Top, Bottom + Usable Sheet Preview) */}
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-lg space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
                          <Layers className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-white">
                            Default Edge Trim Allowance
                          </h3>
                          <p className="text-xs text-neutral-400">
                            Pre-trim allowance to square rough board edges on
                            all 4 sides.
                          </p>
                        </div>
                      </div>
                      <div className="bg-neutral-950 border border-neutral-800 px-3.5 py-2 rounded-xl text-xs">
                        <span className="text-neutral-400">
                          Usable 8'×4' Sheet After Trim:{' '}
                        </span>
                        <strong className="text-emerald-400">
                          {formatMeasurement(usableW, unitDisplay)} ×{' '}
                          {formatMeasurement(usableH, unitDisplay)}
                        </strong>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                      {[
                        { key: 'trimLeft', label: 'Left Trim (in)' },
                        { key: 'trimRight', label: 'Right Trim (in)' },
                        { key: 'trimTop', label: 'Top Trim (in)' },
                        { key: 'trimBottom', label: 'Bottom Trim (in)' },
                      ].map((side) => (
                        <div key={side.key}>
                          <label className="font-bold text-neutral-400 uppercase block mb-1.5">
                            {side.label}
                          </label>
                          <input
                            type="number"
                            step="0.0625"
                            min="0"
                            value={draftSettings[side.key]}
                            onChange={(e) => {
                              const val = Math.max(0, Number(e.target.value));
                              setDraftSettings({
                                ...draftSettings,
                                [side.key]: val,
                                materialProfiles: {
                                  ...draftSettings.materialProfiles,
                                  [draftSettings.activeMaterialProfile]: {
                                    ...activeMaterialObj,
                                    [side.key]: val,
                                  },
                                },
                              });
                            }}
                            className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-2.5 text-sm text-white font-bold focus:border-amber-400 focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 4. OFFCUT CLASSIFICATION, MEASUREMENT FORMAT & PURCHASE CURRENCY */}
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-lg space-y-5">
                    <div>
                      <h3 className="text-base font-bold text-white">
                        Offcut Classification, Units & Currency
                      </h3>
                      <p className="text-xs text-neutral-400">
                        Define when leftover pieces qualify as reusable stock
                        instead of non-reusable scrap.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                      <div>
                        <label className="font-bold text-neutral-400 uppercase block mb-1.5">
                          Min Offcut Length (in)
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={draftSettings.minOffcutLength}
                          onChange={(e) =>
                            setDraftSettings({
                              ...draftSettings,
                              minOffcutLength: Math.max(
                                1,
                                Number(e.target.value)
                              ),
                            })
                          }
                          className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-2.5 text-sm text-white font-bold"
                        />
                      </div>
                      <div>
                        <label className="font-bold text-neutral-400 uppercase block mb-1.5">
                          Min Offcut Width (in)
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={draftSettings.minOffcutWidth}
                          onChange={(e) =>
                            setDraftSettings({
                              ...draftSettings,
                              minOffcutWidth: Math.max(
                                1,
                                Number(e.target.value)
                              ),
                            })
                          }
                          className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-2.5 text-sm text-white font-bold"
                        />
                      </div>
                      <div>
                        <label className="font-bold text-neutral-400 uppercase block mb-1.5">
                          Min Offcut Area (sq.ft)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={draftSettings.minOffcutAreaSqFt}
                          onChange={(e) =>
                            setDraftSettings({
                              ...draftSettings,
                              minOffcutAreaSqFt: Math.max(
                                0,
                                Number(e.target.value)
                              ),
                            })
                          }
                          className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-2.5 text-sm text-blue-400 font-bold"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-neutral-800 text-xs">
                      <div>
                        <label className="font-bold text-neutral-400 uppercase block mb-1.5">
                          Default Measurement Format
                        </label>
                        <select
                          value={draftSettings.measurementMode}
                          onChange={(e) =>
                            setDraftSettings({
                              ...draftSettings,
                              measurementMode: e.target.value,
                            })
                          }
                          className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-2.5 text-sm text-white font-bold"
                        >
                          <option value="mixed">
                            Feet + Inches (e.g. 7' 6")
                          </option>
                          <option value="inches">Inches Only (e.g. 90")</option>
                          <option value="feet">Decimal Feet (e.g. 7.5')</option>
                        </select>
                      </div>
                      <div>
                        <label className="font-bold text-neutral-400 uppercase block mb-1.5">
                          Purchase Currency Symbol
                        </label>
                        <select
                          value={draftSettings.currencySymbol}
                          onChange={(e) =>
                            setDraftSettings({
                              ...draftSettings,
                              currencySymbol: e.target.value,
                            })
                          }
                          className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-2.5 text-sm text-amber-400 font-bold"
                        >
                          <option value="₹">₹ (INR - Indian Rupee)</option>
                          <option value="$">$ (USD - US Dollar)</option>
                          <option value="€">€ (EUR - Euro)</option>
                          <option value="£">£ (GBP - British Pound)</option>
                          <option value="AED">AED (UAE Dirham)</option>
                        </select>
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2.5 bg-neutral-950 border border-neutral-800 px-3.5 py-2.5 rounded-xl w-full cursor-pointer font-bold text-blue-300">
                          <input
                            type="checkbox"
                            checked={Boolean(
                              draftSettings.autoSaveReusableOffcuts
                            )}
                            onChange={(e) =>
                              setDraftSettings({
                                ...draftSettings,
                                autoSaveReusableOffcuts: e.target.checked,
                              })
                            }
                            className="accent-blue-400 rounded"
                          />
                          <span>Auto-Save Reusable Offcuts to Stock</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* 4B. COMPANY BRANDING (LOGO, SIGNATURE, STAMP & BUSINESS DETAILS) */}
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-lg space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-400">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-white">
                          Company Branding & PDF Identity
                        </h3>
                        <p className="text-xs text-neutral-400">
                          Upload your studio logo, digital signature, and
                          official stamp to appear automatically on Quotations &
                          Purchase Orders.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                      <div>
                        <label className="font-bold text-neutral-400 uppercase block mb-1">
                          Company / Studio Name
                        </label>
                        <input
                          type="text"
                          value={draftSettings.branding?.companyName || ''}
                          onChange={(e) =>
                            setDraftSettings({
                              ...draftSettings,
                              branding: {
                                ...(draftSettings.branding || {}),
                                companyName: e.target.value,
                              },
                            })
                          }
                          className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-white font-bold"
                        />
                      </div>
                      <div>
                        <label className="font-bold text-neutral-400 uppercase block mb-1">
                          Tagline / Subtitle
                        </label>
                        <input
                          type="text"
                          value={draftSettings.branding?.tagline || ''}
                          onChange={(e) =>
                            setDraftSettings({
                              ...draftSettings,
                              branding: {
                                ...(draftSettings.branding || {}),
                                tagline: e.target.value,
                              },
                            })
                          }
                          className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-white font-semibold"
                        />
                      </div>
                      <div>
                        <label className="font-bold text-neutral-400 uppercase block mb-1">
                          GSTIN / Tax Reg. No.
                        </label>
                        <input
                          type="text"
                          value={draftSettings.branding?.gstin || ''}
                          onChange={(e) =>
                            setDraftSettings({
                              ...draftSettings,
                              branding: {
                                ...(draftSettings.branding || {}),
                                gstin: e.target.value,
                              },
                            })
                          }
                          placeholder="e.g. 27AABCU9603R1ZM"
                          className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-amber-400 font-bold"
                        />
                      </div>
                      <div>
                        <label className="font-bold text-neutral-400 uppercase block mb-1">
                          Workshop Phone / Contact
                        </label>
                        <input
                          type="text"
                          value={draftSettings.branding?.phone || ''}
                          onChange={(e) =>
                            setDraftSettings({
                              ...draftSettings,
                              branding: {
                                ...(draftSettings.branding || {}),
                                phone: e.target.value,
                              },
                            })
                          }
                          placeholder="+91 98200 00000"
                          className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-white font-bold"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 text-xs">
                      {[
                        { key: 'logoDataUrl', label: 'Company Logo' },
                        { key: 'signatureDataUrl', label: 'Digital Signature' },
                        { key: 'stampDataUrl', label: 'Company Stamp / Seal' },
                      ].map((asset) => {
                        const imgVal =
                          draftSettings.branding?.[asset.key] || '';
                        return (
                          <div
                            key={asset.key}
                            className="bg-neutral-950 border border-neutral-800 rounded-xl p-3.5 flex flex-col justify-between gap-2"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-neutral-300">
                                {asset.label}
                              </span>
                              {imgVal && (
                                <button
                                  onClick={() =>
                                    setDraftSettings({
                                      ...draftSettings,
                                      branding: {
                                        ...(draftSettings.branding || {}),
                                        [asset.key]: '',
                                      },
                                    })
                                  }
                                  className="text-[11px] font-bold text-red-400 hover:underline"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                            {imgVal ? (
                              <img
                                src={imgVal}
                                alt={asset.label}
                                className="h-14 w-auto object-contain bg-white rounded-lg p-1 self-start"
                              />
                            ) : (
                              <div className="h-14 rounded-lg border border-dashed border-neutral-700 flex items-center justify-center text-[11px] text-neutral-500">
                                No image uploaded
                              </div>
                            )}
                            <label className="cursor-pointer bg-neutral-800 hover:bg-neutral-700 text-amber-400 border border-neutral-700 font-bold py-1.5 px-3 rounded-lg text-center">
                              <span>
                                {imgVal ? 'Replace Image' : 'Upload PNG / JPG'}
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const reader = new FileReader();
                                  reader.onload = () => {
                                    setDraftSettings({
                                      ...draftSettings,
                                      branding: {
                                        ...(draftSettings.branding || {}),
                                        [asset.key]: String(
                                          reader.result || ''
                                        ),
                                      },
                                    });
                                  };
                                  reader.readAsDataURL(file);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 5. SAVE SETTINGS FOOTER BAR */}
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
                    <span className="text-xs text-neutral-400">
                      All workshop defaults are validated, stored locally, and
                      applied immediately to the cutting engine.
                    </span>
                    <button
                      onClick={handleSaveWorkshopSettings}
                      className="bg-amber-400 hover:bg-amber-300 text-neutral-950 font-black px-6 py-3 rounded-xl text-xs flex items-center gap-2 shadow-lg self-start sm:self-auto"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>Save Settings</span>
                    </button>
                  </div>
                </div>
              );
            })()}
        </div>
      </main>

      {/* ======================================================================
          MODAL 1: JSON BACKUP RESTORE VALIDATION & MERGE/REPLACE DIALOG
         ====================================================================== */}
      {restorePreview && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-amber-400/40 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 text-xs">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                  Backup Validation
                </span>
                <h3 className="text-lg font-black text-white mt-0.5">
                  Restore Backup File
                </h3>
                <p className="text-neutral-400 mt-0.5">
                  {restorePreview.fileName}
                </p>
              </div>
              <button
                onClick={() => setRestorePreview(null)}
                className="p-1.5 rounded-xl bg-neutral-800 text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-neutral-400">Exported Date:</span>
                <strong className="text-white">
                  {restorePreview.exportedAt}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Projects Found:</span>
                <strong className="text-amber-400">
                  {restorePreview.projectsCount} Project(s)
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Offcut Stock Items:</span>
                <strong className="text-blue-400">
                  {restorePreview.stockCount} Sheet(s)
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Contacts Included:</span>
                <strong className="text-emerald-400">
                  {restorePreview.clientsCount} Clients,{' '}
                  {restorePreview.suppliersCount} Suppliers
                </strong>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => handleExecuteRestore('merge')}
                className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black py-3 px-4 rounded-xl"
              >
                Merge with Existing Data
              </button>
              <button
                onClick={() => handleExecuteRestore('replace')}
                className="bg-amber-400 hover:bg-amber-300 text-neutral-950 font-black py-3 px-4 rounded-xl"
              >
                Replace Existing Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================
          MODAL 3: WORKSHOP CUT-LIST PANEL LABELS & STICKERS
         ====================================================================== */}
      {showLabelsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-xs">
            <div className="p-5 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <Tag className="w-5 h-5 text-emerald-400" />
                  <span>Workshop Cut-List Panel Labels & Stickers</span>
                </h3>
                <p className="text-neutral-400 mt-0.5">
                  Printable workshop labels for every cut board.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 bg-neutral-800 border border-neutral-700 px-3 py-1.5 rounded-xl font-bold text-neutral-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeLabelQr}
                    onChange={(e) => setIncludeLabelQr(e.target.checked)}
                    className="accent-amber-400"
                  />
                  <span>QR Tag</span>
                </label>
                <button
                  onClick={() => setShowLabelsModal(false)}
                  className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-3 py-1.5 rounded-xl font-bold"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(currentProject.panels || []).flatMap((p, pIdx) =>
                Array.from(
                  { length: Math.max(1, Number(p.qty) || 1) },
                  (_, qIdx) => {
                    const eMode = normalizeEdgeMode(p.edgeMode || '4S');
                    return (
                      <div
                        key={`${p.id || pIdx}-${qIdx}`}
                        className="bg-white text-neutral-900 rounded-xl p-3.5 border-2 border-neutral-300 flex justify-between gap-2"
                      >
                        <div className="space-y-0.5">
                          <div className="text-[10px] font-black uppercase text-amber-700">
                            {currentProject.name}
                          </div>
                          <div className="font-black text-sm text-neutral-900">
                            {p.name}
                          </div>
                          <div className="font-extrabold text-xs text-neutral-800">
                            SIZE: {formatMeasurement(p.width, unitDisplay)} ×{' '}
                            {formatMeasurement(p.height, unitDisplay)}
                          </div>
                          <div className="text-[11px] text-neutral-600">
                            MAT: {p.materialType || '18mm Plywood'} • EDGE:{' '}
                            {EDGE_BAND_MODES[eMode]?.short || '4-Side'}
                          </div>
                          <div className="text-[10px] font-bold text-neutral-500">
                            PIECE {qIdx + 1} OF {p.qty}
                          </div>
                        </div>
                        {includeLabelQr && (
                          <div className="w-12 h-12 bg-neutral-100 border border-neutral-300 rounded flex items-center justify-center shrink-0">
                            <QrCode className="w-8 h-8 text-neutral-800" />
                          </div>
                        )}
                      </div>
                    );
                  }
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================
          MODAL 4: CLOUD AUTHENTICATION & CROSS-DEVICE SYNC (PC & ANDROID)
         ====================================================================== */}
      {showCloudModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-amber-400/40 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 text-xs">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                  PC & Android Sync
                </span>
                <h3 className="text-lg font-black text-white mt-0.5">
                  Cloud Account & Backup
                </h3>
                <p className="text-neutral-400 mt-0.5">
                  Sign in with the same email on Windows PC and Android to sync
                  projects, stock & prices.
                </p>
              </div>
              <button
                onClick={() => setShowCloudModal(false)}
                className="p-1.5 rounded-xl bg-neutral-800 text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!cloudUser || cloudUser.isAnonymous ? (
              <form onSubmit={handleEmailAuthSubmit} className="space-y-3">
                <div className="flex gap-2 bg-neutral-950 p-1 rounded-xl border border-neutral-800">
                  <button
                    type="button"
                    onClick={() => setAuthMode('signin')}
                    className={`flex-1 py-1.5 rounded-lg font-extrabold ${
                      authMode === 'signin'
                        ? 'bg-amber-400 text-neutral-950'
                        : 'text-neutral-400'
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMode('signup')}
                    className={`flex-1 py-1.5 rounded-lg font-extrabold ${
                      authMode === 'signup'
                        ? 'bg-amber-400 text-neutral-950'
                        : 'text-neutral-400'
                    }`}
                  >
                    Create Account
                  </button>
                </div>

                {authError && (
                  <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200">
                    {authError}
                  </div>
                )}

                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="Email address"
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-white font-bold"
                />
                <input
                  type="password"
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="Password (min 6 characters)"
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-white font-bold"
                />
                <button
                  type="submit"
                  disabled={authBusy}
                  className="w-full bg-amber-400 hover:bg-amber-300 text-neutral-950 font-black py-2.5 rounded-xl flex items-center justify-center gap-1.5"
                >
                  <LogIn className="w-4 h-4" />
                  <span>
                    {authBusy
                      ? 'Please wait...'
                      : authMode === 'signin'
                      ? 'Sign In & Sync'
                      : 'Create Cloud Account'}
                  </span>
                </button>
              </form>
            ) : (
              <div className="space-y-3">
                <div className="bg-neutral-950 border border-emerald-500/30 rounded-2xl p-3.5 space-y-1">
                  <div className="font-black text-emerald-400">
                    Connected: {cloudUser.email}
                  </div>
                  <div className="text-neutral-400">
                    Status: {cloudSyncStatus}{' '}
                    {lastCloudSyncTime ? `(${lastCloudSyncTime})` : ''}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={() => pushWorkspaceToCloud(true)}
                    className="bg-amber-400 hover:bg-amber-300 text-neutral-950 font-black py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Backup Local → Cloud</span>
                  </button>
                  <button
                    onClick={async () => {
                      if (!db || !cloudUser || !fbModulesRef.current) return;
                      const { doc, getDoc } = fbModulesRef.current.fbStoreMod;
                      const snap = await getDoc(
                        doc(
                          db,
                          'artifacts',
                          appId,
                          'users',
                          cloudUser.uid,
                          'workspace',
                          'mainState'
                        )
                      );
                      if (
                        snap.exists() &&
                        Array.isArray(snap.data().projects)
                      ) {
                        setProjects(snap.data().projects);
                        if (Array.isArray(snap.data().inventoryStock))
                          setInventoryStock(snap.data().inventoryStock);
                        if (snap.data().contacts)
                          setContacts(snap.data().contacts);
                        showNotification(
                          'Restored latest projects from Cloud!'
                        );
                      } else {
                        showNotification(
                          'No cloud backup found yet — click Backup Local → Cloud.'
                        );
                      }
                    }}
                    className="bg-neutral-800 hover:bg-neutral-700 text-emerald-300 border border-emerald-500/40 font-extrabold py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-4 h-4" />
                    <span>Restore Cloud → Device</span>
                  </button>
                </div>

                <button
                  onClick={async () => {
                    if (auth && fbModulesRef.current) {
                      await fbModulesRef.current.fbAuthMod.signOut(auth);
                    }
                    showNotification(
                      'Signed out of Cloud Sync. Local data remains intact.'
                    );
                  }}
                  className="w-full bg-neutral-800 hover:bg-red-500/20 text-neutral-300 hover:text-red-300 font-bold py-2 rounded-xl flex items-center justify-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================================
          MODAL 5: WINDOWS PC & ANDROID PWA INSTALLATION GUIDE
         ====================================================================== */}
      {showPwaGuideModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-amber-400/40 rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-5 text-xs">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                  Progressive Web App (PWA)
                </span>
                <h3 className="text-lg font-black text-white mt-0.5">
                  Install on Windows PC & Android Phone
                </h3>
                <p className="text-neutral-400 mt-0.5">
                  Run PLYOPTIMIZE as a full-screen standalone desktop & mobile
                  app with offline support.
                </p>
              </div>
              <button
                onClick={() => setShowPwaGuideModal(false)}
                className="p-1.5 rounded-xl bg-neutral-800 text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-amber-400 font-black text-sm">
                  <Monitor className="w-4 h-4" />
                  <span>Windows 10 / 11 PC</span>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-neutral-300 leading-relaxed">
                  <li>
                    Open the app URL in <strong>Google Chrome</strong> or{' '}
                    <strong>Microsoft Edge</strong>.
                  </li>
                  <li>
                    Click the <strong>Install App</strong> icon on the right
                    side of the browser address bar.
                  </li>
                  <li>
                    Click <strong>Install</strong> to add PLYOPTIMIZE to your
                    Desktop & Start Menu.
                  </li>
                </ol>
              </div>

              <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-black text-sm">
                  <Smartphone className="w-4 h-4" />
                  <span>Android Phone / Tablet</span>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-neutral-300 leading-relaxed">
                  <li>
                    Open the app URL in <strong>Chrome for Android</strong>.
                  </li>
                  <li>
                    Tap the <strong>⋮ (Three Dots)</strong> menu at the top
                    right.
                  </li>
                  <li>
                    Tap <strong>Install app</strong> or{' '}
                    <strong>Add to Home screen</strong>.
                  </li>
                </ol>
              </div>
            </div>

            <div className="bg-amber-400/10 border border-amber-400/30 rounded-xl p-3 text-amber-200">
              <strong>Tip:</strong> Sign in via <strong>Cloud Login</strong> in
              the top bar on both your PC and Android phone so any project or
              price edit syncs automatically between devices.
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================
          MODAL 2: CSV & EXCEL (.XLSX) IMPORT & EXPORT CENTER
         ====================================================================== */}
      {showSpreadsheetModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-xs">
            <div className="p-5 border-b border-neutral-800 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-blue-400" />
                  <span>CSV & Excel (.xlsx) Import / Export Center</span>
                </h3>
                <p className="text-neutral-400 mt-0.5">
                  Export cut lists, material estimates, hardware & purchase
                  orders, or import panels with column mapping.
                </p>
              </div>
              <button
                onClick={() => setShowSpreadsheetModal(false)}
                className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-3 py-1.5 rounded-xl font-bold"
              >
                Close
              </button>
            </div>

            <div className="px-5 pt-4 flex gap-2 border-b border-neutral-800 pb-3">
              <button
                onClick={() => setSpreadsheetTab('export')}
                className={`px-4 py-2 rounded-xl font-extrabold transition ${
                  spreadsheetTab === 'export'
                    ? 'bg-amber-400 text-neutral-950'
                    : 'bg-neutral-800 text-neutral-300'
                }`}
              >
                Export Reports (CSV & Excel)
              </button>
              <button
                onClick={() => setSpreadsheetTab('import')}
                className={`px-4 py-2 rounded-xl font-extrabold transition ${
                  spreadsheetTab === 'import'
                    ? 'bg-amber-400 text-neutral-950'
                    : 'bg-neutral-800 text-neutral-300'
                }`}
              >
                Import CSV / Excel File
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {spreadsheetTab === 'export' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    {
                      id: 'panels',
                      title: 'Furniture Panel List',
                      desc: 'Panel names, dimensions, quantities & edge banding sides',
                    },
                    {
                      id: 'cutting',
                      title: 'Plywood Cutting List',
                      desc: 'Sheet-by-sheet saw coordinates, rotations & sheet sizes',
                    },
                    {
                      id: 'materials',
                      title: 'Material Estimates',
                      desc: 'Complete board, laminate & unit pricing schedule',
                    },
                    {
                      id: 'hardware',
                      title: 'Hardware Requirements',
                      desc: 'Hinges, channels, handles, locks & total hardware cost',
                    },
                    {
                      id: 'edgebanding',
                      title: 'Edge Banding Report',
                      desc: 'Side-by-side edge selection & running feet totals',
                    },
                    {
                      id: 'purchaseorder',
                      title: 'Supplier Purchase Order',
                      desc: 'Ready-to-order sheet sizes, quantities & subtotals',
                    },
                  ].map((rep) => (
                    <div
                      key={rep.id}
                      className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 flex flex-col justify-between gap-3"
                    >
                      <div>
                        <h4 className="font-extrabold text-sm text-white">
                          {rep.title}
                        </h4>
                        <p className="text-neutral-400 mt-0.5">{rep.desc}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleExportSpreadsheet(rep.id, 'csv')}
                          className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-emerald-400 border border-emerald-500/30 font-bold py-2 rounded-xl"
                        >
                          Download .CSV
                        </button>
                        <button
                          onClick={() =>
                            handleExportSpreadsheet(rep.id, 'xlsx')
                          }
                          className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-blue-400 border border-blue-500/30 font-bold py-2 rounded-xl"
                        >
                          Download .XLSX
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-neutral-950 border border-neutral-800 p-4 rounded-2xl">
                    <div>
                      <label className="font-bold text-neutral-300 block mb-1">
                        1. Select Import Destination
                      </label>
                      <select
                        value={importTargetType}
                        onChange={(e) => setImportTargetType(e.target.value)}
                        className="bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-amber-400 font-bold"
                      >
                        <option value="panels">
                          Furniture Panel Dimensions & Quantities
                        </option>
                        <option value="materials">
                          Material & Hardware Price List
                        </option>
                      </select>
                    </div>
                    <div>
                      <label className="font-bold text-neutral-300 block mb-1">
                        2. Choose CSV or Excel (.xlsx) File
                      </label>
                      <input
                        type="file"
                        accept=".csv,.xlsx,.xls,.xml"
                        onChange={handleSpreadsheetFileUpload}
                        className="text-neutral-300 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:font-bold file:bg-amber-400 file:text-neutral-950 cursor-pointer"
                      />
                    </div>
                  </div>

                  {importValidationErrors.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 space-y-1">
                      <p className="font-bold text-red-300">
                        Validation Errors:
                      </p>
                      {importValidationErrors.map((err, i) => (
                        <p key={i}>• {err}</p>
                      ))}
                    </div>
                  )}

                  {importedHeaders.length > 0 && (
                    <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 space-y-4">
                      <h4 className="font-bold text-white">
                        3. Map Spreadsheet Columns ({importedRows.length} rows
                        detected)
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {[
                          { key: 'name', label: 'Panel / Item Name' },
                          {
                            key: 'width',
                            label:
                              importTargetType === 'panels' ? 'Width' : 'Unit',
                          },
                          {
                            key: 'height',
                            label:
                              importTargetType === 'panels'
                                ? 'Height'
                                : 'Notes',
                          },
                          {
                            key: 'qty',
                            label:
                              importTargetType === 'panels'
                                ? 'Quantity'
                                : 'Unit Price',
                          },
                          { key: 'material', label: 'Material / Category' },
                          { key: 'edgeMode', label: 'Edge Banding' },
                        ].map((field) => (
                          <div key={field.key}>
                            <label className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">
                              {field.label}
                            </label>
                            <select
                              value={columnMap[field.key]}
                              onChange={(e) =>
                                setColumnMap({
                                  ...columnMap,
                                  [field.key]: Number(e.target.value),
                                })
                              }
                              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-white font-bold"
                            >
                              {importedHeaders.map((h, hIdx) => (
                                <option key={hIdx} value={hIdx}>
                                  Col {hIdx + 1}: {h}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={handleConfirmSpreadsheetImport}
                        className="bg-emerald-400 hover:bg-emerald-300 text-neutral-950 font-black px-5 py-2.5 rounded-xl"
                      >
                        Validate & Import Rows
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
