/**
 * A labelled slider with its value written beside it, for the Styling sections. A drag calls `onChange` for each
 * step (the caller merges them into one undo step); leaving it calls `onBlur`.
 */
export function SliderField(props: {
  label: string;
  min: number;
  max: number;
  value: number;
  /** The unit written after the value, such as "px" or "%". */
  unit: string;
  /** Read out instead of the unit, such as "pixels" or "percent". */
  unitName: string;
  disabled?: boolean;
  onChange(value: number): void;
  onBlur(): void;
}) {
  return (
    <label className="flex items-center gap-2 text-[12px]">
      <span className="text-muted-foreground w-20 shrink-0">{props.label}</span>
      <input
        type="range"
        aria-label={props.label}
        aria-valuetext={`${props.value} ${props.unitName}`}
        min={props.min}
        max={props.max}
        step={1}
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(Number(e.target.value))}
        onBlur={props.onBlur}
        className="accent-primary min-w-0 flex-1 disabled:opacity-40"
      />
      <span className="w-12 shrink-0 text-right tabular-nums">
        {props.value} {props.unit}
      </span>
    </label>
  );
}
