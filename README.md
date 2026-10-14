# Our Home Hub — House Inventory + Grocery

A lightweight household web application with **Inventory** and **Grocery Shopping**, built using HTML, CSS, vanilla JavaScript ES modules, Firebase Authentication, Cloud Firestore, and Firebase Hosting.

> **New to this repository?** Read the [Developer Manual](docs/DEVELOPER_MANUAL.md) first. It is the detailed reference for every source file, the important functions, Firestore reads/writes, and safe ways to add features.

## What it does

- **Sign in:** email/password or Google. Phones use redirect-based Google OAuth rather than a popup.
- **Manage household inventory:** create categories and items, edit names/status, search, filter, remove, and reorder categories/items by drag grip or keyboard.
- **Share an inventory:** create a shared copy, invite someone using a private 32-character ID, or return to personal inventory.
- **Shop with Grocery:** import low-stock or unavailable inventory items separately; add grocery-only items; mark Bought, Not available, Reset, Remove, or change order.
- **Record purchases:** optionally save quantity and total price. Empty fields are saved as `null` (not zero) and can be edited later.
- **Transfer a manual grocery item:** explicitly select a category and status to add it to inventory. A purchase alone never updates inventory stock.

## Source structure

```text
public/
  index.html                  Firebase Hosting entry -> HTML/index.html
  HTML/
    index.html                Login
    home.html                 Home/dashboard
    inventory.html            Inventory UI and dialogs
    grocery.html              Grocery UI and dialogs
  CSS/
    main.css                  Shared variables, components and responsive rules
    Login.css                 Login-specific styles
    Home.css                  Dashboard styles
    Inventory.css             Inventory styles
    Grocery.css               Shopping list styles
  JS/
    firebase.js               Shared Firebase app/auth/db
    login.js                  Authentication events
    home.js                   Session guard / logout
    inventory-model.js        Pure inventory status/normalization/sorting logic
    inventory-sharing.js      Shared inventory transactions
    inventory.js              Inventory page controller and Firestore CRUD
    grocery-model.js          Pure grocery value validation and list sorting
    grocery.js                Grocery page controller and Firestore CRUD
  Files/                     Images and bundled SVG icon assets

tests/
  inventory-model.test.mjs    Inventory model tests
  grocery-model.test.mjs      Grocery model tests
  inventory-browser.cjs       Browser journeys with Firebase mocks
  static-check.cjs           Local HTML/CSS asset and ID checks
  firestore-rules.cjs         Firebase Emulator Security Rules tests

docs/
  DEVELOPER_MANUAL.md         Detailed code/function/data-flow manual
  IMPLEMENTATION_HISTORY.md  Preserved past implementation notes

firebase.json                 Hosting and Firestore rules deployment
firestore.rules               Access rules for personal/shared data
FIREBASE_SETUP.md             Firebase login, sharing, emulator & deployment setup
```

## Where should new code go?

| If you want to... | Start with... |
| --- | --- |
| Change a page section or dialog | `public/HTML/<page>.html` |
| Change page styling | `public/CSS/<Page>.css` |
| Change shared buttons, navigation, color theme | `public/CSS/main.css` |
| Change how inventory status, legacy data, or ordering is computed | `public/JS/inventory-model.js` |
| Change inventory page buttons, dialogs, and Firestore mutations | `public/JS/inventory.js` |
| Change the sharing lifecycle | `public/JS/inventory-sharing.js` |
| Change quantity/price parsing or pure grocery sorting | `public/JS/grocery-model.js` |
| Change Grocery UI actions, imports, and persisted shopping lists | `public/JS/grocery.js` |
| Change how users authenticate | `public/JS/login.js` (plus Firebase Console configuration) |
| Change who can read/write Firestore data | `firestore.rules`, with emulator tests |

Read the **[function-by-function manual](docs/DEVELOPER_MANUAL.md#5-inventory-functions--what-calls-what)** before changing data flow. Existing controller functions include explanatory notes; general-purpose logic belongs in the pure model modules.

## Running locally

You need Node.js. From the repository root:

```sh
node tests/serve.cjs
```

Visit **http://127.0.0.1:4173**. This is the normal app connected to the configured Firebase backend—logging into a real account can affect real data if you edit it. Use a disposable account or the mocked browser tests for experiments.

For repeatable local checks:

```sh
node --test tests/inventory-model.test.mjs
node --test tests/grocery-model.test.mjs
node tests/static-check.cjs
node tests/inventory-browser.cjs
```

The browser test requires Playwright plus Microsoft Edge. The Firebase Security Rules test has additional emulator/Java prerequisites; see [FIREBASE_SETUP.md](FIREBASE_SETUP.md).

## Firestore data and safety

- `users/{uid}` stores personal `categories`, the optional active shared inventory ID, and the user's private `groceryItems`.
- `inventories/{id}` stores shared `categories`, `ownerId`, and `members`.
- Writes are transactional and compare the last loaded data to detect stale edits.
- Unexpected legacy fields should survive editing. Never replace a user document wholesale to change one feature.
- Grocery state is separate from inventory; an explicit transfer is required to create an inventory entry.

The CLI project's saved default (`.firebaserc`) differs from the configured app's Firebase project. **Always specify the intended project explicitly** if and when deployment is authorized. Do not deploy from this document without reviewing rules and checking with the project owner.

## Documentation and changes

1. [Developer Manual](docs/DEVELOPER_MANUAL.md) — detailed modules, functions, event wiring, schemas, and extension recipes.
2. [Firebase Setup](FIREBASE_SETUP.md) — Google sign-in, shared inventory access, rules testing, and deployment configuration.
3. [Implementation History](docs/IMPLEMENTATION_HISTORY.md) — earlier development notes; not authoritative for current code.

**Testing transparency:** This organizational refactor preserves existing HTML hooks, class names, URLs and current app logic except for extracting pure Grocery helpers into `grocery-model.js`. Static consistency checks and pure-function checks can be run locally; a successful merge alone is not evidence that real Firebase/mobile behavior was tested.
