---
name: marker-pdf-conversion
description: Use when converting PDFs (especially equation-heavy, scanned, or slide-deck PDFs) to Markdown with OCR'd text and LaTeX math via marker-pdf, to minimize information loss from figures and rendered equations.
---

# Marker PDF → Markdown (OCR + equations)

Use the bundled `scripts/convert-pdf.sh` to convert a PDF (or a directory of PDFs) to
Markdown with text **and** equations OCR'd into LaTeX, plus extracted figure images.
Prefer this over plain text extraction whenever math fidelity matters — the default PDF
text layer drops math-font glyphs.

## Workflow

1. Check availability:

   ```bash
   command -v marker_single && marker_single --help >/dev/null && echo ok
   ```

2. Convert (the script self-installs marker-pdf via uv on first run):

   ```bash
   # single file -> OUTDIR/<stem>/<stem>.md (+ figure images)
   ./scripts/convert-pdf.sh input.pdf out/

   # every *.pdf in a directory
   ./scripts/convert-pdf.sh pdfs/ mds/
   ```

3. Output layout: `out/<stem>/<stem>.md` with inline `![](…)` figure refs and
   `$…$` / `$$…$$` LaTeX equations.

## Notes

- marker-pdf needs torch; install pins Python 3.12 (3.14 has no compatible wheels).
- The script always passes `--force_ocr --redo_inline_math` — required for faithful math.
- force-OCR runs ~6–7 s/page on CPU; a `TableRec… not compatible with mps` warning is benign.
- For critical equations OCR'd as `\text{...}` placeholders, re-run affected pages with
  `--use_llm` (needs an LLM service / API key). Not the default.

## Safety

- Do not run with sudo. Treat untrusted PDFs as unsafe input; convert in a controlled dir.
