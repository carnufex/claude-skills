---
type: llm
focus: { source: file, path: issue.md }
---

PASS if issue.md is written in English (headings and prose), even though the request was written in Swedish. An email
address, a quoted user-facing string or a code span in another language is fine.

FAIL if the headings or the prose are in Swedish, or the text mixes Swedish and English prose.
