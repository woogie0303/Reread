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
- Pricing is hard to walk back once public. Moving later from a quantity cap to a quality
  split would take features away from existing free users.
