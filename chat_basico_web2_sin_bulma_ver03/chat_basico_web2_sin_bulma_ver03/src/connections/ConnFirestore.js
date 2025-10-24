// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore} from "firebase/firestore";
import {getStorage} from "firebase/storage";
import { getAuth } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBnwtCh2CYL-IVUXun_EWTrGs1-lGLrnM0",
  authDomain: "test01appweb.firebaseapp.com",
  projectId: "test01appweb",
  storageBucket: "test01appweb.firebasestorage.app",
  messagingSenderId: "456032614908",
  appId: "1:456032614908:web:0c844f89f9782d98269a79"
};
// Initialize Firebase
const app = initializeApp(firebaseConfig);
const dbFirestore = getFirestore(app);
const storageFirebase = getStorage(app);
const authFirebase = getAuth(app);

export { dbFirestore, storageFirebase, authFirebase };