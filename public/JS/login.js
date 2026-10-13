import { auth } from './firebase.js';
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';

const loginForm = document.getElementById("login-form");

const emailInput = document.getElementById("email");

const passwordInput = document.getElementById("password");

const message = document.getElementById("message");
const googleButton = document.getElementById('google-sign-in');
let signingIn = false;

function setSigningIn(value) {
    signingIn = value;
    googleButton.disabled = value;
    loginForm.querySelector('button[type="submit"]').disabled = value;
}

loginForm.addEventListener("submit", async function(event) {

    event.preventDefault();
    if (signingIn) return;
    setSigningIn(true);

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

    } finally { setSigningIn(false); }

});

googleButton.addEventListener('click', async () => {
    if (signingIn) return;
    setSigningIn(true);
    message.textContent = 'Opening Google sign-in…';
    try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        await signInWithPopup(auth, provider);
        window.location.href = 'home.html';
    } catch (error) {
        console.error('Google sign-in failed:', error);
        const errors = {
            'auth/popup-closed-by-user': 'Google sign-in was cancelled. You can try again.',
            'auth/popup-blocked': 'Allow pop-ups for this website, then try Google sign-in again.',
            'auth/operation-not-allowed': 'Google sign-in is not enabled yet. Please contact the site owner.',
            'auth/unauthorized-domain': 'Google sign-in is not configured for this website address. Please contact the site owner.',
            'auth/account-exists-with-different-credential': 'This email already uses another sign-in method. Use that method to access your existing inventory.'
        };
        message.textContent = errors[error.code] ?? 'Could not sign in with Google. Check your connection and try again.';
    } finally { setSigningIn(false); }
});
