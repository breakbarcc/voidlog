// Building blocks shared by the batch and the project phase progress charts.
// Both draw a step area over equally wide phase columns with plain CSS, so the
// columns of the plot, the label row and the panel below always line up.

export const LINE_COLOR = "#a46be8";
export const AREA_COLOR = "color-mix(in srgb, var(--primary) 32%, transparent)";
export const DASH_COLOR = "var(--muted-strong)";
/** Left gutter shared by the plot and the panels below it so columns line up. */
export const GUTTER = "w-11 shrink-0";

export function percent(reached: number, total: number): number {
  return total > 0 ? Math.round((reached / total) * 100) : 0;
}

// "Purification 2" -> "P2"; other long single-word names are clipped so 12
// columns still fit on a laptop screen (the full name is in the tooltip).
export function shortPhaseName(name: string): string {
  const purification = /^Purification (\d+)$/.exec(name);
  if (purification) return `P${purification[1]}`;
  if (!name.includes(" ") && name.length > 8) return `${name.slice(0, 6)}.`;
  return name;
}

/** Vertical stroke on the left edge of a column, joining it to its left neighbour. */
export function Riser({
  from,
  to,
  color = LINE_COLOR,
  width = 2,
  dashed,
  opacity = 1,
}: Readonly<{
  from: number;
  to: number;
  color?: string;
  width?: number;
  dashed?: boolean;
  opacity?: number;
}>) {
  if (from === to) return null;
  return (
    <div
      className="absolute left-0 -translate-x-1/2"
      style={{
        bottom: `${Math.min(from, to)}%`,
        height: `${Math.abs(from - to)}%`,
        borderLeft: `${width}px ${dashed ? "dashed" : "solid"} ${color}`,
        opacity,
      }}
    />
  );
}

/** The 0 / 50 / 100 % axis labels and gridlines of a plot. */
export function PlotAxis() {
  return (
    <div className={`${GUTTER} relative mt-6 h-[170px]`}>
      {[100, 50, 0].map((v) => (
        <span
          key={v}
          className="text-muted absolute right-2 translate-y-1/2 text-[10px]"
          style={{ bottom: `${v}%` }}
        >
          {v}%
        </span>
      ))}
    </div>
  );
}

export function PlotGrid() {
  return (
    <>
      {[100, 50, 0].map((v) => (
        <div
          key={v}
          className="border-line-soft absolute inset-x-0 border-t"
          style={{ bottom: `${v}%` }}
        />
      ))}
    </>
  );
}

/**
 * One series as a step line (optionally with area fill) over equally wide
 * columns: `values[i]` is the percentage held across column `i`.
 */
export function StepSeries({
  values,
  color,
  width,
  dashed,
  opacity = 1,
  fill,
}: Readonly<{
  values: number[];
  color: string;
  width: number;
  dashed?: boolean;
  opacity?: number;
  fill?: string;
}>) {
  return (
    <div className="pointer-events-none absolute inset-0 flex">
      {values.map((value, i) => {
        const before = values[i - 1];
        return (
          <div key={i} className="relative flex-1">
            {fill ? (
              <div
                className="absolute inset-x-0 bottom-0"
                style={{ height: `${value}%`, background: fill }}
              />
            ) : null}
            <div
              className="absolute inset-x-0"
              style={{
                bottom: `calc(${value}% - ${width / 2}px)`,
                borderTop: `${width}px ${dashed ? "dashed" : "solid"} ${color}`,
                opacity,
              }}
            />
            {before === undefined ? null : (
              <Riser
                from={before}
                to={value}
                color={color}
                width={width}
                dashed={dashed}
                opacity={opacity}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
