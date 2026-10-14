// INVENTORY SHARING SERVICE: Firestore transactions only; no page rendering.
// Each helper preserves the user's personal inventory and relies on Firestore rules.

import { db } from './firebase.js';
import { doc, runTransaction } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { normalizeCategories, inventoryVersion } from './inventory-model.js';

/**
 * Sharing validation: Validate the 32-character lowercase hexadecimal ID of a shared inventory.
 * See docs/DEVELOPER_MANUAL.md for callers, data flow, and extension points.
 */
export function parseInventoryId(value) {
    const id = value.trim().toLowerCase();
    if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('Enter the complete 32-character inventory ID.');
    return id;
}

// Copy, never move, the user's personal inventory into a shared document.
/**
 * Sharing transaction: Copy personal categories into a new shared document and link it to the user.
 * See docs/DEVELOPER_MANUAL.md for callers, data flow, and extension points.
 */
export async function createSharedInventory(user, expectedVersion) {
    const id = crypto.randomUUID().replaceAll('-', '');
    await runTransaction(db, async transaction => {
        const personalRef = doc(db, 'users', user.uid);
        const sharedRef = doc(db, 'inventories', id);
        const personal = await transaction.get(personalRef);
        const existing = await transaction.get(sharedRef);
        const records = personal.exists() ? (personal.data().categories ?? []) : [];
        if (inventoryVersion(records) !== expectedVersion) throw new Error('Your personal inventory changed. Refresh inventory before sharing.');
        if (existing.exists()) throw new Error('Please try creating the inventory again.');
        transaction.set(sharedRef, { ownerId: user.uid, members: [user.uid], categories: normalizeCategories(records) });
        transaction.set(personalRef, { activeInventoryId: id }, { merge: true });
    });
    return id;
}

/**
 * Sharing transaction: Join an existing inventory and set it active without replacing personal categories.
 * See docs/DEVELOPER_MANUAL.md for callers, data flow, and extension points.
 */
export async function joinSharedInventory(user, value) {
    const id = parseInventoryId(value);
    await runTransaction(db, async transaction => {
        const reference = doc(db, 'inventories', id);
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists()) throw new Error('No inventory matches that ID. Check the ID and try again.');
        const inventory = snapshot.data();
        normalizeCategories(inventory.categories);
        if (!Array.isArray(inventory.members)) throw new Error('This inventory cannot be joined.');
        if (!inventory.members.includes(user.uid)) {
            transaction.set(reference, { members: [...inventory.members, user.uid] }, { merge: true });
        }
        transaction.set(doc(db, 'users', user.uid), { activeInventoryId: id }, { merge: true });
    });
    return id;
}

/**
 * Sharing transaction: Clear the user's active shared inventory selection without deleting shared data.
 * See docs/DEVELOPER_MANUAL.md for callers, data flow, and extension points.
 */
export async function selectPersonalInventory(user) {
    await runTransaction(db, async transaction => {
        transaction.set(doc(db, 'users', user.uid), { activeInventoryId: null }, { merge: true });
    });
}
