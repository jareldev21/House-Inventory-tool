import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Load the pure browser ES module without contacting Firebase or a live account.
const source = await readFile(new URL('../public/JS/grocery-model.js', import.meta.url), 'utf8');
const { money, quantityLabel, priceLabel, optionalNumber, validateList, reorderedList } =
    await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

const input = value => ({ value });

test('optional quantity and price distinguish null from numeric zero', () => {
    assert.equal(optionalNumber(input(''), 'Quantity', 999999, 3, true), null);
    assert.equal(optionalNumber(input('2.5'), 'Quantity', 999999, 3, true), 2.5);
    assert.equal(optionalNumber(input('0'), 'Price', 999999999, 2), 0);
    assert.equal(optionalNumber(input(''), 'Price', 999999999, 2), null);
    for (const invalid of ['-1', 'abc', '0', '1.2345', '1000000']) {
        assert.throws(() => optionalNumber(input(invalid), 'Quantity', 999999, 3, true), invalid);
    }
    assert.throws(() => optionalNumber(input('3.555'), 'Price', 999999999, 2));
});

test('money and purchase labels distinguish unrecorded values', () => {
    assert.equal(quantityLabel({ boughtQuantity: null }), 'Quantity not recorded');
    assert.equal(quantityLabel({ boughtQuantity: 3 }), 'Quantity: 3');
    assert.equal(priceLabel({ price: null }), 'Price not recorded');
    assert.equal(priceLabel({ price: 25 }), money(25));
});

test('grocery validator rejects duplicate IDs and unsupported state', () => {
    const records = [{ id:'a', name:'Milk', state:'pending', price:null }];
    assert.equal(validateList(records), records);
    for (const invalid of [null, {}, [{...records[0],state:'missing'}], [records[0], records[0]]]) {
        assert.throws(() => validateList(invalid));
    }
});

test('grocery reorder is immutable and retains purchase/source fields', () => {
    const old = [
        { id:'a', name:'Milk', state:'bought', price:40, boughtQuantity:null, source:'personal/k/a' },
        { id:'b', name:'Eggs', state:'pending', price:null, boughtQuantity:null },
        { id:'c', name:'Bread', state:'pending', price:null, boughtQuantity:null }
    ];
    const moved = reorderedList(old, 'c', 'a', false);
    assert.deepEqual(moved.map(item => item.id), ['c','a','b']);
    assert.deepEqual(old.map(item => item.id), ['a','b','c']);
    assert.equal(moved[1], old[0]);
    assert.equal(moved[1].source, 'personal/k/a');
    assert.deepEqual(reorderedList(old, 'a', 'c', true).map(item => item.id), ['b','c','a']);
    assert.equal(reorderedList(old, 'a', 'a'), old);
    assert.equal(reorderedList(old, 'a', 'unknown'), old);
});
