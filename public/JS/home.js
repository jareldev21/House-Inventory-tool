// Authentication for the homepage and unfinished feature pages.
import { auth } from './firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';

onAuthStateChanged(auth, user => {
    if (!user) window.location.href = 'index.html';
});
document.getElementById('logout-button').addEventListener('click', async () => {
    try { await signOut(auth); }
    catch (error) {
        console.error('Logout failed:', error);
        window.alert('Could not sign out. Check your connection and try again.');
    }
});
