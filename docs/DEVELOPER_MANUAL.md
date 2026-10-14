# Our Home Hub — Developer Manual

**Purpose:** a source-code map, function reference, and maintenance guide for the existing House Inventory + Grocery application. This describes what the code **currently does**; it does not propose a framework migration.

**Intended reader:** a developer learning to read, debug, extend, and safely maintain this project.

## 1. Start here — architecture in one minute

This is a static, client-side web application built from HTML, CSS, and **vanilla JavaScript ES modules**. It uses Firebase Authentication for sign-in and Cloud Firestore for persistence. There is no Node.js application server, no build/bundling step, and no front-end framework. Hosting serves files from `public/`.

```text
Browser
  public/index.html          -> redirects to HTML/index.html
  HTML/index.html            -> JS/login.js -> Firebase Authentication
  HTML/home.html             -> JS/home.js  -> signed-in dashboard
  HTML/inventory.html        -> JS/inventory.js
                                 |- JS/inventory-model.js  (pure data logic)
                                 |- JS/inventory-sharing.js (sharing transactions)
                                 \- JS/firebase.js -> Firestore
  HTML/grocery.html          -> JS/grocery.js
                                 |- JS/grocery-model.js (pure data logic)
                                 |- JS/inventory-model.js (stock status + version)
                                 \- JS/firebase.js -> Firestore

CSS/main.css                 -> global visual system
CSS/<Page>.css               -> styles specific to that page
```

**Separation rule:** HTML declares accessible page structure; CSS owns presentation; pure models validate and transform data; controller scripts own DOM events and state; Firebase service modules own data access and authentication configuration.

## 2. Repository map and edit ownership

| File/path | What belongs here | What should NOT go here |
| --- | --- | --- |
| `public/HTML/index.html` | Login form, Google button, authentication feedback | Firebase business logic |
| `public/HTML/home.html` | Dashboard header, welcome section, feature links | Inventory or purchase calculations |
| `public/HTML/inventory.html` | Inventory sidebar, search toolbar, cards container, category/item dialogs | New data mutations hardcoded in markup |
| `public/HTML/grocery.html` | Import buttons, entry form, shopping list, purchase/transfer dialogs | Firestore write rules |
| `public/CSS/main.css` | Shared colors, typography, navigation, buttons, dialogs, responsive globals | One page's unique layout |
| `public/CSS/Home.css`, `Login.css`, `Inventory.css`, `Grocery.css` | Corresponding page layouts, states, responsive behavior | Unrelated page selectors |
| `public/JS/firebase.js` | Single Firebase app initialization, Authentication and Firestore exports | Inventory logic; credentials beyond public Firebase web config |
| `public/JS/login.js` | Password and Google sign-in events, redirect errors | Firestore inventory CRUD |
| `public/JS/home.js` | Dashboard authentication guard and logout | Business rules |
| `public/JS/inventory-model.js` | Inventory normalization, statuses, filtering, stable comparisons, item/category ordering | DOM operations or Firebase SDK calls |
| `public/JS/inventory-sharing.js` | Validate share ID; create, join, and leave shared inventories through transactions | HTML rendering |
| `public/JS/inventory.js` | Inventory page state, rendering, forms, drag gestures, and transaction orchestration | Pure reusable calculations (move to model) |
| `public/JS/grocery-model.js` | Purchase amount parsing, shopping entry validation, total formatting, pure reorder calculations | Page state, DOM, Firebase network calls |
| `public/JS/grocery.js` | Grocery page state, imports, row actions, event handling, and transactions | General-purpose pure helpers (move to model) |
| `firestore.rules` | Server-enforced access permissions for collections | Client-side form validation |
| `firebase.json` / `.firebaserc` | Deployment definitions and default CLI project | Application UI code |
| `tests/` | Model, static reference, mocked browser, and security rules regression tests | Production assets or account data |

**Important:** page headers are repeated in HTML; there is no shared layout component. When adding a new top-level page, update the navigation in each applicable HTML file.

## 3. How HTML is organized

Each primary page follows the same division:

1. **Head** — metadata, one shared CSS file, one page CSS file, favicon, and its module script.
2. **Header** — clickable Home Hub logo, primary navigation, and Logout.
3. **Page heading/hero** — page title and short instruction.
4. **Main** — semantic sections for controls and content.
5. **Dialogs** — modal forms whose IDs are referenced from JavaScript.

### Inventory DOM contracts

- `#categoryList`: sidebar category buttons, populated by `renderCategories()`.
- `#renderedCategories`: category and item cards generated by `renderCategories()` / `renderItem()`.
- `#search` and `[data-filter]`: search and status filtering.
- `#categoryModal` / `#categoryForm`: create and edit category.
- `#itemModal` / `#itemForm`: create and edit inventory item.
- `#inventoryMessage` and `#retryLoad`: load/save/conflict feedback.
- `#createSharedBtn`, `#joinInventoryForm`, `#personalInventoryBtn`: sharing actions.
- `#sharedInventoryId` / `#copyInventoryId`: current share code.
- `#reorderHelp`: displays reorder instructions based on filter/readiness state.

Do not rename these IDs unless you update their uses in `inventory.js` and tests. The grip handles and rows are **created dynamically**, not declared in the HTML.

### Grocery DOM contracts

- `#importLow` and `#importUnavailable`: copy inventory-needed items into Grocery.
- `#addGroceryForm` and `#groceryName`: create a grocery-only entry.
- `#groceryList`: generated grocery rows and action buttons.
- `#groceryTotal` / `#groceryCount`: spending summary and progress.
- `#boughtDialog`, `#boughtQuantity`, `#boughtPrice`: purchase form, both fields optional.
- `#inventoryDialog` / `#inventoryCategory` / `#inventoryStatus`: explicit manual-entry transfer to inventory.
- `#groceryMessage` / `#retryGrocery`: persistence feedback.

### CSS organization

Read `main.css` first: CSS variables (`--accent`, `--panel`, etc.), generic controls, shared navigation, dialogs and breakpoints are defined there. Each page stylesheet now has commented, formatted groups for layout, components, states, drag handles, and responsive rules. Keep existing CSS class names if the markup or tests use them. Add new rules beside the relevant component; avoid global overrides that unintentionally change other pages.

## 4. Firebase data model — critical to preserving user records

### Personal Firestore document: `users/{uid}`

The signed-in user's UID is the Firestore document ID. This may contain:

```json
{
  "categories": [
    {
      "id": "category-id",
      "name": "Kitchen",
      "icon": "kitchen",
      "items": [
        { "id": "item-id", "name": "Rice", "status": "low" }
      ]
    }
  ],
  "activeInventoryId": null,
  "groceryItems": [
    {
      "id": "grocery-id",
      "name": "Milk",
      "state": "bought",
      "price": 84.50,
      "boughtQuantity": 2,
      "source": null
    }
  ]
}
```

All fields above are illustrative. Existing user documents can contain extra fields. **Do not overwrite them**. Grocery purchases have a state of `pending`, `bought`, or `unavailable`. Unknown price or quantity is stored as `null`, **not** numeric zero. `source` is set to a stable inventory identity for imported entries; manually added grocery items use `null`. Manual items transferred to inventory get an `inventoryAdded` flag. Grocery is private to each user, not a group-shared list.

### Shared Firestore document: `inventories/{inventoryId}`

```json
{
  "ownerId": "firebase-user-uid",
  "members": ["firebase-user-uid"],
  "categories": []
}
```

The current shared inventory ID is stored as `users/{uid}.activeInventoryId`. If set, the Inventory page reads/writes the corresponding shared `inventories/{inventoryId}.categories`. The Grocery page **always** stores its shopping list under the personal user document but may import item data from the selected shared inventory.

**Ordering:** category order and item order are the sequence of arrays, not a separate `sortOrder` property. Dragging creates a re-ordered array and persists it.

**Legacy compatibility:** historical inventory entries may be strings or contain quantity/unit/extra fields. `normalizeCategories()` creates stable in-memory IDs for older shapes without discarding unknown fields. Loading should never silently rewrite or delete these records. Explicit stock status wins over historical quantities.

**Stock statuses:** `available`, `low`, `unavailable`, or derived `unconfigured` for legacy records. Existing quantity-based records derive `low` at 20% or less remaining, and `unavailable` at zero. The UI lets users choose status manually; buying an item in Grocery does **not** change inventory status.

## 5. Inventory functions — what calls what

The function names below match `public/JS/inventory.js` and `public/JS/inventory-model.js`.

### Inventory page controller: `inventory.js`

| Function | Responsibility / when to use it |
| --- | --- |
| `message(text, error)` | Updates the status region and red error style. |
| `updateControls()` | Disables edits while unauthenticated, loading, or saving; also controls drag handles. |
| `loadCategories()` | Reads personal/shared document, normalizes data, initializes `savedVersion` and re-renders. |
| `saveCategories(nextCategories)` | **Only routine inventory write path.** Firestore transaction checks version, merges categories, then updates local state. Returns success boolean. |
| `openCategoryModal(category?)` | Prepares add/edit category dialog without writing data. |
| `openItemModal(categoryId?, item?)` | Prepares add/edit item dialog. |
| `removeCategory(category)` / `removeItem(category, item)` | Confirm and persist a targeted removal. |
| `canReorder()` | Requires all categories, all stock statuses, empty search, and no pending save. |
| `clearDropHighlight()` / `clearDrag()` | Cleanup for the pointer-drag lifecycle. |
| `dragHandle(kind, category, item?)` | Pointer and keyboard grip setup; chooses category/item destination. |
| `element()` / `button()` / `categoryIconImage()` | Small, safe DOM construction utilities. |
| `renderItem(category, item)` | Creates one item row and badge with action buttons. |
| `renderCategories()` | Rebuilds sidebar and category cards from local state, search and filters. |
| `changeInventory(action)` | Handles create/join/switch connection, with a fresh load after successful transaction. |

### Pure inventory model: `inventory-model.js`

| Function | Responsibility |
| --- | --- |
| `categoryIconKey(value)` | Restricts an icon to built-in asset keys. |
| `normalizeCategories(records)` | Validates legacy and current category/item structures, preserving fields. |
| `isConfigured(item)` | Tests whether saved legacy quantities are valid. |
| `stockStatus(item)` | Computes effective displayed status, respecting manually chosen status. |
| `parseStatus(value)` | Validates a user-selected status. |
| `matchesItem(item, search, filter)` | Case-insensitive search plus stock filter. |
| `inventoryVersion(value)` | Deterministic structural fingerprint for optimistic conflict checks. |
| `moveCategory(records, sourceId, destinationId, after)` | Pure category ordering. |
| `moveItem(records, sourceCategoryId, itemId, targetCategoryId, targetItemId, after)` | Pure item ordering and cross-category move. |

### Shared inventory service: `inventory-sharing.js`

| Function | Responsibility |
| --- | --- |
| `parseInventoryId(value)` | Validates share ID syntax. |
| `createSharedInventory(user, expectedVersion)` | Copies personal data to a new shared record without deleting the original. |
| `joinSharedInventory(user, value)` | Appends the user to an existing share and selects it. |
| `selectPersonalInventory(user)` | Clears selected shared ID; membership and shared data remain intact. |

**Inventory save flow:**

```text
User clicks / submits / drops
  -> handler makes a copy of categories
  -> validates or reorders copy (inventory-model.js when reusable)
  -> saveCategories(copy)
  -> runTransaction() reads current Firestore document
  -> inventoryVersion(remote) compared with savedVersion
  -> transaction.set({ categories: copy }, { merge: true })
  -> only on success: categories = copy; savedVersion = new version
  -> renderCategories() updates screen
```

If remote data changed, stop editing, show a conflict and use **Reload inventory**. Do not write around this guard or manipulate the saved array before a successful transaction.

## 6. Grocery functions — what calls what

### Pure grocery model: `grocery-model.js`

| Function | Responsibility |
| --- | --- |
| `money(value)` | Displays a recorded numeric price in Philippine pesos. |
| `quantityLabel(item)` / `priceLabel(item)` | Display saved amounts or an explicit “not recorded” label. |
| `optionalNumber(input, label, max, decimalPlaces, positive)` | Parses optional field; blank becomes `null`; invalid numeric input throws. |
| `validateList(records)` | Rejects invalid grocery list records or duplicate IDs. |
| `reorderedList(records, id, targetId, after)` | Pure immutable move calculation; leaves each grocery entry's fields intact. |

### Grocery controller: `grocery.js`

| Function | Responsibility / when to use it |
| --- | --- |
| `feedback(text, error)` | Updates grocery status feedback. |
| `controls()` | Enable/disable mutation inputs and drag grips. |
| `node()` / `action()` | Build safe DOM nodes and action buttons. |
| `clearGroceryDrag()` / `groceryHandle(item)` | Pointer and keyboard reorder interaction. |
| `render()` | Rebuilds grocery rows, progress and recorded spending from current `items`. |
| `load()` | Reads the private list plus currently active inventory; supports the `?import=low` and `?import=unavailable` links. |
| `saveList(next)` | **Only ordinary grocery write path.** Transaction checks the old grocery version, then merges `groceryItems`. |
| `changeItem(id, changes)` | Updates status while retaining the item's other fields. |
| `importStatus(status)` | Copies matching inventory entries into Grocery without repeated source entries. |
| `openBought(item)` | Opens purchase form, prefilling existing optional quantity and price. |
| `openInventory(item)` | Opens category/status picker for manually created Grocery items only. |

**Anonymous event listeners in `grocery.js` also matter:**

- `#addGroceryForm submit` creates a new pending item and calls `saveList`; this **does not** create inventory.
- `#boughtForm submit` parses optional quantity/price through the model, sets `state: 'bought'` and calls `saveList`.
- “Not available” and “Reset” update the grocery item only.
- `#inventoryForm submit` performs a special **atomic** Firestore transaction that updates inventory categories *and* marks the grocery item `inventoryAdded: true`. The transaction reads both documents when inventory is shared.
- Logout uses Firebase `signOut`; it does not delete shopping data.

**Grocery purchase flow:**

```text
Bought button -> openBought(item)
  -> user enters quantity and/or price (both optional)
  -> optionalNumber(...) converts blank to null
  -> saveList(next grocery array)
  -> Firestore transaction + version check
  -> render() shows Bought, quantity/price labels
  -> recorded spending sums only prices actually supplied
```

## 7. Authentication functions and startup

### `firebase.js`

Imports the official Firebase browser SDK from Google's CDN. Initializes the shared app once and exports `auth` and `db`. Firebase web client configuration is not a private admin key; nevertheless do not commit service-account secrets, passwords, or production exports.

### `login.js`

| Function / handler | Purpose |
| --- | --- |
| `setBusy(value)` | Prevent concurrent sign-in button presses. |
| `friendlyError(error)` | Turn common Auth errors into explanatory text. |
| `googleProvider()` | Build account-chooser Google provider. |
| `prefersRedirect()` | Use redirect-style sign-in on mobile browsers. |
| `getRedirectResult(auth)` | Finish a mobile Google authentication return before normal login actions. |
| `#login-form submit` | Call `signInWithEmailAndPassword` then navigate to home on success. |
| `#google-sign-in click` | Redirect on mobile; desktop popup with redirect fallback when blocked. |

`home.js` watches `onAuthStateChanged` and redirects signed-out visitors to login. Its Logout button calls `signOut`.

### Firebase domain caution

OAuth redirect operation assumes the hosted domain and `firebaseConfig.authDomain` are compatible, and that the domain and OAuth callback are authorized in Firebase / Google settings. For this project the app configuration uses `jareljaz-house.web.app`; deployment instructions must explicitly select Firebase project `jareljaz-house`. The CLI default in `.firebaserc` is **different**, so do not run an unqualified deployment command. See `FIREBASE_SETUP.md`.

## 8. Concurrency, failure recovery, and data safety

Both controllers use `ready` (load completed), `saving` (mutation underway), and a `session` generation number (reject responses from the wrong account or old request). `savedVersion`/`version` stores the last loaded serialized data; the transaction compares it against the latest server snapshot before any write. Transactions require connectivity and may fail. A failed save must keep the last committed UI data and offer a retry. Shared edits may conflict when another member edits the same single-document inventory.

Firestore Security Rules are the **actual** access-control boundary. Client-side checks alone do not grant or restrict permissions. The shared ID is a capability: a signed-in holder can join according to `firestore.rules`; do not share it publicly. This version does not provide code rotation or member revocation.

Never run mass deletion, clear collections, reset authentication, deploy new rules, force-push or migrate production documents without reviewing impact and getting explicit authorization. Retain a recoverable export before a schema migration.

## 9. How to add or modify a feature safely

**Example: add a new button that updates an inventory item**

1. Put the static button/form element in `HTML/inventory.html` (or create it in `renderItem()` when it belongs to each dynamically generated row).
2. Style it in the matching section of `CSS/Inventory.css`; use shared tokens from `CSS/main.css`.
3. Put reusable validation/transformation in `JS/inventory-model.js` and write a pure unit test.
4. Put the event callback in `JS/inventory.js` near the appropriate handler group.
5. Construct a **copy** of `categories`; do not mutate the committed state.
6. Call `saveCategories(next)`; render from the confirmed committed result.
7. Add a mocked browser regression in `tests/inventory-browser.cjs` and verify mobile layout.

**Example: add a new Grocery calculation**

Keep it in `JS/grocery-model.js`, export it, import it into `grocery.js`, test it in `tests/grocery-model.test.mjs`. Don't put general calculation logic inside a click listener.

**Example: add a new Firestore collection or change inventory schema**

Design the schema, compatibility/migration path, security rules, and emulator tests first. Check document size limits and shared-user permissions. Preserve legacy fields; only then update the controller and DOM.

**Refactoring checklist:**

- Existing HTML IDs, selectors and button meanings remain unchanged unless intentionally migrated.
- JS imports and relative asset links use exact filename case.
- All previous category, item, and Grocery fields survive a round trip.
- Authentication and personal/shared selection behave as before.
- No new hidden data writes during render or load.
- Save failures and stale-tab conflicts do not discard records.
- Desktop, narrow mobile viewport, and touch interactions work.
- No production deployment is assumed merely because code was merged.

## 10. Run and test

**Prerequisites:** Node.js; for browser automation, Playwright and an installed Microsoft Edge browser. The Firebase Emulator test requires Firebase CLI and a supported Java runtime.

From the repository root:

```sh
node tests/serve.cjs
```

Open the app at `http://127.0.0.1:4173`. Normal local browsing uses the configured real Firebase backend if you sign in; **do not use a production account for destructive testing**. The browser regression suite replaces Firebase with local mocks.

Model and static checks:

```sh
node --test tests/inventory-model.test.mjs
node --test tests/grocery-model.test.mjs
node tests/static-check.cjs
node tests/inventory-browser.cjs
```

Browser checks use a Playwright installation and Edge; availability varies by environment. To test Firestore Security Rules safely, see the emulator command in `FIREBASE_SETUP.md`. Do not mistake mocked frontend tests for production Firebase or real mobile OAuth verification.

## 11. Debugging quick reference

| Symptom | Inspect first |
| --- | --- |
| Google login returns to login / does nothing on phone | `login.js` redirect result and Firebase OAuth/auth-domain settings |
| Inventory didn't load | `loadCategories()`, current UID, Firestore permissions, network, active inventory ID |
| An edit is rejected as stale | `saveCategories()` / `inventoryVersion()`; reload current inventory |
| Categories/items disappear on screen but still exist | `renderCategories()`, category selection, search input, status filter |
| Drag grip is disabled | `canReorder()`; clear search and select All Items |
| Imported stock never appears in Grocery | `load()` / `importStatus()`, source IDs, effective `stockStatus()` |
| Grocery purchase shows “not recorded” | `boughtQuantity` / `price` is `null` by design; use Edit purchase |
| Buying doesn't update Inventory | Expected: transfers and stock edits are intentionally explicit |
| Grocery list not saving | `saveList()`, user UID, document version conflict, Firestore permissions |
| App link/image 404 | File path capitalization, `public/` relative URL resolution, `tests/static-check.cjs` |
| Shared inventory access rejected | `inventory-sharing.js`, `firestore.rules`, connected UID and ID format |

## 12. Maintenance conventions

- Use clear names and narrow functions with one responsibility.
- Add a short **why** comment for non-obvious rules; avoid commenting obvious syntax.
- Keep cross-cutting pure functions in model modules and export them for unit tests.
- Avoid new dependencies for problems existing native APIs can solve.
- Keep browser-facing strings/labels accessible, and update tests when UI copy changes.
- Put instructions for a new feature in this manual; keep historical implementation notes in the root README.
- Always document **what was tested**, **what was not tested**, and **whether anything was deployed**.

For Firebase configuration, rules, and sharing deployment, continue with **FIREBASE_SETUP.md**. For current project design and the app entry points, start with the **root README.md**.
