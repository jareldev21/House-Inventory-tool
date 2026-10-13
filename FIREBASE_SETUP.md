# Google sign-in and shared inventories

The application still uses Firebase project `jareljaz-house`. No live configuration or deployment was performed during implementation.

## Enable Google sign-in

1. Open Firebase Console and select **jareljaz-house**.
2. Open **Authentication → Sign-in method → Add new provider → Google**.
3. Enable Google, choose the support email, and save.
4. In **Authentication → Settings → Authorized domains**, verify your live site's domain is listed. Add localhost only if you need local OAuth testing.
5. Deploy the website after reviewing the rules below. The login page now offers **Continue with Google**, as well as the existing email/password login.

The app requests Google authentication only, not Gmail mailbox access. Google creates the Firebase account on first sign-in. Inventory ownership uses Firebase UID, not the displayed email. Existing email/password users should continue using their existing account; if Firebase reports a conflicting sign-in method, the app directs them to that method rather than silently moving data between accounts. Different Google accounts have separate personal inventories until they connect through an inventory ID.

Official reference: https://firebase.google.com/docs/auth/web/google-signin

## Publish the access rules before using sharing

`firestore.rules` is now referenced by `firebase.json`. Review it against your deployed rules before publishing; it covers this app's users and inventories collections and denies other unmatched paths. If this Firebase project hosts other applications, retain their required rules separately. Do not retain an older blanket allow rule that would override these restrictions.

The rules enforce:

- Each personal document at `users/{uid}` can be accessed only by that UID.
- A signed-in person holding a 32-character inventory ID can read that specific shared document and join it. Listing all inventories is denied. **The ID is a private sharing code**, so anyone it is shared with can join and edit.
- New shared inventories must start with their creator as the only member and owner.
- Joining can append only the caller, up to 100 members, without modifying content or ownership.
- Members can edit category content, but cannot change the owner, remove members, or delete the entire shared document.

This version does not offer ID rotation or member revocation. Returning to personal inventory changes the selected workspace; it does not revoke membership. Only give the ID to people who should retain access. Rules validate the shared-document fields and categories list; per-item schema validation is still client-side, so members are trusted collaborators for inventory content.

To test rules locally, install the Firebase CLI and a Java version supported by the current Firestore emulator, then run:

```powershell
firebase.cmd emulators:exec --only firestore --project demo-homehub "node tests/firestore-rules.cjs"
```

The test refuses nonlocal emulator hosts and targets a demo project. It checks personal isolation, unauthenticated denial, inventory enumeration denial, code-based reads, joining, member editing, and rejected ownership/membership changes.

**This rules test has not been run here:** the workspace has no Java/Firestore emulator runtime available. The mocked browser tests are not a substitute for rules enforcement testing.

After reviewing and testing the rules, explicitly publish them to the correct project, followed by Hosting:

```powershell
firebase.cmd deploy --only firestore:rules --project jareljaz-house
firebase.cmd deploy --only hosting --project jareljaz-house
```

These are manual deployment instructions, not commands executed by the implementation. The saved CLI default still points to `first-website-481df`; use the explicit project flag.

## How sharing works

1. Open Inventory and click **Create shared inventory**. Confirm that you want to copy your current personal inventory into a shared workspace.
2. Use **Copy ID** and privately give the ID to the other person.
3. They sign in, paste it into **Connect using an inventory ID**, and click **Connect inventory**.
4. Both accounts edit the same `inventories/{inventoryId}` document. Use **Refresh inventory** to see other members' changes. A stale edit is rejected rather than overwriting newer inventory.
5. **Back to personal inventory** restores access to the untouched personal inventory. Personal and shared records are never automatically merged.

The selected ID is saved as `activeInventoryId` on the private user document, so the connection survives refresh and sign-in. Shared documents contain `ownerId`, `members`, and `categories`. IDs use cryptographically generated UUIDs with hyphens removed. Existing category IDs, item IDs, status values, and historical fields are preserved when copying.

## Verification

Local browser tests passed with Firebase modules mocked and external network requests blocked: creating a shared copy, joining from a second account, shared edits visible on reload, personal data preservation, switching back, malformed/missing IDs, Google popup cancellation, and Google sign-in success. Existing inventory, responsive layout, and status tests also passed. Actual Google OAuth and deployed Firestore Rules must be verified after the console setup and emulator checks above.
