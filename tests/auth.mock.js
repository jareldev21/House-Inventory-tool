import {auth} from '/JS/firebase.js';
export function onAuthStateChanged(_auth,callback){window.authCallback=callback;queueMicrotask(()=>callback(auth.currentUser));}
export async function signOut(){localStorage.setItem('test-user','null');window.authCallback?.(null);}
export async function signInWithEmailAndPassword(){localStorage.setItem('test-user',JSON.stringify({uid:'test-user'}));}
export class GoogleAuthProvider { setCustomParameters(parameters) { this.parameters = parameters; } }
export async function signInWithPopup(_auth,provider) {
 if(provider.parameters.prompt !== 'select_account') throw Error('Account selection missing');
 const code=localStorage.getItem('test-google-error');
 if(code)throw Object.assign(new Error(code),{code});
 localStorage.setItem('test-user',JSON.stringify({uid:'test-user'}));
 return {user:{uid:'test-user'}};
}

export async function signInWithRedirect(_auth,provider) {
 if(provider.parameters.prompt!=='select_account')throw Error('Account selection missing');
 localStorage.setItem('test-redirect-pending','1');
}
export async function getRedirectResult() {
 if(localStorage.getItem('test-redirect-pending')) {
  localStorage.removeItem('test-redirect-pending');
  localStorage.setItem('test-user',JSON.stringify({uid:'test-user'}));
  return {user:{uid:'test-user'}};
 }
 return null;
}
