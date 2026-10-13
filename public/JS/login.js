import { auth } from './firebase.js';
import { signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';

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

        message.textContent = "Unable to sign in. Check your email, password, and connection, then try again.";

    }

});
