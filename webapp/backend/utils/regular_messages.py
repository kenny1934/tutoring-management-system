"""Parent-facing messages for regular course (September intake) applications.

Two messages, matching the summer application flow:

* the **schedule** message, sent when a weekly slot is offered, and
* the **fee** message, sent once the parent has confirmed that slot.

The fee variant reuses ``routers.enrollments.format_fee_message`` verbatim, so
the message an admin sends from an application reads exactly like the renewal
message the same student will get later from their enrollment. The schedule
variant is a trimmed version of the same template: identity, schedule, sign-off,
no money.
"""
from typing import Optional

# Kept in sync with the maps inside routers.enrollments.format_fee_message.
_DAY_ZH = {
    'Mon': '一', 'Tue': '二', 'Wed': '三', 'Thu': '四', 'Fri': '五', 'Sat': '六', 'Sun': '日',
    'Monday': '一', 'Tuesday': '二', 'Wednesday': '三', 'Thursday': '四',
    'Friday': '五', 'Saturday': '六', 'Sunday': '日',
}
_DAY_EN = {
    'Mon': 'Monday', 'Tue': 'Tuesday', 'Wed': 'Wednesday', 'Thu': 'Thursday',
    'Fri': 'Friday', 'Sat': 'Saturday', 'Sun': 'Sunday',
}
_LOCATION_ZH = {'MSA': '華士古分校', 'MSB': '二龍喉分校'}
_LOCATION_EN = {'MSA': 'Vasco Center', 'MSB': 'Flora Garden Center'}

_DATE_INDENT = ' ' * 18


def _duration_minutes(time_slot: str) -> Optional[int]:
    """Minutes spanned by a slot like '10:00 - 11:30'. None when unparseable."""
    parts = (time_slot or '').split('-')
    if len(parts) != 2:
        return None
    try:
        start_h, start_m = (int(p) for p in parts[0].strip().split(':'))
        end_h, end_m = (int(p) for p in parts[1].strip().split(':'))
    except ValueError:
        return None
    diff = (end_h * 60 + end_m) - (start_h * 60 + start_m)
    return diff if diff > 0 else None


def _identity_lines(school_student_id: str, student_name: str, lang: str) -> str:
    """Student ID + name block. The ID line is dropped for applications that
    are not linked to a student record yet."""
    id_label = '學生編號' if lang == 'zh' else 'Student ID'
    name_label = '學生姓名' if lang == 'zh' else 'Student Name'
    sep = '：' if lang == 'zh' else ': '
    lines = []
    if school_student_id:
        lines.append(f'{id_label}{sep}{school_student_id}')
    lines.append(f'{name_label}{sep}{student_name}')
    return '\n'.join(lines)


def strip_blank_student_id(message: str) -> str:
    """Remove the identity line an empty student ID leaves behind.

    ``format_fee_message`` always prints the student-ID line. An application
    with no linked student record has nothing to put there, so drop the line
    rather than send the parent a dangling label.
    """
    return '\n'.join(
        line for line in message.split('\n')
        if line.strip() not in ('學生編號：', 'Student ID:')
    )


def format_schedule_message(
    lang: str,
    school_student_id: str,
    student_name: str,
    assigned_day: str,
    assigned_time: str,
    location: str,
    lessons_paid: int,
    session_dates: list,
) -> str:
    """Class-schedule message for a placement offer, in Chinese or English."""
    duration = _duration_minutes(assigned_time)
    dates_str = '\n'.join(
        f'{_DATE_INDENT}{d.strftime("%Y/%m/%d")}' for d in session_dates
    )

    if lang == 'zh':
        suffix = f' ({duration}分鐘)' if duration else ''
        schedule_section = (
            f'上課時間：逢星期{_DAY_ZH.get(assigned_day, assigned_day)} {assigned_time}{suffix}'
        )
        if session_dates:
            schedule_section += (
                f'\n上課日期：\n{dates_str}\n{_DATE_INDENT}(共{lessons_paid}堂)'
            )
        return f"""家長您好，以下是 MathConcept中學教室 常規課程 之【上課安排】：

{_identity_lines(school_student_id, student_name, 'zh')}
{schedule_section}

MathConcept 中學教室 ({_LOCATION_ZH.get(location, location)})"""

    suffix = f' ({duration} minutes)' if duration else ''
    schedule_section = (
        f'Schedule: Every {_DAY_EN.get(assigned_day, assigned_day)} {assigned_time}{suffix}'
    )
    if session_dates:
        schedule_section += (
            f'\nLesson Dates:\n{dates_str}\n{_DATE_INDENT}({lessons_paid} lessons total)'
        )
    return f"""Dear Parent,

This is the class schedule for the MathConcept Secondary Academy regular course:

{_identity_lines(school_student_id, student_name, 'en')}
{schedule_section}

MathConcept Secondary Academy ({_LOCATION_EN.get(location, location)})"""
