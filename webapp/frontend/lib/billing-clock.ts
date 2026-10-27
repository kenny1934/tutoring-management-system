// Only the development test boundary sets this after verifying the backend.
// A full page reload starts a new fee-date test without retaining old forms.
let testDate: string | null = null;

export function isBillingTestDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function setBillingTestDate(value: string | null) {
  if (value !== null && !isBillingTestDate(value)) {
    throw new Error('The fee test date is invalid.');
  }
  testDate = value;
}

export function billingToday() {
  return testDate ?? new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export function billingLocalDateTime() {
  const now = new Date();
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Hong_Kong', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(now);
  return `${billingToday()}T${time}`;
}
