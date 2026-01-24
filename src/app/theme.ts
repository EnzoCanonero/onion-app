export const APP_MAIN_COLOR = "#673ab7";

// Modern report page design tokens
export const REPORT_THEME = {
  pageBg: "#fafbfc",
  cardBg: "#ffffff",
  textPrimary: "#1a1a2e",
  textSecondary: "#64748b",
  textMuted: "#94a3b8",
  borderLight: "#e2e8f0",
  cardShadow: "0 1px 3px rgba(0,0,0,0.08)",
};

// Status display mapping (internal values remain GREEN/YELLOW for backwards compatibility)
export const STATUS_DISPLAY = {
  GREEN: { label: "Completed", glyph: "✓" },
  YELLOW: { label: "In Progress", glyph: "◐" },
  NONE: { label: "Not Started", glyph: "○" },
} as const;
