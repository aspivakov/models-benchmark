# Models Benchmark

A structured extraction benchmark that compares LLM models across Anthropic, OpenAI, and Google Gemini on a real-world NLP task: parsing job posting descriptions into a canonical JSON schema.

Each model reads plain-text job postings from `input/` and produces a JSON file per posting. Results are written to `output/<model-slug>/` and include latency, token usage, cost, and the extracted payload — making it straightforward to compare accuracy, speed, and cost across models.

## What it benchmarks

The task is structured data extraction from unstructured text. Every model receives the same system prompt and the same job posting, and must return a JSON object with these fields:

| Field                 | Description                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------- |
| `title`               | Job title                                                                                 |
| `company`             | Company name                                                                              |
| `location`            | City, country, or region                                                                  |
| `remote_policy`       | `remote` / `hybrid` / `on-site` / `not specified`                                         |
| `salary_range`        | As stated in the posting, or empty string                                                 |
| `benefits`            | Array of benefits or empty array                                                          |
| `required_skills`     | Array of required skills                                                                  |
| `nice_to_have_skills` | Array of nice-to-have skills                                                              |
| `years_experience`    | Required experience, or empty string                                                      |
| `seniority`           | `intern` / `junior` / `mid` / `senior` / `lead` / `principal` / `staff` / `not specified` |

## Supported models

| Config key            | Model                     | Provider  | Mode                                         |
| --------------------- | ------------------------- | --------- | -------------------------------------------- |
| `haiku`               | claude-haiku-4-5-20251001 | Anthropic | standard                                     |
| `sonnet`              | claude-sonnet-4-6         | Anthropic | standard                                     |
| `sonnet-thinking`     | claude-sonnet-4-6         | Anthropic | extended thinking (high-effort, 3 files max) |
| `gpt4o-mini`          | gpt-4o-mini               | OpenAI    | standard                                     |
| `gpt4o`               | gpt-4o                    | OpenAI    | standard                                     |
| `o4-mini`             | o4-mini                   | OpenAI    | reasoning (high-effort, 3 files max)         |
| `gemini-flash`        | gemini-2.5-flash          | Gemini    | standard                                     |
| `gemini-pro`          | gemini-2.5-pro            | Gemini    | standard                                     |
| `gemini-pro-thinking` | gemini-2.5-pro            | Gemini    | thinking (high-effort, 3 files max)          |

**High-effort configs** (`sonnet-thinking`, `o4-mini`, `gemini-pro-thinking`) are expensive and require you to pass exactly 3 input filenames explicitly, so you can control cost.

## Prerequisites

- Node.js 20+
- API keys for the providers you want to test

## Setup

```bash
npm install
```

Create a `.env` file in the project root:

```env
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
```

You only need the keys for the providers you intend to run.

## Input files

Place job posting descriptions as plain `.txt` files inside the `input/` folder. Files can vary in complexity — short and minimal postings, verbose multi-section descriptions, poorly formatted copy-pastes, and everything in between. Variety in complexity makes the benchmark more meaningful.

## Creating ground-truth JSONs

Before running any model, **manually read each source file in `input/` and create a corresponding ground-truth JSON** — one per posting, following the same schema described above. Store these in a separate folder (e.g. `ground_truth/`).

Hand-crafting these is intentional: automated extraction is the thing being tested, so the source of truth must come from a human reading the original text. Once you have ground-truth files you can diff model outputs against them field-by-field to measure accuracy rather than just comparing models against each other.

## Running the benchmark

Standard configs process all `.txt` files in `input/` automatically:

```bash
npm run run:haiku
npm run run:sonnet
npm run run:gpt4o-mini
npm run run:gpt4o
npm run run:gemini-flash
npm run run:gemini-pro
```

High-effort configs require exactly 3 filenames to keep costs predictable:

```bash
npm run run:sonnet:thinking -- jp1.txt jp5.txt jp12.txt
npm run run:o4-mini -- jp1.txt jp5.txt jp12.txt
npm run run:gemini-pro-thinking -- jp1.txt jp5.txt jp12.txt
```

Use the most confusing files to test with high-effort configs, preferrably when corresponding cheaper model fails to parse correctly.

## Output structure

```
output/
  claude-haiku-4-5/
    jp1.json
    jp2.json
    ...
  claude-sonnet-4-6/
    jp1.json
    ...
  claude-sonnet-4-6_high_effort/
    jp1.json
    ...
```

Each JSON file contains the full `RunResult` including extracted fields, token counts, cost, and latency.

## Comparing results

With ground-truth JSONs in place, compare per field:

- **Exact match rate** on categorical fields (`remote_policy`, `seniority`)
- **Presence/absence accuracy** on skill arrays
- **Latency** (`latencyMs`) for time-sensitive use cases
- **Cost** (`costUsd`) to evaluate price/accuracy trade-offs

## License

MIT
