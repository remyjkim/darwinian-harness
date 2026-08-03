#!/usr/bin/env bash
# Convert a PDF (or every *.pdf in a directory) to Markdown with OCR'd text + LaTeX math.
# Usage: ./convert-pdf.sh <input.pdf | input-dir> <output-dir>
set -euo pipefail

INPUT="${1:?usage: convert-pdf.sh <input.pdf|input-dir> <output-dir>}"
OUTDIR="${2:?usage: convert-pdf.sh <input.pdf|input-dir> <output-dir>}"

if ! command -v marker_single >/dev/null 2>&1; then
  echo "marker_single not found; installing marker-pdf via uv (Python 3.12)..." >&2
  command -v uv >/dev/null 2>&1 || { echo "error: uv is required but not on PATH" >&2; exit 1; }
  uv tool install --python 3.12 marker-pdf
fi

mkdir -p "$OUTDIR"
convert() { marker_single "$1" --force_ocr --redo_inline_math --output_dir "$OUTDIR"; }

if [ -d "$INPUT" ]; then
  shopt -s nullglob
  pdfs=("$INPUT"/*.pdf)
  [ ${#pdfs[@]} -gt 0 ] || { echo "error: no *.pdf in $INPUT" >&2; exit 1; }
  for f in "${pdfs[@]}"; do echo "converting: $f" >&2; convert "$f"; done
else
  convert "$INPUT"
fi
echo "done -> $OUTDIR" >&2
