import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDbWVawfCv0yaZ_1qwh8dzMSeI45HDYfJQ",
  authDomain: "retrojam-e79c2.firebaseapp.com",
  projectId: "retrojam-e79c2",
  storageBucket: "retrojam-e79c2.firebasestorage.app",
  messagingSenderId: "3079071483",
  appId: "1:3079071483:web:3d486f1a1f01dc113f725e",
  measurementId: "G-JQ438Y9KYM",
};

const app = initializeApp(firebaseConfig);
getAnalytics(app);
export const db = getFirestore(app);
