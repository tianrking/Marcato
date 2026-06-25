# Tests

Reusable browser test cases live under `tests/e2e`.

Commands:

- `npm.cmd run test:smoke`: core editor, preview, modals, find, share URL, and mobile shell checks.
- `npm.cmd run test:pdf`: PDF pagination structure checks for long tables, repeated headers, headings, math, and diagrams.
- `npm.cmd run test:perf`: large-document segmented preview baseline.
- `npm.cmd run test:diagrams`: local Markmap/WaveDrom plus remote diagram normalization, retry, and SVG sanitization checks.
- `npm.cmd test`: runs all of the above.

Generated screenshots and JSON metrics are written to `test-artifacts/` and are ignored by git.
