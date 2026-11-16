# Pilot kit — 5 restaurants

Everything needed to run the two-week pilot: an onboarding script, one-page
guides for the owner and the kitchen, a printable QR stand, and the feedback
survey with the System Usability Scale (SUS target ≥ 70).

## 1. Pilot at a glance

| Item | Value |
|---|---|
| Scope | 5 restaurants, 1–3 tables each, lunch + dinner service |
| Duration | 10 service days |
| Success signals | SUS ≥ 70, zero lost orders, order-to-kitchen p95 ≤ 2 s, ≤ 1% API errors |
| Support channel | WhatsApp group with the on-call engineer |
| Demo accounts | `owner@cafearoma.pk` / `CafeAroma2026!`, `kitchen@cafearoma.pk` / `KitchenCafe2026!` |
| Runbook | `docs/RUNBOOK.md` |

## 2. Onboarding script (target: 15 minutes)

Run this with the owner on their own phone. Tick each step.

1. **Account (2 min).** Open `https://app.<domain>/register`. Enter the owner's
   name, restaurant name, email and a password of at least 8 characters. Tap
   *Create account*. You land on the Menu Builder.
2. **Restaurant settings (1 min).** Open *Settings*. Confirm the restaurant name,
   default language and currency (PKR by default). Save.
3. **First category (2 min).** In *Menu Builder*, type a category name (for
   example *Starters*) and tap *Add*. Add one more category (for example
   *Drinks*).
4. **First three items (5 min).** Tap *Add item*. Enter name, description, base
   price, dietary tags and allergens. If the item has sizes, tap *Add variant*
   and give each size a price. Optionally add up to three photos — they upload
   directly to Cloudinary. Save. Repeat for three items.
5. **Availability (30 s).** Toggle an item to *Out of stock* and back. The
   customer menu reflects it immediately.
6. **Tables (2 min).** Open *Tables & QR*. Add each table (for example *1*, *2*,
   *3*). Download the PNG for each table and print it, or download the PDF.
7. **Staff (1 min).** Open *Staff*. Create a kitchen account for the person who
   runs the tablet. Write the password on the kitchen guide.
8. **Test order (2 min).** Scan a printed QR with the owner's phone, add an item,
   place the order, and confirm the card appears on `/kitchen`. Advance it to
   *Served*.

**Hand-over pack:** two printed QR stands per table, the owner guide, the kitchen
guide, and the support number.

### If the owner already has a menu

There is no bulk import in the MVP. Add categories and items with the drawer; a
three-category, twelve-item menu takes about 25 minutes. Use the item *Copy*
pattern by re-entering the same fields for similar items. Document the extra time
in the pilot log.

## 3. Owner one-pager

> **QuickMenu QR — Owner guide**
>
> **Sign in:** `https://app.<domain>/login`
>
> **Menu** — *Dashboard → Menu*. Add categories with **Add**, add dishes with
> **Add item**. Use **Edit** to change a price, **In stock / Out of stock** to
> stop selling a dish for the day, and drag categories to reorder them.
>
> **Photos** — In the item drawer, upload up to three photos. Images are stored
> by Cloudinary; you do not need to resize them yourself.
>
> **Tables & QR** — *Dashboard → Tables & QR*. Add a table, then **Download PNG**
> for a printable code or **Download PDF** for a full-page stand. Deactivate a
> table to stop accepting orders from it.
>
> **Staff** — *Dashboard → Staff*. Create a kitchen login, reset a password, or
> deactivate a leaver. Kitchen accounts cannot open the owner dashboard.
>
> **Kitchen screen** — open `https://app.<domain>/kitchen` on the tablet. Turn
> sound on once (the browser needs a tap). The screen stays awake while it is
> open.
>
> **Orders** — *Dashboard → Orders* shows the same tickets in a list with a
> status action per order.
>
> **If something goes wrong:** refresh the page. If the kitchen screen says
> *Reconnecting*, it recovers by itself; keep taking orders. Call the support
> number if it has not recovered in 5 minutes.

## 4. Kitchen one-pager

> **QuickMenu QR — Kitchen guide**
>
> 1. Open `https://app.<domain>/kitchen` on the tablet.
> 2. Sign in with the kitchen account. The pill in the top-right turns green and
>    says **Live**.
> 3. Tap **Enable sound** once so new orders beep. The toggle stays on for that
>    tablet.
> 4. A new order appears in **New** with the order number, table, items, variants
>    and notes in yellow.
> 5. Tap **Start preparing** when you begin, **Mark ready** when it leaves the
>    pass, and **Mark served** when it is delivered. One tap per step.
> 6. Use **Cancel** only when the order cannot be made; confirm the dialog.
> 7. Served and cancelled tickets stay for 10 seconds, then clear themselves.
> 8. The number under the status is the minutes since the order was placed.
>
> **If the screen says Reconnecting…** it is still working and refreshes every
> 5 seconds. Do not close the tab. When the connection returns, the board reloads
> all active tickets automatically — nothing is lost.
>
> **Do not** sign out, change the Wi-Fi, or lock the tablet during service.
> Keep the tablet plugged in.

## 5. Printable QR stand template

Print on A5 or A6 card, fold along the dashed line, and place on the table.

```
┌──────────────────────────────────────────┐
│                                          │
│              QUICKMENU QR                │
│                                          │
│         Scan to see the menu             │
│              and order                   │
│                                          │
│            ┌────────────────┐            │
│            │                │            │
│            │   [QR CODE]    │            │
│            │                │            │
│            └────────────────┘            │
│                                          │
│               Table  ____                │
│                                          │
│   No app. No waiting. Ask us anything.   │
│                                          │
└──────────────────────────────────────────┘
```

After printing, write the table number in the blank (or generate one PDF per
table from *Tables & QR*). Minimum QR size on the print: 3 cm × 3 cm. Keep the
code flat and out of direct sunlight; laminate it for outdoor tables.

## 6. Feedback survey (includes SUS)

Collect after the last pilot service, on paper or with a form link. Do not
collect names on the customer survey; the ordering path is anonymous by design
(NFR-S7).

### 6.1 Customer survey (30 seconds, 3 questions)

1. How easy was it to order? (1 = very hard, 5 = very easy)
2. Did the menu show your language correctly? (yes / partly / no)
3. Would you use it again? (yes / maybe / no)

### 6.2 Owner and kitchen survey (SUS)

Answer each statement 1–5 (1 = strongly disagree, 5 = strongly agree).

| # | Statement |
|---|---|
| 1 | I think I would like to use this system frequently. |
| 2 | I found the system unnecessarily complex. |
| 3 | I thought the system was easy to use. |
| 4 | I think I would need the support of a technical person to use this system. |
| 5 | I found the various functions in this system were well integrated. |
| 6 | I thought there was too much inconsistency in this system. |
| 7 | I would imagine that most people would learn to use this system very quickly. |
| 8 | I found the system very cumbersome to use. |
| 9 | I felt very confident using the system. |
| 10 | I needed to learn a lot of things before I could get going with this system. |

**Scoring.** For odd items subtract 1 from the response. For even items subtract
the response from 5. Add the ten results and multiply by 2.5. The score is 0–100;
the target is ≥ 70. Average the scores across owners and kitchen staff and record
the result in `docs/NFR_RESULTS.md` (NFR-U6).

### 6.3 Pilot log (fill one row per restaurant)

| Restaurant | Onboarded (min) | Orders placed | Lost orders | SUS | Notes |
|---|---|---|---|---|---|
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |

## 7. What to watch during the pilot

- **Order-to-kitchen time** from the kitchen tablet clock. Target p95 ≤ 2 s.
- **Reconnect events** on the kitchen screen. They should be invisible to staff.
- **Out-of-stock toggles** — does the customer menu update while the owner saves?
- **Language switch** for Urdu and Arabic (RTL layout, numbers, prices).
- **Print quality** of the QR at arm's length in restaurant lighting.
- **Any paper fallback** — write down the reason; it is a defect, not a habit.

## 8. After the pilot

1. Export the anonymous order counts and timings for the report.
2. Score SUS and update `docs/NFR_RESULTS.md` (NFR-U1, U2, U6, R1, R2).
3. Triage feedback into: bug, usability, missing feature. Add bugs to the
   backlog with an FR reference.
4. Keep the demo tenant (`Cafe Aroma`) seeded for the final presentation.
5. Do not delete pilot restaurants before the evaluation is marked.
