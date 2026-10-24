# Project Brief – QuickMenu QR (Project #031)

**University:** Punjab Tianjin University of Technology – Department of Software Engineering Technology
**Course:** Project 1 (Lab) | **Faculty advisor:** Dr. Zaigham Mushtaq | **Student:** Muhammad Haroon
**Category:** Local Commerce, SMB and Retail Operations (Hospitality / SMB Tech)

## Problem
Cafes and restaurants spend thousands reprinting paper menus when prices change, and they struggle with multilingual tourists and out-of-stock items.

## Solution
A digital menu system. Restaurants print QR table stands. Customers scan, browse a menu with photos, translate it into any language, filter by dietary needs and allergens, and submit orders that appear on a live kitchen display.

## Mandated stack (course sheet)
Next.js (mobile web PWA), Node.js (WebSockets for the live kitchen display), PostgreSQL, Cloudinary.

## Users
- **Restaurant Owner / Admin:** manages menu, prices, availability, tables, QR codes, kitchen accounts.
- **Customer (Diner):** scans a QR code, no account, no app install; browses, filters, translates, orders, tracks the order.
- **Kitchen Staff:** sees new orders live and updates their status.

## MVP features (5)
1. Menu builder dashboard (categories, items, prices, variants, photos, tags, availability)
2. QR-based mobile menu (fast PWA)
3. Multi-language translation (one-tap language switch)
4. Dietary and allergen filters
5. Order submission with a live Kitchen Order Ticket (KOT) screen

## Out of scope
Online payments, delivery, inventory and suppliers, loyalty, native mobile apps, POS integration.

## Course roadmap (4 months)
- Month 1: Menu builder dashboard
- Month 2: Fast mobile QR customer browsing interface
- Month 3: Real-time Kitchen Order Ticket live screen
- Month 4: Pilot with 5 local campus cafes/restaurants

## Weekly reports
12 weekly progress reports. Weeks 1 to 4 (problem discovery, SRS, architecture, database/API/wireframes) are complete; their documents are `01`, `02`, `03` in this folder. Weeks 5 to 12 are implementation, testing, deployment, and the pilot.

## Key measurable targets (from the SRS)
- Menu page: LCP <= 2.5 s on 4G
- API: p95 <= 300 ms
- New order visible on kitchen screen: <= 2 s for 95% of orders
- Uptime >= 99.5% per month; no lost orders; no duplicate orders
- 500 concurrent customers, 25 concurrent kitchen connections
- Unit test coverage >= 70% on backend business logic
- WCAG 2.1 AA; at least 5 languages (English, Urdu, Arabic, Chinese, French)
