import { ImageResponse } from "next/og";

// The preview shown when a link to voidlog is shared (Discord, Slack, X, ...).
// Drawn in code so it follows the app's palette without a binary asset in the
// repo — static, rendered once at build time.
export const alt = "voidlog – Guild Wars 2 log analysis for training groups";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BACKGROUND = "#0a0912";
const PRIMARY = "#8b2fd1";
const FOREGROUND = "#f2eefa";
const MUTED = "#9c93b0";
const PHASE_COLORS = ["#4fb3d9", "#e8643a", "#a98fdb", "#4caf50", "#8b2fd1", "#3dbfa6"];

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        background: `radial-gradient(circle at 12% 8%, rgba(139,47,209,0.35), ${BACKGROUND} 55%)`,
        color: FOREGROUND,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        <svg width="84" height="84" viewBox="0 0 100 100">
          <polygon points="50,0 100,25 100,75 50,100 0,75 0,25" fill={PRIMARY} />
        </svg>
        <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: 6 }}>VOIDLOG</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1 }}>
          Guild Wars 2 log analysis
        </div>
        <div style={{ fontSize: 36, color: MUTED }}>
          Phases, mechanics and progress for Harvest Temple CM
        </div>
      </div>

      <div style={{ display: "flex", gap: 0, height: 14 }}>
        {PHASE_COLORS.map((color) => (
          <div key={color} style={{ flex: 1, background: color }} />
        ))}
      </div>
    </div>,
    size,
  );
}
