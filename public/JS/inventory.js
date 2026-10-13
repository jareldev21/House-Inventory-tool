// Part 1: Add Categories function

const addCategoryTopBtn = document.querySelector ('#addCategoryTopBtn')

const addCategoryCardBtn = document.querySelector ('#addCategoryCardBtn')

const categoryModal = document.querySelector ('#categoryModal')

const categoryForm = document.querySelector ('#categoryForm')

const categoryName = document.querySelector ('#categoryName')

const cancelCategory = document.querySelector('#cancelCategory')

const categoryCards = document.querySelector('#categoryCards')

const renderedCategories = document.querySelector('#renderedCategories')

const itemModal = document.querySelector ('#itemModal')

const itemForm = document.querySelector ('#itemForm')

const itemName = document.querySelector ('#itemName')

const cancelItem = document.querySelector ('#cancelItem')

let categories = [];

let selectedCategory = null;

let currentUser = null

function openCategoryModal() {

    categoryModal.showModal();

}

addCategoryTopBtn.addEventListener("click", openCategoryModal);

addCategoryCardBtn.addEventListener("click", openCategoryModal);

cancelCategory.addEventListener("click", function() {

    categoryModal.close();

});

function renderCategories() {

    renderedCategories.innerHTML = "";

    categories.forEach(function(category, index) {

        const categoryCard = document.createElement("div");

        categoryCard.classList.add("category-card");

        const categoryTitle = document.createElement("h2");

        categoryTitle.textContent = category.name;

        const addItemButton = document.createElement('button');

        addItemButton.textContent="Add Item";

        addItemButton.classList.add("add-item-button");

        addItemButton.addEventListener("click", function () {

            selectedCategory = category;

            itemModal.showModal();

    });

        categoryCard.appendChild(categoryTitle);

        category.items.forEach(function(item, index) {

            const itemElement = document.createElement("p");

            itemElement.textContent = item;

            const removeItemButton = document.createElement("button")

            removeItemButton.textContent = "Remove item";

            removeItemButton.addEventListener("click", function() {

                console.log('Remove button clicked:', item, index);

                category.items.splice(index, 1);

                saveCategories();

                renderCategories();

            });

            itemElement.appendChild(removeItemButton);

            const editItemButton = document.createElement('button');

            editItemButton.textContent = 'Edit item';

            editItemButton.addEventListener('click', function() {

                const updateName = window.prompt('Edit item name:', item)

                console.log(updateName);

                if (updateName === null || updateName.trim() === '') {return;}

                category.items[index] = updateName.trim();

                saveCategories();

                renderCategories();

            });

            itemElement.appendChild(editItemButton)

            categoryCard.appendChild(itemElement);

        });

        categoryCard.appendChild(addItemButton);

        const removeCategoryButton = document.createElement('button');

        removeCategoryButton.textContent = 'Remove Category';

        removeCategoryButton.addEventListener('click', function() {

            const confirmed = window.confirm('Delete this category and all the items?')

            console.log(confirmed);

            if (!confirmed) {return;}

            categories.splice(index, 1)

            saveCategories();

            renderCategories();

        });

        categoryCard.appendChild(removeCategoryButton);

        const editCategoryButton = document.createElement('button');

        editCategoryButton.textContent = 'Edit Category';

        editCategoryButton.addEventListener('click', function () {

            const updatedCategoryName = window.prompt('Edit Category Name:', category.name);

            console.log(updatedCategoryName);

            if (updatedCategoryName === null || updatedCategoryName.trim() === '') {

                return;
            }

            category.name = updatedCategoryName.trim();

            renderCategories();

        });

        categoryCard.appendChild(editCategoryButton);

        renderedCategories.appendChild(categoryCard);

    });

};

categoryForm.addEventListener("submit", function(event) {

    event.preventDefault();

    const enteredCategoryName = categoryName.value.trim();

    if (enteredCategoryName === "") {return;}

    const newCategory = {

        name: enteredCategoryName,

        items: []
    
    };

    categories.push(newCategory); 

    saveCategories();

    renderCategories();

    console.log(categories)

    categoryForm.reset();

    categoryModal.close();

});

itemForm.addEventListener("submit", function (event) {
    
    event.preventDefault();

    const enteredItemName = itemName.value.trim();

    selectedCategory.items.push(enteredItemName);

    saveCategories();

    renderCategories();

    console.log(categories);

    itemForm.reset();

    itemModal.close();

});

cancelItem.addEventListener("click", function() {

    itemModal.close();

});

// Firebase imports

import {getFirestore, doc, setDoc, getDoc} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import {initializeApp} from
"https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";

import {getAuth, onAuthStateChanged, signOut} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyAUiAsV7mLbwgAedq6KPafjLOwrNYFKyYw",
    authDomain: "jareljaz-house.firebaseapp.com",
    projectId: "jareljaz-house",
    storageBucket: "jareljaz-house.firebasestorage.app",
    messagingSenderId: "127422481122",
    appId: "1:127422481122:web:1bd6dcbdeddc1a21b954bb",
    measurementId: "G-4ZHJCZWS1T"
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);

onAuthStateChanged(auth, async function(user) {

    if (!user) {
        window.location.href = "index.html";
        return;
    }

    currentUser = user;

    const userDoc = doc(db, "users", currentUser.uid);

    const snapshot = await getDoc(userDoc);

    if (snapshot.exists()) {
        categories = snapshot.data().categories ?? [];

        renderCategories();
    };

    console.log(snapshot.exists());

    console.log(currentUser.uid);

});

const logoutButton = document.getElementById("logout-button");

logoutButton.addEventListener("click", async function() {

    try {
        await signOut(auth);

        window.location.href = "index.html";

    } 
    
    catch (error) {

        console.error("Logout failed:", error);
        
    }

});

const header = document.querySelector('.main-header');

async function saveCategories() {

    if(!currentUser) {
        return;
    }
    
    const userDoc = doc(db,"users", currentUser.uid)

    await setDoc(userDoc, {categories: categories});
};