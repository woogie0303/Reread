# The free tier is capped by quantity, not by quality

Free readers get the same sentence-in-context AI answer that paying readers get — they just
get fewer of them per month. The obvious alternative, giving free readers a cheap
context-free gloss and reserving the AI for subscribers, was rejected: a context-free gloss
is precisely the failure this product exists to fix, so that free tier would demonstrate the
app being wrong rather than being good, and readers would conclude the app is broken instead
of concluding they want more of it.

## Consequences

- Cost exposure is bounded by the cap rather than by tier, and is small: one ask (~500 in /
  ~150 out on a small model) was estimated at ₩2 but measures about ₩14 on Haiku 4.5 (a page-wide ask carries several sentences; ~$0.01 each), and a single ask returns every candidate in the
  sentence, so cost per saved item is lower still.
- Running out of asks must not break anything — the capture still succeeds and becomes a
  _Pending Ask_. The pile of unanswered sentences is the upsell surface, which is why
  rewarded ads are offered there, only once the monthly quota is spent, rather than
  interstitials before an ask.
- **One exception, decided later:** tapping the photo (OCR) button shows a single
  interstitial before the camera opens. Typing a sentence by hand never shows an ad, and a
  failed ad load never blocks the camera. The rewarded ad grants `ASK_AD_BONUS_USD` of budget (default
  $0.01, about one ask), capped at `ASK_AD_DAILY_LIMIT` per day (default 3) — at ₩14 an ask, a rewarded view (~₩15–30) only just pays for one ask, so more than that loses money. There is no server-side
  verification (SSV) of the ad network's callback yet, so the daily cap is what bounds the
  damage of a forged request.
- **The cap is measured in model cost, not in asks** (decided later). One ask can carry one
  sentence or five, so counting asks let the expensive ones through at the same price. Each
  answered ask records its share of the call's real token cost, and the monthly cap is a
  budget (`ASK_MONTHLY_BUDGET_USD`, default $0.20 ≈ 20 asks). The app shows the share used
  as a percentage and an approximate number of asks left — never the money, and never
  hidden until it runs out, because a meter that appears only at the end feels like a trap.
- **The model was switched and the numbers retuned** (decided later). Asks moved from Haiku 4.5
  (~$0.01 per ask) to Gemma 4 26B on Cloudflare Workers AI. Measured with thinking mode off:
  ~875 tokens in / ~210 out for a two-sentence ask, about **$0.0002 per ask** (≈1/65 of Haiku),
  2–7 seconds. With thinking on it took 17–38 seconds and billed ~2,000 hidden output tokens, so
  the request switches it off. The caps follow the cost, not the other way round: defaults are now
  `ASK_MONTHLY_BUDGET_USD=0.03` (≈150 asks), `ASK_TYPICAL_COST_USD=0.0002`,
  `ASK_AD_BONUS_USD=0.004` (≈20 asks; a rewarded view now pays for dozens of asks, so it can give
  more than one), `ASK_AD_DAILY_LIMIT=3`. The provider and model are swappable
  (`ASK_PROVIDER`, `ASK_MODEL`; `asks/model/`), and **every `ASK_*` budget number must be
  re-measured when the model changes** — the "≈ N asks" figures above are only true for the model
  they were measured on.
- Pricing is hard to walk back once public. Moving later from a quantity cap to a quality
  split would take features away from existing free users.
