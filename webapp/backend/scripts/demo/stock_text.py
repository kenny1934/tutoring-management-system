"""Replacement lines for text that a person typed.

Anything a tutor or admin wrote by hand can mention a student, a parent or a
colleague by name, and no find-and-replace can be sure it caught every one.
So those fields are swapped for a line picked from the pools below. The lines
copy the register of the real notes (short, mostly written Cantonese with
English mixed in) so the demo still reads like a working centre.

Each pool is a list, and a row always gets the same line on every rebuild
because the choice is seeded from the row's id.
"""

POOLS: dict[str, list[str]] = {
    "session_note": [
        "正負數計算不熟練，要多練習",
        "轉數快，但計數有時大意",
        "今堂專注，文字題有進步",
        "上堂有少少分心，要提醒",
        "代數式化簡掌握得幾好",
        "分數運算仲要加強",
        "方程移項成日漏咗變號",
        "幾何證明寫得唔夠完整",
        "Careless with negative signs",
        "Good effort today, finished all CW",
        "Needs more practice on word problems",
        "Asked good questions about factorisation",
        "做題速度慢咗，下堂再跟進",
        "考試前溫習，重點講咗第三章",
        "功課未做完，下堂要補",
        "基礎一般，但肯問問題",
    ],
    "hw_comment": [
        "唔錯，少少大意",
        "有交，大部分啱",
        "計數有時大意",
        "文字題要再睇清楚題目",
        "做得幾好",
        "未做完，下堂補",
        "Mostly correct, check signs",
        "Good work",
        "Show your steps next time",
    ],
    "parent_comm_progress": [
        "同媽媽講咗最近上堂嘅情況，計算有進步",
        "約考試溫習，順便講下比較需要努力嘅部分",
        "上堂積極，交齊功課，文字題仍然要加強",
        "同家長分享咗測驗表現同之後嘅溫習方向",
    ],
    "parent_comm_concern": [
        "最近功課交得唔齊，同媽媽傾咗點樣跟進",
        "上堂比較分心，同爸爸講咗情況",
        "測驗成績退步，約咗多啲溫習時間",
    ],
    "parent_comm_general": [
        "確認下星期上堂時間",
        "通知家長假期停課安排",
        "家長問咗暑期班嘅詳情",
    ],
    "parent_comm_renewal": [
        "提醒家長續報，媽媽話會繼續上",
        "傾咗下一期上堂時間，暫時唔變",
        "家長想轉星期六上堂，續報時一齊安排",
    ],
    "prospect_remark": [
        "理解能力唔錯，鍾意問問題",
        "計數快，但有時粗心",
        "好乖，學校功課比較多",
        "基礎扎實，升中後想繼續上",
        "適應力強，上堂專心",
        "數學一般，媽媽想提早準備升中",
        "鍾意傾計，需要提醒專注",
    ],
    "preferred_time": [
        "想排星期六上午",
        "平日放學後，五點後較好",
        "星期日下午",
        "媽媽想知時間同詳情再決定",
        "Weekday after 5pm",
    ],
    "application_note": [
        "想同朋友一齊上",
        "已傳收費資料",
        "等家長回覆時間",
        "想排星期六下午",
        "需要再確認年級",
    ],
    "unavailability": [
        "7月7-16日",
        "8月第二個星期旅行",
        "7月底至8月初不在澳門",
        "8月24-28日",
        "逢星期三有其他活動",
    ],
    "discount_reason": [
        "家長遲咗確認",
        "之前已答應",
        "早報優惠延長",
        "AUTO PAY FAIL",
        "兄弟姊妹同報",
    ],
    "termination": [
        "想暫停一下，下學期再考慮",
        "轉溫其他科目",
        "時間夾唔到",
        "成績穩定，暫時唔需要補習",
        "搬屋，路程太遠",
        "學校活動太多",
    ],
    "enrollment_remark": [
        "Wechat同媽媽溝通咗轉星期四",
        "Double Lesson",
        "錢係由另一分校轉來",
        "家長要求轉時間",
    ],
    "extension_reason": [
        "補不了堂",
        "老師請假",
        "Exam Rev",
        "weather",
        "遲開始",
        "公司活動所以改作順延",
    ],
    "exercise_remark": [
        "half",
        "剩下",
        "做剩下的回家作業",
        "LV2",
        "all",
    ],
    "memo": [
        "答案未講解，下堂要幫佢對答案",
        "上堂做咗一半，下堂繼續",
        "記得帶返上次測驗卷",
    ],
    "referral": [
        "舊生介紹",
        "小學分校轉介",
        "朋友介紹",
    ],
    "waitlist_note": [
        "新生，想排星期日中午",
        "現讀生，想轉星期二至五",
        "Wants Saturday or Sunday",
        "等有位再通知",
    ],
    "makeup_note": [
        "家長確認咗時間",
        "要再問下家長",
    ],
    "review_note": [
        "老師請假",
        "已同家長確認",
        "延期至下一期",
    ],
    "reschedule_note": [
        "家長提早通知",
        "學校考試",
    ],
    "coverage_note": [
        "代課",
        "支援另一分校",
    ],
}

# Messages between tutors. Each thread is a subject, the message that opens
# it, and replies that fit it, so a thread reads as one conversation. A reply
# gets "Re: " plus its thread's subject, as the app does.
THREADS: dict[str | None, list[tuple[str, str, list[str]]]] = {
    "Announcement": [
        ("下星期假期安排", "各位老師，下星期一公眾假期停課，請提早通知學生。", ["收到", "已經通知咗學生", "收到，thanks!"]),
        ("新學期上堂時間表", "新學期時間表已經更新，請大家睇下自己嘅時段。", ["收到", "星期六個時段想再傾下", "OK 冇問題"]),
        ("教材更新", "新一批工作紙已經放咗入共享資料夾。", ["收到，thanks!", "中二嗰份搵唔到，可唔可以再check下?", "搵到了"]),
        ("Staff meeting this Friday", "Staff meeting this Friday at 1pm in room 2. We'll go through the exam revision plan.", ["Noted", "I'll be 10 minutes late", "OK"]),
    ],
    "Chat": [
        ("影印機壞咗", "二號房部影印機又卡紙", ["我睇下先", "整好咗", "thanks!"]),
        ("Anyone free on Saturday?", "Anyone free to cover my 10:00 class this Saturday?", ["I can take it", "Thanks a lot!", "No problem"]),
        ("課室冷氣", "三號房冷氣好似唔夠凍", ["已經同管理處講咗", "收到"]),
    ],
    "Feedback": [
        ("Feature request: bulk assign homework", "It would help if we could assign the same homework to a whole class at once.",
         ["Good idea, I'll look into it.", "This is in now. Select the sessions and use Assign homework.", "Works well, thanks!"]),
        ("Session page loads slowly", "The session page took a while to load this morning.",
         ["Thanks, I'll check what happened.", "Should be faster now.", "Yes, much better."]),
        ("Typo on the enrolment page", "There's a typo in the confirmation message on the enrolment page.",
         ["Thanks, fixed.", "Thanks!"]),
        ("Calendar view idea", "Could the dashboard show tomorrow's lessons as well as today's?",
         ["Makes sense, I'll add it to the list.", "Thanks"]),
    ],
    "Question": [
        ("How do I book a make-up?", "A student missed today. How do I book the make-up?",
         ["Open the session and use Book make-up. It suggests free slots.", "Got it, thanks!"]),
        ("邊度搵中二試卷?", "請問中二上學期嘅試卷放咗喺邊?", ["喺共享資料夾嘅 Secondary 入面", "搵到了，thanks"]),
    ],
    "Reminder": [
        ("記得點名", "請大家今日收工前點名。", ["收到"]),
        ("續報提醒", "下星期有幾位學生要續報，請留意。", ["收到", "已經通知咗家長"]),
    ],
    "Schedule": [
        ("Timetable for next week", "Next week's timetable is in the shared folder.", ["Thanks"]),
    ],
    None: [
        ("Quick question", "Do you have a minute after class?", ["Sure", "Thanks"]),
    ],
}
