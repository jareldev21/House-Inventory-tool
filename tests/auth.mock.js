import {auth} from '/JS/firebase.js';
export function onAuthStateChanged(_auth,callback){window.authCallback=callback;queueMicrotask(()=>callback(auth.currentUser));}
export async function signOut(){localStorage.setItem('test-user','null');window.authCallback?.(null);}
export async function signInWithEmailAndPassword(){localStorage.setItem('test-user',JSON.stringify({uid:'test-user'}));}
