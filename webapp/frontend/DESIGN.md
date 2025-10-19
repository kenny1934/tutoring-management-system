# CSM Pro Design System

## Vision

Create a futuristic, high-end design system that makes CSM Pro feel like **the best tutoring management system in the world** - modern, avant-garde, yet practical for daily classroom and session management tasks.

## Design Principles

### 1. **Fluid Motion**
Every interaction should feel alive with smooth, physics-based animations that respond naturally to user input.

### 2. **Progressive Disclosure**
Information revealed contextually through expandable sections, hover states, and smooth transitions - never overwhelming the user.

### 3. **Visual Feedback**
Immediate, satisfying feedback for every action through micro-interactions, state changes, and animations.

### 4. **Premium Polish**
High-end visual effects (glassmorphism, gradients, depth) that convey quality and professionalism.

### 5. **Performance First**
60fps animations, optimized rendering, smooth scrolling - speed should never be sacrificed for aesthetics.

### 6. **Tactile Realism** *(New)*
Real-world classroom objects inspire component design - notebooks, sticky notes, flashcards, whiteboards - creating intuitive, familiar interfaces through skeuomorphic elements.

## Technical Stack

### Core Technologies
- **Next.js 15.5.5** with Turbopack - Fast development and production builds
- **React 19.1** - Latest React features and performance improvements
- **TypeScript** - Type safety and developer experience
- **Tailwind CSS v4** - Utility-first styling with custom design tokens

### Animation & Interaction
- **Framer Motion** - Declarative animations, gestures, and layout transitions
- **Lucide React** - Consistent iconography
- **Recharts** - Animated data visualizations

### Design Philosophy
- **Dark-first** - Sophisticated dark theme as default
- **Glassmorphism** - Frosted glass effects with backdrop blur
- **Gradient Accents** - Subtle color transitions for depth
- **Micro-interactions** - Hover, tap, drag, and gesture-based feedback

## Animation Guidelines

### Timing
- **Fast**: 150-200ms - UI feedback (button press, hover)
- **Medium**: 250-350ms - Element transitions (modal, drawer)
- **Slow**: 400-600ms - Page transitions, complex animations
- **Ease curves**: Spring-based physics for natural feel

### Use Cases
1. **Page Transitions**: Smooth fade + slide on route changes
2. **Modal/Drawer**: Scale + fade with backdrop blur
3. **Cards**: Hover elevation, tap feedback
4. **Forms**: Input focus animations, validation feedback
5. **Lists**: Stagger animations on mount
6. **Notifications**: Toast with slide + bounce
7. **Loading**: Skeleton screens with shimmer effect

## Color System

### Foundation
- **Background**: Deep blacks (#0a0a0a, #111111)
- **Surface**: Elevated grays (#1a1a1a, #222222)
- **Borders**: Subtle separators (#2a2a2a, #333333)

### Brand Colors
- **Primary**: CSM Red (#c8102e) - Accent and CTA
- **Primary Hover**: Brighter red (#e01840)
- **Gradient**: Red to orange for emphasis

### Semantic Colors
- **Success**: Emerald (#10b981)
- **Warning**: Amber (#f59e0b)
- **Error**: Red (#ef4444)
- **Info**: Blue (#3b82f6)

### Glassmorphism
- **Glass Surface**: rgba(255, 255, 255, 0.05)
- **Glass Border**: rgba(255, 255, 255, 0.1)
- **Backdrop Blur**: 12px - 24px

## Typography

### Font Stack
- **Primary**: Inter - Clean, modern, highly legible
- **Monospace**: JetBrains Mono (code/data)

### Scale
- **Display**: 48px / 56px - Hero headlines
- **H1**: 36px / 44px - Page titles
- **H2**: 30px / 38px - Section headers
- **H3**: 24px / 32px - Subsections
- **H4**: 20px / 28px - Card headers
- **Body**: 16px / 24px - Default text
- **Small**: 14px / 20px - Supporting text
- **Tiny**: 12px / 18px - Labels, captions

### Weight
- **Light**: 300 - Large displays
- **Regular**: 400 - Body text
- **Medium**: 500 - Emphasis
- **Semibold**: 600 - Headings
- **Bold**: 700 - Strong emphasis

## Spacing System

Based on 4px grid for perfect alignment:
- **xs**: 4px
- **sm**: 8px
- **md**: 16px
- **lg**: 24px
- **xl**: 32px
- **2xl**: 48px
- **3xl**: 64px
- **4xl**: 96px

## Component Patterns

### Session Detail View
The flagship interface showcasing all design patterns:
1. **Header**: Student info with smooth reveal animation
2. **Status Bar**: Attendance, rating with gesture interaction
3. **Action Buttons**: ClassWork, HomeWork, Rate - hover/tap micro-interactions
4. **Expandable Sections**:
   - Upcoming Tests & Exams
   - Previous Homework
   - Today's Courseware
   - Previous Session Summary
5. **Notes**: Auto-save indicator with smooth transitions
6. **Navigation**: Smooth page transitions

### Interactive Elements
- **Buttons**: Scale on press, glow on hover
- **Cards**: Elevate on hover, expand on click
- **Inputs**: Focus glow, smooth validation
- **Dropdowns**: Slide + fade with stagger
- **Modals**: Scale from trigger, backdrop blur
- **Toasts**: Slide from edge with bounce

## Performance Targets

- **First Contentful Paint**: < 1.5s
- **Time to Interactive**: < 3s
- **Cumulative Layout Shift**: < 0.1
- **Animation FPS**: 60fps consistent
- **Interaction Latency**: < 100ms

## Accessibility

- **WCAG 2.1 AA** compliant
- Keyboard navigation for all interactions
- Focus visible states
- Screen reader optimized
- Reduced motion preference respected
- Color contrast minimum 4.5:1

## Design Differentiators vs AppSheet Version

1. **Silky Animations**: 60fps vs static
2. **Gesture Support**: Drag, swipe, pinch
3. **Real-time Feedback**: Visual response to every action
4. **Micro-interactions**: Guide users intuitively
5. **Premium Polish**: Professional, high-class feel
6. **Contextual Intelligence**: Smart progressive disclosure
7. **Performance**: Lightning fast, no lag

## Development Workflow

1. **Design Token First**: Define colors, spacing, typography
2. **Component Library**: Build reusable animated components
3. **Prototype Pages**: Session detail as showcase
4. **Iterate**: Gather feedback, refine animations
5. **Document**: Keep this file updated as system evolves

## Classroom Skeuomorphism

### Philosophy
Blend futuristic glassmorphism with tactile, real-world learning objects to create an interface that's both cutting-edge and comfortably familiar. Educational materials are physical by nature - leverage that familiarity to make digital workflows intuitive.

### Design Language Evolution
- **From**: Pure futuristic glassmorphism (frosted glass, neon accents)
- **To**: Hybrid approach - glass UI shell + paper-based content cards
- **Why**: Glass for structure/navigation, paper for content creates visual hierarchy and cognitive clarity

### Physical Learning Objects Library

#### 1. **Spiral Notebook** (`session notes`)
**Purpose**: Session notes, tutor observations, student performance
**Visual Elements**:
- Cream paper texture with SVG noise grain
- Blue ruled lines (36px line-height for readability)
- Red margin line (left side, 40px from edge)
- Spiral binding holes (8 punched circles along left margin)
- Page curl (top-right corner with triangle fold)
- Slight rotation (-0.5° to 0.5°) for handmade feel
- Layered shadows for paper thickness
- Warm amber/yellow gradient overlay (like aged paper)

**Implementation**: Direct in session detail page
**Props**: Paper color, line spacing, rotation angle

#### 2. **Sticky Note** (`lib/design-system/components/education/StickyNote.tsx`)
**Purpose**: Quick reminders, important alerts, actionable items
**Visual Elements**:
- Classic yellow (or pink/blue/green variants)
- Subtle paper grain texture
- Random rotation (-3° to 3°)
- Shadow that lifts on hover
- Optional transparent tape at top
- Bottom corner shadow (curl effect)

**Usage Example**:
```tsx
<StickyNote variant="yellow" size="md" showTape>
  <p className="font-handwriting">Remember: Review Ch.5 homework!</p>
</StickyNote>
```

#### 3. **Flash Card** (`lib/design-system/components/education/FlashCard.tsx`)
**Purpose**: Vocabulary review, Q&A, concept definitions
**Visual Elements**:
- 3D flip animation (rotateY 180°)
- White front / cream back
- Cardstock texture (thicker than notebook paper)
- Rounded corners (subtle, 4px radius)
- Corner fold indicators
- Perspective depth (1000px)
- Spring-based flip transition

**Usage Example**:
```tsx
<FlashCard
  front={<div className="text-xl font-bold">What is React?</div>}
  back={<div>A JavaScript library for building user interfaces</div>}
/>
```

#### 4. **Index Card** *(Future)* (`Index3x5Card.tsx`)
**Purpose**: Homework assignments, exercise lists
**Visual Elements**:
- 3:5 aspect ratio (300px × 500px)
- Horizontal blue lines
- Vertical red/blue line at top (for title)
- Cardstock texture
- Slight yellowing/aging effect

#### 5. **Whiteboard Panel** *(Future)* (`Whiteboard.tsx`)
**Purpose**: Lesson plans, diagrams, brainstorming
**Visual Elements**:
- Glossy white surface
- Subtle reflection gradient
- Dry-erase marker trails (SVG paths)
- Eraser smudge effects
- Metal frame border

### Paper Texture System

**CSS Custom Properties** (in `globals.css`):
```css
--paper-cream: #fef9f3 (light) / #2d2618 (dark)
--paper-white: #fefefe / #1a1a1a
--paper-yellow: #fff9db / #2b2a1f
--paper-lined-blue: #a7c5e3 / #3d5975
--paper-lined-red: #e8b4b8 / #6b3a3f
```

**Utility Classes**:
- `.paper-texture` - SVG noise overlay (fractal noise, baseFrequency 0.9)
- `.paper-cream/white/yellow` - Background colors
- `.paper-shadow-sm/md/lg` - Realistic lift shadows
- `.ruled-lines` - Horizontal lines (35px spacing)
- `.margin-line-left` - Red vertical margin
- `.page-curl` - Triangle fold corner

**Shadows** (layered for depth):
```css
--shadow-paper-sm: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)
--shadow-paper-md: 0 3px 6px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.12)
--shadow-paper-lg: 0 10px 20px rgba(0,0,0,0.15), 0 3px 6px rgba(0,0,0,0.10)
```

### Animation Behaviors

**Paper Interactions**:
- **Hover**: Slight lift (translateY -2px), shadow increase, subtle rotation correction
- **Tap/Click**: Quick scale down (0.98), then spring back
- **Entrance**: Stagger with slight rotation and opacity fade
- **Exit**: Crumple effect (scale 0.8, rotate 15°, opacity 0)

**Page Transitions**:
- Flip book effect (multiple sheets cascading)
- Slide like turning pages in a binder
- Stack/unstack for modal overlays

### Implementation Guidelines

1. **Use paper components for content**, glass components for UI chrome
2. **Limit skeuomorphic elements** to avoid overwhelming interface
3. **Maintain accessibility** - ensure text contrast on paper backgrounds
4. **Respect motion preferences** - disable rotation/animations if prefers-reduced-motion
5. **SVG noise at 0.08 opacity** - subtle, never distracting
6. **Consistent line-height** (36px) - aligns with ruled lines perfectly

### Educational Object Metaphors

| Component | Real-World Object | Use Case |
|-----------|------------------|----------|
| Session Notes | Spiral Notebook | Tutor observations, student performance |
| Quick Alerts | Sticky Notes | Reminders, action items, warnings |
| Study Cards | Flash Cards | Vocabulary, Q&A review, concept checks |
| Assignments | Index Cards | Homework lists, exercise references |
| Lesson Plans | Whiteboard | Teaching materials, diagrams, schedules |
| Report Cards | Official Document | Grades, progress reports, certificates |
| File Folders | Manila Folders | Student portfolios, document organization |

### Dark Mode Considerations

- **Paper colors shift to warm darks** (not pure black/gray)
- **Ruled lines reduce opacity** (0.15 vs 0.25 in light mode)
- **Margins use softer reds** (reduce saturation 20%)
- **Noise texture stays subtle** (same 0.08 opacity)
- **Shadows become outlines** (subtle border + soft glow)

## Extended Component Library

📋 **See COMPONENTS_BRAINSTORM.md** for comprehensive research and planning of 22+ additional educational components, including:

**Priority 1 (In Development)**:
- Graph Paper Panel (charts, coordinate planes)
- Worksheet Card (problem sets, exercises)
- Report Card (grades, progress reports)
- Manila Folder/File Tabs (navigation, organization)
- Highlighter Marks (text emphasis)
- Date/Grade Stamps (metadata, status)

**Coming Soon**:
- Calculator Display (retro LED/LCD)
- Certificate/Award (achievements)
- Composition Notebook (formal notes)
- Index Cards 3x5 (quick refs)
- Sticker Badges (gamification)
- Pencil/Pen Annotations (handwritten comments)

The brainstorm document includes use cases, implementation details, priority ratings, and a 5-phase roadmap.

## Future Considerations

- **3D Elements**: Subtle parallax, depth effects
- **Voice Integration**: Hands-free tutoring assistance
- **AR Features**: Session materials in augmented reality
- **AI Animations**: Context-aware motion design
- **Haptic Feedback**: Mobile vibration for confirmations

---

**Last Updated**: 2025-10-19
**Version**: 2.1.0
**Status**: Classroom Skeuomorphism Phase - Component Expansion
