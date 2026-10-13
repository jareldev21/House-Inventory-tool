// 1. Firebase and data helpers
import { auth, db } from './firebase.js';
import { doc, getDoc, runTransaction } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { normalizeCategories, stockStatus, parseStatus, matchesItem, inventoryVersion, categoryIcons, categoryIconKey } from './inventory-model.js';
import { createSharedInventory, joinSharedInventory, selectPersonalInventory, parseInventoryId } from './inventory-sharing.js';

// 2. DOM references and application state
const byId = id => document.getElementById(id);
const categoryModal = byId('categoryModal');
const itemModal = byId('itemModal');
const categoryForm = byId('categoryForm');
const itemForm = byId('itemForm');
const labels = { available: 'Available', low: 'Low Stock', unavailable: 'Unavailable', unconfigured: 'Not configured' };
let categories = [];
let savedVersion = inventoryVersion([]);
let currentUser = null;
let session = 0;
let ready = false;
let saving = false;
let activeCategory = 'all';
let activeFilter = 'all';
let editingCategory = null;
let editingItem = null;
let originalItemCategory = null;
let activeInventoryId = null;

function message(text, error = false) {
    byId('inventoryMessage').textContent = text;
    byId('inventoryMessage').classList.toggle('error', error);
}

function updateControls() {
    document.querySelectorAll('[data-mutation]').forEach(button => { button.disabled = !ready || saving; });
    byId('addItemBtn').disabled = !ready || saving || categories.length === 0;
    byId('logout-button').disabled = saving;
    byId('retryLoad').disabled = saving;
    document.querySelectorAll('dialog input, dialog select, dialog button').forEach(control => { control.disabled = saving; });
    document.querySelectorAll('dialog button[type="submit"]').forEach(control => { control.disabled = !ready || saving; });
    byId('createSharedBtn').disabled = !ready || saving || Boolean(activeInventoryId);
    byId('joinInventoryBtn').disabled = !currentUser || saving;
    byId('joinInventoryId').disabled = !currentUser || saving;
    byId('personalInventoryBtn').disabled = !currentUser || saving;
    byId('refreshInventoryBtn').disabled = !currentUser || saving;
    byId('copyInventoryId').disabled = !activeInventoryId || saving;
}

// 3. Authentication and loading. Ignore requests from a previous user session.
async function loadCategories() {
    if (!currentUser || saving) return;
    const requestSession = ++session;
    const user = currentUser;
    ready = false;
    categories = [];
    renderCategories();
    message('Loading your inventory…');
    byId('retryLoad').hidden = true;
    try {
        const personal = await getDoc(doc(db, 'users', user.uid));
        if (requestSession !== session) return;
        activeInventoryId = personal.exists() ? (personal.data().activeInventoryId ?? null) : null;
        byId('activeInventoryLabel').textContent = activeInventoryId ? 'Shared inventory' : 'Personal inventory';
        byId('sharedInventoryDetails').hidden = !activeInventoryId;
        byId('personalInventoryBtn').hidden = !activeInventoryId;
        byId('sharedInventoryId').value = activeInventoryId ?? '';
        const snapshot = activeInventoryId ? await getDoc(doc(db, 'inventories', parseInventoryId(activeInventoryId))) : personal;
        if (requestSession !== session) return;
        if (activeInventoryId && (!snapshot.exists() || !snapshot.data().members?.includes(user.uid))) throw new Error('Inventory membership is unavailable.');
        const records = snapshot.exists() ? (snapshot.data().categories ?? []) : [];
        categories = normalizeCategories(records);
        savedVersion = inventoryVersion(records);
        ready = true;
        activeCategory = 'all';
        message(activeInventoryId ? 'Inventory loaded. Changes are shared with everyone connected to this ID.' : 'Inventory loaded. Changes are saved to your account.');
    } catch (error) {
        if (requestSession !== session) return;
        console.error('Inventory load failed:', error);
        message('Could not load inventory. Check your connection or account permissions and retry. No data was changed.', true);
        byId('retryLoad').hidden = false;
    }
    renderCategories();
}

onAuthStateChanged(auth, user => {
    session++;
    currentUser = user;
    ready = false;
    saving = false;
    activeInventoryId = null;
    byId('sharedInventoryDetails').hidden = true;
    byId('personalInventoryBtn').hidden = true;
    byId('sharedInventoryId').value = '';
    byId('joinInventoryId').value = '';
    byId('activeInventoryLabel').textContent = 'Personal inventory';
    categories = [];
    activeCategory = 'all';
    activeFilter = 'all';
    byId('search').value = '';
    categoryModal.close();
    itemModal.close();
    renderCategories();
    if (!user) { window.location.href = 'index.html'; return; }
    loadCategories();
});

// 4. Persistence. Apply changes only after Firestore confirms the save.
// Transactions reject stale tabs; merge preserves unrelated user-document fields.
async function saveCategories(nextCategories) {
    if (!ready || saving || !currentUser) return false;
    const user = currentUser;
    const requestSession = session;
    const expectedVersion = savedVersion;
    const reference = activeInventoryId ? doc(db, 'inventories', activeInventoryId) : doc(db, 'users', user.uid);
    saving = true;
    updateControls();
    message('Saving…');
    try {
        await runTransaction(db, async transaction => {
            const snapshot = await transaction.get(reference);
            const stored = snapshot.exists() ? (snapshot.data().categories ?? []) : [];
            if (inventoryVersion(stored) !== expectedVersion) throw new Error('inventory-conflict');
            if (requestSession !== session || auth.currentUser?.uid !== user.uid) throw new Error('session-changed');
            transaction.set(reference, { categories: nextCategories }, { merge: true });
        });
        if (requestSession !== session) return false;
        categories = nextCategories;
        savedVersion = inventoryVersion(nextCategories);
        message('All changes saved.');
        return true;
    } catch (error) {
        console.error('Inventory save failed:', error);
        if (requestSession !== session) return false;
        const conflict = error.message === 'inventory-conflict';
        message(conflict ? 'Inventory changed in another tab or by another member. Close this form and refresh inventory before editing again.' :
            'Could not save. Your saved inventory is unchanged; check your connection or permissions and try again.', true);
        document.querySelectorAll('dialog[open] .form-error').forEach(element => {
            element.textContent = conflict ? 'Another tab changed your inventory. Close this form and reload inventory.' : 'Save failed. Your input is still here. Please try again.';
        });
        if (conflict) { ready = false; byId('retryLoad').hidden = false; }
        return false;
    } finally {
        if (requestSession === session) {
            saving = false;
            renderCategories();
        }
    }
}

// 5. Category and item management
function openCategoryModal(category = null) {
    if (!ready || saving) return;
    editingCategory = category?.id ?? null;
    categoryForm.reset();
    byId('categoryError').textContent = '';
    byId('categoryTitle').textContent = category ? 'Edit Category' : 'Add Category';
    byId('categoryName').value = category?.name ?? '';
    const selectedIcon = categoryIconKey(category?.icon);
    byId('categoryIconOptions').replaceChildren(...Object.entries(categoryIcons).map(([key, label]) => {
        const option = element('label', 'category-icon-option');
        const radio = element('input');
        radio.type = 'radio';
        radio.name = 'categoryIcon';
        radio.value = key;
        radio.checked = key === selectedIcon;
        option.append(radio, categoryIconImage(key, 'picker-icon'), element('span', '', label));
        return option;
    }));
    categoryModal.showModal();
}

function openItemModal(categoryId = activeCategory, item = null) {
    if (!ready || saving || !categories.length) return;
    itemForm.reset();
    editingItem = item?.id ?? null;
    originalItemCategory = item ? categoryId : null;
    byId('itemError').textContent = '';
    byId('itemTitle').textContent = item ? 'Edit Item' : 'Add Item';
    byId('itemCategory').replaceChildren(...categories.map(category => new Option(category.name, category.id)));
    if (categories.some(category => category.id === categoryId)) byId('itemCategory').value = categoryId;
    byId('itemName').value = item?.name ?? '';
    const status = item ? stockStatus(item) : 'unconfigured';
    byId('itemStatus').value = status === 'unconfigured' ? '' : status;
    itemModal.showModal();
}

categoryForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!ready || saving) return;
    const name = byId('categoryName').value.trim();
    if (!name) { byId('categoryError').textContent = 'Enter a category name.'; return; }
    const icon = categoryIconKey(categoryForm.querySelector('[name="categoryIcon"]:checked')?.value);
    const next = structuredClone(categories);
    if (editingCategory) Object.assign(next.find(category => category.id === editingCategory), { name, icon });
    else next.push({ id: crypto.randomUUID(), name, icon, items: [] });
    if (await saveCategories(next)) categoryModal.close();
});

itemForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!ready || saving) return;
    const name = byId('itemName').value.trim();
    try {
        if (!name) throw new Error('Enter an item name.');
        const status = parseStatus(byId('itemStatus').value);
        const next = structuredClone(categories);
        const target = next.find(category => category.id === byId('itemCategory').value);
        if (!target) throw new Error('Select a category.');
        let original = {};
        let originalIndex = -1;
        if (editingItem) {
            const source = next.find(category => category.id === originalItemCategory);
            originalIndex = source.items.findIndex(item => item.id === editingItem);
            original = source.items.find(item => item.id === editingItem);
            source.items = source.items.filter(item => item.id !== editingItem);
        }
        const updated = { ...original, id: editingItem ?? crypto.randomUUID(), name, status };
        if (editingItem && target.id === originalItemCategory) target.items.splice(originalIndex, 0, updated);
        else target.items.push(updated);
        if (await saveCategories(next)) itemModal.close();
    } catch (error) { byId('itemError').textContent = error.message; }
});

async function removeCategory(category) {
    if (!ready || saving || !window.confirm('Delete “' + category.name + '” and all ' + category.items.length + ' items?')) return;
    if (await saveCategories(categories.filter(record => record.id !== category.id))) {
        if (activeCategory === category.id) activeCategory = 'all';
        renderCategories();
    }
}

async function removeItem(category, item) {
    if (!ready || saving || !window.confirm('Remove “' + item.name + '”?')) return;
    const next = structuredClone(categories);
    next.find(record => record.id === category.id).items = category.items.filter(record => record.id !== item.id);
    await saveCategories(next);
}

// 6. Rendering. textContent prevents saved names from injecting HTML.
function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function button(text, action, className = '', mutation = true) {
    const node = element('button', className, text);
    node.type = 'button';
    if (mutation) node.dataset.mutation = '';
    node.addEventListener('click', action);
    return node;
}

function categoryIconImage(key, className) {
    const image = element('img', className);
    image.src = '../Files/branding/' + categoryIconKey(key) + '.svg';
    image.alt = '';
    return image;
}

function renderItem(category, item) {
    const status = stockStatus(item);
    const row = element('li', 'item-card ' + status);
    const details = element('div', 'item-details');
    details.append(element('h3', '', item.name));
    if (status === 'unconfigured') details.append(element('p', 'item-hint', 'Edit to choose a stock status.'));
    const badge = element('span', 'stock-badge ' + status, labels[status]);
    const actions = element('div', 'item-actions');
    const edit = button('Edit', () => openItemModal(category.id, item), 'text-button');
    edit.setAttribute('aria-label', 'Edit ' + item.name);
    const remove = button('Remove', () => removeItem(category, item), 'text-button danger');
    remove.setAttribute('aria-label', 'Remove ' + item.name);
    actions.append(edit, remove);
    row.append(details, badge, actions);
    return row;
}

function renderCategories() {
    const total = categories.reduce((sum, category) => sum + category.items.length, 0);
    const categoryList = byId('categoryList');
    categoryList.replaceChildren();
    [{ id: 'all', name: 'All Items', count: total }, ...categories.map(category => ({ ...category, count: category.items.length }))].forEach(category => {
        const navigation = button('', () => { activeCategory = category.id; renderCategories(); }, 'category-nav', false);
        const label = element('span', 'category-nav-label');
        if (category.id !== 'all') label.append(categoryIconImage(category.icon, 'category-nav-icon'));
        label.append(element('span', '', category.name));
        navigation.append(label, element('span', 'count', category.count));
        navigation.setAttribute('aria-pressed', String(activeCategory === category.id));
        categoryList.append(navigation);
    });
    document.querySelectorAll('[data-filter]').forEach(control => control.setAttribute('aria-pressed', String(control.dataset.filter === activeFilter)));
    const container = byId('renderedCategories');
    container.replaceChildren();
    const search = byId('search').value;
    let shown = 0;
    categories.filter(category => activeCategory === 'all' || category.id === activeCategory).forEach(category => {
        const items = category.items.filter(item => matchesItem(item, search, activeFilter));
        if (!items.length && (search.trim() || activeFilter !== 'all')) return;
        shown += items.length;
        const card = element('section', 'category-card');
        const heading = element('div', 'category-heading');
        const icon = categoryIconImage(category.icon, 'category-icon');
        const title = element('div');
        title.append(element('h2', '', category.name), element('p', '', items.length + ' of ' + category.items.length + ' items'));
        heading.append(icon, title);
        const actions = element('div', 'category-actions');
        const edit = button('Edit', () => openCategoryModal(category), 'text-button');
        edit.setAttribute('aria-label', 'Edit category ' + category.name);
        const remove = button('Delete', () => removeCategory(category), 'text-button danger');
        remove.setAttribute('aria-label', 'Delete category ' + category.name);
        actions.append(edit, remove);
        const list = element('ul', 'item-list');
        list.append(...items.map(item => renderItem(category, item)));
        card.append(heading, actions, list);
        if (!items.length) card.append(element('p', 'empty-category', 'No items yet. Add your first item below.'));
        card.append(button('+ Add Item', () => openItemModal(category.id), 'add-item-button'));
        container.append(card);
    });
    byId('itemCount').textContent = shown + ' shown · ' + total + ' items total';
    byId('emptyState').hidden = !ready || container.childElementCount > 0;
    byId('emptyState').textContent = categories.length ? 'No items match your search and filters.' : 'Make room for a little order. Create your first category to get started.';
    updateControls();
}

// 7. Search, filtering, and event listeners
byId('search').addEventListener('input', renderCategories);
document.querySelectorAll('[data-filter]').forEach(control => control.addEventListener('click', () => {
    activeFilter = control.dataset.filter;
    renderCategories();
}));
byId('addCategoryTopBtn').addEventListener('click', () => openCategoryModal());
byId('addCategoryCardBtn').addEventListener('click', () => openCategoryModal());
byId('addItemBtn').addEventListener('click', () => openItemModal());
byId('cancelCategory').addEventListener('click', () => categoryModal.close());
byId('cancelItem').addEventListener('click', () => itemModal.close());
[categoryModal, itemModal].forEach(dialog => dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); }));
byId('retryLoad').addEventListener('click', loadCategories);
byId('logout-button').addEventListener('click', async () => {
    if (saving) return;
    try { await signOut(auth); }
    catch (error) { console.error(error); message('Could not sign out. Please try again.', true); }
});
renderCategories();

// 8. Connecting inventories. Changing connections never merges or deletes personal items.
async function changeInventory(action) {
    if (!currentUser || saving) return;
    const user = currentUser;
    const requestSession = session;
    saving = true;
    updateControls();
    message('Connecting inventory…');
    try {
        await action(user);
        if (requestSession !== session) return;
        saving = false;
        await loadCategories();
    } catch (error) {
        if (requestSession !== session) return;
        console.error('Inventory connection failed:', error);
        message(error.code ? 'Could not connect. Check your connection and ensure shared-inventory access rules are configured.' : error.message, true);
    } finally {
        if (currentUser?.uid === user.uid) { saving = false; updateControls(); }
    }
}

byId('createSharedBtn').addEventListener('click', () => {
    if (!ready || activeInventoryId || saving) return;
    if (!window.confirm('Create a shared copy of your personal inventory? Anyone signed in with its inventory ID can join and edit it. Your personal inventory will stay separate.')) return;
    changeInventory(user => createSharedInventory(user, savedVersion));
});
byId('joinInventoryForm').addEventListener('submit', event => {
    event.preventDefault();
    const id = byId('joinInventoryId').value;
    changeInventory(user => joinSharedInventory(user, id));
});
byId('personalInventoryBtn').addEventListener('click', () => changeInventory(selectPersonalInventory));
byId('refreshInventoryBtn').addEventListener('click', loadCategories);
byId('copyInventoryId').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(activeInventoryId); message('Inventory ID copied. Share it only with people you want to edit this inventory.'); }
    catch { byId('sharedInventoryId').select(); message('Select and copy the inventory ID shown above.'); }
});
