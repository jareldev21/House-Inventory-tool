// Pure data helpers, shared by the interface and local tests.
export const categoryIcons = {
    inventory: 'Storage', kitchen: 'Kitchen', bedroom: 'Bedroom',
    'living-room': 'Living Room', bathroom: 'Bathroom', food: 'Food',
    cleaning: 'Cleaning', tools: 'Tools'
};

// Only bundled icons may be used; old categories retain the storage icon.
export function categoryIconKey(value) {
    return typeof value === 'string' && Object.hasOwn(categoryIcons, value) ? value : 'inventory';
}

export function normalizeCategories(records) {
    if (!Array.isArray(records)) throw new Error('Inventory categories have an unsupported format.');
    const categoryIds = new Set();
    const itemIds = new Set();
    return records.map((category, categoryIndex) => {
        if (!category || typeof category.name !== 'string' || !Array.isArray(category.items)) {
            throw new Error('A saved category has an unsupported format. No data was changed.');
        }
        const id = category.id || `legacy-category-${categoryIndex}`;
        if (typeof id !== 'string' || categoryIds.has(id)) throw new Error('Duplicate or invalid category ID.');
        categoryIds.add(id);
        return { ...category, id, items: category.items.map((record, itemIndex) => {
            const item = typeof record === 'string' ? { name: record } : record;
            if (!item || typeof item.name !== 'string') throw new Error('A saved item has an unsupported format.');
            const itemId = item.id || `legacy-item-${categoryIndex}-${itemIndex}`;
            if (typeof itemId !== 'string' || itemIds.has(itemId)) throw new Error('Duplicate or invalid item ID.');
            itemIds.add(itemId);
            // Preserve unknown fields and existing values; missing quantities are never assumed to be zero.
            return { ...item, id: itemId, currentQuantity: item.currentQuantity ?? null, maxQuantity: item.maxQuantity ?? null };
        }) };
    });
}

export function isConfigured(item) {
    return Number.isSafeInteger(item.currentQuantity) && item.currentQuantity >= 0 &&
        Number.isSafeInteger(item.maxQuantity) && item.maxQuantity >= 1;
}

export function stockStatus(item) {
    if (['available', 'low', 'unavailable'].includes(item.status)) return item.status;
    if (!isConfigured(item)) return 'unconfigured';
    if (item.currentQuantity === 0) return 'unavailable';
    return item.currentQuantity / item.maxQuantity <= 0.2 ? 'low' : 'available';
}

export function parseStatus(value) {
    if (!['available', 'low', 'unavailable'].includes(value)) throw new Error('Choose Available, Low Stock, or Unavailable.');
    return value;
}

export function matchesItem(item, search, filter) {
    return item.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) &&
        (filter === 'all' || stockStatus(item) === filter);
}

// Sort object keys so a Firestore field-order change is not mistaken for another edit.
export function inventoryVersion(value) {
    if (Array.isArray(value)) return `[${value.map(inventoryVersion).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${inventoryVersion(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

// Order is defined by array position; preserve all category/item fields.
export function moveCategory(records, sourceId, destinationId, after = false) {
    const sourceIndex = records.findIndex(category => category.id === sourceId);
    const destinationIndex = records.findIndex(category => category.id === destinationId);
    if (sourceIndex < 0 || destinationIndex < 0) throw new Error('Category not found. Refresh inventory.');
    if (sourceId === destinationId) return records;
    const result = [...records];
    const [source] = result.splice(sourceIndex, 1);
    const targetIndex = result.findIndex(category => category.id === destinationId);
    result.splice(targetIndex + Number(after), 0, source);
    return result;
}

export function moveItem(records, sourceCategoryId, itemId, targetCategoryId, targetItemId = null, after = false) {
    const next = structuredClone(records);
    const source = next.find(category => category.id === sourceCategoryId);
    const destination = next.find(category => category.id === targetCategoryId);
    if (!source || !destination) throw new Error('Category not found. Refresh inventory.');
    const sourceIndex = source.items.findIndex(item => item.id === itemId);
    if (sourceIndex < 0) throw new Error('Item not found. Refresh inventory.');
    if (sourceCategoryId === targetCategoryId && targetItemId === itemId) return records;
    // Validate the drop target before removing anything from the clone.
    if (targetItemId !== null && !destination.items.some(item => item.id === targetItemId))
        throw new Error('Drop target not found. Refresh inventory.');
    const [moving] = source.items.splice(sourceIndex, 1);
    const targetIndex = targetItemId === null
        ? destination.items.length
        : destination.items.findIndex(item => item.id === targetItemId) + Number(after);
    destination.items.splice(targetIndex, 0, moving);
    return next;
}
