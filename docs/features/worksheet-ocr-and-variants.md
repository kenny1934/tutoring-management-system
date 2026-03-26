# Worksheet OCR & Variant Generation — Implementation Plan

> Reference document for the worksheet OCR feature. Produced 2026-03-26 from codebase exploration + SOTA web research + requirements interview.

## Context

Tutors spend significant time retyping printed math worksheets (F1-F6 HK secondary) into the Document editor. This feature automates that via LLM-based OCR: upload a scanned PDF → get an editable TipTap document with KaTeX math, structural markers, and embedded figure images. Future phases add question-level extraction, auto-solving, and variant generation to build a reusable question pool.

**Priority:** OCR import is the MVP (highest standalone value). Variant generation and solving are follow-ups.

## Requirements

- **Worksheets:** Mostly scans of printed materials. Ignore handwriting. F1-F6 HK math.
- **Content focus:** Algebra-first. Geometry is best-effort (embed image + text description, manual redraw with GeoGebra/JSXGraph).
- **Languages:** English or Chinese. Always convert output to Traditional Chinese.
- **Users:** All tutors.
- **Entry points:** Documents page "Import" button + Courseware Browse tab "Import to Document" button.
- **OCR output:** Single document with structural markers (Question 1, 2... as headings). Future: split into question pool.
- **Geometry:** (a) Embed cropped scan image + (c) text description. Fallback: (b) "redraw manually" marker.
- **Page layout:** Use default layout (not replicate scanned layout).
- **Variants:** Future phase. Linked to source worksheet. Both worksheet-level and question-level.
- **Solutions:** Future phase. Auto-generate into AnswerSection nodes.
- **Volume:** ~5-10 worksheets/day.

## Research Summary (SOTA 2025-2026)

### OCR
- **Gemini 3.1 Flash Lite** (already in our ai_client.py): DocVQA 92.2%, MATH 88.5%, native PDF/image input, structured JSON output, $0.25/1M input tokens. Sufficient for printed worksheet OCR.
- **Gemini 2.5 Pro/Flash:** Higher reasoning for complex math. Use for variant generation.
- **Mistral OCR 3:** 94.3% math accuracy, 2000 pages/min. Separate API — not needed given Gemini.
- **Marker + Surya (open source):** 120 pages/sec. Good fallback but adds infra complexity.

### Variant generation
- AAAI 2025: Skill extraction + recombination from existing problems
- Template-driven: Extract structure, LLM paraphrases + substitutes values
- MathPrompter: Algebraic form with variable substitution
- Key: Human-in-the-loop review needed for quality

### Geometry diagrams
- Still hardest unsolved problem. Sketch2Diagram (ICLR 2025) shows progress but unreliable.
- Practical: LLM describes geometry → regenerate with JSXGraph (we already have this).

---

## Phase 1: Backend — Multimodal AI Client + OCR Endpoint

### 1A. Extend `ai_client.py` with multimodal support

**File:** `webapp/backend/services/ai_client.py`

Add a new function `generate_multimodal()` alongside existing `generate()`:

```python
def generate_multimodal(
    prompt: str,
    images: list[tuple[bytes, str]],  # [(image_bytes, mime_type), ...]
    thinking_level: ThinkingLevelStr = "medium",
    max_output_tokens: int = 8192,
    temperature: float = 0.2,
    model: str = MODEL_ID,
    response_mime_type: str | None = None,        # "application/json" for structured output
    response_schema: dict | None = None,           # JSON schema for structured output
) -> tuple[str, int, bool]:
```

- Constructs `contents` as `[Part(text=prompt), Part(inline_data=Blob(mime_type, data)), ...]`
- Uses `response_mime_type` and `response_schema` in config for Gemini's native structured JSON output
- Same error handling pattern as existing `generate()`
- google-genai >= 1.51.0 already supports this

### 1B. New OCR service module

**New file:** `webapp/backend/services/worksheet_ocr.py`

Responsibilities:
1. Accept PDF bytes
2. Use PyMuPDF (already installed) to render pages to PNG at 300 DPI (reuse pattern from `document_processing.py`)
3. Optionally run handwriting removal on page images (reuse `remove_colored_ink()` from `document_processing.py`)
4. Send page image(s) to Gemini with a structured prompt
5. Parse response into TipTap JSON
6. Convert Simplified Chinese → Traditional Chinese in output (use `opencc` library, lightweight)

**Prompt strategy:**
- System prompt defines the exact TipTap JSON node types available (paragraph, heading, inlineMath, blockMath, orderedList, table, image, answerSection)
- Instructs Gemini to output a JSON array of content nodes per page
- Math expressions must use KaTeX-compatible LaTeX
- Geometry figures: describe in text + flag for manual redraw
- All Chinese text → Traditional Chinese
- Question numbers as heading nodes (enables future question-level extraction)

**Key detail:** Use Gemini's native `response_mime_type: "application/json"` + `response_schema` for reliable structured output (94-97% compliance rate per research). Define a Pydantic schema for the expected output.

### 1C. New API endpoint

**File:** `webapp/backend/routers/documents.py` (add to existing router)

```
POST /documents/import-worksheet
```

- Accepts: `UploadFile` (PDF), optional `remove_handwriting: bool`, optional `title: str`, optional `folder_id: int`
- Flow:
  1. Read PDF bytes
  2. Render pages to images (PyMuPDF)
  3. Optionally clean handwriting
  4. Send each page to Gemini OCR (sequential — pages must maintain order)
  5. Merge page results into single TipTap document JSON
  6. Upload any extracted figure images to GCS (reuse `upload_image()` from `image_storage.py`)
  7. Create Document record with `doc_type="worksheet"`, `content=tiptap_json`
  8. Return created Document
- Auth: `reject_read_only` (same as document creation)

**Synchronous approach:** For a 5-page worksheet at ~5s/page with Gemini Flash Lite, total is ~25s — acceptable for a synchronous request with a loading UI. No SSE needed at 5-10 worksheets/day.

---

## Phase 2: Frontend — Import Worksheet UI

### 2A. Import modal component

**New file:** `webapp/frontend/components/documents/ImportWorksheetModal.tsx`

- Reusable modal triggered from multiple entry points (see 2B)
- UI flow:
  1. **Upload step**: Drag-and-drop or file picker for PDF (or accept pre-loaded PDF bytes from courseware). Show filename + page count preview.
  2. **Options step**: Toggle "Remove handwriting" (default on). Optional title override (defaults to filename). Optional folder selection.
  3. **Processing step**: Show progress ("Processing page 1 of 5..."). Animated spinner.
  4. **Done**: Navigate to `/documents/{id}` (editor) with toast "Worksheet imported successfully"

**Pattern:** Follow existing `CreateDocumentModal` structure in `app/documents/page.tsx` (lines 1164-1284). Reuse `HandwritingRemovalToolbar` options pattern from `components/ui/handwriting-removal-toolbar.tsx`.

### 2B. Entry points (two locations)

**Entry point 1 — Documents page:**
- **File:** `webapp/frontend/app/documents/page.tsx`
- Add "Import" button next to "New Document" (around line 491)
- Add `showImportModal` state
- Icon: `Upload` or `ScanLine` from lucide-react

**Entry point 2 — Courseware Browse tab (PDF preview):**
- **File:** `webapp/frontend/components/courseware/BrowsePdfPreview.tsx`
- Add "Import to Document" button in the footer (alongside existing "Assign" and "Copy Path" buttons)
- Natural workflow: tutor browses PDF files, previews, optionally cleans handwriting, clicks "Import to Document"
- Opens ImportWorksheetModal with PDF pre-loaded (pass `pdfBlobUrl` or cleaned PDF)
- Props: `ImportWorksheetModal` accepts optional `preloadedPdf: { blob: Blob; filename: string }` to skip upload step

### 2C. API function

**File:** `webapp/frontend/lib/document-api.ts`

Add to `documentsAPI`:
```typescript
async importWorksheet(file: File, options?: {
  removeHandwriting?: boolean;
  title?: string;
  folderId?: number;
}): Promise<Document>
```

Uses `FormData` + fetch (similar to existing `uploadImage()`).

---

## Phase 3: Question-Level Extraction & Variants (future)

### 3A. Question metadata extraction

**New endpoint:** `POST /documents/{id}/extract-questions`
- Parses TipTap JSON for question boundaries (heading-based markers)
- Calls Gemini to analyze each question: topic, subtopic, difficulty, answer type, concept tags

### 3B. Variant generation

**New endpoint:** `POST /documents/{id}/generate-variants`
- Accepts: question indices, variant count, constraints (clean answers, difficulty)
- Calls Gemini (2.5 Flash/Pro for stronger reasoning)
- Options: whole worksheet or individual questions

### 3C. Solution generation

**New endpoint:** `POST /documents/{id}/generate-solutions`
- Step-by-step solutions in KaTeX
- Returns as `answerSection` TipTap nodes

### 3D. Variant linking

- Add `source_document_id` column to `documents` table (nullable FK to self)
- Add `is_variant` boolean column
- Frontend: "Variants" badge, drawer to browse related worksheets

---

## Key Files to Modify/Create

| Action | File | Purpose |
|--------|------|---------|
| **Modify** | `webapp/backend/services/ai_client.py` | Add `generate_multimodal()` |
| **Create** | `webapp/backend/services/worksheet_ocr.py` | OCR pipeline + TipTap JSON builder |
| **Modify** | `webapp/backend/routers/documents.py` | Add `POST /import-worksheet` endpoint |
| **Modify** | `webapp/backend/requirements.txt` | Add `opencc-python-reimplemented` |
| **Create** | `webapp/frontend/components/documents/ImportWorksheetModal.tsx` | Import UI (reusable) |
| **Modify** | `webapp/frontend/app/documents/page.tsx` | Add import button + modal trigger |
| **Modify** | `webapp/frontend/components/courseware/BrowsePdfPreview.tsx` | Add "Import to Document" button |
| **Modify** | `webapp/frontend/lib/document-api.ts` | Add `importWorksheet()` API method |

---

## TipTap JSON Output Format (OCR target)

```json
{
  "type": "doc",
  "content": [
    {
      "type": "heading",
      "attrs": {"level": 2, "textAlign": "center"},
      "content": [{"type": "text", "text": "F3 Mathematics Worksheet — Quadratic Equations"}]
    },
    {
      "type": "heading",
      "attrs": {"level": 3},
      "content": [{"type": "text", "text": "Question 1"}]
    },
    {
      "type": "paragraph",
      "content": [
        {"type": "text", "text": "Solve "},
        {"type": "inlineMath", "attrs": {"latex": "2x^2 - 5x + 3 = 0"}},
        {"type": "text", "text": "."}
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {"type": "text", "text": "[Geometry figure: Triangle ABC with right angle at B, AB = 5cm, BC = 12cm]"}
      ]
    },
    {
      "type": "image",
      "attrs": {"src": "https://storage.googleapis.com/csm-inbox-images/documents/...", "alt": "Figure for Question 3"}
    }
  ]
}
```

## Supported TipTap Node Types Reference

**Block nodes:** `heading` (level 1-6), `paragraph`, `orderedList`, `bulletList`, `table`/`tableRow`/`tableCell`/`tableHeader`, `blockquote`, `codeBlock`, `image`, `answerSection`, `geometryDiagram`, `pageBreak`, `taskList`/`taskItem`

**Inline nodes:** `text` (with marks), `inlineMath`, `blockMath`

**Marks:** `bold`, `italic`, `underline`, `strike`, `code`, `link`, `highlight`, `textStyle`, `subscript`, `superscript`

**Answer section:** `{"type": "answerSection", "attrs": {"open": false, "align": "left", "label": ""}, "content": [block+]}`

**Math:** `{"type": "inlineMath", "attrs": {"latex": "..."}}` or `{"type": "blockMath", "attrs": {"latex": "..."}}`

**Image:** `{"type": "image", "attrs": {"src": "...", "alt": "...", "align": null, "width": null}}`

**Geometry:** `{"type": "geometryDiagram", "attrs": {"graphJson": "{...}", "svgThumbnail": "...", "width": null, "align": null}}`

---

## Dependencies

**Backend:** `opencc-python-reimplemented>=0.1.7` (pure Python Simplified→Traditional Chinese)

**Frontend:** None new.

---

## Existing Building Blocks

| Component | File | Reuse for |
|-----------|------|-----------|
| Gemini AI client | `backend/services/ai_client.py` | Extend with multimodal |
| PDF→image pipeline | `backend/routers/document_processing.py` | Reuse PyMuPDF rendering + handwriting removal |
| Image storage | `backend/services/image_storage.py` | Upload extracted figures to GCS |
| Document CRUD | `backend/routers/documents.py` | Create imported document |
| Document model | `backend/models.py` (line 1023) | Store TipTap JSON content |
| TipTap editor | `frontend/components/documents/DocumentEditor.tsx` | Render + edit OCR output |
| Math editor | `frontend/components/inbox/MathEditorModal.tsx` | Edit imported math |
| Geometry editor | `frontend/components/inbox/GeometryEditorModal.tsx` | Redraw geometry figures |
| Handwriting removal | `frontend/components/ui/handwriting-removal-toolbar.tsx` | Preprocessing UI |
| Courseware browser | `frontend/components/courseware/BrowsePdfPreview.tsx` | Entry point for import |
| JSON parsing | `backend/services/progress_insights.py` | Pattern for parsing AI JSON responses |
