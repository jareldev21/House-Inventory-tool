// GROCERY CONTROLLER: private shopping list, stock imports, purchase tracking, and ordering.
// Grocery state lives in users/{uid}.groceryItems; categories are read from the active inventory.

import { auth, db } from './firebase.js';
import { doc, getDoc, runTransaction } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { normalizeCategories, stockStatus, inventoryVersion } from './inventory-model.js';
import { money, quantityLabel, priceLabel, optionalNumber, validateList, reorderedList } from './grocery-model.js';

// 1. DOM references and session/data snapshots; pure helpers are in grocery-model.js.
const byId = id => document.getElementById(id);
let user = null, session = 0, ready = false, saving = false;
let items = [], version = inventoryVersion([]), categories = [], categoryVersion = inventoryVersion([]);
let inventoryId = null, selectedItemId = null;
let groceryDrag = null;
/**
 * UI feedback: Show load/save errors and success messages without modifying Firestore.
 * See docs/DEVELOPER_MANUAL.md for callers, data flow, and extension points.
 */
function feedback(text, error = false) {
    byId('groceryMessage').textContent = text;
    byId('groceryMessage').classList.toggle('error', error);
}
/**
 * UI state: Gate mutations and drag grips while loading or saving.
 * See docs/DEVELOPER_MANUAL.md for callers, data flow, and extension points.
 */
function controls() {
    const disabled = !ready || saving;
    document.querySelectorAll('#importLow,#importUnavailable,#addGroceryBtn,#groceryName').forEach(node => node.disabled = disabled);
    document.querySelectorAll('.grocery-item-actions button, .grocery-list .drag-handle').forEach(node => node.disabled = disabled);
    document.querySelectorAll('dialog input,dialog select,dialog button').forEach(node => node.disabled = disabled);
    byId('logout-button').disabled = saving;
}
/**
 * DOM helper: Create elements using textContent, never untrusted HTML.
 * See docs/DEVELOPER_MANUAL.md for callers, data flow, and extension points.
 */
function node(tag, className, value) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (value != null) el.textContent = value;
    return el;
}
/**
 * DOM helper: Create an enabled/disabled button wired to an action callback.
 * See docs/DEVELOPER_MANUAL.md for callers, data flow, and extension points.
 */
function action(label, callback) {
    const el = node('button', '', label); el.type = 'button'; el.disabled = !ready || saving; el.addEventListener('click', callback); return el;
}
// 2. Grocery drag-and-drop: calculate order in grocery-model.js, then save.
// Persist display order by rearranging the same groceryItems array.
/**
 * Drag lifecycle: Clear highlighted destinations, the preview, and pointer state.
 * See docs/DEVELOPER_MANUAL.md for callers, data flow, and extension points.
 */
function clearGroceryDrag() {
    document.querySelectorAll('.grocery-drop-target').forEach(el => el.classList.remove('grocery-drop-target'));
    groceryDrag?.ghost?.remove();
    groceryDrag?.handle?.classList.remove('dragging');
    groceryDrag = null;
}
/**
 * Drag/keyboard controls: Create the shopping-row grip and send completed moves through saveList.
 * See docs/DEVELOPER_MANUAL.md for callers, data flow, and extension points.
 */
function groceryHandle(item) {
    const handle = node('button', 'drag-handle', '⠿');
    handle.type = 'button';
    handle.disabled = !ready || saving;
    handle.dataset.item = item.id;
    handle.title = 'Drag or use up/down arrow keys';
    handle.setAttribute('aria-label', 'Rearrange ' + item.name + '. Drag or use up/down arrow keys.');
    handle.addEventListener('pointerdown', event => {
        if (!ready || saving || event.button !== 0 || groceryDrag) return;
        groceryDrag = { pointerId:event.pointerId, handle, id:item.id, name:item.name,
            x:event.clientX, y:event.clientY, active:false, target:null, ghost:null };
        handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove', event => {
        const drag = groceryDrag;
        if (!drag || drag.handle !== handle || drag.pointerId !== event.pointerId || !ready || saving) return;
        if (!drag.active && Math.hypot(event.clientX-drag.x, event.clientY-drag.y) < 7) return;
        event.preventDefault();
        if (!drag.active) {
            drag.active = true;
            handle.classList.add('dragging');
            drag.ghost = node('div','grocery-drag-preview','⠿  '+drag.name);
            document.body.append(drag.ghost);
        }
        drag.ghost.style.left = Math.min(event.clientX + 14, window.innerWidth - 50)+'px';
        drag.ghost.style.top = Math.max(5,event.clientY - 20)+'px';
        if (event.clientY < 55) window.scrollBy(0,-20);
        if (event.clientY > window.innerHeight - 55) window.scrollBy(0,20);
        document.querySelectorAll('.grocery-drop-target').forEach(el => el.classList.remove('grocery-drop-target'));
        const row = document.elementFromPoint(event.clientX,event.clientY)?.closest('.grocery-item');
        drag.target = row && row.dataset.item !== drag.id
            ? {id:row.dataset.item,after:event.clientY>=row.getBoundingClientRect().top + row.getBoundingClientRect().height/2}
            : null;
        if (drag.target) row.classList.add('grocery-drop-target');
    });
    handle.addEventListener('pointerup', async event => {
        if (!groceryDrag || groceryDrag.handle !== handle || groceryDrag.pointerId !== event.pointerId) return;
        const target = groceryDrag.active ? groceryDrag.target : null;
        clearGroceryDrag();
        if (target && ready && !saving) {
            const next = reorderedList(items, item.id,target.id,target.after);
            if (next !== items) await saveList(next);
        }
    });
    handle.addEventListener('pointercancel',clearGroceryDrag);
    handle.addEventListener('lostpointercapture',() => {
        if (groceryDrag?.handle === handle) clearGroceryDrag();
    });
    handle.addEventListener('keydown', async event => {
        if (!ready || saving || !['ArrowUp','ArrowDown'].includes(event.key)) return;
        const index = items.findIndex(entry => entry.id === item.id);
        const delta = event.key === 'ArrowUp' ? -1 : 1;
        const target = items[index + delta];
        if (!target) return;
        event.preventDefault();
        if (await saveList(reorderedList(items, item.id,target.id,delta > 0))) {
            [...document.querySelectorAll('.grocery-list .drag-handle')].find(el=>el.dataset.item===item.id)?.focus();
        }
    });
    return handle;
}
/**
 * Rendering: Rebuild rows, action buttons, item totals, and recorded spending from groceries.
 * See docs/DEVELOPER_MANUAL.md for callers, data flow, and extension points.
 */
// 3. Grocery list rendering and summary totals.
function render() {
    const list = byId('groceryList');
    list.replaceChildren();
    for (const item of items) {
        const li = node('li', 'grocery-item ' + item.state);
        li.dataset.item = item.id;
        const details = node('div');
        details.append(node('div', 'grocery-name', item.name));
        const meta = item.state === 'bought' ? 'Bought · ' + quantityLabel(item) + ' · ' + priceLabel(item) :
            item.state === 'unavailable' ? 'Not available at the store' : 'To buy';
        details.append(node('p', 'grocery-meta', meta + (item.source ? ' · From inventory' : ' · Manually added')));
        const actions = node('div','grocery-item-actions');
        if (item.state !== 'bought') actions.append(action('Bought', () => openBought(item)));
        else actions.append(action('Edit purchase', () => openBought(item)));
        if (item.state !== 'unavailable') actions.append(action('Not available', () => changeItem(item.id, { state:'unavailable', price:null, boughtQuantity:null })));
        if (item.state !== 'pending') actions.append(action('Reset', () => changeItem(item.id, { state:'pending', price:null, boughtQuantity:null })));
        if (!item.source && !item.inventoryAdded) actions.append(action('Add to inventory', () => openInventory(item)));
        actions.append(action('Remove', () => {
            if (window.confirm('Remove “' + item.name + '” from your grocery list?')) saveList(items.filter(entry => entry.id !== item.id));
        }));
        li.append(groceryHandle(item), details, actions); list.append(li);
    }
    byId('groceryCount').textContent = items.length + ' items · ' + items.filter(i=>i.state==='bought').length + ' bought';
    const withPrices = items.filter(i => i.state === 'bought' && typeof i.price === 'number');
    byId('groceryTotal').textContent = withPrices.length
        ? 'Recorded spending: ' + money(withPrices.reduce((sum,i)=>sum+i.price,0))
        : 'Recorded spending: —';
    byId('groceryEmpty').hidden = !ready || items.length > 0;
    controls();
}
/**
 * Firestore read: Read the user's private grocery list and current inventory snapshot, then process optional imports.
 * See docs/DEVELOPER_MANUAL.md for callers, data flow, and extension points.
 */
// 4. Session lifecycle and Firestore reads.
async function load() {
    if (!user || saving) return;
    const token = ++session, uid = user.uid;
    ready = false; items = []; categories = []; render(); feedback('Loading grocery and inventory…');
    byId('retryGrocery').hidden = true;
    try {
        const personal = await getDoc(doc(db, 'users', uid));
        if (token !== session) return;
        const data = personal.exists() ? personal.data() : {};
        inventoryId = data.activeInventoryId || null;
        items = validateList(data.groceryItems ?? []);
        version = inventoryVersion(items);
        const snapshot = inventoryId ? await getDoc(doc(db,'inventories',inventoryId)) : personal;
        if (token !== session) return;
        if (inventoryId && (!snapshot.exists() || !snapshot.data().members?.includes(uid))) throw Error('Inventory sharing access unavailable.');
        const records = snapshot.exists() ? snapshot.data().categories ?? [] : [];
        categories = normalizeCategories(records); categoryVersion = inventoryVersion(records);
        ready = true; feedback('List loaded. Changes save to your account.');
        const requested = new URLSearchParams(location.search).get('import');
        if (requested === 'low' || requested === 'unavailable') {
            history.replaceState(null,'',location.pathname);
            await importStatus(requested);
        }
    } catch (error) {
        if (token !== session) return;
        console.error('Grocery load failed', error);
        feedback('Could not load your list or inventory. Check connection and permissions. No data was changed.',true);
        byId('retryGrocery').hidden = false;
    } finally { if (token === session) render(); }
}
// Authentication event: clear UI when account changes; reload only after sign-in.
onAuthStateChanged(auth, value => {
    session++; clearGroceryDrag(); user=value; ready=false; saving=false; inventoryId=null; items=[]; categories=[];
    byId('boughtDialog').close(); byId('inventoryDialog').close(); render();
    if (!value) { location.replace('index.html'); return; }
    load();
});
/**
 * Firestore write: Persist groceryItems transactionally with conflict detection and no premature UI commit.
 * See docs/DEVELOPER_MANUAL.md for callers, data flow, and extension points.
 */
// 5. Transactional grocery CRUD and inventory status imports.
async function saveList(next) {
    if (!ready || saving || !user) return false;
    const token=session, uid=user.uid, expected=version;
    saving=true; controls(); feedback('Saving grocery list…');
    try {
        await runTransaction(db, async tx => {
            const ref=doc(db,'users',uid);
            const snap=await tx.get(ref);
            const actual=snap.exists() ? snap.data().groceryItems ?? [] : [];
            if (inventoryVersion(actual)!==expected) throw Error('grocery-conflict');
            if (token!==session || auth.currentUser?.uid!==uid) throw Error('session-changed');
            tx.set(ref,{groceryItems:next},{merge:true});
        });
        if (token!==session) return false;
        items=next; version=inventoryVersion(next); feedback('Grocery list saved.'); return true;
    } catch (error) {
        console.error('Grocery save failed',error);
        if (token===session) {
            const conflict=error.message==='grocery-conflict';
            feedback(conflict?'Your grocery list changed in another tab. Reload the page before making more changes.':'Save failed. Your saved list is unchanged.',true);
            if(conflict){ready=false;byId('retryGrocery').hidden=false;}
        }
        return false;
    } finally {if(token===session){saving=false;render();}}
}
/**
 * Grocery mutation: Update one shopping item while preserving its other saved fields.
 * See docs/DEVELOPER_MANUAL.md for callers, data flow, and extension points.
 */
async function changeItem(id, changes) {
    await saveList(items.map(item => item.id===id ? {...item,...changes} : item));
}
/**
 * Inventory-to-grocery import: Append matching low/unavailable inventory records without duplicating source IDs.
 * See docs/DEVELOPER_MANUAL.md for callers, data flow, and extension points.
 */
async function importStatus(status) {
    if (!ready || saving) return;
    const additions=[];
    const existing=new Set(items.filter(i=>i.source).map(i=>i.source));
    for (const category of categories) for (const item of category.items) {
        if (stockStatus(item)!==status) continue;
        const source=(inventoryId||'personal')+'/'+category.id+'/'+item.id;
        if (existing.has(source)) continue;
        existing.add(source);
        additions.push({id:crypto.randomUUID(),name:item.name,state:'pending',price:null,boughtQuantity:null,source});
    }
    if (!additions.length) {feedback('No new ' + (status==='low'?'low-stock':'unavailable') + ' items to add.');return;}
    if (await saveList([...items,...additions])) feedback('Added '+additions.length+' items from inventory.');
}
// 6. Grocery import and manual-entry event handlers.
byId('importLow').addEventListener('click',()=>importStatus('low'));
byId('importUnavailable').addEventListener('click',()=>importStatus('unavailable'));
byId('retryGrocery').addEventListener('click',load);
byId('addGroceryForm').addEventListener('submit',async event=>{
    event.preventDefault();
    const name=byId('groceryName').value.trim();
    if(!name || name.length>200) return;
    if(await saveList([...items,{id:crypto.randomUUID(),name,state:'pending',price:null,boughtQuantity:null,source:null}])){
        byId('addGroceryForm').reset();
    }
});
/**
 * Purchase form: Prefill the Bought dialog for new purchases or later corrections.
 * See docs/DEVELOPER_MANUAL.md for callers, data flow, and extension points.
 */
// 7. Bought dialog: optional price and quantity (null means not recorded).
function openBought(item) {
    if (!ready || saving) return;
    selectedItemId=item.id;
    byId('boughtForm').reset(); byId('boughtError').textContent='';
    byId('boughtItemName').textContent=item.name;
    byId('boughtTitle').textContent=item.state === 'bought' ? 'Edit purchase' : 'Mark as bought';
    byId('boughtQuantity').value = item.boughtQuantity == null ? '' : String(item.boughtQuantity);
    byId('boughtPrice').value = item.price == null ? '' : String(item.price);
    byId('boughtDialog').showModal();
}
byId('cancelBought').addEventListener('click',()=>byId('boughtDialog').close());
// Purchase submit handler: mark bought only after a successful saveList call.
byId('boughtForm').addEventListener('submit',async event=>{
    event.preventDefault();
    try {
        const boughtQuantity = optionalNumber(byId('boughtQuantity'), 'Quantity', 999999, 3, true);
        const price = optionalNumber(byId('boughtPrice'), 'Price', 999999999, 2);
        if (await saveList(items.map(item => item.id === selectedItemId
            ? {...item, state:'bought', boughtQuantity, price} : item))) byId('boughtDialog').close();
    } catch (error) {
        byId('boughtError').textContent = error.message;
    }
});
/**
 * Optional inventory transfer: Open the explicit manual-grocery-item transfer form with available categories.
 * See docs/DEVELOPER_MANUAL.md for callers, data flow, and extension points.
 */
// 8. Explicit grocery-to-inventory transfer. Never update stock automatically on purchase.
function openInventory(item) {
    if (!ready||saving||item.source||item.inventoryAdded) return;
    selectedItemId=item.id;
    const select=byId('inventoryCategory');
    select.replaceChildren(...categories.map(category=>new Option(category.name,category.id)));
    byId('inventoryError').textContent='';
    byId('inventoryItemName').textContent=item.name;
    byId('inventoryStatus').value='available';
    if(!categories.length) {feedback('Create an inventory category first, then try adding this item.',true);return;}
    byId('inventoryDialog').showModal();
}
byId('cancelInventory').addEventListener('click',()=>byId('inventoryDialog').close());
// Transfer submit handler: one transaction updates inventory and the user's grocery flag.
byId('inventoryForm').addEventListener('submit',async event=>{
    event.preventDefault();
    if(!ready||saving||!user)return;
    const current=items.find(i=>i.id===selectedItemId);
    const targetId=byId('inventoryCategory').value, status=byId('inventoryStatus').value;
    if(!current||current.source||current.inventoryAdded||!['available','low','unavailable'].includes(status))return;
    const token=session, uid=user.uid;
    saving=true;controls();feedback('Adding item to inventory…');
    try{
        await runTransaction(db,async tx=>{
            const inventoryRef=inventoryId?doc(db,'inventories',inventoryId):doc(db,'users',uid);
            const groceryRef=doc(db,'users',uid);
            const inventorySnap=await tx.get(inventoryRef);
            const grocerySnap=inventoryId?await tx.get(groceryRef):inventorySnap;
            const existing=inventorySnap.exists()?inventorySnap.data().categories??[]:[];
            const grocery=grocerySnap.exists()?grocerySnap.data().groceryItems??[]:[];
            if(inventoryVersion(existing)!==categoryVersion||inventoryVersion(grocery)!==version)throw Error('data-conflict');
            if(token!==session||auth.currentUser?.uid!==uid)throw Error('session-changed');
            const next=normalizeCategories(existing);
            const category=next.find(c=>c.id===targetId);
            if(!category)throw Error('Category not found.');
            category.items.push({id:crypto.randomUUID(),name:current.name,status});
            const updated=grocery.map(i=>i.id===current.id?{...i,inventoryAdded:true}:i);
            if(inventoryId){
                tx.set(inventoryRef,{categories:next},{merge:true});
                tx.set(groceryRef,{groceryItems:updated},{merge:true});
            }else tx.set(groceryRef,{categories:next,groceryItems:updated},{merge:true});
        });
        if(token!==session)return;
        // Reload authoritative data and versions after the committed transaction.
        saving=false;
        byId('inventoryDialog').close();
        await load();
        if (ready) feedback('Item added to inventory.');
    }catch(error){
        console.error('Add to inventory failed',error);
        if(token===session){
            byId('inventoryError').textContent=error.message==='data-conflict'?'Inventory or grocery list changed. Reload before trying again.':'Could not add to inventory. No changes were saved.';
        }
    }finally{if(token===session){saving=false;render();}}
});
// 9. Session exit and initial UI render.
byId('logout-button').addEventListener('click',async()=>{
    if(saving)return;
    try{await signOut(auth);}catch(error){console.error(error);feedback('Could not sign out.',true);}
});
render();
