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

## Future Considerations

- **3D Elements**: Subtle parallax, depth effects
- **Voice Integration**: Hands-free tutoring assistance
- **AR Features**: Session materials in augmented reality
- **AI Animations**: Context-aware motion design
- **Haptic Feedback**: Mobile vibration for confirmations

---

**Last Updated**: 2025-10-17
**Version**: 1.0.0
**Status**: Foundation Phase
