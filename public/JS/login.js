import { initializeApp } from
"https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";

import {
    getAuth,
    signInWithEmailAndPassword
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

const loginForm = document.getElementById("login-form");

const emailInput = document.getElementById("email");

const passwordInput = document.getElementById("password");

const message = document.getElementById("message");

loginForm.addEventListener("submit", async function(event) {

    event.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    message.textContent = "Logging in...";

    try {
        await signInWithEmailAndPassword(
            auth,
            email,
            password
        );

        window.location.href = "home.html";

    } catch (error) {

        console.error(error);

        message.textContent = "Incorrect email or password.";

    }

});