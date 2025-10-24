import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, GithubAuthProvider, FacebookAuthProvider, PhoneAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBFO2X_7AZQj3co94Ak4WxQoJ0DDdKKfwA",
  authDomain: "projet-1-7a096.firebaseapp.com",
  projectId: "projet-1-7a096",
  storageBucket: "projet-1-7a096.firebasestorage.app",
  messagingSenderId: "783932360596",
  appId: "1:783932360596:web:07da690dd1c2d1eb893181",
  measurementId: "G-Y6GLE2RBMD"
};


const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const rtdb = getDatabase(app);

export const providers = {
  google: new GoogleAuthProvider(),
  github: new GithubAuthProvider(),
  facebook: new FacebookAuthProvider(),
  phone: new PhoneAuthProvider(auth)
};
