// GROCERY DOMAIN MODEL: pure, reusable functions (no DOM, Firebase, or mutable page state).
// Used by grocery.js and tests/grocery-model.test.mjs. Add validation and calculations here.

export const money = value => '₱' + Number(value).toLocaleString('en-PH', {minimumFractionDigits:2,maximumFractionDigits:2});

export const quantityLabel = item => item.boughtQuantity == null ? 'Quantity not recorded' : 'Quantity: ' + item.boughtQuantity;
export const priceLabel = item => item.price == null ? 'Price not recorded' : money(item.price);
/**
 * Purchase validation: Parse an optional numeric form field; an empty string becomes null rather than zero.
 * See docs/DEVELOPER_MANUAL.md for callers, data flow, and extension points.
 */
export function optionalNumber(input, label, max, decimalPlaces, positive = false) {
    const raw = input.value.trim();
    if (raw === '') return null;
    const decimalDigits = raw.includes('.') ? raw.split('.')[1].length : 0;
    const valid = /^[0-9]+(?:\.[0-9]+)?$/.test(raw);
    const value = Number(raw);
    if (!valid || decimalDigits > decimalPlaces || !Number.isFinite(value)
        || (positive ? value <= 0 : value < 0) || value > max) {
        throw new Error(label + ' must be a valid ' + (positive ? 'positive' : 'nonnegative')
            + ' number with up to ' + decimalPlaces + ' decimal places.');
    }
    return value;
}

/**
 * Stored-data validation: Reject unsupported or duplicate grocery entries before allowing edits.
 * See docs/DEVELOPER_MANUAL.md for callers, data flow, and extension points.
 */
// 2. Stored-record validation and UI control helpers.
export function validateList(records) {
    if (!Array.isArray(records)) throw Error('Grocery list has an unsupported format.');
    const ids = new Set();
    for (const item of records) {
        if (!item || typeof item.id !== 'string' || ids.has(item.id) || typeof item.name !== 'string' || !['pending','bought','unavailable'].includes(item.state))
            throw Error('Grocery list contains invalid data. No changes were made.');
        ids.add(item.id);
    }
    return records;
}

/**
 * Pure ordering logic: Reorder existing grocery records without changing their saved fields.
 * Inputs: records array, source ID, target ID, before/after flag.
 */
export function reorderedList(records, id, targetId, after) {
    if (id === targetId) return records;
    const result = [...records];
    const sourceIndex = result.findIndex(item => item.id === id);
    const destinationIndex = result.findIndex(item => item.id === targetId);
    if (sourceIndex === -1 || destinationIndex === -1) return records;
    const [moving] = result.splice(sourceIndex, 1);
    const index = result.findIndex(item => item.id === targetId);
    result.splice(index + Number(after), 0, moving);
    return result;
}
