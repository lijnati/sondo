# HACKATHON.md — Rules, judging strategy, deliverables, compliance

Sources (retrieved 2026-10-15):
- Official rules: https://qloo.devpost.com/rules
- Overview / requirements: https://qloo.devpost.com/
- Developer guide (page `updatedAt: 2026-10-07`): https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide

> Per the rules, the Official Rules override the overview page and all other materials if they conflict (Rules §11).

## 1. Key dates (Eastern Time)

| Event | Date |
|---|---|
| Registration and submission period | Sep 30, 2026 9:00 am – **Oct 30, 2026 11:45 pm** |
| **Sondo internal submission target** | **Oct 29, 2026 6:00 pm** (about 30 h buffer) |
| Judging period | Nov 2, 2026 12:00 pm – Nov 16, 2026 11:45 pm |
| Winners announced | On or around Nov 23, 2026 3:00 pm |

Submissions can't be edited after Oct 30, 11:45 pm (Rules §5). Qloo hackathon keys stay active through judging and are deactivated after the hackathon (dev guide).

## 2. Eligibility (Rules §3)
- Individuals at or above the age of majority, Teams, and Organizations are eligible.
- **Excluded:** residents of Brazil, Quebec, Russia, Crimea, Cuba, Iran, North Korea, and any other OFAC-sanctioned region. Also excluded: Qloo/Devpost employees and their families, judges and their employers, and anyone with a conflict of interest.
- Projects funded by, contracted by, or commercially licensed from Qloo are ineligible.
- ⚠ **Action:** the entrant must confirm their residence and eligibility (see Decisions in ROADMAP.md).

## 3. Project requirements (Rules §4)
- **What to create:** "a working software application that integrates the Qloo API and that either (a) functions as an agentic tool, (b) is built using an agent framework, or (c) integrates the Qloo API into an existing agent."
- **Theme (overview page):** "If your submission would work the same without Qloo, you're building the wrong thing." Cultural intelligence must be the differentiator.
- **New or existing:** Sondo is newly created inside the submission period (started 2026-10-15). ✅
- **Third-party integrations:** we must be authorized under each service's terms (LLM provider, Vercel, Neon). ✅
- **Original work and IP:** we own the work. Open source dependencies are fine if we comply with their licenses.

## 4. Submission requirements
Required by both the rules and the overview page:
1. **Link to a functional demo**: live, end to end, **externally hosted and fully published**. "Submissions that only run locally or rely on private access will not qualify."
2. **Public repo URL** (GitHub, GitLab or Bitbucket) with all source, assets and run instructions.
3. **Open source license file**, "detectable and visible at the top of the repository page (in the About section)". GitHub only detects a standard `LICENSE` file at the repo root.
4. **Text description** of the features and functionality, plus what makes the project "Qloo-powered".
5. **Free, unrestricted access** for the sponsor, administrator and judges **until the Judging Period ends (Nov 16)**. If login is required, test credentials must be provided. Sondo will have **no login**.
6. Materials in English.
- A demo video is **not required** (overview page). But the rules say judges "may choose to judge based solely on the text description, images, and video". A short optional video and screenshots are cheap insurance.

## 5. Judging (Rules §6)
- **Stage One (pass/fail):** the project "reasonably fits the theme and reasonably applies the required APIs".
- **Stage Two:** four **equally weighted** criteria. Ties are broken in this order:
  1. **Technological Implementation:** "How thoroughly and skillfully does the project use Qloo? Does the code reflect genuine effort and a working, non-trivial implementation?"
  2. **Design:** "complete, coherent product experience, not just a technical proof of concept"
  3. **Potential Impact:** "credible, specific case for solving a real problem for a real audience … based on what's demonstrated"
  4. **Quality of the Idea:** "creative, non-obvious use of Qloo … genuine understanding of the problem space"
- Judging "may utilize expert panels, peer review, **automated AI-driven analysis**". The README and Devpost text therefore need to be well structured and explicitly mapped to the criteria.
- Judges include Jason Calacanis, Mike Diolosa (Qloo CTO), Nicole Seligman, Todd Boehly, Cedric the Entertainer and Michael Abrams (Live Nation). The audience is investors and media/entertainment operators, so lead with a business problem, not plumbing.
- Prizes: $15k / $6k / $4k, one prize per project. There is also a bonus: Jason Calacanis will personally invest $25k in his favorite entry.

## 6. Judging strategy — how Sondo scores on each criterion

| Criterion | What we demonstrate | Evidence the judge can see |
|---|---|---|
| Technological implementation (tiebreak #1) | Multi-endpoint Qloo use: `/search`, `/v2/tags`, `/v2/audiences`, and `/v2/insights` across 6+ entity types with demographic, audience and location signals, explainability, and (if available) taste analysis and compare. Bounded agent with typed tools, an evidence ledger and deterministic claim validation. | The live **tool trace** panel shows every Qloo call, its parameters (key-free), latency and result count. Tests and the architecture doc are in the repo. |
| Design | One coherent flow from brief to live research to report to evidence. Editorial, data-honest UI, with real empty and error states. | The deployed app and its featured example reports |
| Potential impact | Marketers pick cultural partners and channels by gut feel or expensive panels. Sondo gives a cited, testable hypothesis set in about 90 s. It is honest about what affinity does and doesn't mean. | Every strategy has a "How to validate" test plan, plus a limitations box |
| Quality of the idea | **Audience lift** (what this audience over-indexes on compared with a location baseline) and **distinctiveness** (high affinity but low mainstream popularity, i.e. under-priced cultural levers) are non-obvious uses of Qloo's affinity × popularity data. | A lift and distinctiveness visualization, with each point clickable to its evidence |

## 7. Compliance risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| C1 | **No Qloo API key yet.** Keys are "provisioned manually … a few business days". 15 days remain. | **Critical** | Request a key today if not already done. Ask in Discord #api-help if there's no key by Oct 17. The spike is ready to run (`spike/qloo-feasibility.ts`). |
| C2 | The demo must stay live and free until **Nov 16**. Quota or LLM spend could be exhausted by judges or the public. | High | Private server-side Qloo cache (explicitly allowed), featured pre-run reports, per-IP and global daily run caps, and a degraded "cached examples only" mode. Request a quota increase in #api-help. |
| C3 | **No Qloo response data in a public repo** (dev guide). | High | Test fixtures are synthetic (fictional names and fake IDs). Caches and reports live in a private DB. The spike summary is sanitized. `.gitignore` blocks `.qloo-cache/`. |
| C4 | The license must be detected in the GitHub About section. | Medium | Add a standard MIT `LICENSE` at the root in Phase 1, then verify the About sidebar shows it. |
| C5 | Stage One "reasonably applies the required APIs". | Low | Qloo is the core evidence source. No report can be produced without Qloo evidence (enforced by the validator). |
| C6 | Trademark or false-endorsement concerns in demo content. | Low | Featured examples use **fictional brands** seeded with real cultural anchors, plus a "not affiliated with Qloo or any brand shown" footer. |
| C7 | Rules text contains a typo ("must have Qloo 4after …") that is unclear for pre-existing projects. | Info | Not applicable, because Sondo is new. Keep the git history from day 1 to prove it. |
| C8 | Overclaiming (affinity presented as purchase intent or ROI). | Medium (credibility) | Language rules in PRODUCT.md §6, plus a validator that blocks forbidden claim patterns. |

## 8. Submission checklist (complete on Oct 29)
- [x] Production URL loads without login on desktop and mobile. A brand-new brief completes end to end (Oct 27, run `Fla2JFlK1e1C`, completed).
- [x] Featured example reports load from the database with zero Qloo calls (time to first byte 0.7–1.1 s).
- [x] Public GitHub repo, with `LICENSE` (MIT) shown in About (Oct 27).
- [x] README covers the problem, what makes it Qloo-powered, architecture diagram, Qloo endpoints used, run instructions, env vars and limitations.
- [x] No secrets in git history (a full `git log -p --all` scan; the only hit is a fake `db.example.test` test URL). No raw Qloo payloads committed.
- [ ] Devpost text description (drafted in [SUBMISSION.md](SUBMISSION.md)). Screenshots still to attach. Optional 2-min video (script in SUBMISSION.md).
- [x] Testing instructions: "No login. Click any example or create a brief." (SUBMISSION.md demo steps, plus the landing FAQ.)
- [~] Rate limits and kill switch verified by tests (PGlite and route), not on production. Qloo key validity through Nov 16 not yet confirmed with Qloo; the quota request is still to send.
- [ ] Submitted on Devpost before **Oct 29, 6:00 pm ET**. Confirmation screenshot saved.
