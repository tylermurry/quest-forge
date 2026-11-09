// The Questforge mark: a 16×16 pixel lantern (the demo game is "The Lantern").
const FRAME = "M6 0h4v1H6zM5 1h1v2H5zM10 1h1v2h-1zM4 3h8v2H4zM3 5h1v8H3zM12 5h1v8h-1zM4 5h1v1H4zM11 5h1v1h-1zM4 12h1v1H4zM11 12h1v1h-1zM2 13h12v2H2z";
const GLASS = "M4 6h8v6H4z";
const FLAME = "M7 7h2v1H7zM6 8h4v3H6zM7 11h2v1H7z";

export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
      <path d={GLASS} fill="var(--glass)" />
      <path d={FLAME} fill="var(--accent)" />
      <path d={FRAME} fill="currentColor" />
    </svg>
  );
}
