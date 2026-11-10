import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { useNativePresentation } from "./useNativePresentation";

function Probe() { return <output>{useNativePresentation()}</output>; }
beforeEach(() => { sessionStorage.clear(); window.history.replaceState({ lesson: "retained" }, "", "/sessions/100?lesson=true"); });

describe("default native presentation", () => {
  it("renders the same default on the server and client without a preview flag", () => {
    expect(renderToString(<Probe />)).toContain("motion");
    render(<Probe />);
    expect(screen.getByText("motion")).toBeInTheDocument();
    expect(window.location.search).toBe("?lesson=true");
    expect(window.history.state).toEqual({ lesson: "retained" });
    expect(sessionStorage.length).toBe(0);
  });
  it.each(["original", "motion", "invalid"])("ignores a retired %s preview choice", mode => {
    sessionStorage.setItem("csm.native-preview.v1", mode);
    window.history.replaceState({}, "", `/?ui-preview=${mode}`);
    render(<Probe />);
    expect(screen.getByText("motion")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Design preview" })).not.toBeInTheDocument();
  });
});
