// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ColorField } from "../src/ui/ColorField.tsx";

afterEach(cleanup);

function Harness(props: { onChange(c: string): void; onBlur(): void }) {
  const [value, setValue] = useState("#ffffff");
  return (
    <ColorField
      label="Text color"
      value={value}
      onChange={(c) => {
        setValue(c);
        props.onChange(c);
      }}
      onBlur={props.onBlur}
    />
  );
}

const box = () => screen.getByLabelText("Text color") as HTMLInputElement;

describe("ColorField", () => {
  it("applies a typed hex, with or without #, and marks one that isn't valid without applying it", () => {
    const onChange = vi.fn();
    const onBlur = vi.fn();
    render(<Harness onChange={onChange} onBlur={onBlur} />);
    fireEvent.change(box(), { target: { value: "FF8800" } });
    expect(onChange).toHaveBeenLastCalledWith("#ff8800");
    fireEvent.change(box(), { target: { value: "#12" } });
    expect(box().getAttribute("aria-invalid")).toBe("true");
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.blur(box());
    expect(box().value).toBe("#ff8800");
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it("opens the picker from the swatch and ends the edit when it closes", async () => {
    const onBlur = vi.fn();
    render(<Harness onChange={() => {}} onBlur={onBlur} />);
    fireEvent.click(screen.getByRole("button", { name: "Pick text color" }));
    expect(await screen.findByRole("slider", { name: "Hue" })).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(onBlur).toHaveBeenCalledTimes(1);
  });
});
