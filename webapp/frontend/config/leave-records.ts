// Leave Record Configuration
// Update these URLs annually when new sheets are created
// Last updated: 2025-2026 school year

export interface LeaveRecordEntry {
  tutorName: string;  // Must match tutor_name in database
  sheetUrl: string;   // Google Sheet URL
}

export const leaveRecords: LeaveRecordEntry[] = [
  { tutorName: "Ms Bella Chang", sheetUrl: "https://docs.google.com/spreadsheets/d/1WdoKKm0_P5fa8maiRhx67xKDp-MEmsaCEyJt1r1h14U/" },
  { tutorName: "Mr David Choi", sheetUrl: "https://docs.google.com/spreadsheets/d/1gxi9m0ra-70soNOMJf92S-U9x-qsUDmttdQCduTfLwA/" },
  { tutorName: "Mr Eric Chan", sheetUrl: "https://docs.google.com/spreadsheets/d/15YkXCtkWIGP6yEMQj1ir0mTiBRW5r5Mswb9vPdVSDmg" },
  { tutorName: "Mr James Lo", sheetUrl: "https://docs.google.com/spreadsheets/d/1Ry3tFQAn3YzGS_QCt0XTs_tZptyVjOzRlGiawKtHnrc" },
  { tutorName: "Mr Kenny Chiu", sheetUrl: "https://docs.google.com/spreadsheets/d/1SV83US3mA82v-5w9XgmugSVQtyNB0hM8paQuATMoW_k/" },
  { tutorName: "Mr Simon Situ", sheetUrl: "https://docs.google.com/spreadsheets/d/1VvVDkXA2r3vGdi9ik-0T4VxiBMXdtCin77xEnacFqjM/" },
  { tutorName: "Mr Tom Ieong", sheetUrl: "https://docs.google.com/spreadsheets/d/1NDRHhpwFiFwzo5P5iJbhrdsx1dHCQpYEiERR-R-m_CQ/" },
  { tutorName: "Mr Ivan Chen", sheetUrl: "https://docs.google.com/spreadsheets/d/1cAyLlZ9STNW3bxfJtBcf30A_8O1CIy8lzijndHPv1v4" },
  { tutorName: "Mr Jeffrey Leong", sheetUrl: "https://docs.google.com/spreadsheets/d/1GPiGmHfahZOcJPibJ7QtVCTBA0XDd0ftHtzAFDm2fOU" },
  { tutorName: "Mr Orison Kam", sheetUrl: "https://docs.google.com/spreadsheets/d/1GBGIILosccMELjVZjmnGcFNL3JtHuhfdqkng5aMIUsQ" },
];

// Helper to find sheet URL by tutor name
export function getLeaveRecordUrl(tutorName: string): string | undefined {
  return leaveRecords.find(r => r.tutorName === tutorName)?.sheetUrl;
}
