# Ask evaluation set

`qa_hr.jsonl` — 78 questions (66 Croatian, 12 English) for testing the question-answering layer (LangGraph + tools over the
knowledge graph). It is a starter set: extend it as real users ask things.

## Fields

| Field | Meaning |
|---|---|
| `id`, `group` | A–I prefix and group: lookup, statistics, coverage, concept_search, global_themes, path, explain, limits, robustness |
| `lang` | language of the question; the answer must be in the same language |
| `route` | expected router decision: `lookup` · `statistics` · `coverage` · `local` · `global` · `path` · `explain` · `limits` (answer with caveat) · `refuse` |
| `tools` | tools the answer is expected to call (names from `IMPLEMENTATION_PLAN.md` §5). Empty for refusals |
| `answerable` | `false` when the correct reply is a refusal |
| `expected` | strings/numbers that must appear in a correct answer (Croatian number format: `3.830`, `29,4`). `null` = graded on citations and relevance instead |
| `verify` | how `expected` was obtained: `regression` (known, traceable number), `compute` (fill from DuckDB once Phase 0 exists), `gold` (human-judged), `refusal` |
| `source` | where the expected number comes from (EDA report section or screenshot). Re-check against DuckDB after Phase 0; the screenshots were rendered from the planned build, not from the EDA tables |
| `mode` | `local` or `global` GraphRAG for concept questions |
| `follow_up_of` | multi-turn: this question continues another one |
| `note` | what the grader should look for |

## Grading (per question)

1. **Route** matches `route`.
2. **Tools**: the expected tools were called, with sensible arguments.
3. **Facts**: every `expected` string appears; no number contradicts the tool output.
4. **Citations**: every project or organisation id in the answer exists in the tool output; concept answers cite at least one project.
5. **Language**: the answer is in the language of the question.
6. **Refusals**: `answerable: false` questions get a refusal that says why; none invents an answer.
7. **Money**: any grant figure names its measure (grants coordinated / value of projects involved in / participations).

Not all checks apply to every question. Items 3, 5 and 6 are automatic; "relevant concepts" in concept and global
questions needs a human or a stronger judge model on a sample.

## Known gaps in the set

- `compute` questions (B04, B11, C07, I02) have no fixed answer yet.
- H11 needs a poisoned summary fixture in `tests/fixtures/`.
- G04 and D08 depend on Phase 2 (aliases, acronym expansion).
- No questions yet for the "first project" ladder (Phase 5) or Croatian dialect/spelling variants beyond missing diacritics.
