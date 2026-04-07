import { Noto_Serif_TC, Noto_Sans_TC } from "next/font/google";

const serifTC = Noto_Serif_TC({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-serif-tc",
  display: "swap",
});

const sansTC = Noto_Sans_TC({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-sans-tc",
  display: "swap",
});

export const metadata = {
  title: "MathConcept中學教室 暑期中學班",
  description:
    "暑假12個鐘，來年數學好輕鬆。MathConcept中學教室2026暑期中學班現正招生。",
};

export default function SummerLandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${serifTC.variable} ${sansTC.variable}`}>{children}</div>
  );
}
