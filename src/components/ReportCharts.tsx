import { useMemo, type ReactNode, type CSSProperties } from "react";
import { REPORT_THEME } from "../app/theme";

export type DonutSlice = {
  key: string;
  label: string;
  value: number;
  color: string;
};

export function ReportCard({
  title,
  subtitle,
  children,
  right,
  style,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  right?: ReactNode;
  style?: CSSProperties;
}) {
  const baseStyle: CSSProperties = {
    backgroundColor: REPORT_THEME.cardBg,
    border: `1px solid ${REPORT_THEME.borderLight}`,
    borderRadius: 14,
    padding: 18,
    boxShadow: REPORT_THEME.cardShadow,
  };
  return (
    <div
      style={{
        ...baseStyle,
        ...style,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 14, alignItems: "baseline" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: REPORT_THEME.textPrimary, letterSpacing: 0.2 }}>
            {title}
          </div>
          {subtitle ? (
            <div style={{ fontSize: 12, color: REPORT_THEME.textMuted, marginTop: 4, lineHeight: 1.3 }}>{subtitle}</div>
          ) : null}
        </div>
        {right ? <div style={{ flex: "0 0 auto" }}>{right}</div> : null}
      </div>
      {children}
    </div>
  );
}

function withHexAlpha(color: string, alphaHex: string): string {
  const normalizedAlpha = /^[0-9a-fA-F]{2}$/.test(alphaHex) ? alphaHex : "10";
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    const r = color[1];
    const g = color[2];
    const b = color[3];
    return `#${r}${r}${g}${g}${b}${b}${normalizedAlpha}`;
  }
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return `${color}${normalizedAlpha}`;
  if (/^#[0-9a-fA-F]{8}$/.test(color)) return `${color.slice(0, 7)}${normalizedAlpha}`;
  return color;
}

export type BadgeItem = {
  id: string;
  title: string;
  dateLabel: string;
  categoryLabel: string;
  color: string;
  isGoal?: boolean;
};

function BadgeIcon({ color, isGoal }: { color: string; isGoal?: boolean }) {
  const ring = withHexAlpha(color, "1f");
  const stroke = withHexAlpha(color, "45");
  return (
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: ring,
        border: `1px solid ${stroke}`,
        display: "grid",
        placeItems: "center",
        flex: "0 0 auto",
      }}
    >
      {isGoal ? (
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
          <path
            d="M4 8l4 6 4-6 4 6 4-6v8H4V8z"
            fill={color}
          />
          <rect x="4" y="16" width="16" height="4" rx="1" fill={color} />
        </svg>
      ) : (
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="8" fill={color} opacity="0.9" />
          <path
            d="M12 6.2l1.7 3.5 3.9.6-2.8 2.7.7 3.8L12 15.2l-3.5 1.6.7-3.8-2.8-2.7 3.9-.6z"
            fill="#fff"
          />
        </svg>
      )}
    </div>
  );
}

export function BadgePanel({
  title = "Milestone Badges",
  badges,
  emptyState,
}: {
  title?: string;
  badges: BadgeItem[];
  emptyState?: ReactNode;
}) {
  return (
    <ReportCard title={title}>
      {badges.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {badges.map((badge) => (
            <div
              key={badge.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                borderRadius: 14,
                border: `1px solid ${REPORT_THEME.borderLight}`,
                backgroundColor: "white",
                boxShadow: REPORT_THEME.cardShadow,
              }}
            >
              <BadgeIcon color={badge.color} isGoal={badge.isGoal} />
              <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    color: REPORT_THEME.textPrimary,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {badge.title}
                </div>
                <div style={{ fontSize: 12, color: REPORT_THEME.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {badge.categoryLabel} · {badge.dateLabel}
                </div>
              </div>
              {badge.isGoal ? (
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: "#8a5a12",
                    backgroundColor: "#fef3c7",
                    border: "1px solid #fde68a",
                    padding: "3px 8px",
                    borderRadius: 999,
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                  }}
                >
                  Goal
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : emptyState ? (
        emptyState
      ) : (
        <div style={{ fontSize: 12, color: REPORT_THEME.textMuted, fontStyle: "italic" }}>No badges yet</div>
      )}
    </ReportCard>
  );
}

export function DonutChart({
  slices,
  size = 160,
  thickness = 16,
  centerTop,
  centerMain,
  centerBottom,
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centerTop?: string;
  centerMain?: string;
  centerBottom?: string;
}) {
  const normalized = useMemo(() => {
    const cleaned = slices
      .map((s) => ({ ...s, value: Number.isFinite(s.value) ? Math.max(0, s.value) : 0 }))
      .filter((s) => s.value > 0);
    const total = cleaned.reduce((a, b) => a + b.value, 0);
    return { cleaned, total };
  }, [slices]);

  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;

  let acc = 0;

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={REPORT_THEME.borderLight}
            strokeWidth={thickness}
          />
          {normalized.cleaned.map((s) => {
            const len = normalized.total > 0 ? (s.value / normalized.total) * c : 0;
            const dash = `${len} ${Math.max(0, c - len)}`;
            const pct = normalized.total > 0 ? Math.round((s.value / normalized.total) * 100) : 0;
            const el = (
              <circle
                key={s.key}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={dash}
                strokeDashoffset={-acc}
                strokeLinecap="butt"
              >
                <title>
                  {s.label}: {s.value} ({pct}%)
                </title>
              </circle>
            );
            acc += len;
            return el;
          })}
        </g>

        <g>
          {centerTop ? (
            <text
              x="50%"
              y="44%"
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ fontSize: 11, fontWeight: 800, fill: REPORT_THEME.textMuted }}
            >
              {centerTop}
            </text>
          ) : null}
          {centerMain ? (
            <text
              x="50%"
              y="56%"
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ fontSize: 26, fontWeight: 900, fill: REPORT_THEME.textPrimary }}
            >
              {centerMain}
            </text>
          ) : null}
          {centerBottom ? (
            <text
              x="50%"
              y="69%"
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ fontSize: 11, fontWeight: 700, fill: REPORT_THEME.textSecondary }}
            >
              {centerBottom}
            </text>
          ) : null}
        </g>
      </svg>
    </div>
  );
}

export function ReportLegend({
  slices,
  valueFormatter,
  maxItems = 8,
  layout = "spread",
}: {
  slices: DonutSlice[];
  valueFormatter?: (n: number) => string;
  maxItems?: number;
  layout?: "spread" | "inline" | "table";
}) {
  const items = useMemo(() => {
    const cleaned = slices
      .map((s) => ({ ...s, value: Number.isFinite(s.value) ? Math.max(0, s.value) : 0 }))
      .filter((s) => s.value > 0);
    const total = cleaned.reduce((a, b) => a + b.value, 0);
    const sorted = cleaned.slice().sort((a, b) => b.value - a.value);
    return { total, sorted };
  }, [slices]);

  if (items.sorted.length === 0) {
    return <div style={{ fontSize: 12, color: REPORT_THEME.textMuted, fontStyle: "italic" }}>No data</div>;
  }

  const shown = items.sorted.slice(0, maxItems);
  const rest = items.sorted.slice(maxItems);
  const restValue = rest.reduce((a, b) => a + b.value, 0);

  if (layout === "table") {
    const rows: Array<{ key: string; label: string; value: number; color: string }> = [
      ...shown.map((s) => ({ key: s.key, label: s.label, value: s.value, color: s.color })),
      ...(rest.length > 0 ? [{ key: "__other__", label: "Other", value: restValue, color: REPORT_THEME.borderLight }] : []),
    ];

    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "max-content max-content",
          justifyContent: "start",
          columnGap: 92,
          rowGap: 6,
          alignItems: "center",
        }}
      >
        {rows.map((r) => {
          const pct = items.total > 0 ? Math.round((r.value / items.total) * 100) : 0;
          const valueLabel = `${valueFormatter ? valueFormatter(r.value) : String(r.value)} · ${pct}%`;
          return (
            <div key={r.key} style={{ display: "contents" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: r.color, flex: "0 0 auto" }} />
                <div
                  style={{
                    minWidth: 0,
                    maxWidth: "min(320px, 55vw)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: 12,
                    color: REPORT_THEME.textPrimary,
                    fontWeight: 700,
                  }}
                  title={r.label}
                >
                  {r.label}
                </div>
              </div>
              <div style={{ fontSize: 12, color: REPORT_THEME.textSecondary, fontWeight: 700, whiteSpace: "nowrap" }}>
                {valueLabel}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const renderRow = (s: DonutSlice, labelOverride?: string) => {
    const pct = items.total > 0 ? Math.round((s.value / items.total) * 100) : 0;
    const label = labelOverride ?? s.label;
    const valueLabel = `${valueFormatter ? valueFormatter(s.value) : String(s.value)} · ${pct}%`;

    if (layout === "inline") {
      return (
        <div
          key={s.key}
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            padding: "6px 0",
          }}
        >
          <div style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: s.color, flex: "0 0 auto" }} />
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", minWidth: 0 }}>
            <div
              style={{
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: 12,
                color: REPORT_THEME.textPrimary,
                fontWeight: 700,
              }}
              title={label}
            >
              {label}
            </div>
            <div style={{ fontSize: 12, color: REPORT_THEME.textSecondary, fontWeight: 700, whiteSpace: "nowrap" }}>
              {valueLabel}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        key={s.key}
        style={{
          display: "grid",
          gridTemplateColumns: "12px 1fr auto",
          gap: 8,
          alignItems: "center",
          padding: "6px 0",
        }}
      >
        <div style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: s.color }} />
        <div
          style={{
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: 12,
            color: REPORT_THEME.textPrimary,
            fontWeight: 700,
          }}
          title={label}
        >
          {label}
        </div>
        <div style={{ fontSize: 12, color: REPORT_THEME.textSecondary, fontWeight: 700, whiteSpace: "nowrap" }}>
          {valueLabel}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: "grid", gap: 2 }}>
        {shown.map((s) => renderRow(s))}
        {rest.length > 0 ? renderRow({ key: "rest", label: "Other", value: restValue, color: REPORT_THEME.borderLight }, "Other") : null}
      </div>
    </div>
  );
}

export type StackedSegment = {
  key: string;
  label: string;
  value: number;
  color: string;
};

export type StackedDatum = {
  key: string;
  label: string;
  total: number;
  segments: StackedSegment[];
};

export function StackedHistogram({
  data,
  height = 180,
  barWidth = 12,
  gap = 6,
  xLabelEvery = 3,
  formatTotal,
  fill = false,
  minBarWidth = 10,
  minMaxTotal = 0,
}: {
  data: StackedDatum[];
  height?: number;
  barWidth?: number;
  gap?: number;
  xLabelEvery?: number;
  formatTotal?: (n: number) => string;
  fill?: boolean;
  minBarWidth?: number;
  minMaxTotal?: number;
}) {
  const maxTotal = useMemo(() => {
    const max = Math.max(...data.map((d) => (Number.isFinite(d.total) ? d.total : 0)), 0);
    const baseline = Number.isFinite(minMaxTotal) ? Math.max(0, minMaxTotal) : 0;
    return Math.max(1, baseline, max);
  }, [data, minMaxTotal]);

  if (data.length === 0) {
    return <div style={{ fontSize: 12, color: REPORT_THEME.textMuted, fontStyle: "italic" }}>No data</div>;
  }

  return (
    <div style={{ overflowX: "auto", paddingBottom: 6 }}>
      <div
        style={{
          height,
          width: "100%",
          minWidth: "max-content",
          display: "flex",
          alignItems: "stretch",
          gap,
          paddingBottom: 2,
          borderBottom: `1px solid ${REPORT_THEME.borderLight}`,
        }}
      >
        {data.map((d, idx) => {
          const safeTotal = Number.isFinite(d.total) ? Math.max(0, d.total) : 0;
          const pctHeight = Math.max(0, Math.min(100, (safeTotal / maxTotal) * 100));

          const tooltipLines = [
            `${d.key}: ${formatTotal ? formatTotal(safeTotal) : String(safeTotal)}`,
            ...d.segments
              .filter((s) => s.value > 0)
              .slice()
              .sort((a, b) => b.value - a.value)
              .map((s) => `• ${s.label}: ${formatTotal ? formatTotal(s.value) : String(s.value)}`),
          ];

          const showLabel = idx === 0 || idx === data.length - 1 || idx % xLabelEvery === 0;

          return (
            <div
              key={d.key}
              style={
                fill
                  ? {
                      flex: "1 0 0px",
                      minWidth: minBarWidth,
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }
                  : {
                      width: barWidth,
                      flex: `0 0 ${barWidth}px`,
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }
              }
            >
              <div
                title={tooltipLines.join("\n")}
                style={{
                  flex: "1 1 auto",
                  minHeight: 0,
                  display: "flex",
                  alignItems: "flex-end",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: `${pctHeight}%`,
                    minHeight: 2,
                    borderRadius: 6,
                    overflow: "hidden",
                    backgroundColor: REPORT_THEME.borderLight,
                    display: "flex",
                    flexDirection: "column-reverse",
                    boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.02)",
                  }}
                >
                  {safeTotal > 0
                    ? d.segments
                        .filter((s) => Number.isFinite(s.value) && s.value > 0)
                        .map((s) => {
                          const segPct = (s.value / safeTotal) * 100;
                          return (
                            <div
                              key={s.key}
                              style={{
                                height: `${Math.max(0, Math.min(100, segPct))}%`,
                                backgroundColor: s.color,
                              }}
                            />
                          );
                        })
                    : null}
                </div>
              </div>

              <div
                style={{
                  flex: "0 0 14px",
                  height: 14,
                  fontSize: 10,
                  color: REPORT_THEME.textMuted,
                  textAlign: "center",
                  userSelect: "none",
                }}
              >
                {showLabel ? d.label : ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
