---
type: plan
topic: Trial Mastery module — delivery redesign for behavior change
date: 2026-04-28
status: draft
version: 1
---

# Trial Mastery — Delivery Redesign Plan
### Turning a content module into a behavior change system

---

## Diagnosis

The module has a content problem and a delivery problem. The content problem is largely solved — the material is rich, accurate, and well-structured. The delivery problem is systemic and not fixable by improving the content further.

**The core failure**: The module is a closed system. A teacher completes it, acquires knowledge, then walks into a trial two weeks later with no active connection between what they learned and what they're doing. The feedback loop that would reinforce the knowledge — "I used X technique, the parent enrolled" — never closes inside the module. The knowledge decays (Ebbinghaus: 90% gone in a week without reinforcement), the behavior doesn't change, and the conversion rate stays flat.

**The secondary failure**: Teachers who already convert at some rate — even poorly — believe they are competent (Dunning-Kruger). The module, as designed, gives them no reason to revise that belief. It contains no mirror, no benchmark, no moment of productive discomfort. So they click through it to comply.

**What the research converges on**: Four mechanisms are missing. Everything else in this plan is a derivative of these four.

---

## The Four Missing Mechanisms

### 1. Visible competence signal at the point of behavior
Every major framework — Self-Determination Theory (Deci & Ryan), Csikszentmihalyi's flow research, Kluger & DeNisi's 607-study feedback meta-analysis — points to the same thing: motivation and behavior change require feedback that the person can attribute to their own actions. Right now, a teacher cannot connect "I did Part C objections training" to "my last three trials converted." The TCScore exists. The conversion data exists. None of it is inside the module.

**Without this, everything else is theory.**

### 2. Retrieval at the moment of task execution
Roediger & Karpicke's retrieval practice research (*Psychological Science*, 2006) shows that testing outperforms studying — 61% retention vs 40% after a week. More critically, Morris et al.'s Transfer-Appropriate Processing principle shows that memory is most accessible when the retrieval context matches the encoding context. Teachers who learn objection scripts by reading text will not retrieve them fluently in a live, conversational, emotionally pressured trial session. The training must reach them *at* the trial, not two weeks before it. Currently, there is no mechanism for this.

### 3. Identity framing before content delivery
Dweck's mindset research and Aronson's self-affirmation work both show that experienced workers disengage when training threatens their self-concept ("if I need training, I must be bad"). The current module begins with content immediately. There is no frame that says: *you already know how to teach — this is about understanding why your trials convert, so you can do more of what works.* That frame is not motivational padding — it is a psychological prerequisite for receptive engagement, especially in the 200+ teachers who already have some conversion history.

### 4. Implementation intentions throughout
Gollwitzer's 94-study meta-analysis (*Advances in Experimental Social Psychology*, 2006) found an average effect size of d = 0.65 for if-then planning vs. regular goals. The structure: *"When [specific situation in a trial] arises, I will [specific behavior]."* Right now, every section ends with information. None of them end with a concrete commitment. Information without commitment is passive. Commitment triggers are what close the training-to-behavior gap.

---

## Proposed Changes — Tiered by Impact

### Tier 1 — Build first. High impact. Self-contained in the module.

These do not require any external API integration or system changes. They are changes to `index.html` only.

---

**T1-A: Identity frame at the start (before the intro quiz)**

Replace the current intro sequence with a 2-step frame before Part A begins:

Step 1 — Acknowledgement prompt:
> "Before we start — how many trials have you taken so far?"
> ○ This is my first   ○ A few (2–10)   ○ I've done many (10+)

Step 2 — Personalised frame based on answer:
- *First trial*: "This module gives you the exact framework top-converting teachers use. By the end, you'll know what to do in every situation a parent throws at you."
- *A few trials*: "You've already seen what a trial feels like. This module will help you understand *why* some trials converted and some didn't — so you can do more of what worked."
- *Many trials*: "You have real experience. This module will give you a name and a system for things you've already been doing instinctively — and close the gaps you haven't identified yet."

**Psychological mechanism**: Aronson self-affirmation + Dweck growth frame. Doesn't threaten competence. Opens receptivity.
**Effort**: Low. One new intro slide per region, branched on a radio input.

---

**T1-B: TCScore bridge — honest explanation of how trial allocation works**

Add a single dedicated slide early in Part A (after the market context slide, before archetypes). No live data pull required. Static, honest text:

> **How Cuemath allocates trials**
>
> Cuemath has more teachers than trials available at any given time. Trials are not assigned randomly — they are allocated based on your Trial Conversion Score (TCScore), which reflects your conversion rate over recent trials.
>
> A higher TCScore means you are prioritised for the next available trial. A lower TCScore means you may wait longer. This is the direct, mechanical link between your conversion rate and your earning capacity.
>
> This module exists because the techniques in it have a measurable impact on conversion. Teachers who apply them systematically convert more. That's the only reason it exists.

**Psychological mechanism**: Transparent loss aversion framing (Fryer et al. NBER field experiment showed loss-framed incentives produced 0.2–0.4 SD improvement in teacher performance vs. near-zero for gain-framed). Removes the "I thought trials were random" belief. Creates an honest stake. Does not threaten self-concept — it informs it.
**Effort**: Low. One new section slide per region.

---

**T1-C: Implementation intention prompts at the end of every section**

Every section currently ends with a "Got it →" button. Replace this with a micro-commitment before the button. Two formats:

*Format A — pre-written if-then selection (lower friction):*
> "Before you move on — which of these will you try in your next trial?"
> ○ "When a parent asks about homework, I'll say: [X]"
> ○ "When the parent seems distracted, I'll [Y]"
> ○ "When the child loses focus, I'll [Z]"
> → Then: "Got it →" becomes active

*Format B — open text commitment (higher engagement, higher drop-off):*
> "In your own words: the next time [situation from this section] happens in a trial, you will..."
> [text input field]

Use Format A by default. Format B as an optional "go deeper" link.

**These commitments are saved locally** (localStorage) and surfaced in the pre-trial brief card (see T1-D).

**Psychological mechanism**: Gollwitzer implementation intentions (d = 0.65 effect size). The if-then structure encodes the response plan directly into long-term memory in a context-linked way — not as abstract knowledge but as a stimulus-response pair.
**Effort**: Medium. One micro-commitment component added per section (HTML + localStorage logic). Can be shipped per-Part, not all at once.

---

**T1-D: Pre-trial activation card — a 60-second brief before every trial**

This is the highest-leverage single addition. A new view inside the module, accessible via:
- A direct link/button on the module home screen: "Preparing for a trial? Open your brief →"
- A URL fragment that jumps directly to it: `index.html#pretrial`

The card surfaces:
1. The top 3 implementation intentions the teacher committed to (from T1-C, stored in localStorage)
2. One scenario question from the SRS deck relevant to the session (e.g., if they're doing a KS2 trial, surface a KS2-specific card)
3. A single "I'm ready" confirmation button (which logs the pre-trial prep event to the tracking sheet)

This takes 60 seconds. It requires zero module navigation. It delivers the training content *at* the moment of task execution.

**Psychological mechanism**: Fogg's Behavior Model (prompt at the moment of motivation + ability convergence). BJ Fogg: "Tiny Habits" anchor behavior. Transfer-Appropriate Processing — the brief is in a conversational, task-activated mental context matching the retrieval context.
**Effort**: Medium. New view (HTML section), localStorage reads, one new tracking event. Does not require external API.

---

**T1-E: Social proof copy embedded in section headers**

Each Part intro and each section that has supporting conversion data should include a single-line benchmark:

> *"Teachers who applied this section's techniques improved their Part B conversion by an average of [X]%"*

Initially this can be estimated/placeholder text ("top-performing teachers consistently cite this as the highest-impact section"). Once tracking data accumulates from the live module, replace with real aggregate data from the tracking sheet.

The benchmark framing must include both the descriptive norm AND the mechanism — not just "X% more" but "because [specific behavior]." Schultz et al. (2007) showed that descriptive norms alone cause a boomerang effect for above-average performers. The mechanism attribution prevents this.

**Psychological mechanism**: Cialdini social proof + Festinger social comparison + Nunes & Drèze endowed progress effect.
**Effort**: Very low. Copy changes only. No code changes.

---

**T1-F: Scenario-based retrieval practice within sections (replace passive reading)**

The current sections are structured as: explanation → examples → TL;DR. Retrieval practice research (Roediger & Karpicke) shows this is the least effective format for long-term retention. A more effective structure: short framing → challenge scenario → reveal → TL;DR.

Change 3–4 key sections (the highest-stakes ones: probe ladder, objection handling, closing sequence) to this format:

> **[Parent scenario]**
> *"A parent says: 'My son is already doing fine in school — I'm not sure why we need this.' What do you do first?"*
> ○ Acknowledge and reframe immediately
> ○ Ask a clarifying question about their goal
> ○ Show them the Student Insights feature
>
> → Reveal + explanation

This is not a quiz. It is contextualised retrieval practice — the teacher engages with the concept in the format of the actual situation they'll face.

**Psychological mechanism**: Transfer-Appropriate Processing (Morris et al., 1977). Encoding in conversational stimulus-response format matches the retrieval context of a live trial.
**Effort**: Medium. Requires content redesign of 3–4 sections (not all). The quiz infrastructure already exists; this reuses it inside sections.

---

### Tier 2 — High impact. Requires a system touchpoint outside the module.

These require either a notification system, an API call, or a post-trial trigger. They are the right direction but need a decision on system ownership first.

---

**T2-A: TCScore visibility inside the module (live data)**

At login, after the teacher enters their email, a lightweight API call to CueTeacher returns their current conversion rate and TCScore (or a simplified version of it). This is displayed as:

> *"Your current trial conversion rate: 38%*
> *Average for your region: 44% | Top quartile: 61%*
> Teachers in the top quartile get priority allocation for the next available trials.*"

This creates the visible competence signal that the research identifies as the single highest-leverage intervention. It also makes the TCScore bridge (T1-B) personal rather than generic.

**Dependency**: CueTeacher API must expose this endpoint. This is a product/engineering decision.
**Psychological mechanism**: SDT competence need + Kluger & DeNisi behavior-specific feedback + Festinger social comparison with percentile framing.
**Effort**: Medium-high (API integration). The module-side display is simple; the API work is the dependency.

---

**T2-B: Post-trial reflection loop**

After a trial is marked complete in CueTeacher, push a notification (email or app) that links to a 90-second reflection in the module:

> "How did your trial go?"
> 1. Did the parent raise any objections? [Yes / No / Wasn't sure]
> 2. Which technique did you use? [Select from 5–6 options from Part C]
> 3. What was the outcome? [Enrolled / Thinking / Didn't convert]

This data: (a) trains teachers to make the connection between technique and outcome, (b) populates aggregate data for the T1-E social proof benchmarks, (c) creates the investment step in the Hooked model (Eyal) — the teacher has authored their own performance data, making them more likely to return to the module.

**Dependency**: Post-trial trigger from CueTeacher system. The reflection itself lives in the module.
**Effort**: High (system trigger). Reflection UI is low effort once the trigger exists.

---

**T2-C: Notification-triggered pre-trial brief**

When a trial is assigned in CueTeacher, the push notification deep-links directly to `index.html#pretrial` (the T1-D card). This removes the friction of remembering the module exists. The brief card is already there — the notification just eliminates the memory/motivation dependency.

**Dependency**: CueTeacher notification system must support deep links. One link format change.
**Effort**: Very low on the module side. Depends on notification system capability.

---

### Tier 3 — Valuable but lower priority or more complex.

**T3-A: Skill progression / mastery tree**
Visual representation of which sections the teacher has "mastered" based on SRS card performance + section ack + quiz scores. Satisfies Octalysis Core Drive 2 (Development & Accomplishment) for high-motivation teachers who want depth signals.

**T3-B: Advanced scenario unlocks**
After passing the final quiz, unlock an "Advanced Scenarios" section with edge cases (difficult parents, multi-child households, competitor switch scenarios). This is specifically for high-motivation teachers and creates a reason to return post-completion.

**T3-C: Personalised SRS based on weak sections**
Currently the SRS deck is fixed. A smarter deck serves cards biased toward sections where the teacher scored poorly in part quizzes or has low ack engagement. Requires cross-referencing quiz responses with SRS card topics.

---

## What NOT to Build

**Generic badges** (Module Complete, Quiz Passed): These are controlling, not informational (Rigby & Ryan, *Glued to Games*). They will accelerate the compliance-tick behavior you're trying to escape.

**Leaderboards**: Teachers are geographically dispersed, don't know each other, operate independently. Social comparison requires perceived similarity and proximity (Garcia et al., 2013). A leaderboard of 500 anonymous teachers produces no social comparison motivation.

**Mandatory re-completion timers**: Forcing teachers to redo sections on a calendar interval creates resentment, not engagement. The SRS deck already handles spaced retrieval — it's sufficient.

**Streak mechanics** (unbroken login streaks): Streaks generate anxiety about breaking them, which degrades intrinsic motivation (Eyal, *Indistractable*). Use progress continuity instead — "you've completed X sections, 3 more to your next milestone."

---

## Decisions Needed from You

Before any code work starts, these decisions need to be made:

1. **TCScore API**: Is it feasible to expose teacher conversion rate via an API that the module can query at login? This is T2-A and is the highest-leverage intervention in the entire plan. If yes, what's the timeline? If no, can we at least show a manually-set cohort average as a benchmark without live data?

2. **Implementation intentions — stored where?**: The T1-C commitments can be stored in localStorage (private to the browser, disappears if they clear storage) or sent to the tracking sheet via the existing GAS web app (permanent, visible to managers). Which do you want?

3. **Pre-trial brief format**: The T1-D brief card is self-contained. The T2-C notification deep-link requires CueTeacher integration. Do you want to build T1-D first as a standalone (works, but teacher must remember to open it) and add the notification trigger later? Or hold T1-D until the notification can be wired?

4. **Sections to convert to scenario-based format (T1-F)**: Which 3–4 sections do you want to prioritise for the scenario-based retrieval redesign? My recommendation: Probe Ladder (B2), Handling Objections intro (C1), Closing Sequence (E2), and one archetype section. But you know the content better than I do.

5. **Social proof copy (T1-E)**: Should the initial benchmarks be estimated/directional ("this is one of the highest-impact sections") or held until we have real tracking data from live usage? Real data will be more effective, but it requires a go-live cohort first.

---

## Summary Table

| Change | Impact | Effort | Dependencies | Tier |
|---|---|---|---|---|
| T1-A: Identity frame at start | High | Low | None | 1 |
| T1-B: TCScore bridge (static) | High | Low | None | 1 |
| T1-C: Implementation intentions per section | Very High | Medium | None | 1 |
| T1-D: Pre-trial activation card | Very High | Medium | None | 1 |
| T1-E: Social proof copy | Medium | Very Low | None (or tracking data later) | 1 |
| T1-F: Scenario-based retrieval (3–4 sections) | High | Medium | Content decisions | 1 |
| T2-A: Live TCScore at login | Very High | High | CueTeacher API | 2 |
| T2-B: Post-trial reflection loop | High | High | CueTeacher post-trial trigger | 2 |
| T2-C: Notification deep-link to brief | High | Low (module side) | CueTeacher notification system | 2 |
| T3-A: Skill progression tree | Medium | Medium | None | 3 |
| T3-B: Advanced scenario unlocks | Medium | Medium | None | 3 |
| T3-C: Personalised SRS | Medium | High | None | 3 |

---

## Recommended Build Order

If you approve this plan, the recommended sequence is:

**Sprint 1** (module-only, no external dependencies):
T1-B → T1-A → T1-C (start with 2–3 sections) → T1-D → T1-E

T1-B first because the honest TCScore explanation reframes everything that follows. T1-A second so the identity frame is in place before Part A. T1-C and T1-D together because they share localStorage state.

**Sprint 2** (content redesign):
T1-F (scenario-based sections, your content decisions first)

**Sprint 3** (system integrations, once API/notification work is scoped):
T2-C → T2-A → T2-B

**Later** (post-launch data):
T1-E benchmarks updated with real data. T3 tier based on engagement patterns from tracking.

---

*Sources: Deci & Ryan SDT; Gollwitzer (1999) implementation intentions; Roediger & Karpicke (2006) retrieval practice; Fryer et al. (2012) NBER teacher incentives field experiment; Kluger & DeNisi (1996) feedback meta-analysis; Fogg (2019) Tiny Habits; Clear (2018) Atomic Habits; Dweck (2006) Mindset; Kruger & Dunning (1999); Heath & Heath (2010) Switch; Chou (2015) Octalysis; Nunes & Drèze (2006) endowed progress; Cialdini (1984/2021) Influence; Festinger (1954) social comparison theory.*
