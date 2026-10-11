import { initializeApp } from
"https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";

import {
    getAuth,
    onAuthStateChanged,
    signOut
} from
"https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

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

onAuthStateChanged(auth, function(user) {

    if (!user) {window.location.href = "index.html";}

});

const logoutButton = document.getElementById("logout-button");

logoutButton.addEventListener("click", async function() {

    try {

        await signOut(auth);

        window.location.href = "index.html";

    } 
    
    catch (error) {console.error("Logout failed:", error);}

});