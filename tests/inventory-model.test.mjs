import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const source = await readFile(new URL('../public/JS/inventory-model.js', import.meta.url), 'utf8');
const { normalizeCategories, stockStatus, parseStatus, matchesItem, inventoryVersion, categoryIcons, categoryIconKey, moveCategory, moveItem } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
test('legacy names and unknown fields survive migration; IDs remain stable', () => {
    const old = [{ name: 'Kitchen', note: 'keep', items: ['Rice', 'Rice'] }];
    const migrated = normalizeCategories(old);
    assert.equal(migrated[0].note, 'keep');
    assert.deepEqual(migrated[0].items.map(item => item.name), ['Rice', 'Rice']);
    assert.notEqual(migrated[0].items[0].id, migrated[0].items[1].id);
    assert.equal(stockStatus(migrated[0].items[0]), 'unconfigured');
    assert.deepEqual(normalizeCategories(migrated), migrated);
    assert.deepEqual(old[0].items, ['Rice', 'Rice']);
});
test('configured IDs and extra fields are preserved', () => {
    const record = [{ id: 'c', name: 'Room', items: [{ id: 'i', name: 'Lamp', currentQuantity: 3, maxQuantity: 10, note: 'keep' }] }];
    assert.deepEqual(normalizeCategories(record), record);
});
test('unsafe records stop migration instead of dropping data', () => {
    for (const records of [{}, [null], [{ name: 'Room', items: [42] }], [{ name: 'A', id: 'same', items: [] }, { name: 'B', id: 'same', items: [] }]]) assert.throws(() => normalizeCategories(records));
});
test('stock threshold, zero, missing, and above-maximum quantities', () => {
    for (const [currentQuantity, maxQuantity, expected] of [[0,10,'unavailable'],[1,5,'low'],[1,4,'available'],[21,100,'available'],[2,4,'available'],[12,10,'available'],[null,null,'unconfigured'],[-1,10,'unconfigured'],[2,0,'unconfigured']]) assert.equal(stockStatus({currentQuantity,maxQuantity}), expected);
});
test('status is required and explicit choices override old quantities', () => {
    for (const status of ['available','low','unavailable']) {
        assert.equal(parseStatus(status),status);
        assert.equal(stockStatus({status,currentQuantity:0,maxQuantity:10}),status);
    }
    for (const status of ['',null,'unconfigured','unknown']) assert.throws(()=>parseStatus(status));
});
test('search and filters combine; unconfigured items appear only in All', () => {
    const item = { name:'Basmati Rice', currentQuantity:1, maxQuantity:5 };
    assert.equal(matchesItem(item, ' RICE ', 'low'), true);
    assert.equal(matchesItem(item, 'rice', 'available'), false);
    assert.equal(matchesItem({name:'Rice'}, 'rice', 'all'), true);
    assert.equal(matchesItem({name:'Rice'}, '', 'unavailable'), false);
});
test('conflict comparison ignores object-key order but detects changes', () => {
    assert.equal(inventoryVersion([{name:'A',items:[]}]), inventoryVersion([{items:[],name:'A'}]));
    assert.notEqual(inventoryVersion([{name:'A'}]), inventoryVersion([{name:'B'}]));
});
test('historical unit fields are preserved without adding units to legacy names', () => {
    const records = normalizeCategories([{name:'Kitchen',items:['Rice',{name:'Flour',unit:'kg',currentQuantity:2,maxQuantity:5}]}]);
    assert.equal(records[0].items[0].unit, undefined);
    assert.equal(records[0].items[1].unit, 'kg');
});
test('category icons persist through normalization and unknown icons fall back safely', async () => {
    for (const icon of Object.keys(categoryIcons)) {
        assert.equal(categoryIconKey(icon), icon);
        assert.match(await readFile(new URL('../public/Files/branding/' + icon + '.svg', import.meta.url), 'utf8'), /<svg/);
    }
    for (const value of [undefined, null, '../unsafe', 'https://example.com/icon.svg', 'toString']) assert.equal(categoryIconKey(value), 'inventory');
    const records = normalizeCategories([{ name: 'Kitchen', icon: 'kitchen', items: ['Rice'] }]);
    assert.equal(records[0].icon, 'kitchen');
    assert.equal(records[0].items[0].name, 'Rice');
});


test('category moves retain every record and do not mutate source order', () => {
    const old = [
        { id: 'k', name: 'Kitchen', extra: 99, items: [{id: 'rice', name: 'Rice'}] },
        { id: 'b', name: 'Bedroom', items: [] },
        { id: 'l', name: 'Living Room', items: [] }
    ];
    const moved = moveCategory(old, 'l', 'k');
    assert.deepEqual(moved.map(row => row.id), ['l', 'k', 'b']);
    assert.deepEqual(moveCategory(moved, 'l', 'b', true).map(row => row.id), ['k', 'b', 'l']);
    assert.deepEqual(old.map(row => row.id), ['k','b','l']);
    assert.equal(moved[1].extra,99);
    assert.deepEqual(moveCategory(old,'k','k'),old);
    assert.throws(()=>moveCategory(old,'bad','k'));
});
test('items reorder within categories and move across categories without data loss', () => {
    const old = [
        { id:'k',name:'Kitchen',items:[{id:'a',name:'Rice',status:'low',custom:5},{id:'b',name:'Eggs'},{id:'c',name:'Milk'}] },
        { id:'b',name:'Bedroom',items:[{id:'d',name:'Lamp'}] }
    ];
    const reordered=moveItem(old,'k','c','k','a');
    assert.deepEqual(reordered[0].items.map(i=>i.id),['c','a','b']);
    const moved=moveItem(reordered,'k','a','b','d',true);
    assert.deepEqual(moved[0].items.map(i=>i.id),['c','b']);
    assert.deepEqual(moved[1].items.map(i=>i.id),['d','a']);
    assert.equal(moved[1].items[1].status,'low');
    assert.equal(moved[1].items[1].custom,5);
    assert.deepEqual(old[0].items.map(i=>i.id),['a','b','c']);
    assert.deepEqual(moveItem(old,'k','a','k','a'),old);
    assert.deepEqual(moveItem(old,'k','a','k',null).map(c=>c.items.map(i=>i.id)),[['b','c','a'],['d']]);
    assert.throws(()=>moveItem(old,'k','a','b','missing'));
    assert.throws(()=>moveItem(old,'k','missing','b'));
});
