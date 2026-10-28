import { auth, db } from "./firebase.js";
import {
  doc,
  getDoc,
  runTransaction,
  setDoc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  normalizeCategories,
  stockStatus,
  inventoryVersion,
} from "./inventory-model.js";

const byId = (id) => document.getElementById(id);

let user = null,
  session = 0,
  ready = false,
  saving = false;

let items = [],
  version = inventoryVersion([]),
  categories = [],
  categoryVersion = inventoryVersion([]);

let selectedItemId = null;

let groceryDrag = null;

let stopGrocerySync = null;

let pendingGroceryWrites = 0;

const money = (value) =>
  "₱" +
  Number(value).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const quantityLabel = (item) =>
  item.boughtQuantity == null
    ? "Quantity not recorded"
    : "Quantity: " + item.boughtQuantity;

const priceLabel = (item) =>
  item.price == null ? "Price not recorded" : money(item.price);

function optionalNumber(input, label, max, decimalPlaces, positive = false) {
  const raw = input.value.trim();

  if (raw === "") return null;
  const decimalDigits = raw.includes(".") ? raw.split(".")[1].length : 0;

  const valid = /^[0-9]+(?:\.[0-9]+)?$/.test(raw);

  const value = Number(raw);

  if (
    !valid ||
    decimalDigits > decimalPlaces ||
    !Number.isFinite(value) ||
    (positive ? value <= 0 : value < 0) ||
    value > max
  ) {
    throw new Error(
      label +
        " must be a valid " +
        (positive ? "positive" : "nonnegative") +
        " number with up to " +
        decimalPlaces +
        " decimal places.",
    );
  }
  return value;
}

function feedback(text, error = false) {
  byId("groceryMessage").textContent = text;
  byId("groceryMessage").classList.toggle("error", error);
}
function validateList(records) {
  if (!Array.isArray(records))
    throw Error("Grocery list has an unsupported format.");
  const ids = new Set();
  for (const item of records) {
    if (
      !item ||
      typeof item.id !== "string" ||
      ids.has(item.id) ||
      typeof item.name !== "string" ||
      !["pending", "bought", "unavailable"].includes(item.state)
    )
      throw Error("Grocery list contains invalid data. No changes were made.");
    ids.add(item.id);
  }
  return records;
}

function controls() {
  const disabled = !ready || saving;

  document.querySelectorAll(
      "#importLow,#groceryCategory,#importUnavailable,#addGroceryBtn,#groceryName",
    )
    .forEach((node) => (node.disabled = disabled));

  document.querySelectorAll(
      ".grocery-item-actions button, .grocery-list .drag-handle",
    )
    .forEach((node) => (node.disabled = disabled));

  document.querySelectorAll("dialog input,dialog select,dialog button")
    .forEach((node) => (node.disabled = disabled));

  byId("logout-button").disabled = saving;

  byId("clearGroceryBtn").disabled =
  !ready || saving || items.length === 0;
}

function node(tag, className, value) {

  const el = document.createElement(tag);

  if (className) el.className = className;

  if (value != null) el.textContent = value;
  
  return el;
}

function action(label, callback) {
  const el = node("button", "", label);
  el.type = "button";
  el.disabled = !ready || saving;
  el.addEventListener("click", callback);
  return el;
}
// Persist display order by rearranging the same groceryItems array.
function reorderedList(id, targetId, after) {
  if (id === targetId) return items;
  const result = [...items];
  const sourceIndex = result.findIndex((item) => item.id === id);
  const destinationIndex = result.findIndex((item) => item.id === targetId);
  if (sourceIndex === -1 || destinationIndex === -1) return items;
  const [moving] = result.splice(sourceIndex, 1);
  const index = result.findIndex((item) => item.id === targetId);
  result.splice(index + Number(after), 0, moving);
  return result;
}
function clearGroceryDrag() {
  document
    .querySelectorAll(".grocery-drop-target")
    .forEach((el) => el.classList.remove("grocery-drop-target"));
  groceryDrag?.ghost?.remove();
  groceryDrag?.handle?.classList.remove("dragging");
  groceryDrag = null;
}
function groceryHandle(item) {
  const handle = node("button", "drag-handle", "⠿");
  handle.type = "button";
  handle.disabled = !ready || saving;
  handle.dataset.item = item.id;
  handle.title = "Drag or use up/down arrow keys";
  handle.setAttribute(
    "aria-label",
    "Rearrange " + item.name + ". Drag or use up/down arrow keys.",
  );
  handle.addEventListener("pointerdown", (event) => {
    if (!ready || saving || event.button !== 0 || groceryDrag) return;
    groceryDrag = {
      pointerId: event.pointerId,
      handle,
      id: item.id,
      name: item.name,
      x: event.clientX,
      y: event.clientY,
      active: false,
      target: null,
      ghost: null,
    };
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener("pointermove", (event) => {
    const drag = groceryDrag;
    if (
      !drag ||
      drag.handle !== handle ||
      drag.pointerId !== event.pointerId ||
      !ready ||
      saving
    )
      return;
    if (
      !drag.active &&
      Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 7
    )
      return;
    event.preventDefault();
    if (!drag.active) {
      drag.active = true;
      handle.classList.add("dragging");
      drag.ghost = node("div", "grocery-drag-preview", "⠿  " + drag.name);
      document.body.append(drag.ghost);
    }
    drag.ghost.style.left =
      Math.min(event.clientX + 14, window.innerWidth - 50) + "px";
    drag.ghost.style.top = Math.max(5, event.clientY - 20) + "px";
    if (event.clientY < 55) window.scrollBy(0, -20);
    if (event.clientY > window.innerHeight - 55) window.scrollBy(0, 20);
    document
      .querySelectorAll(".grocery-drop-target")
      .forEach((el) => el.classList.remove("grocery-drop-target"));
    const row = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest(".grocery-item");
    drag.target =
      row && row.dataset.item !== drag.id
        ? {
            id: row.dataset.item,
            after:
              event.clientY >=
              row.getBoundingClientRect().top +
                row.getBoundingClientRect().height / 2,
          }
        : null;
    if (drag.target) row.classList.add("grocery-drop-target");
  });
  handle.addEventListener("pointerup", async (event) => {
    if (
      !groceryDrag ||
      groceryDrag.handle !== handle ||
      groceryDrag.pointerId !== event.pointerId
    )
      return;
    const target = groceryDrag.active ? groceryDrag.target : null;
    clearGroceryDrag();
    if (target && ready && !saving) {
      const next = reorderedList(item.id, target.id, target.after);
      if (next !== items) await saveList(next);
    }
  });
  handle.addEventListener("pointercancel", clearGroceryDrag);

  handle.addEventListener("lostpointercapture", () => {
    if (groceryDrag?.handle === handle) clearGroceryDrag();

  });
  handle.addEventListener("keydown", async (event) => {
    if (!ready || saving || !["ArrowUp", "ArrowDown"].includes(event.key))
      return;
    const index = items.findIndex((entry) => entry.id === item.id);
    const delta = event.key === "ArrowUp" ? -1 : 1;
    const target = items[index + delta];
    if (!target) return;
    event.preventDefault();

    if (await saveList(reorderedList(item.id, target.id, delta > 0))) {
      [...document.querySelectorAll(".grocery-list .drag-handle")]
        .find((el) => el.dataset.item === item.id)
        ?.focus();
    }
  });
  return handle;
}

function groceryCategoryName(item) {
  const categoryId = item.categoryId ?? item.source?.split("/")[1];

  const category = categories.find(
    (category) => category.id === categoryId
  );

  return category?.name ?? "Uncategorized";
}


function findLinkedInventoryItem(groceryItem, records = categories) {
  const parts = groceryItem.source?.split("/") ?? [];

  if (parts[0] !== "personal") return null;

  for (const category of records) {
    const found = category.items.find(
      (item) => item.id === parts[2]
    );

    if (found) return found;
  }

  return null;
}

function render() {

  const list = byId("groceryList");

  const boughtList = byId("groceryBoughtList");

  const notBoughtGroups = new Map();

  const boughtGroups = new Map();

  list.replaceChildren();

  boughtList.replaceChildren();

  for (const item of items) {

    const li = node("li", "grocery-item " + item.state);

    li.dataset.item = item.id;

    const details = node("div");

    details.append(node("div", "grocery-name", item.name));

    const inventoryItem = findLinkedInventoryItem(item);

if (inventoryItem?.quantityText) {
  details.append(
    node(
      "p",
      "grocery-meta",
      "Current Quantity: " + inventoryItem.quantityText
    )
  );
}

    const meta =
      item.state === "bought"
        ? "Bought · " + quantityLabel(item) + " · " + priceLabel(item)
        : item.state === "unavailable"
          ? "Not available at the store"
          : "To buy";
    details.append(
      node(
        "p",
        "grocery-meta",
        meta + (item.source ? " · From inventory" : " · Manually added"),
      ),
    );

    const actions = node("div", "grocery-item-actions");

    if (item.state !== "bought")
      actions.append(action("Bought", () => openBought(item)));
    else actions.append(action("Edit purchase", () => openBought(item)));

    if (item.state !== "unavailable")
      actions.append(
        action("Not available", () =>
          changeItem(item.id, {
            state: "unavailable",
            price: null,
            boughtQuantity: null,
          }),
        ),
      );

    if (item.state !== "pending")
      actions.append(
        action("Reset", () =>
          changeItem(item.id, {
            state: "pending",
            price: null,
            boughtQuantity: null,
          }),
        ),
      );

    if (!item.source && !item.inventoryAdded)
      actions.append(action("Add to inventory", () => openInventory(item)));

    actions.append(
      action("Remove", () => {
        if (
          window.confirm("Remove “" + item.name + "” from your grocery list?")
        )
          saveList(items.filter((entry) => entry.id !== item.id));
      }),
    );

    li.append(groceryHandle(item), details, actions);

    if (item.state === "bought") {
      const categoryName = groceryCategoryName(item);

      if (!boughtGroups.has(categoryName)) {
        boughtGroups.set(categoryName, []);
      }

      boughtGroups.get(categoryName).push(li);
    }
    else {
      const categoryName = groceryCategoryName(item);

      if (!notBoughtGroups.has(categoryName)) {
        notBoughtGroups.set(categoryName, []);
      }

      notBoughtGroups.get(categoryName).push(li);
    }

    }

    for (const [categoryName, rows] of notBoughtGroups) {
      list.append(
        node("li", "grocery-category-heading", categoryName),
        ...rows
      );
    }

    for (const [categoryName, rows] of boughtGroups) {
      boughtList.append(
        node("li", "grocery-category-heading", categoryName),
    ...rows
  );
    }
  
  byId("groceryCount").textContent =
    items.length +
    " items · " +
    items.filter((i) => i.state === "bought").length +
    " bought";

  const withPrices = items.filter(
    (i) => i.state === "bought" && typeof i.price === "number",
  );

  byId("groceryTotal").textContent = withPrices.length
    ? "Recorded spending: " +
      money(withPrices.reduce((sum, i) => sum + i.price, 0))
    : "Recorded spending: —";

  byId("groceryEmpty").hidden = !ready || items.length > 0;
  controls();
}
async function load() {
  if (!user || saving) return;

  const token = ++session,

    uid = user.uid;

  ready = false;

  items = [];

  categories = [];
  


  render();

  feedback("Loading grocery and inventory…");

  byId("retryGrocery").hidden = true;

  try {
    const personal = await getDoc(doc(db, "users", uid));

    if (token !== session) return;

    const data = personal.exists() ? personal.data() : {};

    items = validateList(data.groceryItems ?? []);

    version = inventoryVersion(items);

    const snapshot = personal;

    if (token !== session) return;

    const records = snapshot.exists() ? (snapshot.data().categories ?? []) : [];

    categories = normalizeCategories(records);

    const categorySelect = byId("groceryCategory");

    categorySelect.replaceChildren(
      new Option("Uncategorized", ""),
      ...categories.map(
        (category) => new Option(category.name, category.id)
      )
    );

    categoryVersion = inventoryVersion(records);

    ready = true;
    feedback("List loaded. Changes save to your account.");
    const requested = new URLSearchParams(location.search).get("import");
    if (requested === "low" || requested === "unavailable") {
      history.replaceState(null, "", location.pathname);
      await importStatus(requested);
    }
  } catch (error) {
    if (token !== session) return;
    console.error("Grocery load failed", error);
    feedback(
      "Could not load your list or inventory. Check connection and permissions. No data was changed.",
      true,
    );
    byId("retryGrocery").hidden = false;
  } finally {
    if (token === session) render();
  }
}
onAuthStateChanged(auth, (value) => {

  stopGrocerySync?.();

  stopGrocerySync = null;

  session++;

  clearGroceryDrag();

  user = value;

  ready = false;

  saving = false;

  items = [];

  categories = [];

  byId("boughtDialog").close();

  byId("inventoryDialog").close();

  render();

  if (!value) {
    location.replace("index.html");
    return;
  }

  stopGrocerySync = onSnapshot(
  doc(db, "users", value.uid),
  { includeMetadataChanges: true },
  (snapshot) => {
    console.log(
      "Firestore sync:",
      snapshot.metadata.hasPendingWrites ? "Pending" : "No pending writes"
    );
  },
  (error) => console.error("Sync listener failed:", error)
);

  load();

});

function writeGroceryToCloud(nextItems,uid) {

  return setDoc(
    doc(db, "users", uid),
    { groceryItems: nextItems },
    { merge: true }
  );
}

async function saveList(next) {
  if (!ready || saving || !user) return false;
  const token = session,
    uid = user.uid,
    expected = version;

  const previousItems = items;

  saving = true;

  items= next;

  render();

  controls();

  feedback("Saving grocery list…");

  try {
    await writeGroceryToCloud(next, uid);

    if (token !== session) return false;

    items = next;

    version = inventoryVersion(next);
    feedback("Grocery list saved.");
    return true;

  } catch (error) {
    items = previousItems;

    console.error("Grocery save failed", error);

    if (token === session) {
      const conflict = error.message === "grocery-conflict";
      feedback(
        conflict
          ? "Your grocery list changed in another tab. Reload the page before making more changes."
          : "Save failed. Your saved list is unchanged.",
        true,
      );
      if (conflict) {
        ready = false;
        byId("retryGrocery").hidden = false;
      }
    }
    return false;
  } finally {
    if (token === session) {
      saving = false;
      render();
    }
  }
}
async function changeItem(id, changes) {
  await saveList(
    items.map((item) => (item.id === id ? { ...item, ...changes } : item)),
  );
}
async function importStatus(status) {
  if (!ready || saving) return;
  const additions = [];
  const existing = new Set(items.filter((i) => i.source).map((i) => i.source));
  for (const category of categories)
    for (const item of category.items) {
      if (stockStatus(item) !== status) continue;
      const source = "personal/" + category.id + "/" + item.id;
      if (existing.has(source)) continue;
      existing.add(source);
      additions.push({
        id: crypto.randomUUID(),
        name: item.name,
        state: "pending",
        price: null,
        boughtQuantity: null,
        source,
      });
    }
  if (!additions.length) {
    feedback(
      "No new " +
        (status === "low" ? "low-stock" : "unavailable") +
        " items to add.",
    );
    return;
  }
 const groceryItem = items.find(
  (item) => item.id === selectedItemId
);

if (!groceryItem) {
  throw new Error("Grocery item not found.");
}

const nextItems = items.map((item) =>
  item.id === selectedItemId
    ? { ...item, state: "bought", boughtQuantity, price }
    : item
);

const isInventoryLinked =
  groceryItem.source?.startsWith("personal/");

const success = isInventoryLinked
  ? await savePurchaseAndInventory(
      nextItems,
      groceryItem,
      boughtQuantity
    )
  : await saveList(nextItems);

if (success) {
  byId("boughtDialog").close();
}

}
byId("importLow").addEventListener("click", () => importStatus("low"));
byId("importUnavailable").addEventListener("click", () =>
  importStatus("unavailable"),
);
byId("retryGrocery").addEventListener("click", load);

byId("clearGroceryBtn").addEventListener("click", async () => {
  if (!ready || saving || items.length === 0) return;

  const confirmed = window.confirm(
    "Are you sure you want to remove all Grocery items? This cannot be undone."
  );

  if (!confirmed) return;

  const success = await saveList([]);

  if (success) {
    feedback("Grocery list cleared successfully.");
  }
});

byId("addGroceryForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = byId("groceryName").value.trim();
  if (!name || name.length > 200) return;
  if (
    await saveList([
      ...items,
      {
        id: crypto.randomUUID(),
        name,
        categoryId: byId("groceryCategory").value || null,
        state: "pending",
        price: null,
        boughtQuantity: null,
        source: null,
      },
    ])
  ) {
    byId("addGroceryForm").reset();
  }
});

async function savePurchaseAndInventory(nextItems, groceryItem, quantityText) {
  if (!ready || saving || !user) return false;

  const token = session;

  const uid = user.uid;

  saving = true;

  controls();

  try {
    const savedCategories = await runTransaction(db, async (tx) => {const ref = doc(db, "users", uid);

    const snapshot = await tx.get(ref);

    const data = snapshot.exists() ? snapshot.data() : {};

    const storedCategories = data.categories ?? [];

    const storedGrocery = data.groceryItems ?? [];

    if (
        inventoryVersion(storedCategories) !== categoryVersion ||
        inventoryVersion(storedGrocery) !== version
      ) {
        throw new Error("data-conflict");
      }

    if (token !== session || auth.currentUser?.uid !== uid) {
        throw new Error("session-changed");
      }

    const updatedCategories = normalizeCategories(storedCategories);

    const inventoryItem = findLinkedInventoryItem(
        groceryItem,
        updatedCategories
    );

    if (!inventoryItem) {
        throw new Error("linked-item-missing");
    }

    inventoryItem.quantityText = quantityText;

    tx.set(
        ref,
        {
          categories: updatedCategories,
          groceryItems: nextItems
        },
        { merge: true }
    );

    return updatedCategories;

});


    if (token !== session) return false;

    items = nextItems;

    categories = savedCategories;

    version = inventoryVersion(nextItems);

    categoryVersion = inventoryVersion(savedCategories);

    feedback("Purchase saved and Inventory quantity updated.");

    return true;

  } catch (error) {
    console.error("Purchase synchronization failed:", error);

    if (token === session) {
      byId("boughtError").textContent =
        error.message === "data-conflict"
          ? "Inventory or Grocery changed. Reload before trying again."
          : "Could not save the purchase and Inventory quantity.";
    }

    return false;

  } finally {
    if (token === session) {
      saving = false;
      render();
    }
  }
}

function openBought(item) {
  if (!ready || saving) return;

  selectedItemId = item.id;

  byId("boughtForm").reset();

  byId("boughtError").textContent = "";

  byId("boughtItemName").textContent = item.name;
  byId("boughtTitle").textContent =
    item.state === "bought" ? "Edit purchase" : "Mark as bought";
  byId("boughtQuantity").value =
    item.boughtQuantity == null ? "" : String(item.boughtQuantity);
  byId("boughtPrice").value = item.price == null ? "" : String(item.price);
  byId("boughtDialog").showModal();
}
byId("cancelBought").addEventListener("click", () =>
  byId("boughtDialog").close(),
);
byId("boughtForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  
  try {
    const boughtQuantity = byId("boughtQuantity").value.trim() || null;

    const price = optionalNumber(byId("boughtPrice"), "Price", 999999999, 2);

const groceryItem = items.find(
  (item) => item.id === selectedItemId
);

if (!groceryItem) {
  throw new Error("Grocery item not found.");
}

const nextItems = items.map((item) =>
  item.id === selectedItemId
    ? { ...item, state: "bought", boughtQuantity, price }
    : item
);

const isInventoryLinked =
  groceryItem.source?.startsWith("personal/");

const success = isInventoryLinked
  ? await savePurchaseAndInventory(
      nextItems,
      groceryItem,
      boughtQuantity
    )
  : await saveList(nextItems);

if (success) {
  byId("boughtDialog").close();
}

} catch (error) {
    byId("boughtError").textContent = error.message;
  }
});

function openInventory(item) {

  if (pendingGroceryWrites > 0) {
  feedback("Grocery changes are still syncing. Try again shortly.");
  return;
  }

  if (!ready || saving || item.source || item.inventoryAdded) return;

  selectedItemId = item.id;

  const select = byId("inventoryCategory");

  select.replaceChildren(
    ...categories.map((category) => new Option(category.name, category.id)),
  );
  byId("inventoryError").textContent = "";
  byId("inventoryItemName").textContent = item.name;
  byId("inventoryStatus").value = "available";
  if (!categories.length) {
    feedback(
      "Create an inventory category first, then try adding this item.",
      true,
    );
    return;
  }
  byId("inventoryDialog").showModal();
}
byId("cancelInventory").addEventListener("click", () =>
  byId("inventoryDialog").close(),
);
byId("inventoryForm").addEventListener("submit", async (event) => {

  event.preventDefault();

  if (pendingGroceryWrites > 0) {
  byId("inventoryError").textContent =
    "Wait for Grocery changes to sync before adding to Inventory.";
  return;
  }

  if (!ready || saving || !user) return;

  const current = items.find((i) => i.id === selectedItemId);
  const targetId = byId("inventoryCategory").value,
    status = byId("inventoryStatus").value;
  if (
    !current ||
    current.source ||
    current.inventoryAdded ||
    !["available", "low", "unavailable"].includes(status)
  )
    return;
  const token = session,
    uid = user.uid;
  saving = true;
  controls();
  feedback("Adding item to inventory…");
  try {
    await runTransaction(db, async (tx) => {

      const personalRef = doc(db, "users", uid);

      const personalSnap = await tx.get(personalRef);

      const existing = personalSnap.exists()
        ? (personalSnap.data().categories ?? [])
        : [];

      const grocery = personalSnap.exists()
        ? (personalSnap.data().groceryItems ?? [])
        : [];

      if (
        inventoryVersion(existing) !== categoryVersion ||
        inventoryVersion(grocery) !== version
      )
        throw Error("data-conflict");
      if (token !== session || auth.currentUser?.uid !== uid)
        throw Error("session-changed");
      const next = normalizeCategories(existing);
      const category = next.find((c) => c.id === targetId);
      if (!category) throw Error("Category not found.");
      category.items.push({
        id: crypto.randomUUID(),
        name: current.name,
        status,
      });
      const updated = grocery.map((i) =>
        i.id === current.id ? { ...i, inventoryAdded: true } : i,
      );

      tx.set(
        personalRef,
        { categories: next, groceryItems: updated },
        { merge: true },
      );

    });
    
    if (token !== session) return;
    // Reload authoritative data and versions after the committed transaction.
    saving = false;
    byId("inventoryDialog").close();
    await load();
    if (ready) feedback("Item added to inventory.");
  } catch (error) {
    console.error("Add to inventory failed", error);
    if (token === session) {
      byId("inventoryError").textContent =
        error.message === "data-conflict"
          ? "Inventory or grocery list changed. Reload before trying again."
          : "Could not add to inventory. No changes were saved.";
    }
  } finally {
    if (token === session) {
      saving = false;
      render();
    }
  }
});
byId("logout-button").addEventListener("click", async () => {
  if (saving) return;
  try {
    await signOut(auth);
  } catch (error) {
    console.error(error);
    feedback("Could not sign out.", true);
  }
});
render();
