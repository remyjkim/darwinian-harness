# @remyjkim/pdf-ocr-card

> Convert PDFs to Markdown with OCR'd text, LaTeX equations, and extracted figures — minimal information loss for math-heavy or scanned documents.

## What it does

- Converts a PDF (or a whole directory of PDFs) to Markdown via marker-pdf, OCR-ing
  every page so rendered equations become LaTeX (`$…$` / `$$…$$`) instead of being lost.
- Ships an executable wrapper (`scripts/convert-pdf.sh`) that self-installs marker-pdf
  via uv (pinned to Python 3.12) and always applies `--force_ocr --redo_inline_math`.
- Extracts figures as image files referenced inline in the output Markdown.

## Recommended for users who...

- Convert equation-heavy, scanned, or slide-deck PDFs (lecture notes, papers, decks)
  where the default text layer drops math-font glyphs.

## Installation

> Requires the [drwn CLI](https://darwiniantools.com).

If this is a new project, run `drwn init` first. Apply the card from your local store
(pin to a strict version for reproducible installs):

```sh
drwn card apply @remyjkim/pdf-ocr-card@^1.0.0
```

## What's included

| Asset | Purpose |
|---|---|
| `marker-pdf-conversion/SKILL.md` | Agent-facing instructions: when/how to OCR a PDF |
| `marker-pdf-conversion/scripts/convert-pdf.sh` | Self-installing wrapper running the verified marker recipe |

## Versions

| Version | Notes |
|---|---|
| v1.0.0 | Initial release |

---

See the [Darwinian Tools documentation](https://docs.darwiniantools.com) for more information on drwn harness cards, installation, version pinning, and project configuration.
