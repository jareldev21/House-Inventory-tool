// HOME CONTROLLER: dashboard session guard and logout only.
// Page features and data operations live in inventory.js and grocery.js.
import { auth } from './firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';

// Session guard: unauthenticated visitors return to login.
onAuthStateChanged(auth, user => {
    if (!user) window.location.href = 'index.html';
});
// Logout handler: Firebase clears session; pages handle redirected state.
document.getElementById('logout-button').addEventListener('click', async () => {
    try { await signOut(auth); }
    catch (error) {
        console.error('Logout failed:', error);
        window.alert('Could not sign out. Check your connection and try again.');
    }
});
