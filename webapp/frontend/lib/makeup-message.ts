import type { Session } from '@/types';

const WEEKDAYS_ZH = ['日', '一', '二', '三', '四', '五', '六'];
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(dateStr: string, lang: 'zh' | 'en'): string {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDate();
  const weekday = lang === 'zh' ? WEEKDAYS_ZH[d.getDay()] : WEEKDAYS_EN[d.getDay()];
  if (lang === 'zh') {
    return `${d.getMonth() + 1}月${day}日 (${weekday})`;
  }
  return `${MONTHS_EN[d.getMonth()]} ${day} (${weekday})`;
}

function extractSessionData(session: Session) {
  if (session.session_status === 'Make-up Class') {
    const original = session.make_up_for;
    const originalTutorName = original?.tutor_name || '';
    const makeupTutorName = session.tutor_name || '';
    return {
      originalDateStr: original?.session_date,
      originalTime: original?.time_slot || '',
      makeupDateStr: session.session_date,
      makeupTime: session.time_slot || '',
      makeupTutorDisplay: session.tutor_nickname || session.tutor_name || '',
      isDifferentTutor: makeupTutorName !== originalTutorName,
    };
  }
  const makeup = session.rescheduled_to;
  const originalTutorName = session.tutor_name || '';
  const makeupTutorName = makeup?.tutor_name || '';
  return {
    originalDateStr: session.session_date,
    originalTime: session.time_slot || '',
    makeupDateStr: makeup?.session_date,
    makeupTime: makeup?.time_slot || '',
    makeupTutorDisplay: makeup?.tutor_nickname || makeup?.tutor_name || '',
    isDifferentTutor: makeupTutorName !== originalTutorName,
  };
}

export function formatMakeupMessage(session: Session, lang: 'zh' | 'en' = 'zh'): string {
  const studentName = session.student_name || (lang === 'zh' ? '學生' : 'the student');
  const { originalDateStr, originalTime, makeupDateStr, makeupTime, makeupTutorDisplay, isDifferentTutor } = extractSessionData(session);

  const unknown = lang === 'zh' ? '(未知)' : '(unknown)';
  const originalDate = originalDateStr ? formatDate(originalDateStr, lang) : unknown;
  const makeupDate = makeupDateStr ? formatDate(makeupDateStr, lang) : unknown;
  const tutorSuffix = isDifferentTutor && makeupTutorDisplay ? ` (${makeupTutorDisplay})` : '';

  if (lang === 'en') {
    return `Hello, the make-up class for ${studentName} has been arranged. Details as follows:

Original class: ${originalDate} ${originalTime}
Make-up class: ${makeupDate} ${makeupTime}${tutorSuffix}

If you have any questions, please feel free to contact us. Thank you!`;
  }

  return `你好，${studentName} 的補堂已安排好，詳情如下：

原定課堂：${originalDate} ${originalTime}
補堂日期：${makeupDate} ${makeupTime}${tutorSuffix}

如有任何疑問，歡迎隨時與我們聯絡，謝謝！`;
}
