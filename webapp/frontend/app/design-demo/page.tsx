"use client";

import {
  PageTransition,
  StickyNote,
  FlashCard,
  GraphPaper,
  Highlighter,
  RubberStamp,
  DateStamp,
  GradeStamp,
  StatusStamp,
  WorksheetCard,
  WorksheetProblem,
  AnswerBlank,
  ReportCard,
  Subject,
  TeacherComment,
  FileFolder,
  CalculatorDisplay,
  StickerBadge,
  StickerGrid,
  IndexCard,
  HandwrittenNote,
  CircleAnnotation,
  UnderlineAnnotation,
} from "@/lib/design-system";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// Sample data for graph paper chart
const chartData = [
  { name: "Week 1", score: 65 },
  { name: "Week 2", score: 72 },
  { name: "Week 3", score: 80 },
  { name: "Week 4", score: 88 },
  { name: "Week 5", score: 92 },
];

/**
 * Design Demo Page
 *
 * Showcases the Classroom Skeuomorphism component library:
 * - Paper & Note Components (StickyNote, FlashCard)
 * - Math & Academic Components (GraphPaper, WorksheetCard, ReportCard)
 * - Organization Components (FileFolder)
 * - Interactive & Feedback Components (Highlighter, RubberStamp)
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

      {/* Graph Paper Section */}
      <section>
        <h2 className="text-2xl font-semibold mb-6">Graph Paper</h2>
        <p className="text-muted-foreground mb-6">
          Authentic graph paper backgrounds for charts, coordinates, and data visualization
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 1cm Grid with Chart */}
          <GraphPaper gridSize="1cm" showAxes showNumbers className="min-h-[300px]">
            <div className="text-center mb-2">
              <h3 className="font-bold text-gray-900 dark:text-gray-100">Progress Chart</h3>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="transparent" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="score" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </GraphPaper>

          {/* Dot Grid */}
          <GraphPaper gridSize="dot" paperColor="white" className="min-h-[300px]">
            <div className="space-y-4 text-gray-900 dark:text-gray-100">
              <h3 className="font-bold">Dot Grid Paper</h3>
              <p className="text-sm opacity-80">
                Perfect for bullet journaling, sketching, or free-form notes.
              </p>
              <div className="flex gap-2 items-center">
                <div className="w-3 h-3 bg-primary rounded-full"></div>
                <div className="w-3 h-3 bg-warning rounded-full"></div>
                <div className="w-3 h-3 bg-success rounded-full"></div>
              </div>
            </div>
          </GraphPaper>
        </div>
      </section>

      {/* Highlighter Section */}
      <section>
        <h2 className="text-2xl font-semibold mb-6">Highlighter Marks</h2>
        <div className="bg-white dark:bg-gray-900 p-8 rounded-lg paper-shadow-md">
          <p className="text-lg mb-4 text-gray-900 dark:text-gray-100">
            Emphasize important concepts with <Highlighter color="yellow">realistic highlighter marks</Highlighter> that
            draw attention without overwhelming the content.
          </p>
          <p className="text-lg mb-4 text-gray-900 dark:text-gray-100">
            Available in multiple colors: <Highlighter color="pink">pink for warnings</Highlighter>,{" "}
            <Highlighter color="green">green for success</Highlighter>, <Highlighter color="blue">blue for info</Highlighter>,
            and <Highlighter color="orange">orange for attention</Highlighter>.
          </p>
          <p className="text-sm text-muted-foreground italic">
            Use sparingly for maximum impact - highlight only the most important information.
          </p>
        </div>
      </section>

      {/* Rubber Stamps Section */}
      <section>
        <h2 className="text-2xl font-semibold mb-6">Rubber Stamps</h2>
        <p className="text-muted-foreground mb-6">
          Official-looking stamps for dates, grades, and status indicators
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Date Stamps */}
          <div className="bg-white dark:bg-gray-900 p-6 rounded-lg paper-shadow-md">
            <h3 className="font-bold mb-4 text-gray-900 dark:text-gray-100">Date Stamps</h3>
            <div className="flex flex-wrap gap-4">
              <DateStamp date="OCT 25" label="DUE" />
              <DateStamp date="NOV 1" label="SUBMITTED" />
              <RubberStamp text="FINAL: DEC 15" type="rect" color="purple" />
            </div>
          </div>

          {/* Grade Stamps */}
          <div className="bg-white dark:bg-gray-900 p-6 rounded-lg paper-shadow-md">
            <h3 className="font-bold mb-4 text-gray-900 dark:text-gray-100">Grade Stamps</h3>
            <div className="flex flex-wrap gap-4">
              <GradeStamp grade="A+" size="lg" />
              <GradeStamp grade="B" size="lg" />
              <GradeStamp grade="C+" size="lg" />
            </div>
          </div>

          {/* Status Stamps */}
          <div className="bg-white dark:bg-gray-900 p-6 rounded-lg paper-shadow-md md:col-span-2">
            <h3 className="font-bold mb-4 text-gray-900 dark:text-gray-100">Status Stamps</h3>
            <div className="flex flex-wrap gap-4">
              <StatusStamp status="APPROVED" />
              <StatusStamp status="COMPLETED" />
              <StatusStamp status="PENDING" />
              <StatusStamp status="LATE" />
              <StatusStamp status="MISSING" />
            </div>
          </div>
        </div>
      </section>

      {/* Worksheet Card Section */}
      <section>
        <h2 className="text-2xl font-semibold mb-6">Worksheet Card</h2>
        <WorksheetCard
          title="Algebra Practice"
          dueDate="OCT 25"
          showHeader
          numbering="decimal"
        >
          <WorksheetProblem number={1}>
            Solve for x: <strong>2x + 5 = 13</strong>
            <div className="mt-2">
              Answer: <AnswerBlank width="md" />
            </div>
          </WorksheetProblem>

          <WorksheetProblem number={2}>
            Factor the expression: <strong>x² + 5x + 6</strong>
            <div className="mt-2">
              Answer: <AnswerBlank width="lg" />
            </div>
          </WorksheetProblem>

          <WorksheetProblem number={3}>
            Simplify: <strong>(3x² - 2x + 1) + (x² + 4x - 3)</strong>
            <div className="mt-2">
              Answer: <AnswerBlank width="full" />
            </div>
          </WorksheetProblem>
        </WorksheetCard>
      </section>

      {/* Report Card Section */}
      <section>
        <h2 className="text-2xl font-semibold mb-6">Report Card</h2>
        <ReportCard
          studentName="Alex Chen"
          term="Fall 2025"
          gradingScale="letter"
        >
          <Subject name="Algebra II" grade="A" gpa={4.0} notes="Excellent problem-solving skills" />
          <Subject name="Geometry" grade="B+" gpa={3.5} notes="Strong improvement in proofs" />
          <Subject name="Pre-Calculus" grade="A-" gpa={3.7} notes="Consistent performance" />
          <Subject name="Statistics" grade="B" gpa={3.0} />

          <TeacherComment author="Ms. Rodriguez">
            Alex has shown remarkable growth this semester. Their analytical thinking has improved significantly,
            and they consistently demonstrate strong problem-solving abilities. With continued practice in
            geometric proofs, Alex will be well-prepared for advanced mathematics courses.
          </TeacherComment>
        </ReportCard>
      </section>

      {/* File Folder Section */}
      <section>
        <h2 className="text-2xl font-semibold mb-6">File Folder Tabs</h2>
        <FileFolder
          tabs={[
            {
              label: "Personal Info",
              color: "red",
              content: (
                <div className="space-y-4 text-gray-900 dark:text-gray-100">
                  <h3 className="font-bold text-xl">Student Profile</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-semibold">Name:</span> Alex Chen
                    </div>
                    <div>
                      <span className="font-semibold">Grade:</span> 10th
                    </div>
                    <div>
                      <span className="font-semibold">Start Date:</span> Sept 2024
                    </div>
                    <div>
                      <span className="font-semibold">Guardian:</span> Sarah Chen
                    </div>
                  </div>
                </div>
              ),
            },
            {
              label: "Grades",
              color: "blue",
              content: (
                <div className="space-y-4 text-gray-900 dark:text-gray-100">
                  <h3 className="font-bold text-xl">Academic Performance</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between border-b pb-2">
                      <span>Algebra II</span>
                      <span className="font-bold">A (4.0)</span>
                    </div>
                    <div className="flex justify-between border-b pb-2">
                      <span>Geometry</span>
                      <span className="font-bold">B+ (3.5)</span>
                    </div>
                    <div className="flex justify-between border-b pb-2">
                      <span>Pre-Calculus</span>
                      <span className="font-bold">A- (3.7)</span>
                    </div>
                  </div>
                </div>
              ),
            },
            {
              label: "Attendance",
              color: "green",
              content: (
                <div className="space-y-4 text-gray-900 dark:text-gray-100">
                  <h3 className="font-bold text-xl">Attendance Record</h3>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-3xl font-bold text-green-600">95%</div>
                      <div className="text-sm text-muted-foreground">Present</div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-yellow-600">3</div>
                      <div className="text-sm text-muted-foreground">Late</div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-red-600">2</div>
                      <div className="text-sm text-muted-foreground">Absent</div>
                    </div>
                  </div>
                </div>
              ),
            },
          ]}
          defaultTab={0}
        />
      </section>

      {/* Calculator Display Section */}
      <section>
        <h2 className="text-2xl font-semibold mb-6">Calculator Displays</h2>
        <p className="text-muted-foreground mb-6">
          Retro calculator aesthetics for number displays and math operations
        </p>
        <div className="flex flex-wrap gap-8 items-end">
          <div className="space-y-2">
            <CalculatorDisplay value="42.857142" variant="lcd" size="lg" showBranding />
            <p className="text-sm text-muted-foreground text-center">LCD (90s style)</p>
          </div>

          <div className="space-y-2">
            <CalculatorDisplay value="1337" variant="led" size="md" showBranding />
            <p className="text-sm text-muted-foreground text-center">LED (70s/80s style)</p>
          </div>

          <div className="space-y-2">
            <CalculatorDisplay value="95.5" variant="modern" size="md" label="Score" />
            <p className="text-sm text-muted-foreground text-center">Modern</p>
          </div>
        </div>
      </section>

      {/* Sticker Badges Section */}
      <section>
        <h2 className="text-2xl font-semibold mb-6">Sticker Badges</h2>
        <p className="text-muted-foreground mb-6">
          Glossy reward stickers for achievements and gamification
        </p>
        <StickerGrid>
          <StickerBadge type="star" label="Great!" color="gold" size="lg" />
          <StickerBadge type="trophy" label="Winner" color="gold" size="lg" />
          <StickerBadge type="ribbon" label="A+" color="rainbow" size="md" />
          <StickerBadge type="smiley" label="Good Job" color="gold" size="md" />
          <StickerBadge type="thumbsUp" color="silver" size="md" />
          <StickerBadge type="sparkle" label="100%" color="rainbow" size="lg" />
        </StickerGrid>
      </section>

      {/* Index Cards Section */}
      <section>
        <h2 className="text-2xl font-semibold mb-6">Index Cards</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <IndexCard size="3x5" lined color="white">
            <h3 className="font-bold text-lg mb-2">Homework - Oct 19</h3>
            <ul className="space-y-1 text-sm">
              <li>• Complete Ex. 1-15</li>
              <li>• Review Ch. 3</li>
              <li>• Quiz Friday</li>
            </ul>
          </IndexCard>

          <IndexCard size="3x5" lined color="cream">
            <h3 className="font-bold text-lg mb-2">Study Tips</h3>
            <p className="text-sm">
              Practice 20 minutes daily. Break complex problems into smaller steps.
            </p>
          </IndexCard>

          <IndexCard size="3x5" lined={false} color="yellow">
            <h3 className="font-bold text-lg mb-2">Quick Ref</h3>
            <div className="text-sm space-y-1">
              <div>a² + b² = c²</div>
              <div>y = mx + b</div>
              <div>(a+b)² = a² + 2ab + b²</div>
            </div>
          </IndexCard>
        </div>
      </section>

      {/* Handwritten Notes Section */}
      <section>
        <h2 className="text-2xl font-semibold mb-6">Handwritten Annotations</h2>
        <div className="bg-white dark:bg-gray-900 p-8 rounded-lg paper-shadow-md space-y-6">
          <div className="text-gray-900 dark:text-gray-100">
            <p className="mb-4">
              Student completed the assignment with{" "}
              <HandwrittenNote font="cursive" color="bluePen">
                excellent attention to detail!
              </HandwrittenNote>
            </p>

            <p className="mb-4">
              <CircleAnnotation color="red">
                Remember to show your work
              </CircleAnnotation>{" "}
              for full credit on word problems.
            </p>

            <p className="mb-4">
              The following topics need{" "}
              <UnderlineAnnotation style="wavy" color="orange">
                additional review
              </UnderlineAnnotation>
              : quadratic equations and factoring.
            </p>

            <div className="flex flex-wrap gap-4 mt-6">
              <HandwrittenNote font="print" color="pencil">
                Review Ch. 5
              </HandwrittenNote>
              <HandwrittenNote font="marker" color="redPen" rotation={3}>
                Important!
              </HandwrittenNote>
              <HandwrittenNote font="pencil" color="pencil" rotation={-2}>
                Well done :)
              </HandwrittenNote>
            </div>
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
