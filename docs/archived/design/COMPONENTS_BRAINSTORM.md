# Classroom Skeuomorphism: Extended Component Library

**Purpose**: Comprehensive brainstorm of educational and math-specific components for the CSM Pro design system.

**Date**: 2025-10-19
**Status**: Research & Planning Phase

---

## Design Philosophy

**Balance Principle**: Every component must serve a **clear functional purpose**, not just aesthetic decoration. Math/education themes should feel natural and enhance usability, never overwhelm or appear gimmicky.

**When to Use Paper vs. Glass**:
- 🏗️ **Glass UI** → Structure, navigation, controls (modern, professional)
- 📄 **Paper Components** → Content, data display, user-generated items (familiar, comfortable)

---

## Priority Matrix

### 🔴 **Priority 1: High Impact, Immediate Use**
Components that solve current design problems or fill obvious gaps.

### 🟡 **Priority 2: Enhanced UX**
Nice-to-have components that improve experience but aren't critical.

### 🟢 **Priority 3: Future Polish**
Delightful details and advanced features for later iterations.

---

## A. Math-Specific Materials

### 1. **Graph Paper Panel** 🔴 Priority 1

**Purpose**: Display charts, coordinate planes, data visualizations, graphing exercises

**Use Cases**:
- Session performance charts with real graph paper background
- Coordinate plane problems in exercises
- Data analysis views
- Progress tracking over time

**Visual Elements**:
- Light gray/blue grid lines on cream paper
- Multiple grid sizes: 5mm, 1cm, 0.5-inch
- Optional axis labels (X, Y)
- Grid fades out at edges for depth
- Can overlay pen/pencil marks (SVG paths)

**Implementation**:
```tsx
<GraphPaper
  gridSize="1cm"        // 5mm | 1cm | 0.5in
  showAxes={true}       // Display X/Y axes
  showNumbers={true}    // Grid numbering
  overlay={<RechartsChart />} // Chart component
>
  {/* Content rendered over graph paper */}
</GraphPaper>
```

**CSS Utilities**:
```css
.graph-paper-5mm { background-size: 5mm 5mm; }
.graph-paper-1cm { background-size: 1cm 1cm; }
.graph-axes-xy    { /* SVG overlay for axes */ }
```

**Technical Notes**:
- Use CSS repeating-linear-gradient for grid
- SVG overlay for axes and numbers
- Ensure grid aligns with data points
- Dark mode: reduce grid opacity, invert axis colors

**Complexity**: Medium (CSS patterns + SVG overlays)

---

### 2. **Worksheet Card** 🔴 Priority 1

**Purpose**: Display problem sets, exercises, homework assignments, quizzes

**Use Cases**:
- Exercise lists with numbered problems
- Homework assignments with due dates
- Practice problem sets
- Quiz/test questions

**Visual Elements**:
- White paper (brighter than notebook cream)
- Black text, traditional worksheet formatting
- Numbered problems: ①  ②  ③  or 1. 2. 3.
- Answer blanks: __________ or ( )
- "Name: _____ Date: _____" header
- Optional: Multiple choice bubbles ⓐ ⓑ ⓒ ⓓ
- "Due date" stamp in corner (rubber stamp style)
- Slight noise texture (photocopied feel)

**Implementation**:
```tsx
<WorksheetCard
  title="Algebra Review"
  dueDate="2025-10-25"
  showHeader={true}      // Name/Date fields
  numbering="circle"     // circle | decimal | none
>
  <WorksheetProblem number={1}>
    Solve for x: 2x + 5 = 13
  </WorksheetProblem>
  <WorksheetProblem number={2}>
    Factor: x² + 5x + 6
  </WorksheetProblem>
</WorksheetCard>
```

**Technical Notes**:
- Monospace font for problems/answers
- CSS counter for auto-numbering
- Date stamp uses rotated span with border
- Print-friendly styling

**Complexity**: Low-Medium (mostly text formatting)

---

### 3. **Engineering/Quad Paper** 🟡 Priority 2

**Purpose**: Technical drawings, precise diagrams, engineering problems

**Use Cases**:
- Geometry proofs with precise measurements
- Technical diagrams for physics problems
- Blueprint-style layouts
- Drafting assignments

**Visual Elements**:
- Fine quad ruling (4 squares per inch)
- Light blue or green lines (engineering tradition)
- Optional: Major gridlines every 5th line (thicker)
- Margin borders with measurement scales
- Slightly yellowed/aged paper tone

**Implementation**:
```tsx
<EngineeringPaper
  ruling="quad"          // quad | engineering | isometric
  scale="4per inch"
  showMeasurements={true}
>
  {/* Technical content */}
</EngineeringPaper>
```

**Complexity**: Medium (detailed grid patterns)

---

### 4. **Calculator Display** 🟡 Priority 2

**Purpose**: Show calculations, number displays, step-by-step math work

**Use Cases**:
- Calculation results display
- Retro aesthetic for math operations
- Step counter/timer displays
- Numerical input feedback

**Visual Elements**:
- Retro LCD/LED style (7-segment digits)
- Dark background with bright digits
- Slight screen glare/reflection
- Optional: Solar panel strip at top
- Chunky "CASIO" or generic calculator branding

**Variants**:
- **LCD** (90s style, greenish backlight, pixel segments)
- **LED** (70s/80s style, red digits, black background)
- **Modern** (Clean, white background, system font)

**Implementation**:
```tsx
<CalculatorDisplay
  value="42.857142"
  variant="lcd"         // lcd | led | modern
  size="md"             // sm | md | lg
  showBranding={true}
/>
```

**Technical Notes**:
- Use monospace font or custom 7-segment font
- CSS filter for screen glare effect
- Animation: flicker on value change
- Maybe integrate with actual calculator logic

**Complexity**: Low-Medium (mostly styling)

---

### 5. **Protractor/Ruler Graphics** 🟢 Priority 3

**Purpose**: Decorative/functional geometry tool visualization

**Use Cases**:
- Geometry section indicators
- Angle measurement displays
- Progress bars styled as rulers
- Subtle background decoration

**Visual Elements**:
- Semi-transparent overlays
- Realistic markings and numbers
- Subtle reflection/plastic texture
- Can be interactive (draggable angle measurement)

**Implementation**:
```tsx
<Protractor angle={45} showMeasurement={true} />
<Ruler length="15cm" unit="metric" />
```

**Usage Guidelines**:
- ⚠️ **Use sparingly** - can quickly become kitsch
- Best as subtle background elements
- Functional use (progress bars) > decorative use

**Complexity**: High (SVG graphics, potential interactivity)

---

## B. Formal Educational Documents

### 6. **Report Card** 🔴 Priority 1

**Purpose**: Display grades, progress reports, assessment results

**Use Cases**:
- Student performance summaries
- Grade displays with letter/percentage
- Progress reports over time
- Official assessment results

**Visual Elements**:
- Traditional report card grid layout
- Header: School name, student name, term
- Subjects in rows, grades in columns
- Letter grades with corresponding GPA
- "Teacher Comments" section at bottom
- Official seal/stamp (embossed effect)
- Subtle border or decorative header
- Cream/manila paper color

**Implementation**:
```tsx
<ReportCard
  studentName="John Doe"
  term="Fall 2025"
  gradingScale="letter"  // letter | percentage | gpa
>
  <Subject name="Algebra II" grade="A" gpa={4.0} />
  <Subject name="Geometry" grade="B+" gpa={3.5} />
  <TeacherComment>
    Excellent progress in problem-solving...
  </TeacherComment>
</ReportCard>
```

**Technical Notes**:
- Table-based layout or CSS Grid
- Print-friendly styling
- Subtle box-shadow for official document feel
- Optional: Watermark background

**Complexity**: Medium (table layout, formal styling)

---

### 7. **Certificate/Award** 🟡 Priority 2

**Purpose**: Achievements, milestones, badges, recognition

**Use Cases**:
- Completion certificates (finished course/level)
- Achievement badges (mastered topic, streak milestones)
- Recognition awards (top performer, most improved)
- Gamification rewards

**Visual Elements**:
- Decorative border (filigree, laurels, academic motifs)
- Parchment/cream paper with aged texture
- Fancy serif font for headers
- "This Certifies That" formal language
- Ribbon seal at bottom (red/gold)
- Signature line (cursive font)
- Date stamp
- Optional: Gold foil accent (gradient overlay)

**Implementation**:
```tsx
<Certificate
  title="Certificate of Achievement"
  recipientName="Jane Smith"
  achievement="Mastery of Quadratic Equations"
  date="October 19, 2025"
  signedBy="CSM Pro Math Center"
  variant="gold"         // gold | silver | bronze
  showSeal={true}
/>
```

**Technical Notes**:
- SVG border graphics
- CSS gradients for foil effect
- Print-optimized for physical certificates
- Animation: Entrance with unfurl effect

**Complexity**: High (decorative graphics, animations)

---

### 8. **Official Form** 🟢 Priority 3

**Purpose**: Permission slips, assessment sheets, administrative forms

**Use Cases**:
- Parent permission forms
- Assessment rubric sheets
- Enrollment forms
- Feedback forms

**Visual Elements**:
- Clean white paper
- Form fields with underlines or boxes
- Checkbox groups
- Signature line
- "Office Use Only" sections (gray background)
- Form number in corner
- Carbon copy style (duplicate layer effect)

**Complexity**: Medium (form elements styling)

---

### 9. **Composition Notebook** 🟡 Priority 2

**Purpose**: Alternative to spiral notebook for more formal/extensive content

**Use Cases**:
- Student journals
- Long-form notes
- Course outlines
- Lecture notes

**Visual Elements**:
- Black marbled cover (classic speckled pattern)
- Sewn binding (stitch marks on left)
- Wide-ruled or college-ruled lines
- No spiral holes
- Slightly thicker paper
- Label rectangle on cover ("Subject: ____ Name: ____")

**Implementation**:
```tsx
<CompositionNotebook
  coverLabel="Algebra II - Spring 2025"
  ruling="college"       // wide | college
  pages={50}
>
  {/* Notebook content */}
</CompositionNotebook>
```

**Visual Difference from Spiral**:
- More formal, professional
- Better for continuous reading
- Sewn binding vs. perforated edge
- Use for curriculum content vs. session notes

**Complexity**: Medium (cover pattern, binding detail)

---

## C. Organization Tools

### 10. **Manila Folder/File Tab** 🔴 Priority 1

**Purpose**: Document organization, student portfolios, categorical navigation

**Use Cases**:
- Student profile sections (grades, attendance, notes)
- Document categories (homework, tests, reports)
- File organization UI
- Tabbed navigation alternative to pills

**Visual Elements**:
- Tan/manila color (#e6d5b8)
- Tab protruding from top or side
- Handwritten label on tab (marker or pen)
- Slight texture (cardboard grain)
- Worn edges (darker, slight fray)
- Shadow at base for depth
- Optional: Color-coded tabs (red, blue, green dots)

**Implementation**:
```tsx
<FileFolder tabPosition="top">
  <FolderTab label="Personal Info" color="red" />
  <FolderTab label="Grades" color="blue" />
  <FolderTab label="Attendance" color="green" />

  <FolderContent activeTab={0}>
    {/* Content for Personal Info */}
  </FolderContent>
</FileFolder>
```

**Interaction**:
- Click tab to switch content
- Hover: Tab lifts slightly
- Active tab: Fully visible, others peek out

**Technical Notes**:
- CSS clip-path for tab shape
- z-index layering for stacking
- Framer Motion for smooth tab switching

**Complexity**: Medium (tab shapes, state management)

---

### 11. **Binder with Divider Tabs** 🟡 Priority 2

**Purpose**: Multi-section navigation, course organization

**Use Cases**:
- Course sections (Ch 1, Ch 2, Ch 3)
- Resource categories
- Multi-part documentation
- Progressive disclosure of content

**Visual Elements**:
- Plastic/cardboard divider tabs on right edge
- Colored tabs (rainbow or category-coded)
- 3-ring punch holes on left (if full binder view)
- Tab labels: Ch. 1, Ch. 2, etc.
- Tabs are staggered vertically
- Active tab highlights

**Implementation**:
```tsx
<BinderTabs>
  <BinderTab label="Chapter 1" color="red" />
  <BinderTab label="Chapter 2" color="orange" />
  <BinderTab label="Chapter 3" color="yellow" />
  <BinderContent>{/* ... */}</BinderContent>
</BinderTabs>
```

**Complexity**: Medium (tab positioning, styling)

---

### 12. **Index Cards 3x5** 🟡 Priority 2

**Purpose**: Quick reference lists, homework assignments, bite-sized content

**Use Cases**:
- Homework lists (compact format)
- Quick reference cards
- Definition lists
- Task cards

**Visual Elements**:
- 3:5 aspect ratio (300px × 500px)
- White or cream cardstock
- Optional: Horizontal ruled lines
- Optional: Red/blue header line for title
- Rounded corners (2px radius)
- Subtle yellowing (aged index cards)
- Slight thickness (layered shadow)

**Implementation**:
```tsx
<IndexCard size="3x5" lined={true}>
  <CardTitle>Homework - Oct 19</CardTitle>
  <CardContent>
    • Complete Ex. 1-15
    • Review Ch. 3
    • Quiz Friday
  </CardContent>
</IndexCard>
```

**Complexity**: Low (simple card with specific dimensions)

---

### 13. **Bookmark Ribbon** 🟢 Priority 3

**Purpose**: Mark current position, saved locations, bookmarked items

**Use Cases**:
- Current lesson indicator
- Saved pages in documentation
- Progress markers
- "Read later" flags

**Visual Elements**:
- Fabric ribbon hanging from top
- Satin or grosgrain texture
- Classic colors: red, green, purple, gold
- Slight fold/crease at top where it attaches
- Tapered "V" cut at bottom
- Shadow underneath

**Implementation**:
```tsx
<BookmarkRibbon color="red" position="top-center" />
```

**Usage**: Absolutely positioned overlay element

**Complexity**: Low (CSS shape, gradients)

---

## D. Interactive/Feedback Elements

### 14. **Highlighter Marks** 🔴 Priority 1

**Purpose**: Emphasize text, draw attention, mark important sections

**Use Cases**:
- Highlight key concepts in notes
- Emphasize important dates/info
- Mark errors or corrections
- Attention-grabbing alerts

**Visual Elements**:
- Semi-transparent color overlay
- Slightly wavy/hand-drawn edge (SVG path or filter)
- Classic colors: yellow, pink, green, blue, orange
- Layered behind text (text on top)
- Slight bleed at edges

**Implementation**:
```tsx
<Highlighter color="yellow" wavy={true}>
  This is important text that needs emphasis.
</Highlighter>

// Or utility class
<span className="highlight-yellow">Important</span>
```

**CSS Utility**:
```css
.highlight-yellow {
  background: rgba(255, 255, 0, 0.3);
  box-shadow: 0 0 8px rgba(255, 255, 0, 0.2);
  padding: 2px 4px;
  border-radius: 3px;
}
```

**Complexity**: Low (CSS background, optional SVG)

---

### 15. **Pencil/Pen Annotations** 🟡 Priority 2

**Purpose**: Handwritten-style notes, corrections, personal touches

**Use Cases**:
- Tutor comments on student work
- Quick annotations
- Margin notes
- Circled items, arrows, underlining

**Visual Elements**:
- Handwriting font (cursive or print)
- Slight angle/rotation (-2° to 2°)
- Pencil gray or pen blue/black
- Optional: Sketchy underlines, arrows, circles (SVG)
- Rough, imperfect lines

**Implementation**:
```tsx
<HandwrittenNote
  font="cursive"         // cursive | print
  color="pencil"         // pencil | bluePen | blackPen
  rotation={-1.5}
>
  Great work! Keep it up!
</HandwrittenNote>

<CircleAnnotation>
  <ImportantText />
</CircleAnnotation>

<UnderlineAnnotation wavy={true}>
  This needs review
</UnderlineAnnotation>
```

**Fonts to Consider**:
- Caveat (Google Fonts - cursive)
- Indie Flower (playful handwriting)
- Permanent Marker (bold pen)

**Complexity**: Low-Medium (fonts + SVG overlays)

---

### 16. **Eraser Smudges** 🟢 Priority 3

**Purpose**: Deletion feedback, "removed" indicator, correction marks

**Use Cases**:
- Visualize deleted items (instead of instant removal)
- Correction indicators
- "Oops, mistake" feedback
- Undo/redo visual cues

**Visual Elements**:
- Gray smudge streak
- Slight fading of original content
- Textured (grainy eraser residue)
- Content underneath still faintly visible

**Implementation**:
```tsx
// Wrap removed content
<EraserSmudge>
  <DeletedContent />
</EraserSmudge>
```

**Animation**: Swipe motion, content fades to smudge

**Complexity**: Medium (texture overlay, animation)

---

### 17. **Date/Grade Stamps** 🔴 Priority 1

**Purpose**: Metadata display, timestamping, grading markers

**Use Cases**:
- Assignment due dates
- Submission timestamps
- Grade displays (A+, 95%, etc.)
- Status stamps (APPROVED, COMPLETED, etc.)

**Visual Elements**:
- Rubber stamp style
- Rotated slightly (-5° to 5°)
- Red ink (or custom colors)
- Circular or rectangular border
- Distressed/imperfect edges
- Semi-transparent overlay

**Implementation**:
```tsx
<RubberStamp
  text="DUE: OCT 25"
  type="date"            // date | grade | status
  color="red"
  rotation={-3.5}
/>

<GradeStamp grade="A+" size="lg" />

<StatusStamp status="COMPLETED" color="green" />
```

**Variants**:
- **Date**: "DUE: [date]" or "SUBMITTED: [date]"
- **Grade**: Large letter grade or percentage
- **Status**: APPROVED, LATE, MISSING, COMPLETE, etc.

**Complexity**: Low (text with rotated border)

---

### 18. **Sticker Badges** 🟡 Priority 2

**Purpose**: Gamification, achievements, rewards, motivation

**Use Cases**:
- Achievement badges (first A+, 10-day streak)
- Milestone markers (100 problems solved)
- Encouragement stickers (Great Job! Keep Going!)
- Collectible rewards

**Visual Elements**:
- Glossy, colorful sticker appearance
- Slight peel/curl at edges
- Shadow underneath (lifted from page)
- Star, trophy, ribbon, or custom shapes
- Shiny foil effect (gradient)
- Classic teacher stickers: smiley faces, stars, ribbons

**Implementation**:
```tsx
<StickerBadge
  type="star"            // star | trophy | ribbon | smiley
  label="Great Work!"
  shiny={true}
  size="md"
/>
```

**Animation**: Pop in with slight bounce and rotation

**Complexity**: Medium (graphics, shine effects)

---

## E. CSS Utility Styles & Effects

### 19. **Grid Pattern Utilities**

**Purpose**: Reusable background patterns for various paper types

**Patterns**:
- `graph-paper-5mm` - Fine graph paper
- `graph-paper-1cm` - Standard graph paper
- `quad-paper` - Engineering quad ruling
- `isometric-paper` - Isometric grid (3D drawings)
- `dot-grid` - Dotted grid (bullet journaling)
- `hex-grid` - Hexagonal grid (chemistry, gaming)

**Implementation**: CSS custom properties + repeating-linear-gradient

**Complexity**: Low (pure CSS)

---

### 20. **Edge Variations**

**Purpose**: More torn/cut edge styles for variety

**Existing**: `torn-edge-right`, `torn-edge-top`, `torn-edge-bottom`

**New Additions**:
- `perforated-all` - Perforated edges all sides (tear-off ticket)
- `deckle-edge` - Rough deckled edge (handmade paper)
- `cut-corner` - Clean scissor-cut corner (dog-eared)
- `serrated-edge` - Sawtooth pattern (stamps, coupons)
- `spiral-holes-left/right/top` - More binding hole patterns

**Complexity**: Medium (clip-path shapes)

---

### 21. **Aging & Weathering Effects**

**Purpose**: Add realism through aging/wear indicators

**Effects**:
- `paper-yellowed` - Old paper aging (cream → tan gradient)
- `coffee-stain` - Brown circular stain (radial-gradient)
- `ink-bleed` - Feathered ink edges
- `crease-line` - Fold mark (dark line)
- `tape-mark` - Removed tape residue (discolored rectangle)
- `water-damage` - Warped/rippled edge

**Usage**: Apply sparingly for realism, not on every element

**Complexity**: Low-Medium (CSS gradients, filters)

---

### 22. **Handwriting Font Integration**

**Purpose**: Authentic handwritten text for annotations

**Fonts to Add**:
1. **Caveat** (Google Fonts) - Elegant cursive, teacher-like
2. **Indie Flower** - Casual, friendly handwriting
3. **Permanent Marker** - Bold marker pen
4. **Shadows Into Light** - Light pencil-style
5. **Reenie Beanie** - Quirky, playful notes

**Implementation**:
```css
@import url('https://fonts.googleapis.com/css2?family=Caveat&family=Indie+Flower&display=swap');

.font-handwriting-cursive { font-family: 'Caveat', cursive; }
.font-handwriting-print { font-family: 'Indie Flower', cursive; }
.font-handwriting-marker { font-family: 'Permanent Marker', cursive; }
```

**Usage Guidelines**:
- Use for annotations, not body text
- Limit to 1-2 fonts (avoid overuse)
- Pair with slight rotation for authenticity

**Complexity**: Low (font imports)

---

## Implementation Roadmap

### Phase 1: Foundation Utilities (Week 1)
- ✅ Graph Paper Panel CSS utilities
- ✅ Highlighter marks styling
- ✅ Date/Grade stamps component
- ✅ Handwriting font integration

### Phase 2: Core Components (Week 2)
- ✅ Worksheet Card component
- ✅ Report Card component
- ✅ Manila Folder/File Tabs
- ✅ Index Cards 3x5

### Phase 3: Interactive Elements (Week 3)
- ✅ Pencil/Pen annotations
- ✅ Sticker badges
- ✅ Calculator Display
- ✅ Certificate/Award

### Phase 4: Polish & Effects (Week 4)
- ✅ Composition Notebook
- ✅ Binder divider tabs
- ✅ Aging/weathering effects
- ✅ Additional edge variations

### Phase 5: Advanced Features (Future)
- ✅ Protractor/Ruler graphics
- ✅ Engineering paper
- ✅ Eraser smudges
- ✅ Bookmark ribbons

---

## Usage Guidelines: When to Use What

### Quick Reference Table

| Component | Best For | Avoid For |
|-----------|----------|-----------|
| **Spiral Notebook** | Session notes, observations | Official reports, grades |
| **Composition Notebook** | Long-form content, curriculum | Quick notes, reminders |
| **Sticky Notes** | Alerts, reminders, action items | Permanent content |
| **Flash Cards** | Q&A review, vocabulary | Long explanations |
| **Worksheet Card** | Exercises, problem sets | Prose, notes |
| **Graph Paper** | Charts, data viz, coordinates | Text-heavy content |
| **Report Card** | Grades, progress reports | Exercise lists |
| **Certificate** | Achievements, awards | Regular feedback |
| **Manila Folder** | Organization, navigation | Primary content display |
| **Index Cards** | Lists, quick refs | Detailed information |
| **Highlighter** | Emphasis, important text | Large blocks of text |
| **Stamps** | Metadata, status indicators | Body content |

---

## Design Principles Checklist

Before adding any new component, verify:

- [ ] **Clear Purpose**: Does it solve a specific UX problem?
- [ ] **Not Decorative Only**: Does it enhance function, not just aesthetics?
- [ ] **Appropriate Context**: Is it suitable for a math learning center?
- [ ] **Balanced**: Does it fit without overwhelming the interface?
- [ ] **Accessible**: Does it work for all users (contrast, motion, screen readers)?
- [ ] **Performant**: Is the implementation efficient (CSS > JS > Images)?
- [ ] **Dark Mode**: Does it work in both light and dark themes?
- [ ] **Responsive**: Does it adapt to different screen sizes?

---

## Next Steps

1. **Review & Prioritize**: Team discussion on which components to build first
2. **Design Specs**: Create detailed Figma mockups for approved components
3. **Technical Planning**: Decide on component API and implementation approach
4. **Build & Test**: Implement Phase 1 components
5. **Document**: Update DESIGN.md with new components as they're built
6. **Iterate**: Gather feedback and refine based on usage

---

**End of Brainstorm Document**

_This is a living document. Update as new ideas emerge or priorities shift._
