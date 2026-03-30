/**
 * PPTX Templates — color palette, fonts, and layout constants
 * for consistent slide generation.
 */

// ---------------------------------------------------------------------------
// Color palette — Midnight Executive theme
// ---------------------------------------------------------------------------

export const COLORS = {
  navy: "1E2761",
  ice: "CADCFC",
  white: "FFFFFF",
  offWhite: "F8FAFC",
  slate900: "0F172A",
  slate700: "334155",
  slate500: "64748B",
  slate300: "CBD5E1",
  slate100: "F1F5F9",
  primary: "3B82F6",
  emerald: "10B981",
  red: "EF4444",
  amber: "F59E0B",
  transparent: "00000000",
} as const;

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

export const FONTS = {
  title: "Calibri",
  body: "Calibri",
  mono: "Consolas",
} as const;

// ---------------------------------------------------------------------------
// Layout constants (in inches, for 16:9 layout)
// ---------------------------------------------------------------------------

export const LAYOUT = {
  slideW: 10,
  slideH: 5.625,
  marginX: 0.5,
  marginY: 0.4,
  contentW: 9,
  titleH: 0.6,
  subtitleH: 0.3,
  footerY: 5.2,
  tableStartY: 1.8,
} as const;

// ---------------------------------------------------------------------------
// Table styling
// ---------------------------------------------------------------------------

export const TABLE_STYLE = {
  headerFill: COLORS.navy,
  headerColor: COLORS.white,
  headerFontSize: 8,
  rowFontSize: 7.5,
  altRowFill: COLORS.slate100,
  borderColor: COLORS.slate300,
  borderWidth: 0.5,
  cellPadding: [0.02, 0.08, 0.02, 0.08] as [number, number, number, number],
} as const;
