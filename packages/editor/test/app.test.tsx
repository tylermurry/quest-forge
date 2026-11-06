// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/ui/App.tsx";

describe("editor shell", () => {
  it("renders", () => {
    render(<App />);
    expect(screen.getByText("Inspector")).toBeTruthy();
  });
});
