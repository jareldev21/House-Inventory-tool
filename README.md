# Our Home Hub — local implementation notes

This is the existing HTML, CSS, vanilla JavaScript, Firebase Authentication, and Cloud Firestore app. No framework or production dependency was added. Nothing was deployed, and verification did not access or modify live user data.

Google sign-in and shared inventories are now implemented. See [Firebase setup and sharing instructions](FIREBASE_SETUP.md) for the required Google provider configuration, new access rules, emulator testing, and deployment commands. Those live setup steps have not been performed.

## What changed

- `public/CSS/main.css`: shared theme variables, reset, typography, header/navigation, branding, buttons, inputs, dialogs, and placeholder styles.
- `public/CSS/Home.css`, `Inventory.css`, and `Login.css`: page-specific layouts. `todos.css` and `places.css` intentionally defer to the shared placeholder styles.
- `public/HTML/inventory.html` and `public/JS/inventory.js`: category/item creation, editing, confirmed removal, stock-status forms, category selection/navigation, search, stock filters, status indicators, and load/save feedback.
- `public/JS/inventory-model.js`: validation, stock status, legacy record normalization and comparison helpers. Pure functions can be tested without Firebase.
- `public/JS/firebase.js`: the existing Firebase project configuration and SDK version, centralized without changing values. `home.js` and `login.js` reuse it.
- `public/HTML/home.html`: valid structure, correct feature-card destinations, shared navigation and branding.
- `public/HTML/index.html`: shared styling and branding, retaining the pre-existing login form and autocomplete changes.
- `public/HTML/grocery.html` and `public/JS/grocery.js`: persistent grocery list, imported inventory items, purchase prices, not-available marking, removal, and explicit add-to-inventory.
- `public/HTML/404.html`: themed missing-page fallback.
- `public/index.html` and `public/404.html`: entry point and actual Firebase Hosting error page at the configured public root.
- `public/Files/branding/`: editable SVG house logo/favicon and matching inventory, to-do, and places icons. Original image assets remain available.
- `tests/`: repeatable model, static-reference, and browser checks. Test mocks are outside the deployed `public/` folder.

The inventory follows the supplied reference's purple category cards, item rows, badges, sidebar, and banner. Item photographs were not added because the existing item model has no image field.

## Inventory status and data

Category icons can be selected in Add Category or Edit Category: Storage, Kitchen, Bedroom, Living Room, Bathroom, Food, Cleaning, or Tools. The selection is stored as the category's `icon` key and displayed on its card and in the sidebar. Existing categories without an icon keep the storage icon. Cancelling does not change the saved selection; failed saves retain the selected icon for retry. All icon assets are bundled SVGs; no image uploads or external icon library are needed.

Personal documents remain at `users/{authenticatedUser.uid}`. Optional shared inventories use `inventories/{inventoryId}`, with the active ID saved on the private user document. Creating a shared inventory copies personal categories and leaves the original intact. A category has a stable `id`, `name`, and `items` array. An item looks like this:

```json
{
  "id": "generated-uuid",
  "name": "Rice",
  "status": "available"
}
```

Users now choose Available, Low Stock, or Unavailable in the item form. A status is required; exact quantities and progress bars are no longer part of the interface. The chosen status is saved in the item's status field and drives all stock badges and filters.

- Available: more than 20% left.
- Low Stock: some stock remains, but 20% or less is left.
- Unavailable: no stock remains (0).

These descriptions guide the user's choice; no percentage or exact amount is required. Existing quantity-based records derive their initial status using this same 20% threshold, with zero checked first. Once the user saves a status, that choice takes precedence over old numeric fields. Existing quantities are preserved in storage but are not displayed or requested. Legacy names without quantity or status information remain Not configured until the user chooses a status.

Unit selectors and labels have been removed. Previously saved unit fields are retained as historical data, but new items do not store a unit.

Layouts adapt to small screens, including scrolling dialogs in landscape, 16px form inputs, and at least 44px action/filter tap targets on touch devices. Hover zoom applies to buttons, navigation, category cards, homepage cards, and icon choices on mouse/trackpad devices. It is disabled for touch-only devices and reduced-motion preferences.

Search is case-insensitive and combines with category navigation and the chosen stock filter. Totals count item records.

Legacy arrays of item-name strings are normalized in memory with deterministic IDs and null quantities. Names, categories, extra fields, and existing configured values are preserved. Loading does not write anything. The normalized records are saved only with the next successful user edit. IDs then remain stable across reloads. Unsupported record structures stop editing instead of silently dropping records.

Writes use a Firestore transaction with merge enabled, preserving unrelated user-document fields. The transaction compares against the last loaded inventory and rejects stale edits from another tab. On conflict, close the form and use Reload inventory. Failed saves leave the saved state unchanged and retain form input for retry. Editing is disabled until loading succeeds and while a save is pending. Transactions require a connection; there is no offline write queue.

## Verification performed

- Nine model tests passed: migration preservation, stable IDs, unsafe-record rejection, stock boundaries, required-status validation, search/filter composition, conflict comparison, historical-field preservation, and category icon fallback/preservation.
- Static checks passed for 70 exact-case local links/assets, balanced HTML tags, unique IDs, and shared CSS imports.
- JavaScript syntax checks passed.
- Headless Microsoft Edge browser journeys passed using local Firebase mocks: login, homepage navigation, category/item create-edit-remove, manual stock statuses and reload, legacy conversion, search/filters, category selection, persistence across reload, save/load failure recovery, stale-tab rejection, simulated account switching, logout/login, and grocery workflows (new regression checks require execution).
- Responsive overflow checks passed at 320, 390, 768, and 1440 pixels for inventory, home, login, and the grocery page. Desktop and mobile inventory screenshots were visually reviewed. No uncaught page errors occurred in these mocked journeys; expected simulated Firebase failures were logged.

Mock tests verify frontend behavior, not the deployed Firebase service or Security Rules. Real sign-in, production persistence, actual transaction contention, deployed rules enforcement, and cross-browser/device behavior still require verification with an authorized test account or Firebase Emulator Suite.

## Before deployment

1. Verify the Firebase target: the app uses `jareljaz-house`, but `.firebaserc` defaults to `first-website-481df`. Neither value was changed. Select the intended project explicitly when you eventually deploy.
2. Review, emulator-test, and deploy the new `firestore.rules` before using sharing. See `FIREBASE_SETUP.md`. Personal user documents remain private; shared IDs intentionally grant signed-in holders read/join access, while content edits require membership. Client-side checks alone are not security enforcement. The local rules test is provided but has not been executed because a Java/Firestore emulator runtime is unavailable here.
3. Test real login, create/edit/delete, refresh, sign-out/sign-in, and user isolation with a nonproduction account. Confirm the intended hosting domain is authorized for Firebase Authentication.
4. Keep a recoverable export before any production migration or deployment. This task neither exported nor changed live data.

The existing single-document inventory design is retained. Very large inventories remain subject to Firestore's per-document size limit; this change does not introduce pagination or a new storage architecture.

## Run locally

From the project directory with Node.js installed:

```sh
node tests/serve.cjs
```

Open `http://127.0.0.1:4173`. The normal app uses the existing Firebase project, so signing in and editing there would affect that account's real inventory. The automated browser test instead intercepts every Firebase module and blocks nonlocal network requests.

```sh
node --test tests/inventory-model.test.mjs
node tests/static-check.cjs
node tests/inventory-browser.cjs
```

The browser check requires an existing Playwright installation resolvable through Node and Microsoft Edge. Verification used the Codex bundled Playwright via `NODE_PATH`; it was not added as an application dependency. Browser screenshots are generated in `tests/artifacts/`, which Git ignores.

To replace branding, edit the corresponding SVG in `public/Files/branding/`. Replacing `logo.svg` updates the site logo and favicon.



## Grocery and mobile sign-in update (October 2026)

The To-do and Places pages, CSS, and dedicated artwork were removed, with navigation consolidated into Home, Inventory, and Grocery. The Grocery page is `public/HTML/grocery.html`. Users can add all Low Stock or all Unavailable items from their active inventory, add manually named items, mark purchases (with a required price in Philippine pesos), mark items not available, reset their state, and remove entries. Reimporting items from the same inventory does not duplicate source-linked list entries. Manually added grocery items **do not** automatically enter inventory; the Add to inventory action requires category and status selection. Purchase actions never change inventory stock levels.

Grocery items are saved in the authenticated user's private Firestore document as `groceryItems`; they are **not** a shared grocery list even if the user has joined a shared inventory. A grocery item's optional `source` identifies the inventory record. Stock categories are read from the currently selected personal or shared inventory. Transactional saves reject stale grocery state and merge unrelated user fields; manually transferring a grocery item to inventory is atomic across the relevant documents. Existing inventory fields and records are not deleted.

Mobile Google sign-in now uses `signInWithRedirect` instead of a popup. Desktop retains popup sign-in with redirect fallback if blocked; `getRedirectResult` completes the mobile round trip. The configured `authDomain` now matches the existing Firebase Hosting domain `jareljaz-house.web.app`, which is necessary for reliable redirect handling when hosted there. Verify that **the exact deployed domain** is authorized under Firebase Authentication > Settings > Authorized domains, Google provider is enabled, and OAuth configuration allows the redirect URI `https://jareljaz-house.web.app/__/auth/handler`. If hosting on a different domain, configure the appropriate same-origin authentication domain first.

**Testing note:** The changes above were statically checked for JavaScript parseability; real mobile sign-in, actual Firebase rules and transactions, end-to-end browser interactions, and deployment have **not** been verified. The pre-existing mock browser test was updated for Grocery but still needs to be executed locally with Playwright and Edge.
