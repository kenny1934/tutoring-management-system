export interface UsefulTool {
  name: string;
  url: string;
  iconUrl?: string; // Image URL for the tool's icon
  description?: string;
}

// Useful tools for quick access
export const usefulTools: UsefulTool[] = [
  {
    name: "Courseware Codex Guide",
    description: "Courseware (Chi) 教材編碼命名指南",
    url: "https://courseware-codex-guide.mathconceptsecondary.academy/",
    iconUrl: "https://courseware-codex-guide.mathconceptsecondary.academy/images/msa-logo.png",
  },
  {
    name: "Google Calendar",
    description: "Mark and browse dates of quizzes, tests, and exams",
    url: "https://calendar.google.com/calendar/u/2?cid=bXNhbWFjYXUwMUBnbWFpbC5jb20",
    iconUrl: "https://ssl.gstatic.com/calendar/images/dynamiclogo_2020q4/calendar_4_2x.png",
  },
  {
    name: "Kuta Software",
    description: "Free maths worksheets for English schools",
    url: "https://www.kutasoftware.com/",
    iconUrl: "https://cdn.kutasoftware.com/img/logos/KutaSoftwareColorLogoWhiteType.svg",
  },
  {
    name: "MCSA Hub",
    description: "Onboarding knowledge base for new staff",
    url: "https://www.notion.so/MCSA-Hub-42c9c4a312064966bb5b92b81a89b7eb",
    iconUrl: "https://upload.wikimedia.org/wikipedia/commons/4/45/Notion_app_logo.png",
  },
  {
    name: "MCSA PDF Studio",
    description: "All-in-one PDF tool for conversion, merging, splitting, OCR and more",
    url: "http://mcsa:8080",
    iconUrl: "https://courseware-codex-guide.mathconceptsecondary.academy/images/msa-logo.png",
  },
  {
    name: "SAGE (Beta)",
    description: "Generate customised mathematical problems with AI (Gemini API Key required)",
    url: "https://sage.mathconceptsecondary.academy/",
    iconUrl: "https://sage.mathconceptsecondary.academy/images/msa-logo.png",
  },
  {
    name: "School Curriculum 2024-2025",
    description: "Historical record of school curriculum topics by week, grade, and school",
    url: "https://docs.google.com/spreadsheets/d/1SMORd7tUzjzdGBQqW0U7x3iy7frzH0-bs-2i1hi_Spw/edit?gid=55848868#gid=55848868",
    iconUrl: "https://cdn.prod.website-files.com/655b60964be1a1b36c746790/655b60964be1a1b36c746d61_646e04919c3fa7c2380ae837_Google_Sheets_logo_(2014-2020).svg.png",
  },
  {
    name: "School Curriculum 2025-2026",
    description: "Current academic year curriculum tracking with collaborative editing",
    url: "https://docs.google.com/spreadsheets/d/1l9CBqVqqp0zVU4YbRAKND_cwSu2TrLmspHFqY4SJEZo/",
    iconUrl: "https://cdn.prod.website-files.com/655b60964be1a1b36c746790/655b60964be1a1b36c746d61_646e04919c3fa7c2380ae837_Google_Sheets_logo_(2014-2020).svg.png",
  },
  {
    name: "Shelv",
    description: "Powerful content search and intelligent tagging for courseware material",
    url: "http://mcsa:8000",
    iconUrl: "https://drive.google.com/thumbnail?id=11MaKptp0D9QjYTporDETT-OS0qAoX_my",
  },
  {
    name: "Snip Mathpix",
    description: "Convert images and pdfs to LaTeX, .docx and more",
    url: "https://snip.mathpix.com/",
    iconUrl: "https://play-lh.googleusercontent.com/-HA5y1fFjL6nTGYhJNo3KRidO_loSQQHT9XoitCUNT2HI86UCjODYWObRb66wBN2bQ",
  },
  {
    name: "組卷網",
    description: "Maths problem library for Chinese schools",
    url: "https://zujuan.xkw.com/",
    iconUrl: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSs2eBo1WH4QZtUQrY6qD-yMSCmA9UUYzKE7Q&s",
  },
];
