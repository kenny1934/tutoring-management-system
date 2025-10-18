"use client";

import { PageTransition, StickyNote, FlashCard } from "@/lib/design-system";
import { motion } from "framer-motion";

/**
 * Design Demo Page
 *
 * Showcases the new Classroom Skeuomorphism components:
 * - StickyNote (4 color variants)
 * - FlashCard (3D flip interaction)
 * - Paper textures and utilities
 */
export default function DesignDemoPage() {
  return (
    <PageTransition className="flex flex-col gap-12 p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold mb-2">Classroom Skeuomorphism Demo</h1>
        <p className="text-muted-foreground">
          Real-world learning objects brought to life with CSS, SVG, and Framer Motion
        </p>
      </div>

      {/* Sticky Notes Section */}
      <section>
        <h2 className="text-2xl font-semibold mb-6">Sticky Notes</h2>
        <div className="flex flex-wrap gap-8">
          <StickyNote variant="yellow" size="md" showTape>
            <div className="space-y-2">
              <h3 className="font-bold text-lg">Quick Reminder</h3>
              <p className="text-sm">
                Review homework for Chapter 5 before next session!
              </p>
            </div>
          </StickyNote>

          <StickyNote variant="pink" size="md">
            <div className="space-y-2">
              <h3 className="font-bold text-lg text-red-600">Important!</h3>
              <p className="text-sm">
                Parent meeting scheduled for Friday 3PM
              </p>
            </div>
          </StickyNote>

          <StickyNote variant="blue" size="md">
            <div className="space-y-2">
              <h3 className="font-bold text-lg">Study Tip</h3>
              <p className="text-sm">
                Practice makes perfect - 20 minutes daily is better than 2 hours once a week
              </p>
            </div>
          </StickyNote>

          <StickyNote variant="green" size="md" showTape>
            <div className="space-y-2">
              <h3 className="font-bold text-lg">Achievement!</h3>
              <p className="text-sm">
                Great job on the math quiz - 95%! Keep it up!
              </p>
            </div>
          </StickyNote>
        </div>
      </section>

      {/* Flash Cards Section */}
      <section>
        <h2 className="text-2xl font-semibold mb-6">Flash Cards</h2>
        <div className="flex flex-wrap gap-8">
          <FlashCard
            front={
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground uppercase tracking-wide">
                  Question
                </div>
                <div className="text-2xl font-bold">
                  What is the Pythagorean Theorem?
                </div>
              </div>
            }
            back={
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground uppercase tracking-wide">
                  Answer
                </div>
                <div className="text-xl">
                  a² + b² = c²
                </div>
                <div className="text-sm text-muted-foreground">
                  In a right triangle, the square of the hypotenuse equals the sum of squares of the other two sides.
                </div>
              </div>
            }
          />

          <FlashCard
            front={
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground uppercase tracking-wide">
                  Vocabulary
                </div>
                <div className="text-2xl font-bold">
                  Photosynthesis
                </div>
              </div>
            }
            back={
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground uppercase tracking-wide">
                  Definition
                </div>
                <div className="text-base">
                  The process by which plants use sunlight, water, and carbon dioxide to produce oxygen and energy in the form of sugar.
                </div>
              </div>
            }
          />

          <FlashCard
            front={
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground uppercase tracking-wide">
                  Chinese Character
                </div>
                <div className="text-5xl font-bold">
                  学
                </div>
              </div>
            }
            back={
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground uppercase tracking-wide">
                  Meaning
                </div>
                <div className="text-xl font-semibold">
                  xué
                </div>
                <div className="text-base">
                  To learn, to study
                </div>
              </div>
            }
          />
        </div>
      </section>

      {/* Paper Textures Section */}
      <section>
        <h2 className="text-2xl font-semibold mb-6">Paper Texture Utilities</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Cream Paper */}
          <div className="bg-[#fef9f3] dark:bg-[#2d2618] paper-texture paper-shadow-md rounded-lg p-6 text-gray-900 dark:text-gray-100">
            <h3 className="font-bold mb-2">Cream Paper</h3>
            <p className="text-sm opacity-80">
              Classic notebook paper with warm cream tone and subtle grain texture.
            </p>
            <code className="text-xs bg-black/10 dark:bg-white/10 px-2 py-1 rounded mt-2 inline-block">
              bg-[#fef9f3]
            </code>
          </div>

          {/* White Paper */}
          <div className="bg-[#fefefe] dark:bg-[#1a1a1a] paper-texture paper-shadow-md rounded-lg p-6 text-gray-900 dark:text-gray-100">
            <h3 className="font-bold mb-2">White Paper</h3>
            <p className="text-sm opacity-80">
              Bright white paper for clean, professional documents.
            </p>
            <code className="text-xs bg-black/10 dark:bg-white/10 px-2 py-1 rounded mt-2 inline-block">
              bg-[#fefefe]
            </code>
          </div>

          {/* Yellow Paper */}
          <div className="bg-[#fff9db] dark:bg-[#2b2a1f] paper-texture paper-shadow-md rounded-lg p-6 text-gray-900 dark:text-gray-100">
            <h3 className="font-bold mb-2">Yellow Paper</h3>
            <p className="text-sm opacity-80">
              Sticky note yellow with subtle grain for reminders.
            </p>
            <code className="text-xs bg-black/10 dark:bg-white/10 px-2 py-1 rounded mt-2 inline-block">
              bg-[#fff9db]
            </code>
          </div>
        </div>
      </section>

      {/* Torn Edge Effects Demo */}
      <section>
        <h2 className="text-2xl font-semibold mb-6">Torn Paper Edges</h2>
        <p className="text-muted-foreground mb-6">
          Organic, irregular edges make paper feel real - not perfect rectangles
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Torn Top */}
          <div className="bg-[#fef9f3] dark:bg-[#2d2618] paper-texture torn-edge-top paper-shadow-md p-6 text-gray-900 dark:text-gray-100">
            <h3 className="font-bold mb-2">Torn Top Edge</h3>
            <p className="text-sm opacity-80">
              Sticky notes and papers ripped from pads. The top edge has an irregular, torn pattern.
            </p>
            <code className="text-xs bg-black/10 dark:bg-white/10 px-2 py-1 rounded mt-2 inline-block">
              .torn-edge-top
            </code>
          </div>

          {/* Torn Bottom */}
          <div className="bg-[#fff9db] dark:bg-[#2b2a1f] paper-texture torn-edge-bottom paper-shadow-md p-6 text-gray-900 dark:text-gray-100">
            <h3 className="font-bold mb-2">Torn Bottom Edge</h3>
            <p className="text-sm opacity-80">
              Papers torn roughly at the bottom. Creates natural, organic feel instead of perfect cuts.
            </p>
            <code className="text-xs bg-black/10 dark:bg-white/10 px-2 py-1 rounded mt-2 inline-block">
              .torn-edge-bottom
            </code>
          </div>

          {/* Torn Right (Notebook) */}
          <div className="bg-[#fefefe] dark:bg-[#1a1a1a] paper-texture torn-edge-right paper-shadow-md p-6 pl-12 text-gray-900 dark:text-gray-100">
            <h3 className="font-bold mb-2">Torn Right Edge</h3>
            <p className="text-sm opacity-80">
              Notebook pages ripped from spiral binding. Right edge shows irregular torn pattern.
            </p>
            <code className="text-xs bg-black/10 dark:bg-white/10 px-2 py-1 rounded mt-2 inline-block">
              .torn-edge-right
            </code>
          </div>
        </div>
      </section>

      {/* Ruled Lines Demo */}
      <section>
        <h2 className="text-2xl font-semibold mb-6">Ruled Lines & Margins</h2>
        <div className="bg-[#fef9f3] dark:bg-[#2d2618] paper-texture paper-wrinkled paper-shadow-lg torn-edge-right relative overflow-hidden p-8 pl-20 text-gray-900 dark:text-gray-100">
          {/* Red margin line */}
          <div className="absolute left-16 top-0 bottom-0 w-0.5 bg-red-400/50 dark:bg-red-400/25" />

          {/* Ruled lines */}
          <div className="absolute inset-0 ruled-lines rounded-lg pointer-events-none" />

          {/* Content */}
          <div className="relative space-y-[36px]">
            <p style={{ lineHeight: '36px' }}>
              This is a demonstration of ruled notebook paper with proper line spacing.
            </p>
            <p style={{ lineHeight: '36px' }}>
              The red margin line appears on the left, just like a real notebook.
            </p>
            <p style={{ lineHeight: '36px' }}>
              Line height is set to 36px to perfectly align with the ruled lines.
            </p>
            <p style={{ lineHeight: '36px' }}>
              SVG noise texture adds subtle paper grain for realism.
            </p>
          </div>
        </div>
      </section>

      {/* Design Philosophy */}
      <section className="bg-muted/30 rounded-lg p-8">
        <h2 className="text-2xl font-semibold mb-4">Design Philosophy</h2>
        <div className="prose prose-sm max-w-none">
          <p className="text-muted-foreground">
            <strong>Classroom Skeuomorphism</strong> blends futuristic glassmorphism with tactile,
            real-world learning objects. Educational materials are physical by nature - we leverage
            that familiarity to make digital workflows intuitive.
          </p>
          <ul className="text-muted-foreground space-y-2 mt-4">
            <li>Glass UI for structure and navigation (modern, professional)</li>
            <li>Paper textures for content (familiar, comfortable)</li>
            <li>Creates visual hierarchy and cognitive clarity</li>
            <li>60fps animations with spring physics</li>
            <li>Accessible and respects motion preferences</li>
          </ul>
        </div>
      </section>
    </PageTransition>
  );
}
