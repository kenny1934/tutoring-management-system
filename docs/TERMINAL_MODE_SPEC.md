# Terminal Mode (Zen Mode) - Feature Specification

> An easter egg terminal-inspired UI mode for power users seeking speed, focus, and minimalist delight.

## Table of Contents

1. [Overview](#overview)
2. [Core Philosophy](#core-philosophy)
3. [Discovery & Activation](#discovery--activation)
4. [Architecture](#architecture)
5. [Visual Design](#visual-design)
6. [Navigation & Routing](#navigation--routing)
7. [Command System](#command-system)
8. [UI Components](#ui-components)
9. [Page Specifications](#page-specifications)
10. [Theming System](#theming-system)
11. [Keyboard Navigation](#keyboard-navigation)
12. [Data & State Management](#data--state-management)
13. [Mobile Support](#mobile-support)
14. [Accessibility](#accessibility)
15. [Performance Requirements](#performance-requirements)
16. [Implementation Phases](#implementation-phases)

---

## Overview

Terminal Mode (internally codenamed "Zen Mode") is an alternative UI for CSM Pro that presents the same functionality through a minimalist, terminal-inspired interface. It is discovered via an easter egg (Konami code) and persists as a user preference once activated.

### Goals

- **Speed**: Minimize latency between thought and action through keyboard-first navigation
- **Focus**: Strip away visual noise to concentrate on data
- **Delight**: Provide the aesthetic joy of a retro/hacker terminal experience

### Non-Goals

- Replacing the GUI (this is a complementary experience)
- Forcing everything to be ASCII text (complex features can remain visual, just minimal)
- Creating a steep learning curve (approachable, not geeky)

---

## Core Philosophy

### Same Data, Different Skin

Terminal Mode exposes the **same data model** as the GUI:
- Students, Sessions, Enrollments remain discrete entities
- Same API endpoints, same data structures
- Only the presentation layer changes

### Minimalism, Not Asceticism

- Complex features (PDF previews, thumbnails) don't need to become pure text
- Existing Lucide icons continue to be used for status indicators
- The goal is **minimal visual design**, not **text-only**

### Approachable Terminal Aesthetic

- Easy command syntax with no steep learning curve
- Helpful error messages with suggestions
- Live autocomplete to aid discovery
- Comprehensive help system

---

## Discovery & Activation

### Konami Code Activation

The easter egg is activated by entering the classic Konami code anywhere in the application:

```
↑ ↑ ↓ ↓ ← → ← → B A
```

**Implementation Details:**
- Global key listener attached to document
- Sequence buffer with 2-second timeout between keys
- Works on any page in the GUI

### Activation Experience

When the code is entered correctly:

1. Screen briefly flashes/dims
2. "Boot sequence" animation plays:
   ```
   Initializing terminal mode...
   Loading preferences... done
   Mounting filesystem... done
   Starting session...

   Welcome to CSM Pro Zen Mode v1.0
   Type 'help' to get started.
   ```
3. Fade transition to terminal interface
4. User redirected to `/zen/dashboard`

### Persistence

- Mode preference stored in `localStorage` (`terminalModeEnabled: true`)
- Once activated, persists across sessions indefinitely
- User remains in terminal mode until explicitly exited

### Direct URL Access Protection

If a user tries to access `/zen/*` routes without prior activation:
- Show a styled "Access Denied" screen
- Display hint: "Looking for something? Some secrets must be discovered..."
- Provide no explicit instructions (preserve easter egg mystery)

### Exiting Terminal Mode

Two methods available:
1. **Command**: Type `exit` or `gui` in the command bar
2. **Konami code**: Enter the sequence again to toggle back

Exit triggers a "boot sequence" animation transitioning to GUI mode.

---

## Architecture

### Separate Route Tree

Terminal mode uses a dedicated route structure under `/zen`:

```
/zen
├── /zen                    # Dashboard (redirect from /zen/)
├── /zen/dashboard          # Dashboard
├── /zen/students           # Students list
├── /zen/students/[id]      # Student detail
├── /zen/sessions           # Sessions log
├── /zen/sessions/[id]      # Session detail
├── /zen/enrollments/[id]   # Enrollment detail
├── /zen/courseware         # Courseware page
├── /zen/revenue            # Revenue page
└── /zen/settings           # Settings
```

### Component Organization

```
components/
├── zen/
│   ├── ZenLayout.tsx           # Main layout wrapper
│   ├── ZenHeader.tsx           # Top navigation bar
│   ├── ZenCommandBar.tsx       # Persistent command input
│   ├── ZenStatusBar.tsx        # Bottom status line
│   ├── ZenTable.tsx            # Data table component
│   ├── ZenTabs.tsx             # Tabbed section navigator
│   ├── ZenModal.tsx            # Minimal floating form
│   ├── ZenCalendar.tsx         # Minimal date picker
│   ├── ZenSpinner.tsx          # ASCII loading spinner
│   ├── ZenSparkline.tsx        # ASCII chart component
│   ├── ZenBootSequence.tsx     # Activation animation
│   ├── hooks/
│   │   ├── useKonamiCode.ts    # Easter egg detector
│   │   ├── useCommandHistory.ts # Command history management
│   │   └── useZenNavigation.ts # j/k navigation
│   └── themes/
│       ├── index.ts            # Theme definitions
│       └── ThemeProvider.tsx   # Theme context
├── zen/pages/
│   ├── ZenDashboard.tsx
│   ├── ZenStudents.tsx
│   ├── ZenStudentDetail.tsx
│   ├── ZenSessions.tsx
│   ├── ZenSessionDetail.tsx
│   ├── ZenCourseware.tsx
│   ├── ZenRevenue.tsx
│   └── ZenSettings.tsx
```

### Shared Infrastructure

- **SWR Cache**: Shared with GUI mode for instant data when switching
- **API Client**: Same `lib/api.ts` functions
- **Context Providers**: Same LocationContext and RoleContext
- **Types**: Same TypeScript interfaces from `types/`

---

## Visual Design

### Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│ CSM PRO │ [Dashboard] [Students] [Sessions] [Courseware]    │  ← Header Bar
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                                                             │
│                     Main Content Area                       │
│                                                             │
│                                                             │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ [HQ] [Admin] │ Session saved successfully          │ 14:32  │  ← Status Bar
├─────────────────────────────────────────────────────────────┤
│ > _                                                         │  ← Command Bar
└─────────────────────────────────────────────────────────────┘
```

### Header Bar

- CSM PRO logo/branding on the left
- Horizontal navigation with keyboard shortcuts shown: `[D]ashboard`, `[S]tudents`, etc.
- Current page highlighted
- Quick access to main sections
- Minimal styling, monospace font

### Status Bar

Displays (left to right):
- Current location filter (e.g., `[HQ]`, `[All Locations]`)
- Current role (`[Admin]` or `[Tutor]`)
- Last action result (success/error messages)
- Current time (optional, updates every minute)

### Command Bar

- Persistent at bottom of screen (vim `:` style)
- Always visible, always accessible
- Prompt character: `> ` or `$ ` (configurable per theme)
- Blinking cursor when focused
- Autocomplete dropdown appears above when typing

### Typography

- Monospace font throughout (bundled with theme selection)
- Default options per theme:
  - JetBrains Mono (modern themes)
  - SF Mono (macOS themes)
  - IBM Plex Mono (classic themes)
  - Fira Code (code-focused themes)
- Font loaded from Google Fonts or self-hosted

### Subtle Glow Effect

- Text has subtle CSS glow/bloom effect (not full CRT scanlines)
- Implemented via `text-shadow` with theme color
- Intensity adjustable per theme
- No scanlines, no flicker, no hardcore CRT simulation

### Table Styles

**Hybrid approach based on context:**

Dense data (sessions log, full student list):
```
┌────────────┬──────────┬────────────┬──────────┐
│ Student    │ Date     │ Status     │ Rating   │
├────────────┼──────────┼────────────┼──────────┤
│ John Doe   │ 2025-01-05│ ✓ Attended │ ★★★★☆   │
│ Jane Smith │ 2025-01-05│ ✗ No-show  │ -        │
└────────────┴──────────┴────────────┴──────────┘
```

Simple lists (search results, compact views):
```
  John Doe        F5    St. Paul's       3 enrollments
  Jane Smith      F4    DGS              1 enrollment
  Bob Johnson     F6    QC               2 enrollments
```

### Status Indicators

Reuse existing Lucide React icons with theme-appropriate colors:
- ✓ Attended (green)
- ✗ No-show (red)
- ↻ Rescheduled (yellow)
- 🏥 Sick leave (blue)
- 🌧 Weather cancelled (gray)

### ASCII Visualizations

For charts (grade distribution, revenue):

Sparkline:
```
Revenue (6mo): ▁▂▃▅▇█ $12,450
```

Bar chart:
```
Grade Distribution
F4  ████████████░░░░░░░░  45%
F5  ██████████████████░░  72%
F6  ██████░░░░░░░░░░░░░░  28%
```

Horizontal bars with percentage labels.

---

## Navigation & Routing

### Route Structure

Same conceptual pages as GUI, prefixed with `/zen`:

| GUI Route | Terminal Route | Description |
|-----------|---------------|-------------|
| `/` | `/zen/dashboard` | Home dashboard |
| `/students` | `/zen/students` | Students list |
| `/students/[id]` | `/zen/students/[id]` | Student detail |
| `/sessions` | `/zen/sessions` | Sessions log |
| `/sessions/[id]` | `/zen/sessions/[id]` | Session detail |
| `/enrollments/[id]` | `/zen/enrollments/[id]` | Enrollment detail |
| `/courseware` | `/zen/courseware` | Courseware analytics |
| `/revenue` | `/zen/revenue` | Revenue reports |
| `/settings` | `/zen/settings` | Settings + theme config |

### Navigation Methods

1. **Header shortcuts**: Press `d` for Dashboard, `s` for Students, etc.
2. **Command bar**: Type `go students` or just `students`
3. **Browser back/forward**: Standard navigation works
4. **Links in content**: Clickable student names, session links, etc.

### Deep Linking

- All routes are bookmarkable
- Sharing `/zen/students/123` works (if recipient has activated terminal mode)
- If not activated, shows access denied screen

---

## Command System

### Command Bar Behavior

- Always visible at bottom of screen
- Focus with `/` key (like vim search) or click
- Escape to cancel/clear
- Enter to execute
- Arrow up/down for command history

### Command Syntax

Simple, approachable syntax (NOT Unix pipes):

```
# Navigation
go students              # Navigate to students page
go sessions              # Navigate to sessions page
dashboard                # Shorthand navigation

# Searching
search john              # Global search for "john"
find student john        # Search students named john

# Filtering (on list pages)
filter grade=F5          # Filter current list
filter school="St Pauls" # Filter by school (quotes for spaces)
clear                    # Clear all filters

# Actions (context-dependent)
view                     # View selected item details
edit                     # Edit selected item
mark attended            # Mark selected session as attended
mark noshow              # Mark as no-show

# Help
help                     # Show all commands
help sessions            # Help for sessions page
?                        # Quick cheat sheet

# Mode
exit                     # Return to GUI mode
gui                      # Alias for exit
theme                    # Open theme selector
set location HQ          # Change location filter
set role admin           # Change view role
```

### Autocomplete

- Live dropdown appears as user types
- Shows matching commands and recent history
- Arrow keys to navigate suggestions
- Tab or Enter to accept
- Suggestions include:
  - Available commands
  - Recent command history
  - Contextual suggestions (e.g., student names when filtering)

### Command History

- Arrow up/down cycles through past commands
- History persisted in `localStorage`
- Last 100 commands stored
- Searchable with `Ctrl+R` (reverse search)

### Error Handling

Helpful messages with suggestions:

```
> studnets
Unknown command 'studnets'. Did you mean 'students'?
Try 'help' for a list of commands.

> filter gradee=F5
Unknown filter 'gradee'. Available filters: grade, school, name, status
```

---

## UI Components

### ZenTable

Hybrid table component:

```tsx
<ZenTable
  data={students}
  columns={[
    { key: 'name', label: 'Student', width: 20 },
    { key: 'grade', label: 'Grade', width: 5 },
    { key: 'school', label: 'School', width: 15 },
  ]}
  bordered={data.length > 10}  // Borders for dense data
  selectable={true}            // j/k navigation, space to select
  onSelect={handleSelect}
/>
```

Features:
- j/k navigation with visible cursor
- Space to toggle selection (for multi-select)
- Enter to view/action on current item
- Visual cursor indicator (inverted colors or `>` prefix)

### ZenTabs

Tabbed sections for detail views:

```tsx
<ZenTabs
  tabs={[
    { key: 'info', label: 'Info', shortcut: '1' },
    { key: 'enrollments', label: 'Enrollments', shortcut: '2' },
    { key: 'sessions', label: 'Sessions', shortcut: '3' },
  ]}
  activeTab={activeTab}
  onChange={setActiveTab}
/>
```

- Press 1/2/3 to switch tabs
- Tab labels show shortcuts: `[1] Info  [2] Enrollments  [3] Sessions`

### ZenModal (Floating Form)

Minimal floating form for data entry:

```tsx
<ZenModal
  title="Edit Session"
  fields={[
    { name: 'status', type: 'select', options: [...] },
    { name: 'notes', type: 'textarea' },
    { name: 'rating', type: 'rating' },
  ]}
  onSubmit={handleSubmit}
  onCancel={handleCancel}
/>
```

Features:
- Centered, minimal styling
- Tab between fields
- Enter to submit (when on last field)
- Escape to cancel
- Keyboard-navigable selects

### ZenCalendar

Minimal date picker popup:

```tsx
<ZenCalendar
  value={selectedDate}
  onChange={setDate}
  onClose={closeCalendar}
/>
```

Features:
- Compact month view
- Arrow keys to navigate days
- Enter to select
- Escape to cancel
- Natural language shortcuts: `t` for today, `y` for yesterday

### ZenSpinner

ASCII loading indicator:

```tsx
<ZenSpinner />  // Renders rotating |/-\
```

Animation sequence: `|` → `/` → `-` → `\` → repeat

### ZenSparkline

Inline ASCII chart:

```tsx
<ZenSparkline data={[10, 25, 40, 35, 60, 80]} />
// Renders: ▁▂▄▃▅█
```

---

## Page Specifications

### Dashboard (`/zen/dashboard`)

```
┌─────────────────────────────────────────────────────────────┐
│ DASHBOARD                                            14:32  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ STATS                                                       │
│ ─────                                                       │
│ Students: 145    Active: 89    Sessions (MTD): 234         │
│ Revenue:  $12,450 ▁▂▃▅▇█                                   │
│                                                             │
│ TODAY'S SESSIONS                                            │
│ ────────────────                                            │
│   14:00  John Doe (F5)        Algebra         → Room A     │
│   15:30  Jane Smith (F4)      Physics         → Room B     │
│   17:00  Bob Johnson (F6)     Chemistry       → Online     │
│                                                             │
│ UPCOMING TESTS                                              │
│ ──────────────                                              │
│   Jan 10  Mock Exam - F5 Students                          │
│   Jan 15  Unit Test - Chemistry F6                         │
│                                                             │
│ GRADE DISTRIBUTION                                          │
│ ──────────────────                                          │
│ F4  ████████████░░░░░░░░  45%                              │
│ F5  ██████████████████░░  72%                              │
│ F6  ██████░░░░░░░░░░░░░░  28%                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Students List (`/zen/students`)

```
┌─────────────────────────────────────────────────────────────┐
│ STUDENTS                              Filter: grade=F5      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ > John Doe           F5    St. Paul's        3 active      │
│   Jane Smith         F5    DGS               2 active      │
│   Bob Johnson        F5    QC                1 active      │
│   Alice Wong         F5    St. Paul's        2 active      │
│   Charlie Lee        F5    Diocesan          1 active      │
│                                                             │
│                                                [1/3 pages]  │
│                                                             │
│ j/k: navigate  Enter: view  /: search  f: filter  n: next  │
└─────────────────────────────────────────────────────────────┘
```

### Student Detail (`/zen/students/[id]`)

```
┌─────────────────────────────────────────────────────────────┐
│ STUDENT: John Doe                                           │
├─────────────────────────────────────────────────────────────┤
│ [1] Info  [2] Enrollments  [3] Sessions                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ▼ BASIC INFO                                                │
│   Grade:    F5                                              │
│   School:   St. Paul's College                              │
│   Phone:    +852 9123 4567                                  │
│   Stream:   Science                                         │
│                                                             │
│ ▶ CONTACT INFO (press Enter to expand)                      │
│                                                             │
│ ▶ NOTES                                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Sessions Log (`/zen/sessions`)

```
┌─────────────────────────────────────────────────────────────┐
│ SESSIONS                        Jan 1 - Jan 7, 2025         │
├─────────────────────────────────────────────────────────────┤
│ ┌──────────┬───────────────┬────────┬──────────┬─────────┐ │
│ │ Date     │ Student       │ Time   │ Status   │ Rating  │ │
│ ├──────────┼───────────────┼────────┼──────────┼─────────┤ │
│ │ Jan 05   │ John Doe      │ 14:00  │ ✓ Done   │ ★★★★☆  │ │
│ │ Jan 05   │ Jane Smith    │ 15:30  │ ✗ NoShow │ -       │ │
│ │ Jan 04   │ Bob Johnson   │ 17:00  │ ✓ Done   │ ★★★★★  │ │
│ │ Jan 04   │ Alice Wong    │ 18:30  │ ↻ Resch  │ -       │ │
│ └──────────┴───────────────┴────────┴──────────┴─────────┘ │
│                                                             │
│ Space: select  m: mark status  e: edit  d: date range      │
└─────────────────────────────────────────────────────────────┘
```

### Courseware (`/zen/courseware`)

```
┌─────────────────────────────────────────────────────────────┐
│ COURSEWARE                                                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ TRENDING THIS MONTH                                         │
│ ───────────────────                                         │
│ 1. Algebra Fundamentals Ch.5      ████████████  45 uses    │
│ 2. Physics Mock Paper 2024        ██████████░░  38 uses    │
│ 3. Chemistry Organic Reactions    ████████░░░░  32 uses    │
│                                                             │
│ BY GRADE                                                    │
│ ────────                                                    │
│ F4: 156 items used    F5: 234 items used    F6: 189 items  │
│                                                             │
│ s: search PDFs  p: preview selected  t: trending           │
└─────────────────────────────────────────────────────────────┘
```

### PDF Search (Hybrid Modal)

When searching for PDFs/courseware:

```
┌─────────────────────────────────────────────────────────────┐
│ SEARCH COURSEWARE                              [Esc: close] │
├─────────────────────────────────────────────────────────────┤
│ > algebra_                                                  │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ [thumb]  Algebra Ch.5 - Quadratics                      ││
│ │          Pages: 1-24  |  Last used: Jan 3               ││
│ ├─────────────────────────────────────────────────────────┤│
│ │ [thumb]  Algebra Ch.6 - Functions                       ││
│ │          Pages: 1-18  |  Last used: Dec 28              ││
│ ├─────────────────────────────────────────────────────────┤│
│ │ [thumb]  Algebra Mock Paper 2024                        ││
│ │          Pages: 1-12  |  Never used                     ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ j/k: navigate  Enter: select  p: preview  Tab: filters     │
└─────────────────────────────────────────────────────────────┘
```

Note: Thumbnails are actual small images (not ASCII), keeping the hybrid approach.

---

## Theming System

### Theme Structure

Each theme defines:

```typescript
interface ZenTheme {
  id: string;
  name: string;
  category: 'classic' | 'modern';
  colors: {
    background: string;      // Main background
    foreground: string;      // Primary text
    dim: string;             // Secondary/muted text
    accent: string;          // Highlighted elements
    cursor: string;          // Cursor/selection color
    success: string;         // Success states
    error: string;           // Error states
    warning: string;         // Warning states
    border: string;          // Table borders, dividers
  };
  glow: {
    enabled: boolean;
    color: string;
    intensity: number;       // 0-1
  };
  font: {
    family: string;
    size: string;
    lineHeight: string;
  };
  prompt: string;            // Command prompt character
}
```

### Bundled Themes

**Classic Terminals (3):**

1. **Phosphor Green**
   - Background: `#0a0a0a`
   - Foreground: `#00ff00`
   - Accent: `#00ff00`
   - Font: IBM Plex Mono
   - Prompt: `>`

2. **Amber Terminal**
   - Background: `#1a1200`
   - Foreground: `#ffb000`
   - Accent: `#ffc800`
   - Font: IBM Plex Mono
   - Prompt: `$`

3. **Classic White**
   - Background: `#000000`
   - Foreground: `#ffffff`
   - Accent: `#00ffff`
   - Font: SF Mono
   - Prompt: `>`

**Modern Dark Themes (4):**

4. **Dracula**
   - Background: `#282a36`
   - Foreground: `#f8f8f2`
   - Accent: `#bd93f9`
   - Font: JetBrains Mono
   - Prompt: `λ`

5. **Nord**
   - Background: `#2e3440`
   - Foreground: `#eceff4`
   - Accent: `#88c0d0`
   - Font: JetBrains Mono
   - Prompt: `>`

6. **Tokyo Night**
   - Background: `#1a1b26`
   - Foreground: `#c0caf5`
   - Accent: `#7aa2f7`
   - Font: JetBrains Mono
   - Prompt: `$`

7. **Gruvbox Dark**
   - Background: `#282828`
   - Foreground: `#ebdbb2`
   - Accent: `#fabd2f`
   - Font: Fira Code
   - Prompt: `>`

### Theme Customization

Users can:
1. Select a preset theme
2. Optionally override individual colors
3. Customizations stored in `localStorage`

Settings UI:
```
THEME SETTINGS
──────────────

Preset: [Dracula ▼]

Custom overrides:
  Background:  #282a36  [Reset]
  Foreground:  #f8f8f2  [Reset]
  Accent:      #ff79c6  [Modified]

Glow: [On ▼]  Intensity: ████░░ 65%

[Save] [Reset All]
```

### Theme Application

- CSS custom properties updated on theme change
- Smooth 200ms transition between themes
- Theme class applied to root: `.zen-theme-dracula`

---

## Keyboard Navigation

### Global Shortcuts

| Key | Action |
|-----|--------|
| `/` | Focus command bar |
| `Esc` | Cancel/close current action |
| `d` | Go to Dashboard |
| `s` | Go to Students |
| `n` | Go to Sessions |
| `c` | Go to Courseware |
| `r` | Go to Revenue |
| `?` | Show keyboard shortcuts help |
| `Ctrl+R` | Reverse search command history |

### List Navigation

| Key | Action |
|-----|--------|
| `j` / `↓` | Move cursor down |
| `k` / `↑` | Move cursor up |
| `Enter` | View/select current item |
| `Space` | Toggle selection (multi-select) |
| `g` `g` | Go to top of list |
| `G` | Go to bottom of list |
| `n` | Next page |
| `p` | Previous page |
| `f` | Open filter |

### Detail View Navigation

| Key | Action |
|-----|--------|
| `1-9` | Switch to tab N |
| `Tab` | Next section |
| `Shift+Tab` | Previous section |
| `e` | Edit current item |
| `Backspace` | Go back to list |

### Command Bar

| Key | Action |
|-----|--------|
| `Enter` | Execute command |
| `Esc` | Clear/unfocus |
| `↑` / `↓` | Navigate history |
| `Tab` | Accept autocomplete |
| `Ctrl+A` | Start of line |
| `Ctrl+E` | End of line |
| `Ctrl+U` | Clear line |

### Multi-Select Mode

| Key | Action |
|-----|--------|
| `Space` | Toggle item selection |
| `a` | Select all (visible) |
| `A` | Deselect all |
| `Enter` | Apply action to selected |

---

## Data & State Management

### Shared SWR Cache

Terminal mode shares the SWR cache with GUI mode:

```typescript
// Same SWR provider wraps both GUI and terminal routes
<SWRConfig value={swrConfig}>
  {children}
</SWRConfig>
```

Benefits:
- Instant data display when switching modes
- No duplicate API calls
- Consistent data across modes

### Terminal-Specific State

Stored in `localStorage`:

```typescript
interface ZenState {
  enabled: boolean;           // Mode activation status
  theme: string;              // Current theme ID
  themeOverrides?: Partial<ZenTheme['colors']>;
  commandHistory: string[];   // Last 100 commands
  preferences: {
    glowEnabled: boolean;
    glowIntensity: number;
  };
}
```

### Context Sharing

LocationContext and RoleContext work identically:
- Location filter applied to all data fetches
- Role determines admin-only feature visibility
- Changed via command bar: `set location HQ`, `set role admin`

---

## Mobile Support

### Responsive Terminal

Terminal mode is responsive and works on mobile devices with adaptations:

### Layout Changes (< 768px)

1. **Header**: Becomes hamburger menu with slide-out navigation
2. **Command bar**: Remains at bottom, input takes full width
3. **Tables**: Horizontal scroll or card layout for narrow screens
4. **Status bar**: Simplified (location + role only, no time)

### Touch Adaptations

1. **Tap to select**: Single tap = select item (replaces j/k)
2. **Long press**: Context menu for actions (replaces keyboard shortcuts)
3. **Swipe gestures**:
   - Swipe left: Delete/archive (where applicable)
   - Swipe right: Mark as done/attended
   - Pull down: Refresh
4. **Floating action button**: Quick access to common actions

### Virtual Keyboard

- Command bar input triggers virtual keyboard
- Autocomplete dropdown appears above keyboard
- "Done" key submits command

### Orientation

- Works in both portrait and landscape
- Landscape preferred for data-heavy views

---

## Accessibility

### Standard A11y Implementation

Terminal mode follows standard accessibility practices:

1. **Semantic HTML**: Proper heading hierarchy, lists, tables
2. **Keyboard navigation**: All features accessible via keyboard
3. **Focus management**: Visible focus indicators, logical tab order
4. **Color contrast**: All themes meet WCAG AA contrast ratios
5. **Alt text**: Images (thumbnails) have appropriate alt text

### Not Included in Initial Release

- ARIA live regions for command output (future enhancement)
- Screen reader optimizations beyond standard semantics
- Voice control integration

---

## Performance Requirements

### Target Metrics

Terminal mode should feel **snappier than GUI**:

| Metric | Target |
|--------|--------|
| First Contentful Paint | < 500ms |
| Time to Interactive | < 1s |
| Route transition | < 200ms |
| Command execution | < 100ms (local) |
| List render (100 items) | < 50ms |

### Optimization Strategies

1. **Minimal bundle**: Terminal components are lightweight
2. **Code splitting**: `/zen/*` routes loaded separately
3. **CSS-only animations**: Glow, transitions use CSS not JS
4. **Virtualization**: Long lists use react-window
5. **Memoization**: Heavy components wrapped in React.memo
6. **Shared cache**: No duplicate data fetching

### Bundle Size Budget

- Terminal mode JS: < 100KB gzipped (excluding shared SWR)
- Terminal mode CSS: < 20KB gzipped
- Theme definitions: < 5KB

---

## Implementation Phases

### Phase 1: Foundation (Core Infrastructure)

- [ ] Konami code detector hook
- [ ] Activation/deactivation flow with boot animation
- [ ] ZenLayout component with header/status/command bars
- [ ] Route protection (access denied screen)
- [ ] localStorage persistence
- [ ] Basic theming (2 themes: Phosphor Green, Dracula)

### Phase 2: Core Pages

- [ ] ZenDashboard with stats and today's sessions
- [ ] ZenStudents list with j/k navigation
- [ ] ZenStudentDetail with tabbed sections
- [ ] ZenSessions list with filtering
- [ ] ZenSessionDetail with edit capabilities

### Phase 3: Command System

- [ ] Command bar with history
- [ ] Live autocomplete
- [ ] Navigation commands (go, search)
- [ ] Filter commands
- [ ] Action commands (mark, edit)
- [ ] Help system (help, ?)

### Phase 4: Additional Pages

- [ ] ZenCourseware with trends
- [ ] ZenRevenue with charts
- [ ] ZenSettings with theme selector
- [ ] PDF search hybrid modal

### Phase 5: Polish

- [ ] All 7 bundled themes
- [ ] Theme customization UI
- [ ] Mobile touch adaptations
- [ ] ASCII charts and sparklines
- [ ] Performance optimization
- [ ] Edge case handling

### Phase 6: Documentation

- [ ] In-app help pages
- [ ] Command cheat sheet
- [ ] Keyboard shortcuts reference
- [ ] Theme creation guide (for custom overrides)

---

## Appendix: Command Reference

### Navigation Commands

| Command | Description |
|---------|-------------|
| `go <page>` | Navigate to page (dashboard, students, sessions, etc.) |
| `back` | Go to previous page |
| `home` | Go to dashboard |

### Search & Filter Commands

| Command | Description |
|---------|-------------|
| `search <query>` | Global search |
| `find <type> <query>` | Search specific type (student, session) |
| `filter <field>=<value>` | Filter current list |
| `clear` | Clear all filters |

### Action Commands

| Command | Description |
|---------|-------------|
| `view` | View selected item |
| `edit` | Edit selected item |
| `mark attended` | Mark session as attended |
| `mark noshow` | Mark session as no-show |
| `mark rescheduled` | Mark session as rescheduled |

### Settings Commands

| Command | Description |
|---------|-------------|
| `theme` | Open theme selector |
| `theme <name>` | Switch to named theme |
| `set location <loc>` | Change location filter |
| `set role <role>` | Change view role (admin/tutor) |

### Mode Commands

| Command | Description |
|---------|-------------|
| `exit` | Return to GUI mode |
| `gui` | Alias for exit |
| `help` | Show all commands |
| `help <topic>` | Show help for topic |
| `?` | Quick cheat sheet |

---

## Appendix: ASCII Art Examples

### Boot Sequence

```
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║      ╭──────╮                                         ║
║     ╱        ╲   ███████╗███╗   ███╗                  ║
║    │          │  ██╔════╝████╗ ████║                  ║
║    │          │  ███████╗██╔████╔██║                  ║
║    │          │  ╚════██║██║╚██╔╝██║                  ║
║     ╲        ╱   ███████║██║ ╚═╝ ██║                  ║
║      ╰──↗───╯    ╚══════╝╚═╝     ╚═╝                  ║
║           ╲                                           ║
║            ╲     ██████╗ ██████╗  ██████╗             ║
║             ↗    ██╔══██╗██╔══██╗██╔═══██╗            ║
║                  ██████╔╝██████╔╝██║   ██║            ║
║                  ██╔═══╝ ██╔══██╗██║   ██║            ║
║                  ██║     ██║  ██║╚██████╔╝            ║
║                  ╚═╝     ╚═╝  ╚═╝ ╚═════╝             ║
║                                                       ║
║            Zen Mode v1.0                              ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝

Initializing...
Loading preferences... done
Mounting data... done
Starting session...

Welcome! Type 'help' to get started.
```

### Alternative Boot Sequence (Compact)

```
╔═════════════════════════════════════════════╗
║                                             ║
║    ██████╗███████╗███╗   ███╗               ║
║   ██╔════╝██╔════╝████╗ ████║               ║
║   ██║     ███████╗██╔████╔██║               ║
║   ██║     ╚════██║██║╚██╔╝██║               ║
║   ╚██████╗███████║██║ ╚═╝ ██║               ║
║    ╚═════╝╚══════╝╚═╝     ╚═╝  PRO          ║
║                            ───              ║
║           Zen Mode v1.0                     ║
║                                             ║
╚═════════════════════════════════════════════╝

Initializing...
Loading preferences... done
Mounting data... done
Starting session...

Welcome! Type 'help' to get started.
```

### Access Denied

```
╭─────────────────────────────────────╮
│                                     │
│   CSM PRO                           │
│   ───────                           │
│                                     │
│   ACCESS DENIED                     │
│                                     │
│   ████████████████████████████████  │
│                                     │
│   Looking for something?            │
│   Some secrets must be discovered.  │
│                                     │
│   ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  │
│                                     │
╰─────────────────────────────────────╯
```

### Minimal Logo (for Status Bar / Header)

```
┌─────────────────────────────────────────────────────────────┐
│  CSM PRO  │ [Dashboard] [Students] [Sessions] [Courseware]  │
└─────────────────────────────────────────────────────────────┘
```

Or with the icon representation:
```
╭─╮
│C│SM PRO
╰↗╯
```

---

*Document Version: 1.0*
*Created: January 2025*
*Status: Ready for Implementation*
