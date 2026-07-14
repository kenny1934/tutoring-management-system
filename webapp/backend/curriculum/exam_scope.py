"""Resolve exam-scope text from calendar events into curriculum concepts.

Schools publish what an upcoming test covers in the calendar event
description: chapter codes ("第21章", "24.1", "Ch7"), topic names
("一次函數", "Quadratic Functions"), or a mix. This module parses that
text mechanically. Two channels:

- Name channel: normalised match against the concept vocabulary
  (bilingual names + hand aliases for common phrasings, ported from the
  proven dry-run matcher).
- Chapter-code channel: 人教 numbering is continuous and publisher-fixed
  (ch 1-10 = MAS 7xx, 11-20 = 8xx, 21-29 = 9xx), so bare codes resolve
  positionally for MAS-series schools. HK textbook chapter numbers are
  edition-dependent (each school's textbook orders chapters differently
  from our master list), so bare HK codes are deliberately left
  unresolved rather than guessed.

When a line carries both a code and a name, agreement raises confidence
and the name wins a conflict (schools on the 2024 人教 edition renumber
F1 chapters; names stay truthful).

Pure module: no DB session state, no caching. Callers build a
ScopeMatcher from vocabulary rows (load_scope_matcher for a session) and
keep it as long as they like.
"""
import html
import re
import unicodedata
from collections import Counter, defaultdict

# --- text normalisation -----------------------------------------------------

_SIMP2TRAD = {
    '数': '數', '线': '線', '组': '組', '测': '測', '验': '驗', '温': '溫',
    '复': '複', '习': '習', '图': '圖', '阶': '階', '综': '綜', '进': '進',
    '负': '負', '应': '應', '练': '練', '归': '歸', '两': '兩', '与': '與',
    '轴': '軸', '对': '對', '称': '稱', '积': '積', '运': '運', '术': '術',
    '实': '實', '变': '變', '边': '邊', '长': '長', '关': '關', '单': '單',
    '项': '項', '极': '極', '绝': '絕', '义': '義', '约': '約', '众': '眾',
    '据': '據', '频': '頻', '证': '證', '识': '識', '统': '統', '计': '計',
    '设': '設', '钝': '鈍', '锐': '銳', '错': '錯', '问': '問', '题': '題',
    '间': '間', '简': '簡', '带': '帶', '师': '師', '几': '幾', '余': '餘',
    '减': '減', '况': '況', '准': '準', '别': '別', '则': '則', '剩': '剩',
    '区': '區', '历': '歷', '参': '參', '双': '雙', '发': '發', '员': '員',
    '周': '週', '圆': '圓', '块': '塊', '标': '標', '决': '決', '样': '樣',
    '级': '級', '类': '類', '总': '總', '论': '論', '轨': '軌', '迹': '跡',
    '斜': '斜', '们': '們', '视': '視', '尔': '爾', '选': '選', '递': '遞',
}


def _s2t(s):
    return "".join(_SIMP2TRAD.get(ch, ch) for ch in s)


def normalize(s):
    s = unicodedata.normalize("NFKC", str(s)).lower()
    s = _s2t(s)
    s = re.sub(r'[.　·•‧\-–—_,，、;；:：/\\()（）\[\]{}【】"\'\s]+', " ", s)
    return re.sub(r"\s+", " ", s).strip()


_CN_DIGITS = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
              "六": 6, "七": 7, "八": 8, "九": 9}


def _chinese_numeral(s):
    """一..二十九 -> int (only the range chapter numbers can take)."""
    if not s:
        return None
    if s.isdigit():
        return int(s)
    if "十" in s:
        tens, _, units = s.partition("十")
        value = (_CN_DIGITS.get(tens, 1) if tens else 1) * 10
        if units:
            if units not in _CN_DIGITS:
                return None
            value += _CN_DIGITS[units]
        return value if (not tens or tens in _CN_DIGITS) else None
    return _CN_DIGITS.get(s)


# --- hand aliases (common scope phrasings not in the concept names) ---------
# Keyed by series code; resolved to concept ids when the matcher is built,
# so entries whose code is absent from the vocabulary are skipped safely.

_MAS_ALIASES = {
    '絕對值': '701', '正負數': '701', '有理數加減': '701', '有理數乘除': '701',
    '有理數的加減法': '701', '有理數的乘除法': '701', '乘方': '701',
    '科學記數法': '701', '近似數': '701',
    '整式的加減': '702', '單項式': '702', '多項式': '702', '合併同類項': '702',
    '去括號': '702', '代數式': '702', '列代數式': '702',
    '解方程': '703', '移項': '703', '等式的性質': '703', '一元一次方程應用': '703',
    '線段': '704', '幾何圖形': '704', '立體圖形': '704',
    '平行線': '705', '相交線': '705', '垂線': '705', '同位角': '705',
    '內錯角': '705', '命題': '705', '平移': '705',
    '平方根': '706', '立方根': '706', '算術平方根': '706', '無理數': '706',
    '平面直角坐標系': '707', '點的坐標': '707', '坐標': '707',
    '二元一次方程': '708', '代入消元法': '708', '加減消元法': '708',
    '三元一次方程組': '708', '代入法': '708', '消元': '708',
    '不等式': '709', '一元一次不等式': '709', '不等式組': '709',
    '一元一次不等式組': '709',
    '抽樣': '710', '條形圖': '710', '扇形圖': '710', '直方圖': '710',
    '折線圖': '710', '數據的收集': '710', '收集數據': '710',
    '三角形的邊': '801', '三角形的角': '801', '內角和': '801', '外角': '801',
    '多邊形': '801', '多邊形的內角和': '801',
    '全等': '802', '全等三角形': '802', '全等三角形的判定': '802',
    '角平分線的性質': '802',
    '軸對稱': '803', '等腰三角形': '803', '等邊三角形': '803',
    '垂直平分線': '803', '最短路徑': '803',
    '整式乘法': '804', '冪的運算': '804', '因式分解': '804', '平方差公式': '804',
    '完全平方公式': '804', '乘法公式': '804', '提公因式': '804',
    '十字相乘': '804', '同底數冪': '804', '冪': '804', '分組分解法': '804',
    '分式方程': '805', '分式運算': '805', '分式的加減': '805',
    '分式的乘除': '805', '負整數指數冪': '805',
    '二次根式的加減': '806', '二次根式的乘除': '806', '最簡二次根式': '806',
    '二次根式運算': '806',
    '勾股定理逆定理': '807', '勾股逆定理': '807', '逆定理': '807',
    '平行四邊形': '808', '矩形': '808', '菱形': '808', '正方形': '808',
    '梯形': '808', '中位線': '808', '特殊平行四邊形': '808',
    '平行四邊形的性質與判定': '808',
    '一次函數': '809', '函數': '809', '正比例函數': '809', '函數圖像': '809',
    '待定係數法': '809', '函數定義': '809', '解析式': '809',
    '平均數': '810', '中位數': '810', '眾數': '810', '方差': '810',
    '加權平均數': '810', '數據分析': '810',
    '一元二次方程': '901', '配方法': '901', '公式法': '901', '因式分解法': '901',
    '根的判別式': '901', '韋達定理': '901', '根與係數': '901',
    '二次函數': '902', '拋物線': '902', '頂點式': '902', '二次函數圖像': '902',
    '中心對稱': '903', '圖形的旋轉': '903', '中心旋轉': '903',
    '垂徑定理': '904', '圓周角': '904', '圓心角': '904', '切線': '904',
    '弧長': '904', '扇形面積': '904', '內接': '904', '切線長': '904',
    '正多邊形': '904', '弦心距': '904', '圓外角': '904', '圓內角': '904',
    '圓內接四邊形': '904', '點和圓': '904', '直線和圓': '904', '弧': '904',
    '弦': '904', '弦切角': '904', '正多邊': '904', '切線長定理': '904',
    '內切圓': '904', '外接圓': '904', '圓的有關性質': '904',
    '概率': '905', '列表法': '905', '樹狀圖': '905', '隨機事件': '905',
    '反比例函數': '906',
    '相似三角形': '907', '相似': '907', '位似': '907', '黃金分割': '907',
    '平行線分線段成比例': '907',
    '銳角三角函數': '908', '正弦': '908', '餘弦': '908', '正切': '908',
    '解直角三角形': '908', '三角比': '908', '應用舉例': '908',
    '投影': '909', '三視圖': '909', '視圖': '909',
}

_HK_ALIASES = {
    'directed numbers': '702', 'number line': '702',
    'algebra': '703', 'algebraic expressions': '703', 'formulating': '703',
    'linear equations': '704', 'equations in one unknown': '704',
    'percentage': '705', 'percentages': '705', 'percentage change': '705',
    'percentages i': '705', 'profit and loss': '705', 'discount': '705',
    '百分數': '705', '百分法': '705', '折扣': '705', '盈虧': '705',
    'estimation': '706', 'approximation': '706', 'significant figures': '706',
    '估算': '706', '近似值': '706',
    'introduction to geometry': '707', '3d figures': '707', 'polyhedra': '707',
    'areas and volumes': '708',
    'coordinates': '709', 'distance between two points': '709',
    'angles related to lines': '710', 'parallel lines': '710',
    'polynomials': '711', 'laws of indices': '711', 'indices': '711',
    '指數律': '711',
    'statistics': '712', 'statistical diagrams': '712', 'stem and leaf': '712',
    '統計圖': '712',
    'rates': '801', 'ratios': '801', 'ratio': '801', 'proportion': '801',
    'rate and ratio': '801', 'rate': '801', 'applications of ratio': '801',
    'identities': '802', '恆等式': '802',
    'factorization': '803', 'factorisation': '803', 'cross method': '803',
    '十字相乘法': '803',
    'algebraic fractions': '804', 'formulae': '804', 'formulas': '804',
    'change of subject': '804',
    'errors': '805', 'measurement': '805', '誤差': '805', '量度的誤差': '805',
    'angles of polygon': '806', 'rectilinear figures': '806', 'polygons': '806',
    'histogram': '807', 'frequency polygon': '807',
    'simultaneous equations': '808', 'simultaneous linear equations': '808',
    '聯立方程': '808',
    'congruence': '809', 'congruent triangles': '809',
    'similarity': '810', 'similar triangles': '810',
    'square roots': '811', 'pythagoras': '811', 'pythagoras theorem': '811',
    '畢氏定理': '811',
    'surds': '812', 'irrational numbers': '812', 'rational numbers': '812',
    '根式': '812',
    'cylinders': '813', 'prisms': '813', 'sectors': '813', 'arc': '813',
    '圓柱': '813',
    'trigonometry': '814', 'trigonometric ratios': '814', 'trig': '814',
    '三角學': '814',
    'quadratic equations': '901', 'more about factorization': '901',
    '二次方程': '901',
    'laws of integral indices': '902', 'scientific notation': '902',
    'integral indices': '902', 'zero index': '902',
    'inequalities': '903', 'linear inequalities': '903',
    'simple interest': '904', 'compound interest': '904',
    'salaries tax': '904', 'interests and salaries': '904',
    'percentages ii': '904', 'more about percentage changes': '904',
    'successive percentage changes': '904',
    'mensuration': '813',
    'special lines': '905', 'centres of triangle': '905', 'circumcentre': '905',
    'incentre': '905', 'centroid': '905', 'orthocentre': '905',
    'quadrilaterals': '906', 'parallelograms': '906', 'rhombus': '906',
    'trapezium': '906', '四邊形': '906', 'rectangles': '906',
    'operations involving brackets': '702',
    'expected values': '912', 'expected value': '912',
    'central tendency': '907', 'mean': '907', 'median': '907', 'mode': '907',
    'coordinate geometry': '909', 'slope': '909', 'straight lines': '909',
    '斜率': '909', '直線方程': '909',
    'trigonometric relations': '910', 'trigonometric identities': '910',
    'trigonometry relation': '910',
    'applications of trigonometry': '911', 'application of trigonometry': '911',
    'gradient': '911', 'inclination': '911', 'elevation': '911',
    'depression': '911', 'bearing': '911',
    'probability': '912', '機率': '912',
}

# Extension concepts have no series codes; alias by exact name_en instead.
_EXT_ALIASES = {
    '綜合除法': 'Remainder and Factor Theorems (Polynomial Division)',
    '多項式除法': 'Remainder and Factor Theorems (Polynomial Division)',
    '餘式定理': 'Remainder and Factor Theorems (Polynomial Division)',
    '因式定理': 'Remainder and Factor Theorems (Polynomial Division)',
    'remainder theorem': 'Remainder and Factor Theorems (Polynomial Division)',
    'factor theorem': 'Remainder and Factor Theorems (Polynomial Division)',
    'polynomial division': 'Remainder and Factor Theorems (Polynomial Division)',
    'synthetic division': 'Remainder and Factor Theorems (Polynomial Division)',
    'sequences': 'Sequences', '數列': 'Sequences',
    '等差數列': 'Sequences', '等比數列': 'Sequences',
    'sets': 'Sets and Venn Diagrams', 'venn diagrams': 'Sets and Venn Diagrams',
    'venn': 'Sets and Venn Diagrams', '集合': 'Sets and Venn Diagrams',
    '文氏圖': 'Sets and Venn Diagrams',
    'travel graphs': 'Travel Graphs', '行程圖': 'Travel Graphs',
    'distance time graphs': 'Travel Graphs',
}

# Lines that describe the event rather than its topics.
_NONTOPIC = [
    (re.compile(r'(?i)holiday|假期|christmas|easter|新年|寒假|暑假|春節'), "holiday"),
    (re.compile(r'(?i)mid[- ]?term|期中|中段考?|\but\d?\b|統測|统测'), "exam"),
    (re.compile(r'(?i)final|期末|大考|考試|考试|exam(?!ple)'), "exam"),
    (re.compile(r'(?i)^test\b|測驗|测验|quiz|小測|大測'), "test"),
    (re.compile(r'(?i)revision|複習|复习|溫習|温习|^rev\b|統整'), "revision"),
    # Textbook exercise-set refs and material names — not topics.
    (re.compile(r'(?i)^ex\.?\s*\d|^supp\.?\s|^syllabus\b|worksheet|工作紙'), "material"),
    (re.compile(r'(?i)教科書|上[冊册]|下[冊册]|學案|功課本|課堂檢測|筆記|練習冊'), "material"),
    (re.compile(r'(?i)calculator|計算機'), "note"),
]

# Strand headers used to group scope lines ("代數:", "幾何:") — grouping
# labels, not topics; matching them to a concept would be noise.
_STRAND_WORDS = {
    "代數", "幾何", "統計", "數據", "數據處理", "數學", "algebra", "geometry",
    "statistics", "number", "data handling",
}

# Publisher markers seen in scope text. 人教 pins the MAS positional map;
# any other recognised marker means "some other textbook's numbering" and
# switches the chapter-code channel off for the lines it governs.
_PUBLISHERS = {"人教": "MAS", "文風": "OTHER"}
_PUBLISHER_RE = re.compile(r"[(（](人教|文風)[)）]")

_SPLIT_RE = re.compile(r"[\n/;；+]+|[,，、]\s*(?=[^)）]*(?:[(（]|$))")
_PERCENT_RE = re.compile(r"\d+(?:\.\d+)?\s*%")
_CH_WESTERN_RE = re.compile(r"(?i)\bch(?:apter)?\.?\s*(\d{1,2})(?:\s*[-~–至]\s*(\d{1,2}))?")
_CH_CJK_RE = re.compile(r"第\s*([0-9一二三四五六七八九十]{1,3})\s*(?:[-~–至]\s*([0-9一二三四五六七八九十]{1,3})\s*)?章")
# No \b: CJK counts as \w so "第24.3" would never anchor; the lookbehind
# also stops x.y.z chains ("24.2.2") from re-matching at the ".2.2" tail.
_SECTION_RE = re.compile(r"(?<![\d.])(\d{1,2})\.\d{1,2}")
_NOISE_LINE_RE = re.compile(r"^[\s\-–—*·•:：\d%.、,，()（）~至及和與+]*$")

_GRADE_ORDER = {"F1": 1, "F2": 2, "F3": 3, "F4": 4, "F5": 5, "F6": 6}

# Channel confidences. Bare MAS codes sit below name matches because the
# 2024 人教 edition renumbers F1 chapters; a name on the same line settles it.
CONF_AGREE = 0.95
CONF_NAME_EXACT = 0.9
CONF_CODE = 0.8
CONF_NAME_FUZZY = 0.7
CONF_CONFLICT = 0.7


def _contains(haystack, needle):
    """Substring test that respects word boundaries for ASCII terms.

    normalize() collapses punctuation to single spaces, so padding both
    sides makes " ratio " miss "mensuration". CJK has no word boundaries;
    raw containment is correct there.
    """
    if needle.isascii():
        return f" {needle} " in f" {haystack} "
    return needle in haystack


def _mas_code_for_chapter(n):
    """人教 continuous chapter number -> MAS code (publisher-fixed order)."""
    if 1 <= n <= 10:
        return str(700 + n)
    if 11 <= n <= 20:
        return str(800 + n - 10)
    if 21 <= n <= 29:
        return str(900 + n - 20)
    return None


class ScopeMatcher:
    """Concept vocabulary compiled for scope parsing.

    concepts: iterable of (id, name_en, name_zh, kind, grade) rows.
    aliases: iterable of (concept_id, code_space, code) rows.
    """

    def __init__(self, concepts, aliases):
        self.grade_of = {}
        by_name_en = {}
        # term index: normalised term -> {(concept_id, series): weight}
        self.term_index = defaultdict(dict)
        self.mas_concepts = defaultdict(set)   # MAS code -> concept ids
        series_of = defaultdict(set)

        for cid, space, code in aliases:
            series = "MAS" if space == "MAS" else "HK"
            series_of[cid].add(series)
            if space == "MAS":
                self.mas_concepts[str(code)].add(cid)

        def add_term(term, cid, weight):
            n = normalize(term)
            # Single CJK characters are legitimate chapter names (圓); the
            # exact-match channel needs them. Single ASCII chars are noise.
            if len(n) < 2 and not ("一" <= n[:1] <= "鿿"):
                return
            tags = series_of.get(cid) or {None}
            for series in tags:
                key = (cid, series)
                if self.term_index[n].get(key, 0) < weight:
                    self.term_index[n][key] = weight

        for cid, name_en, name_zh, kind, grade in concepts:
            self.grade_of[cid] = grade
            if name_en:
                by_name_en[name_en] = cid
                add_term(name_en, cid, 3)
            if name_zh:
                add_term(name_zh, cid, 3)

        alias_maps = {"MAS": _MAS_ALIASES, "HK": _HK_ALIASES}
        code_concepts = {"MAS": self.mas_concepts, "HK": defaultdict(set)}
        for cid, space, code in aliases:
            if space in ("HK_NEW",):
                code_concepts["HK"][str(code)].add(cid)
        for series, table in alias_maps.items():
            for term, code in table.items():
                for cid in code_concepts[series].get(code, ()):
                    add_term(term, cid, 2)
        for term, name_en in _EXT_ALIASES.items():
            cid = by_name_en.get(name_en)
            if cid is not None:
                add_term(term, cid, 2)

    # -- name channel --------------------------------------------------------

    def _match_name(self, n, series):
        if not n:
            return None
        cand = Counter()
        exact = self.term_index.get(n)
        if exact:
            for (cid, s), w in exact.items():
                cand[(cid, s)] += w * 3
            fuzzy = False
        else:
            if len(n) < 3:
                return None
            for term, hits in self.term_index.items():
                if len(term) >= 3 and (_contains(n, term) or _contains(term, n)):
                    ratio = min(len(term), len(n)) / max(len(term), len(n))
                    if ratio > 0.25:
                        for (cid, s), w in hits.items():
                            cand[(cid, s)] += w * (2 if _contains(n, term) else 1) * ratio
            fuzzy = True
        if not cand:
            return None
        if series in ("MAS", "HK"):
            cand = Counter({k: v * (2 if k[1] == series else 1)
                            for k, v in cand.items()})
        (cid, _), _score = cand.most_common(1)[0]
        return cid, (CONF_NAME_FUZZY if fuzzy else CONF_NAME_EXACT)

    # -- code channel (MAS positional only; see module docstring) ------------

    def _match_codes(self, part, series):
        if series != "MAS":
            return set()
        chapters = set()
        for m in _CH_CJK_RE.finditer(part):
            lo = _chinese_numeral(m.group(1))
            hi = _chinese_numeral(m.group(2)) if m.group(2) else lo
            if lo and hi and lo <= hi <= lo + 6:
                chapters.update(range(lo, hi + 1))
        stripped = _CH_CJK_RE.sub(" ", part)
        for m in _CH_WESTERN_RE.finditer(stripped):
            lo, hi = int(m.group(1)), int(m.group(2) or m.group(1))
            if lo <= hi <= lo + 6:
                chapters.update(range(lo, hi + 1))
        for m in _SECTION_RE.finditer(stripped):
            chapters.add(int(m.group(1)))
        cids = set()
        for n in chapters:
            code = _mas_code_for_chapter(n)
            if code:
                cids.update(self.mas_concepts.get(code, ()))
        return cids

    # -- line parsing ----------------------------------------------------------

    def parse(self, description, series=None, grade=None):
        """-> list of {text, kind, concepts:[{concept_id, confidence, channel}]}.

        series: the school's series ("MAS"/"HK"/None) — gates the
        chapter-code channel and boosts same-series name candidates.
        grade: event grade for the sanity guard (a bare code resolving to
        a concept above the event's grade is a mis-read, not a scope).
        """
        # Calendar descriptions arrive as HTML more often than not; tags act
        # as line breaks and entities decode before any matching.
        text = html.unescape(str(description or ""))
        text = re.sub(r"<[^<>]{0,120}>", "\n", text)
        text = re.sub(r"[<>]", " ", text)

        lines = []
        context_series = series
        for raw in _SPLIT_RE.split(text):
            part = raw.strip()
            if not part:
                continue

            marker = _PUBLISHER_RE.search(part)
            line_series = context_series
            if marker:
                line_series = _PUBLISHERS[marker.group(1)]
                remainder = _PUBLISHER_RE.sub(" ", part).strip()
                if not remainder:
                    # A standalone "(人教)" line governs the lines after it.
                    context_series = line_series
                    continue

            cleaned = _PERCENT_RE.sub(" ", _PUBLISHER_RE.sub(" ", part))
            # A line that is nothing but section codes ("22.1至22.3") still
            # belongs to the code channel; only drop numeric lines the section
            # pattern cannot read.
            if _NOISE_LINE_RE.fullmatch(cleaned) and not _SECTION_RE.search(cleaned):
                continue
            # Splitting "x^2+bx+c" on '+' leaves algebraic crumbs like "bx";
            # no real topic is a couple of ASCII characters.
            if cleaned.strip().isascii() and len(normalize(cleaned)) <= 2:
                continue

            head, sep, rest = cleaned.partition(":")
            if not sep:
                head, sep, rest = cleaned.partition("：")
            if sep and normalize(head) in _STRAND_WORDS:
                cleaned = rest.strip()
                if not cleaned:
                    lines.append({"text": part, "kind": "strand", "concepts": []})
                    continue
            if normalize(cleaned) in _STRAND_WORDS:
                lines.append({"text": part, "kind": "strand", "concepts": []})
                continue

            kind = "topic"
            for rx, tag in _NONTOPIC:
                if rx.search(cleaned):
                    kind = tag
                    break

            code_cids = self._match_codes(cleaned, line_series)
            name_hit = self._match_name(normalize(cleaned), line_series)

            concepts = []
            if name_hit and code_cids:
                cid, _ = name_hit
                if cid in code_cids:
                    concepts = [{"concept_id": cid, "confidence": CONF_AGREE,
                                 "channel": "code+name"}]
                else:
                    concepts = [{"concept_id": cid, "confidence": CONF_CONFLICT,
                                 "channel": "name"}]
            elif name_hit:
                cid, conf = name_hit
                concepts = [{"concept_id": cid, "confidence": conf,
                             "channel": "name"}]
            elif code_cids:
                concepts = [{"concept_id": cid, "confidence": CONF_CODE,
                             "channel": "code"}
                            for cid in sorted(code_cids)]

            # Guard bare-code resolutions only: a code mapping to a concept
            # above the event's grade is a mis-read (wrong edition, wrong
            # textbook). Explicit names are trusted — schools teach ahead of
            # our grade filing often enough.
            if grade in _GRADE_ORDER:
                limit = _GRADE_ORDER[grade]
                concepts = [
                    c for c in concepts
                    if c["channel"] != "code"
                    or _GRADE_ORDER.get(self.grade_of.get(c["concept_id"]), 0)
                    <= limit
                ]

            lines.append({"text": part, "kind": kind, "concepts": concepts})
        return lines


def summarize(lines):
    """Aggregate parsed lines -> ({concept_id: {confidence, channel, lines}},
    unmatched topic lines). Nontopic/strand lines never count as unmatched."""
    concepts = {}
    unmatched = []
    for line in lines:
        if line["concepts"]:
            for c in line["concepts"]:
                entry = concepts.get(c["concept_id"])
                if entry is None or c["confidence"] > entry["confidence"]:
                    concepts[c["concept_id"]] = {
                        "confidence": c["confidence"],
                        "channel": c["channel"],
                        "lines": [line["text"]],
                    }
                elif line["text"] not in entry["lines"]:
                    entry["lines"].append(line["text"])
        elif line["kind"] == "topic":
            unmatched.append(line["text"])
    return concepts, unmatched


def apply_stored_rows(concepts, stored_rows, description):
    """Overlay persisted AI/manual rows onto a mechanical summary.

    Rows are keyed to the description line they were parsed from; if that
    line no longer appears in the (re-synced) description, the row is
    stale and skipped, so edits to the scope self-invalidate old AI calls.
    Manual rows always outrank; AI rows fill gaps but never demote a
    mechanical match.
    """
    desc_norm = normalize(description or "")
    for row in stored_rows:
        line_norm = normalize(row["matched_text"] or "")
        if line_norm and line_norm not in desc_norm:
            continue
        entry = concepts.get(row["concept_id"])
        if row["source"] == "manual":
            concepts[row["concept_id"]] = {
                "confidence": 1.0, "channel": "manual",
                "lines": [row["matched_text"]],
            }
        elif entry is None:
            concepts[row["concept_id"]] = {
                "confidence": float(row["confidence"]), "channel": "ai",
                "lines": [row["matched_text"]],
            }
    return concepts


def load_scope_matcher(db):
    """Build a ScopeMatcher from the live vocabulary tables."""
    from sqlalchemy import text as sql_text
    concepts = db.execute(sql_text("""
        SELECT id, name_en, name_zh, kind, COALESCE(grade, atlas_grade)
        FROM curriculum_concepts
    """)).fetchall()
    aliases = db.execute(sql_text("""
        SELECT concept_id, code_space, code FROM concept_code_aliases
    """)).fetchall()
    return ScopeMatcher(concepts, aliases)


def school_series(db, school):
    """The series a school's evidence points at ("MAS"/"HK"/None).

    Weighs the school's topic observations by which code space their
    concepts belong to — the same signal the backfill uses to pick a
    series for ambiguous sheet strings.
    """
    from sqlalchemy import text as sql_text
    # Deduplicate aliases per (concept, side) first: most HK concepts carry
    # both an HK_NEW and an HK_OLD row, and a bare join would double their
    # weight against MAS.
    rows = db.execute(sql_text("""
        SELECT a.s, SUM(o.confidence) AS w
        FROM school_topic_observations o
        JOIN (
            SELECT DISTINCT concept_id,
                   CASE WHEN code_space = 'MAS' THEN 'MAS' ELSE 'HK' END AS s
            FROM concept_code_aliases
        ) a ON a.concept_id = o.concept_id
        WHERE o.school = :school
        GROUP BY a.s
    """), {"school": school}).fetchall()
    if not rows:
        return None
    return max(rows, key=lambda r: float(r.w or 0)).s
