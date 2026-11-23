import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { CommandPaletteProvider, useCommandPalette } from "@/contexts/CommandPaletteContext";
import { CommandPalette } from "./CommandPalette";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), search: vi.fn(), student: vi.fn(), session: vi.fn(), enrollment: vi.fn(), push: vi.fn(), auth: { user: { id: 5 }, effectiveRole: "Tutor", isAdmin: false, isSuperAdmin: false }, locations: ["MSA", "MSB"], noop: () => {} }));
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  const subscribe = (fn: () => void) => { window.addEventListener("popstate", fn); window.addEventListener("search-navigation", fn); return () => { window.removeEventListener("popstate", fn); window.removeEventListener("search-navigation", fn); }; };
  return { useRouter: () => ({ push: mocks.push }),
    usePathname: () => useSyncExternalStore(subscribe, () => location.pathname),
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, () => location.search)) };
});
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "light", setTheme: mocks.noop }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/contexts/RoleContext", () => ({ useRole: () => ({ viewMode: "my-view", setViewMode: mocks.noop }) }));
vi.mock("@/contexts/LocationContext", () => ({ useLocation: () => ({ selectedLocation: "MSA", setSelectedLocation: mocks.noop, locations: mocks.locations }) }));
vi.mock("@/contexts/ToastContext", () => ({ useToast: () => ({ showToast: mocks.noop }) }));
vi.mock("@/lib/hooks/useSummerPreGradeWindow", () => ({ useSummerPreGradeWindow: () => false }));
vi.mock("@/lib/useHaptic", () => ({ useHaptic: () => ({ trigger: mocks.noop }) }));
vi.mock("@/lib/api", () => ({ fetchAPI: mocks.fetch, api: { stats: { search: mocks.search } }, studentsAPI: { getById: mocks.student }, sessionsAPI: { getById: mocks.session }, enrollmentsAPI: { getById: mocks.enrollment } }));
vi.mock("framer-motion", async importOriginal => ({ ...await importOriginal<object>(), useReducedMotion: () => true }));
vi.mock("@/components/sessions/SessionDetailPopover", () => ({ SessionDetailPopover: ({ session, onClose }: { session: { id: number }; onClose: () => void }) => <div role="dialog" aria-label="Session details"><span>Session {session.id}</span><button onClick={onClose}>Close session details</button></div> }));
vi.mock("@/components/enrollments/EnrollmentDetailPopover", () => ({ EnrollmentDetailPopover: ({ enrollment, onClose }: { enrollment: { id: number }; onClose: () => void }) => <div role="dialog" aria-label="Enrolment details"><span>Enrolment {enrollment.id}</span><button onClick={onClose}>Close enrolment details</button></div> }));
vi.mock("@/components/ui/action-buttons", () => ({ SessionActionButtons: ({ session, onAction }: { session: { id: number }; onAction: () => void }) => <button onClick={onAction}>Actions for session {session.id}</button> }));
function Trigger() { const { open } = useCommandPalette(); return <button data-global-search-trigger onClick={event => open(event.currentTarget)}>Open search</button>; }
const response = { students: [1, 2].map(id => ({ id, student_name: `Learner ${id}`, school_student_id: `MSA-${id}`, school: "School", grade: "F2", phone: null })), sessions: [], enrollments: [], exams: [] };
function mount() { return render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}><CommandPaletteProvider><Trigger /><CommandPalette /></CommandPaletteProvider></SWRConfig>); }
const input = () => screen.getByRole("combobox", { name: "Search commands and pages" });
beforeEach(() => {
  window.history.replaceState({}, "", "/sessions"); localStorage.clear(); mocks.auth.isAdmin = false; mocks.auth.isSuperAdmin = false;
  mocks.session.mockReset().mockResolvedValue({ id: 71, student_name: "Search Learner", session_date: "2026-11-23", exercises: [], session_status: "Scheduled" });
  mocks.enrollment.mockReset().mockResolvedValue({ id: 81, student_name: "Search Learner", payment_status: "Paid" });
  mocks.search.mockReset().mockResolvedValue(response); mocks.student.mockReset().mockImplementation(async (id: number) => ({ id, student_name: `Learner ${id}`, school: "School", grade: "F2" }));
  mocks.push.mockReset().mockImplementation((href: string) => { window.history.pushState({}, "", href); window.dispatchEvent(new Event("search-navigation")); });
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(() => [new DOMRect(0, 0, 100, 44)] as unknown as DOMRectList);
});

afterEach(() => vi.restoreAllMocks());

describe("Global search workspace", () => {
  it("opens with Ctrl+K and sends only the term from a student filter", async () => {
    mount(); fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    await waitFor(() => expect(input()).toHaveFocus()); fireEvent.change(input(), { target: { value: "@learner" } });
    await screen.findByRole("option", { name: /Learner 1/ }); expect(mocks.search).toHaveBeenLastCalledWith("learner", "MSA", undefined, false, { category: "students" });
    fireEvent.keyDown(input(), { key: "k", ctrlKey: true }); await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  it("keeps the query and selection when dismissed and reopened, with staged Escape and focus return", async () => {
    mount(); const trigger = screen.getByText("Open search"); fireEvent.click(trigger);
    await waitFor(() => expect(input()).toHaveFocus()); fireEvent.change(input(), { target: { value: "learner" } });
    await screen.findByRole("option", { name: /Learner 1/ }); fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(input()).toHaveAttribute("aria-activedescendant", "command-result-student-2");
    fireEvent.click(screen.getByRole("button", { name: "Close search" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull()); await waitFor(() => expect(trigger).toHaveFocus());
    fireEvent.click(trigger); expect(input()).toHaveValue("learner"); expect(input()).toHaveAttribute("aria-activedescendant", "command-result-student-2");
    fireEvent.keyDown(input(), { key: "Escape" }); expect(input()).toHaveValue(""); expect(screen.getByRole("dialog")).toBeVisible();
    fireEvent.keyDown(input(), { key: "Escape" }); await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  it("returns from a result to the same query, selected identity and list scroll", async () => {
    mount(); fireEvent.click(screen.getByText("Open search")); fireEvent.change(input(), { target: { value: "learner" } });
    await screen.findByRole("option", { name: /Learner 1/ }); fireEvent.keyDown(input(), { key: "ArrowDown" });
    const list = screen.getByRole("listbox"); list.scrollTop = 123; fireEvent.scroll(list);
    fireEvent.keyDown(input(), { key: "Enter" });
    await waitFor(() => expect(within(screen.getByRole("dialog", { name: "Student details" })).getByRole("button", { name: "Open student profile" })).toBeInTheDocument());
    fireEvent.click(within(screen.getByRole("dialog", { name: "Student details" })).getByRole("button", { name: "Open student profile" })); expect(mocks.push).toHaveBeenCalledWith("/students/2");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    act(() => window.history.back()); await screen.findByRole("dialog");
    expect(input()).toHaveValue("learner"); expect(input()).toHaveAttribute("aria-activedescendant", "command-result-student-2"); expect(screen.getByRole("listbox").scrollTop).toBe(123);
  });
  it("uses the loaded enrollment list for the preview count instead of an unpopulated summary", async () => {
    mocks.student.mockResolvedValue({ id: 1, student_name: "Learner 1", enrollment_count: 0, enrollments: [{ id: 8 }, { id: 9 }] });
    mount(); fireEvent.click(screen.getByText("Open search")); fireEvent.change(input(), { target: { value: "learner" } });
    await screen.findByRole("option", { name: /Learner 1/ });
    await waitFor(() => expect(screen.getByRole("complementary", { name: "Result preview" })).toHaveTextContent("2 enrollments"));
  });
  it("keeps calculator and nested commands available without remote search", async () => {
    mount(); fireEvent.click(screen.getByText("Open search")); fireEvent.change(input(), { target: { value: "= 2 + 3" } });
    expect(screen.getByRole("option", { name: /2 \+ 3 = 5/ })).toBeVisible(); expect(mocks.search).not.toHaveBeenCalled();
    fireEvent.change(input(), { target: { value: "filter/" } }); await screen.findByRole("option", { name: "Scheduled" });
    fireEvent.keyDown(input(), { key: "Escape" }); expect(screen.getByRole("option", { name: /Filter Sessions/ })).toBeVisible();
  });
  it("shows a retry when remote search fails without calling it no results", async () => {
    mocks.search.mockRejectedValueOnce(new Error("Offline")); mount(); fireEvent.click(screen.getByText("Open search")); fireEvent.change(input(), { target: { value: "learner" } });
    await screen.findByRole("button", { name: "Retry" }); expect(screen.queryByText(/No results for/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" })); await screen.findByRole("option", { name: /Learner 1/ });
  });
});

const sessionResult = { id: 71, student_id: 1, student_name: "Search Learner", session_date: "2026-11-23", time_slot: "16:45 - 18:15", school: "Test School", grade: "F2", lang_stream: "E", tutor_name: "Ms Tutor", session_status: "Scheduled" };
const enrollmentResult = { id: 81, student_id: 1, student_name: "Search Learner", assigned_day: "Mon", assigned_time: "16:45 - 18:15", first_lesson_date: "2026-11-01", tutor_name: "Ms Tutor", location: "MSA", payment_status: "Paid", enrollment_type: "Regular" };
describe("Search record functionality", () => {
  it("opens the exact session and returns to the unchanged search", async () => {
    mocks.search.mockResolvedValue({ students: [], sessions: [sessionResult], enrollments: [], exams: [] });
    mount(); fireEvent.click(screen.getByText("Open search")); fireEvent.change(input(), { target: { value: "#learner" } });
    const row = await screen.findByRole("option", { name: /Search Learner/ });
    expect(row).toHaveTextContent("16:45 - 18:15"); expect(row).toHaveTextContent("Test School"); expect(row).toHaveTextContent("F2E");
    fireEvent.keyDown(input(), { key: "Enter" });
    await screen.findByRole("dialog", { name: "Session details" }); expect(mocks.session).toHaveBeenCalledWith(71); expect(mocks.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Close session details"));
    await waitFor(() => expect(input()).toHaveFocus()); expect(input()).toHaveValue("#learner");
    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  });
  it("filters enrolments and opens the chosen enrolment instead of its student profile", async () => {
    mocks.search.mockResolvedValue({ students: response.students, sessions: [sessionResult], enrollments: [enrollmentResult], exams: [] });
    mount(); fireEvent.click(screen.getByText("Open search")); fireEvent.change(input(), { target: { value: "enr:learner" } });
    const row = await screen.findByRole("option", { name: /Search Learner/ });
    expect(within(screen.getByRole("listbox", { name: "Search results" })).getAllByRole("option")).toHaveLength(1); expect(row).toHaveTextContent("Started");
    fireEvent.click(row); await screen.findByRole("dialog", { name: "Enrolment details" });
    expect(mocks.enrollment).toHaveBeenCalledWith(81); expect(mocks.push).not.toHaveBeenCalled();
  });
  it("shows classwork, homework, rating and comment only in the selected preview", async () => {
    mocks.search.mockResolvedValue({ students: [], sessions: [sessionResult], enrollments: [], exams: [] });
    mocks.session.mockResolvedValue({ ...sessionResult, notes: "Revise factorisation", performance_rating: "⭐⭐⭐", exercises: [{ id: 1, exercise_type: "CW", url: "https://example.test/cw", url_title: "Classwork exercise" }, { id: 2, exercise_type: "HW", url: "https://example.test/hw", url_title: "Homework exercise" }] });
    mount(); fireEvent.click(screen.getByText("Open search")); fireEvent.change(input(), { target: { value: "#learner" } });
    const preview = await screen.findByRole("complementary", { name: "Result preview" });
    await waitFor(() => expect(preview).toHaveTextContent("Revise factorisation"));
    expect(preview).toHaveTextContent("Classwork exercise"); expect(preview).toHaveTextContent("Homework exercise"); expect(preview).toHaveTextContent("Rating");
    fireEvent.click(screen.getByText("Open session page")); expect(mocks.push).toHaveBeenCalledWith("/sessions/71");
  });
  it("requests history explicitly and makes truncation visible", async () => {
    mocks.search.mockResolvedValue({ students: [], sessions: [sessionResult], enrollments: [], exams: [], has_more: { sessions: true } });
    mount(); fireEvent.click(screen.getByText("Open search")); fireEvent.change(input(), { target: { value: "#learner" } });
    await screen.findByRole("option", { name: /Search Learner/ }); expect(screen.getByText("More available")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Include history" }));
    await waitFor(() => expect(mocks.search).toHaveBeenLastCalledWith("learner", "MSA", undefined, true, { category: "sessions" }));
    expect(screen.getByRole("button", { name: "Include history" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe('Search console expansion', () => {
  it('shows content match excerpts and loads the next category page', async () => {
    const rows = [71, 72, 73, 74, 75].map(id => ({ ...sessionResult, id, match_context: [{ label: 'HW', text: 'algebra_revision.pdf' }] }));
    mocks.search.mockResolvedValueOnce({ students: [], sessions: rows, enrollments: [], exams: [], has_more: { sessions: true } }).mockResolvedValueOnce({ students: [], sessions: [{ ...sessionResult, id: 76 }], enrollments: [], exams: [], has_more: { sessions: false } });
    mount(); fireEvent.click(screen.getByText('Open search')); fireEvent.change(input(), { target: { value: '#algebra' } });
    const more = await screen.findByRole('option', { name: 'Show more sessions' });
    expect(screen.getAllByText('HW:')).toHaveLength(5); fireEvent.click(more);
    await waitFor(() => expect(mocks.search).toHaveBeenLastCalledWith('algebra', 'MSA', 5, false, { category: 'sessions', offset: 5 }));
    await waitFor(() => expect(screen.queryByRole('option', { name: 'Show more sessions' })).toBeNull());
    expect(within(screen.getByRole('listbox', { name: 'Search results' })).getAllByRole('option')).toHaveLength(6);
  });
  it('supports filter-only searches, keeps the scope visible, and rejects reversed date ranges', async () => {
    mocks.search.mockResolvedValue({ students: [], sessions: [], enrollments: [], exams: [] });
    mount(); fireEvent.click(screen.getByText('Open search'));
    fireEvent.change(screen.getByLabelText('Search scope'), { target: { value: 'my' } });
    await waitFor(() => expect(mocks.search).toHaveBeenLastCalledWith('', 'MSA', undefined, false, { tutor_id: 5 }));
    fireEvent.click(screen.getByRole('button', { name: 'Search filters' }));
    fireEvent.change(screen.getByLabelText('Session dates'), { target: { value: 'custom' } });
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-12-01' } });
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-11-01' } });
    expect(screen.getByRole('alert')).toHaveTextContent('start date must be on or before');
    expect(screen.getByLabelText('Search category')).toHaveValue('sessions');
  });
  it('opens student shortcuts and drills into records with an exact student filter', async () => {
    mount(); fireEvent.click(screen.getByText('Open search')); fireEvent.change(input(), { target: { value: '@learner' } });
    const row = await screen.findByRole('option', { name: /Learner 1/ }); fireEvent.click(row);
    await waitFor(() => expect(within(screen.getByRole('dialog', { name: 'Student details' })).getByRole('button', { name: 'Enrolments' })).toBeInTheDocument());
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Student details' })).getByRole('button', { name: 'Enrolments' }));
    await waitFor(() => expect(mocks.search).toHaveBeenLastCalledWith('', 'MSA', undefined, false, { category: 'enrollments', student_id: 1 }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to search results' }));
    expect(input()).toHaveValue('@learner'); expect(screen.getByLabelText('Search category')).toHaveValue('students');
  });
  it('turns tomorrow into a visible session filter and removes it from the text query', async () => {
    mocks.search.mockResolvedValue({ students: [], sessions: [], enrollments: [], exams: [] });
    mount(); fireEvent.click(screen.getByText('Open search')); fireEvent.change(input(), { target: { value: 'learner tomorrow' } });
    await waitFor(() => expect(mocks.search).toHaveBeenCalled());
    const [term, , , , filters] = mocks.search.mock.calls.at(-1)!;
    expect(term).toBe('learner'); expect(filters.category).toBe('sessions'); expect(filters.from_date).toBe(filters.to_date);
    expect(screen.getByText('Tomorrow')).toBeVisible();
  });
});


it('uses centre scope for exams, which have no tutor ownership', async () => {
  mount(); fireEvent.click(screen.getByText('Open search'));
  fireEvent.change(screen.getByLabelText('Search scope'), { target: { value: 'my' } });
  fireEvent.change(input(), { target: { value: '!exam' } });
  await waitFor(() => expect(mocks.search).toHaveBeenLastCalledWith('exam', 'MSA', undefined, false, { category: 'exams' }));
  expect(screen.getByLabelText('Search scope')).toHaveValue('centre');
});


describe("Material search entry", () => {
  it("keeps materials independent of record search and opens the first preview with Enter", async () => {
    mocks.fetch.mockImplementation(async (path: string) => {
      if (path.endsWith('/sources')) return { sources: [{ id: 'center', label: 'Center' }] };
      if (path.includes('/preview')) return { file_id: 4, chunks: [], truncated: false };
      return { total: 1, page: 1, page_size: 20, facets: { share: {}, folder: {}, ext: {}, modified: {} }, results: [{ file_id: 4, filename: 'Fractions.pdf', share: 'center', rel_path: 'Fractions.pdf', nas_path: '\\\\nas\\Center\\Fractions.pdf', page_count: 2, matched_pages: [], snippet: '', highlights: [], duplicate_count: 0, duplicate_locations: [] }] };
    });
    mount(); fireEvent.click(screen.getByText('Open search'));
    fireEvent.click(screen.getByRole('button', { name: 'Courseware' }));
    const search = screen.getByRole('searchbox', { name: 'Search courseware' });
    fireEvent.change(search, { target: { value: 'fractions' } });
    await screen.findByRole('button', { name: /Fractions.pdf/ });
    expect(mocks.search).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Courseware source'), { target: { value: 'center' } });
    await screen.findByRole('button', { name: /Fractions.pdf/ });
    fireEvent.keyDown(search, { key: 'Enter' }); await screen.findByRole('region', { name: 'Courseware preview' });
    fireEvent.click(screen.getByRole('button', { name: 'Records' }));
    expect(input()).toHaveValue('fractions');
    await waitFor(() => expect(mocks.search).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Courseware' }));
    expect(screen.getByLabelText('Courseware source')).toHaveValue('center');
    await screen.findByRole('button', { name: /Fractions.pdf/ });
  });
});
