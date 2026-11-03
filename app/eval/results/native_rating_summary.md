# Native-speaker rating by system

Means per rater (1-5); counts are items (of the system's items) that at least one rater flagged 'yes'. Items per system are few, so differences of a few tenths are not reliable.

| system | items | natural matea | natural nikola | spelling matea | spelling nikola | ekavian | diacritics | meaning wrong |
|---|---|---|---|---|---|---|---|---|
| free gemma4-31b | 7 | 4.86 | 3.57 | 4.71 | 4.00 | 0 | 1 | 1 |
| polish qwen3.5-9b q8 | 7 | 4.71 | 3.71 | 4.43 | 4.57 | 0 | 0 | 0 |
| free gemma4-8b | 7 | 4.86 | 3.43 | 4.71 | 4.14 | 0 | 1 | 2 |
| code | 7 | 4.43 | 3.14 | 4.71 | 4.14 | 0 | 1 | 0 |
| free gemma4-e4b | 7 | 4.57 | 2.86 | 4.14 | 3.29 | 1 | 3 | 1 |
| free qwen3.5-9b | 7 | 4.71 | 2.71 | 4.57 | 3.71 | 0 | 4 | 1 |
| polish gemma4-31b q8 | 7 | 4.43 | 2.86 | 4.43 | 3.57 | 0 | 4 | 0 |
| free qwen2.5-3b | 7 | 2.57 | 1.43 | 2.57 | 1.71 | 4 | 6 | 4 |
