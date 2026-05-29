// ════════════════════════════════════════
//  FIREBASE CONFIG
//  js/firebase.js
// ════════════════════════════════════════

import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore }   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth }        from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey:            "AIzaSyA5mVDOI7rINUKbSdjs2tGFbS9sfTaBNBQ",
  authDomain:        "life-control-70663.firebaseapp.com",
  projectId:         "life-control-70663",
  storageBucket:     "life-control-70663.firebasestorage.app",
  messagingSenderId: "418774873271",
  appId:             "1:418774873271:web:634a24c0f811cc55160932"
};

const fbApp = initializeApp(firebaseConfig);

export const db   = getFirestore(fbApp);
export const auth = getAuth(fbApp);
