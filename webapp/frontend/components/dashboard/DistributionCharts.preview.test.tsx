import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { ActiveStudent } from "@/types";
import { SchoolDistributionChart } from "./SchoolDistributionChart";
import { GradeDistributionChart } from "./GradeDistributionChart";

const mocks = vi.hoisted(() => ({ push: vi.fn(), native: true }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/components/design-preview/useNativePresentation", () => ({ useNativePresentation: () => mocks.native ? "motion" : null }));
vi.mock("@/components/dashboard/CopyDataButton", () => ({ CopyDataButton: () => null }));
vi.mock("@/components/ui/mobile-bottom-sheet", () => ({ MobileBottomSheet: ({ children }: { children: ReactNode }) => <div role="dialog" aria-label="Other schools">{children}</div> }));
vi.mock("recharts", () => {
  const wrap = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return { ResponsiveContainer: wrap, PieChart: ({ children }: { children: ReactNode }) => <svg>{children}</svg>, BarChart: ({ children }: { children: ReactNode }) => <svg>{children}</svg>,
    Pie: ({ children }: { children: ReactNode }) => <g>{children}</g>, Bar: ({ children }: { children: ReactNode }) => <g>{children}</g>, Tooltip: () => null, XAxis: () => null, YAxis: () => null,
    Cell: ({ fill, fillOpacity }: { fill: string; fillOpacity: number }) => <path data-testid="segment" data-color={fill} data-opacity={fillOpacity} />,
    RadialBarChart: ({ data, children }: { data: { name: string; fill: string; fillOpacity: number }[]; children: ReactNode }) => <svg>{data.map(entry => <path key={entry.name} data-testid="radial-segment" data-name={entry.name} data-color={entry.fill} data-opacity={entry.fillOpacity} />)}{children}</svg>,
    RadialBar: () => null,
  };
});

const students = (rows: { school: string; grade?: string; lang_stream?: string; count: number }[]) => rows.flatMap(({ count, ...row }) => Array.from({ length: count }, (_, i) => ({ id: i, grade: "F1", ...row } as ActiveStudent)));
beforeEach(() => { localStorage.clear(); mocks.push.mockReset(); mocks.native = true; });

describe("Motion distribution charts", () => {
  it("highlights a ranked school without navigating, preserves its colour across views, and opens the scoped list explicitly", () => {
    render(<SchoolDistributionChart tutorFilterId={17} students={students([{ school: "Small School", count: 1 }, { school: "A School With A Long Full Name", count: 3 }])} />);
    const legend = screen.getByRole("group", { name: "School legend" });
    const rows = within(legend).getAllByRole("button");
    expect(rows[0]).toHaveAccessibleName("A School With A Long Full Name, 3 students");
    const colour = screen.getAllByTestId("segment")[0].getAttribute("data-color");
    fireEvent.click(rows[0]);
    expect(rows[0]).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("3 students · 75.0%")).toBeInTheDocument();
    expect(screen.getAllByTestId("segment")[1]).toHaveAttribute("data-opacity", "0.24");
    expect(mocks.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Radial" }));
    const radial = screen.getAllByTestId("radial-segment").find(node => node.dataset.name === "A School With A Long Full Name")!;
    expect(radial).toHaveAttribute("data-color", colour);
    expect(radial).toHaveAttribute("data-opacity", "1");
    fireEvent.click(screen.getByRole("button", { name: "View students" }));
    expect(mocks.push).toHaveBeenCalledWith("/students?school=A+School+With+A+Long+Full+Name&tutor_id=17");
    fireEvent.click(rows[0]);
    expect(rows[0]).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: "View students" })).not.toBeInTheDocument();
  });

  it("retains every school in Others and opens an individual school with the tutor filter", () => {
    render(<SchoolDistributionChart tutorFilterId={17} students={students(Array.from({ length: 13 }, (_, i) => ({ school: `School ${i}`, count: 13 - i })))} />);
    const legend = screen.getByRole("group", { name: "School legend" });
    expect(within(legend).getAllByRole("button")).toHaveLength(11);
    fireEvent.click(within(legend).getByRole("button", { name: "Others, 6 students" }));
    fireEvent.click(screen.getByRole("button", { name: "See schools" }));
    const breakdown = screen.getByRole("dialog", { name: "Other schools" });
    expect(within(breakdown).getByText("School 10")).toBeInTheDocument();
    expect(within(breakdown).getByText("School 11")).toBeInTheDocument();
    fireEvent.click(within(breakdown).getByRole("button", { name: /School 12/ }));
    expect(mocks.push).toHaveBeenCalledWith("/students?school=School+12&tutor_id=17");
  });

  it("keeps grade and stream selection aligned with stacked-bar segments and scoped navigation", () => {
    render(<GradeDistributionChart tutorFilterId={17} students={students([{ school: "A", grade: "F2", lang_stream: "C", count: 3 }, { school: "A", grade: "F2", lang_stream: "E", count: 2 }, { school: "B", grade: "F3", lang_stream: "C", count: 1 }])} />);
    fireEvent.click(screen.getByTitle("Split by language stream"));
    const legend = screen.getByRole("group", { name: "Grade legend" });
    fireEvent.click(within(legend).getByRole("button", { name: "F2E, 2 students" }));
    expect(screen.getByText("2 students · 33.3%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bar" }));
    const segments = screen.getAllByTestId("segment");
    expect(segments.map(node => node.dataset.opacity)).toEqual(["0.24", "0.24", "1", "0.24"]);
    fireEvent.click(screen.getByRole("button", { name: "View students" }));
    expect(mocks.push).toHaveBeenCalledWith("/students?grade=F2&lang_stream=E&tutor_id=17");
  });

  it("offers no misleading student filter for unknown grades or an unfilterable stream", () => {
    render(<GradeDistributionChart students={students([{ school: "A", grade: "Unknown", count: 1 }, { school: "B", grade: "F2", lang_stream: "Other", count: 1 }])} />);
    fireEvent.click(screen.getByRole("button", { name: "Unknown, 1 student" }));
    expect(screen.queryByRole("button", { name: "View students" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Split by language stream"));
    fireEvent.click(screen.getByRole("button", { name: "F2?, 1 student" }));
    expect(screen.queryByRole("button", { name: "View students" })).not.toBeInTheDocument();
  });

  it.each(["grade", "school"] as const)("retains the selected %s chart and its data when refresh fails", kind => {
    const Chart = kind === "grade" ? GradeDistributionChart : SchoolDistributionChart;
    const data = students([{ school: "A", grade: "F2", count: 3 }]);
    const retry = vi.fn();
    const view = render(<Chart students={data} onRetry={retry} />);
    const legend = screen.getByRole("group", { name: kind === "grade" ? "Grade legend" : "School legend" });
    const choice = within(legend).getAllByRole("button")[0];
    fireEvent.click(choice);
    view.rerender(<Chart students={data} error="Offline" onRetry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t refresh student distribution");
    expect(choice).toHaveAttribute("aria-pressed", "true");
    expect(legend).toBeInTheDocument();
    expect(screen.getAllByTestId("segment")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("keeps the existing passive legend outside Motion", () => {
    mocks.native = false;
    render(<SchoolDistributionChart students={students([{ school: "A", count: 1 }])} />);
    expect(screen.queryByRole("group", { name: "School legend" })).not.toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
  });
});
