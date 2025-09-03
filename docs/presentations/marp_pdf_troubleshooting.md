# Marp PDF Export - Troubleshooting Guide

## Fixed in PDF-Optimized Version

### ✅ What I Fixed

1. **Reduced padding and margins**
   - Boxes: 20px → 12px padding
   - Section: 40px-50px padding (optimized)
   - Margins: 20px → 15px

2. **Improved line spacing**
   - Line height: 1.8 → 1.5
   - List item spacing: optimized

3. **Split dense content**
   - Smart Features: 1 slide → 2 slides
   - Comparisons: Better organized
   - Removed all AI image prompts from slides

4. **Added two-column layouts**
   - Before/After comparison
   - Feature comparisons
   - Better space utilization

5. **Optimized font sizes**
   - Body: 28px (readable in PDF)
   - H1: 42px
   - H2: 36px
   - H3: 32px

## Additional PDF Export Tips

### Command Line Options
```bash
# Basic PDF export
marp curriculum_system_pitch_pdf_optimized.marp.md --pdf

# With custom page size (if still clipping)
marp curriculum_system_pitch_pdf_optimized.marp.md --pdf --pdf-notes

# High quality output
marp curriculum_system_pitch_pdf_optimized.marp.md --pdf --pdf-outlines
```

### VS Code Marp Extension
1. Open the PDF-optimized file
2. Ctrl+Shift+P → "Marp: Export Slide Deck"
3. Choose "PDF" format
4. Select quality: "High"

### Manual CSS Adjustments (if needed)

If still having issues, you can adjust these values:

```css
section {
  padding: 35px 45px; /* Reduce further if needed */
  font-size: 26px;    /* Smaller font if content dense */
}

ul {
  line-height: 1.4;   /* Tighter spacing */
}

.highlight, .cost-box, .problem-box, .solution-box {
  padding: 10px;      /* Even smaller padding */
  margin: 10px 0;     /* Reduced margins */
}
```

### Alternative Export Methods

#### Method 1: HTML then Print
```bash
# Export to HTML first
marp curriculum_system_pitch_pdf_optimized.marp.md --html

# Open in browser, print to PDF with:
# - Margins: Minimum
# - Scale: 90-95%
# - Paper size: A4 Landscape
```

#### Method 2: PowerPoint then PDF
```bash
# Export to PowerPoint
marp curriculum_system_pitch_pdf_optimized.marp.md --pptx

# Open in PowerPoint, then Save As PDF
```

## Content Guidelines for Future Slides

### ✅ PDF-Friendly Practices
- **Max 5-6 bullet points** per slide
- **Short bullet points** (one line preferred)
- **Use boxes sparingly** (they take extra space)
- **Avoid long code blocks** or ASCII art
- **Split complex slides** into multiple slides

### ❌ Avoid These for PDF
- Long image prompts in slide content
- More than 8 bullet points per slide
- Excessive CSS padding/margins
- Small font sizes (<24px for body text)
- Complex multi-column layouts

## Testing Your Slides

### Before Final Export
1. **Preview each slide** in VS Code Marp extension
2. **Check for content overflow** (red text cutoff warnings)
3. **Test on different screen sizes**
4. **Export a small sample** (2-3 slides) first

### PDF Quality Check
1. **Open exported PDF** in Adobe Reader
2. **Zoom to 100%** - text should be crisp
3. **Check all slides** for clipped content
4. **Print preview** to verify margins

## Quick Fixes for Common Issues

### Problem: Text Still Clipping
**Solution**: Reduce content or split slide
```markdown
# Before (Too Much)
- Point 1 with long explanation
- Point 2 with details
- Point 3 with context
- Point 4 with examples
- Point 5 with more info

# After (Split to 2 slides)
## Slide 1
- Point 1 with explanation
- Point 2 with details
- Point 3 with context

## Slide 2 (continued)
- Point 4 with examples  
- Point 5 with more info
```

### Problem: Boxes Too Large
**Solution**: Use simpler formatting
```markdown
# Before
<div class="highlight">
Long content in a box with lots of padding
</div>

# After
**Key Point:** Long content in bold text (no box)
```

### Problem: Low PDF Quality
**Solution**: Use higher DPI export
```bash
marp --pdf --pdf-outlines your-file.md
```

The PDF-optimized version should resolve your clipping issues. Try exporting it and let me know if you need further adjustments!