import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD51flTLk0i2oc_pCRQDpE73-SaXEqvja4",
  authDomain: "smartcafe-523df.firebaseapp.com",
  projectId: "smartcafe-523df",
  storageBucket: "smartcafe-523df.firebasestorage.app",
  messagingSenderId: "428357625205",
  appId: "1:428357625205:web:5b8f6c18649ecd426e1f3c",
  measurementId: "G-N7J91LNBH6",
};

const app = initializeApp(firebaseConfig);

export const analytics = getAnalytics(app);
export const db = getFirestore(app);
export { app };
