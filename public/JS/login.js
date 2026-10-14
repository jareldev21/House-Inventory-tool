// LOGIN CONTROLLER: Firebase password/Google authentication and redirect handling.
// Do not put inventory loading or Firestore writes in this module.

import { auth } from './firebase.js';
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';

const loginForm = document.getElementById('login-form');
const googleButton = document.getElementById('google-sign-in');
const message = document.getElementById('message');
let busy = false;
/**
 * Authentication UI: Disable simultaneous sign-in requests while a password or Google flow is active.
 * See docs/DEVELOPER_MANUAL.md for callers, data flow, and extension points.
 */
function setBusy(value) {
    busy = value;
    googleButton.disabled = value;
    loginForm.querySelector('[type="submit"]').disabled = value;
}
/**
 * Authentication UI: Convert Firebase Authentication error codes to actionable messages.
 * See docs/DEVELOPER_MANUAL.md for callers, data flow, and extension points.
 */
function friendlyError(error) {
    const errors = {
        'auth/popup-closed-by-user': 'Google sign-in was cancelled. Please try again.',
        'auth/popup-blocked': 'Your browser blocked the sign-in window. Please try again.',
        'auth/operation-not-allowed': 'Google sign-in is not enabled for this project.',
        'auth/unauthorized-domain': 'This website must be added to Firebase authorized domains.',
        'auth/account-exists-with-different-credential': 'This email uses another sign-in method.',
        'auth/web-storage-unsupported': 'Enable browser cookies and site storage, then try again.',
        'auth/operation-not-supported-in-this-environment': 'Open this website in Safari or Chrome rather than an in-app browser.'
    };
    return errors[error?.code] || 'Could not sign in with Google. Check your connection and try again.';
}
/**
 * Google OAuth: Configure a Google provider that asks which account to use.
 * See docs/DEVELOPER_MANUAL.md for callers, data flow, and extension points.
 */
function googleProvider() {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return provider;
}
/**
 * Mobile OAuth: Choose full-page redirect for phone browsers where popups are unreliable.
 * See docs/DEVELOPER_MANUAL.md for callers, data flow, and extension points.
 */
function prefersRedirect() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
// 1. Redirect callback: complete a previous mobile Google OAuth attempt.
// Complete a previous redirect before offering another sign-in attempt.
setBusy(true);
getRedirectResult(auth).then(result => {
    if (result?.user) window.location.replace('home.html');
}).catch(error => {
    console.error('Google redirect sign-in failed:', error);
    message.textContent = friendlyError(error);
}).finally(() => { setBusy(false); });
// 2. Password sign-in form; redirect home only after authentication succeeds.
loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    message.textContent = 'Logging in…';
    try {
        await signInWithEmailAndPassword(auth, document.getElementById('email').value.trim(), document.getElementById('password').value);
        window.location.replace('home.html');
    } catch (error) {
        console.error('Email sign-in failed:', error);
        message.textContent = 'Unable to sign in. Check your email, password and connection.';
    } finally { setBusy(false); }
});
// 3. Google sign-in: redirect on mobile; desktop popup with fallback.
googleButton.addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    message.textContent = 'Connecting to Google…';
    try {
        const provider = googleProvider();
        if (prefersRedirect()) {
            // A same-tab redirect works more consistently on phones than a popup.
            await signInWithRedirect(auth, provider);
            return;
        }
        try {
            await signInWithPopup(auth, provider);
        } catch (error) {
            if (error.code !== 'auth/popup-blocked') throw error;
            message.textContent = 'Switching to full-page Google sign-in…';
            await signInWithRedirect(auth, provider);
            return;
        }
        window.location.replace('home.html');
    } catch (error) {
        console.error('Google sign-in failed:', error);
        message.textContent = friendlyError(error);
    } finally { setBusy(false); }
});
