# A browser test for the lease abstracts no longer fails by chance

The browser test for the lease abstract exports (`tests/e2e/abstract-flow.mjs`) failed about one run in four on the step "a confidential deal's workbook is named CONFIDENTIAL and is marked on its sheets". The app was behaving correctly. The test clicked the Workbook button first and only then started waiting for the download, so a download that arrived quickly was missed.

- **The test now starts waiting for the download before the click**, the way the other two downloads in the same file already do. Nothing in the app changed.
- **Tested:** the flow was run eight times in a row after the change and passed 71 of 71 every time; before the change it failed twice in six runs. A search of every browser test found no other download wait that comes after its click.
- Saved results and golden outputs do not change; no app code is touched.
