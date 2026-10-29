# Extraction check against a local LLM (gemma4 8B via Ollama)

Sample: 60 projects with labelled sections + 40 without, seed 7 (100 answered). Gemma was shown the same fixed concept lists as the regexes. **Agreement, not ground truth**: Gemma also makes mistakes. 'Regex precision' = share of regex edges Gemma also chose; 'regex recall' = share of Gemma's choices the regex also found.

## All sampled projects

| Concept type | Regex edges | Gemma edges | Both | Regex precision | Regex recall |
|---|---:|---:|---:|---:|---:|
| Problem | 182 | 315 | 106 | 58% | 34% |
| TargetGroup | 400 | 466 | 250 | 62% | 54% |
| Approach | 253 | 906 | 177 | 70% | 20% |
| Output | 342 | 967 | 268 | 78% | 28% |

### Concepts the regex over-assigns (≥ 8 regex edges, lowest agreement first)

| Concept | Regex edges | Gemma agrees | Agreement |
|---|---:|---:|---:|
| Disadvantaged learners | 19 | 4 | 21% |
| Researchers & academics | 8 | 2 | 25% |
| Learning difficulties & special needs | 10 | 3 | 30% |
| Gamification & game-based learning | 10 | 3 | 30% |
| Research report / study | 23 | 7 | 30% |
| Mobile app / software tool | 16 | 5 | 31% |
| Storytelling & arts-based methods | 19 | 6 | 32% |
| Language learning methods | 9 | 3 | 33% |
| Certification / badges / recognition | 14 | 5 | 36% |
| Mental health & well-being | 13 | 5 | 38% |

### Concepts the regex misses (≥ 8 Gemma edges, lowest recall first)

| Concept | Gemma edges | Regex finds | Recall |
|---|---:|---:|---:|
| Volunteering & service learning | 13 | 0 | 0% |
| Teachers' training needs | 17 | 0 | 0% |
| Open educational resources | 61 | 2 | 3% |
| New partnerships & cooperation | 27 | 1 | 4% |
| Blended / flipped learning | 53 | 2 | 4% |
| Trained participants | 78 | 4 | 5% |
| Curriculum & competence frameworks | 65 | 4 | 6% |
| University students | 15 | 1 | 7% |
| Project / problem-based learning | 89 | 7 | 8% |
| Low quality / relevance of education | 37 | 3 | 8% |

## Labelled sections

| Concept type | Regex edges | Gemma edges | Both | Regex precision | Regex recall |
|---|---:|---:|---:|---:|---:|
| Problem | 97 | 179 | 53 | 55% | 30% |
| TargetGroup | 221 | 295 | 144 | 65% | 49% |
| Approach | 132 | 552 | 98 | 74% | 18% |
| Output | 198 | 601 | 160 | 81% | 27% |

## No sections (whole text matched)

| Concept type | Regex edges | Gemma edges | Both | Regex precision | Regex recall |
|---|---:|---:|---:|---:|---:|
| Problem | 85 | 136 | 53 | 62% | 39% |
| TargetGroup | 179 | 171 | 106 | 59% | 62% |
| Approach | 121 | 354 | 79 | 65% | 22% |
| Output | 144 | 366 | 108 | 75% | 30% |
