/**
 * Python Domain Prompt
 *
 * Per-project .PROMPT.md content for Python projects.
 * Guides the AI to write Python scripts for the Pyodide environment.
 */

export const PYTHON_DOMAIN_PROMPT = `PROJECT TYPE: Python (Pyodide — browser-based CPython)

This project runs Python scripts in the browser via Pyodide. Scripts execute in a Web Worker and output to a terminal panel.

ENVIRONMENT:
- Python 3.11+ (CPython compiled to WebAssembly)
- Standard library available (math, json, re, collections, itertools, functools, etc.)
- Entry point: /main.py

INSTALLING PACKAGES (REQUIRED for any non-stdlib module):
- ALL third-party packages must be installed via micropip BEFORE importing:
  import micropip
  await micropip.install("numpy")
  await micropip.install("matplotlib")
  import numpy as np
  import matplotlib.pyplot as plt
- This includes numpy, pandas, scipy, matplotlib, etc. — none are pre-loaded
- Always put micropip.install() calls at the top of the script, before any imports of those packages

VISUAL OUTPUT (matplotlib, etc.):
- Save figures to /output/ directory — they appear in the Preview panel:
  import matplotlib.pyplot as plt
  plt.plot([1, 2, 3], [1, 4, 9])
  plt.savefig("/output/plot.png")
  plt.close()
- The /output/ directory is scanned after execution
- Supported formats: .png, .jpg, .svg, .html
- You can also write .html files to /output/ — they will be rendered in the Preview panel

FILE I/O:
- Read/write files using standard open():
  with open("/data.txt", "w") as f:
      f.write("Hello")
  with open("/data.txt", "r") as f:
      content = f.read()
- Files persist within the project's virtual filesystem
- Use /output/ for files you want visible in Preview

PRINT OUTPUT:
- print() writes to the Terminal panel (stdout)
- Errors and tracebacks appear in red (stderr)
- Use print() for all text output — there is no GUI/tkinter

FILE STRUCTURE EXAMPLE:
/main.py          — Entry point (auto-executed)
/utils.py         — Helper modules
/data.csv         — Data files
/output/plot.png  — Visual output (shown in Preview)
/output/index.html — HTML output (rendered in Preview)

CONSTRAINTS:
- No network access (no urllib, no requests to external URLs)
- No subprocess or os.system()
- No threading (single-threaded WebAssembly)
- No input() — scripts are non-interactive
- No tkinter or GUI libraries (use matplotlib savefig for visuals)
- Scripts are terminated after 30 seconds

DO NOT:
- Use input() or interactive prompts
- Try to access the network or spawn processes
- Create build configs or package.json

EXECUTION:
- Run scripts with: python main.py (or python3 main.py)
- Output appears in the Terminal panel and is returned to you
- Scripts timeout after 30 seconds

PREVIEW:
- Use 'preview /path' to show a file in the Preview panel
- Files written to /output/ (e.g., .html, .png) can be previewed
- Example: python main.py && preview /output/chart.html

IMPORTANT:
- Use print() for all text output — it appears in the Terminal
- For visual output, save to /output/ and it shows in Preview`;
