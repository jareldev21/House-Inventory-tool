// Keep the existing Firebase project and SDK version in one place.
import {initializeApp} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";

import {getAuth} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAUiAsV7mLbwgAedq6KPafjLOwrNYFKyYw",
  authDomain: "jareljaz-house.web.app",
  projectId: "jareljaz-house",
  storageBucket: "jareljaz-house.firebasestorage.app",
  messagingSenderId: "127422481122",
  appId: "1:127422481122:web:1bd6dcbdeddc1a21b954bb",
  measurementId: "G-4ZHJCZWS1T",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

