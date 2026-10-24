# PHASE 07 – Owner dashboard (web)

**Read:** `docs/03_DATABASE_API_WIREFRAMES.md` section 4 (wireframes 4 and 5 and their element tables), view `docs/diagrams/QuickMenuQR_Wireframe_4_MenuBuilder.png` and `..._5_TablesQR.png`; `docs/01_SRS.md` UC-01..UC-05, NFR-U2, NFR-U3; `AGENTS.md`.

## Goal
Working owner screens against the real API.

## Tasks
1. Foundations: typed API client generated from or aligned with `packages/shared` zod schemas; auth context (access token in memory, silent refresh via the cookie), route guards (owner), toast notifications, loading and error states, a consistent design system with Tailwind (CSS variables for colors, dark mode support).
2. Pages: `/login`, `/register`, `/forgot-password`, `/reset-password`.
3. **Menu Builder** (`/dashboard/menu`) matching wireframe 4: category panel (add, rename, hide, drag-to-reorder with keyboard alternative, delete with confirmation and the `CATEGORY_NOT_EMPTY` flow), items table (photo, name, price, tags, availability toggle with optimistic update and rollback), edit drawer (name, description, base price, category, variants, dietary and allergen checkboxes, up to 3 photos uploaded **directly to Cloudinary** using the signed upload, then registered with the API). Form validation with the shared zod schemas.
4. **Tables and QR** (`/dashboard/tables`) matching wireframe 5: grid of tables, add table, active toggle, PNG/PDF download buttons, delete with confirmation.
5. Layout: sidebar navigation (Menu Builder, Tables and QR, Orders placeholder, Staff placeholder, Settings placeholder) collapsing to a menu button under 900 px; the edit drawer becomes a full page on small screens.
6. Accessibility: labels on all inputs, focus management in the drawer and dialogs, keyboard operable toggles, WCAG AA contrast.

## Tests
Component tests for the item form (validation) and the category list; Playwright flow: register -> add category -> add item with a variant -> toggle availability -> add table -> download QR (use the fake media storage in test mode).

## Acceptance criteria
An owner can build a complete menu and print QR codes in under 10 minutes without touching the API manually; UI matches the wireframes' structure; Lighthouse accessibility score of at least 90 on both pages.
