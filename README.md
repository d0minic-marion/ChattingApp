# 🗨️ChattingApp — Documentation technique

** URL du site web : https://projet-1-7a096.firebaseapp.com/ **

--

# 🚀À propos

ChattingApp est une application web de clavardage en temps réel développée avec React et Firebase.
Elle permet aux utilisateurs de s’authentifier, d’accéder à des salons de discussion et d’échanger des messages instantanément.
Le tout est hébergé sur Firebase Hosting.

--

# 🧩Prérequis

**Avant d’installer le projet, assure-toi d’avoir :**
Node.js (v18 ou plus récent)
npm
Un compte Firebase et un projet configuré
Git, si tu veux cloner le dépôt

--

# ⚙️ Installation locale

1. Cloner le projet
    git clone <https://github.com/d0minic-marion/ChattingApp.git>
    cd <my-app>

2. Installer les dépendances
    npm i (install)

3. Lancer le serveur local
    npm run dev

--

# 🏗️ Build de production

1. Pour générer la version optimisée du site :
    npm run build

## ☁️ Déploiement sur Firebase Hosting

1. Installer la CLI Firebase
    npm install -g firebase-tools

2. Se connecter et initialiser
    firebase login
    firebase init

    ✔ Are you ready to proceed? (y/n) -> Yes
    ✔ What do you want to use as your public directory? -> build
    ✔ Configure as a single-page app (rewrite all urls to /index.html)? -> Yes
    ✔ What file should be used for Storage Rules? -> storage.rules

3. Déployer
    firebase deploy
