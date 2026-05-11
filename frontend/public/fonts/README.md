# Brand fonts for the PDF export

The PDF export (`src/lib/exportPdf.ts`) loads these TTF files at
runtime and embeds them in the generated document so the export
matches the on-screen brand identity. The files are intentionally
**not** committed to the repo — drop them here manually.

If a file is missing or fails to load, the export still works; jsPDF
falls back to its built-in helvetica / times / courier for that
family. Check the browser console for warnings.

## ⚠️ Use STATIC TTFs, not variable fonts

This is the most common pitfall. Google Fonts now ships **variable**
TTFs by default — a single file with all weights baked into one font
(e.g. `DMSans[opsz,wght].ttf`). jsPDF can't parse the cmap table of
variable fonts and throws `No unicode cmap for font`.

You need the **static** TTFs — one file per weight. They live inside
the `static/` subfolder of the zip you download from Google Fonts.

## Required files

Place these exact filenames in this directory:

```
DMSans-Regular.ttf
DMSans-Medium.ttf
DMSans-Italic.ttf
PlayfairDisplay-Regular.ttf
PlayfairDisplay-Bold.ttf
PlayfairDisplay-Italic.ttf
DMMono-Regular.ttf
DMMono-Medium.ttf
```

## Where to download

All three families are open-licensed (OFL) and available on Google
Fonts.

- DM Sans — https://fonts.google.com/specimen/DM+Sans
- DM Mono — https://fonts.google.com/specimen/DM+Mono
- Playfair Display — https://fonts.google.com/specimen/Playfair+Display

1. Click "Get font" → "Download all"
2. Unzip
3. Open the `static/` subfolder (NOT the variable TTF at the top level)
4. Copy the files matching the names above into this directory

If the family ships only a variable font (no `static/` folder),
generate static TTFs with a tool like fonttools:

```
pip install fonttools
fonttools varLib.mutator "DMSans[opsz,wght].ttf" wght=400 -o DMSans-Regular.ttf
fonttools varLib.mutator "DMSans[opsz,wght].ttf" wght=500 -o DMSans-Medium.ttf
```

Once dropped in here the next PDF export will use them automatically.
