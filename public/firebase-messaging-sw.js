/* public/firebase-messaging-sw.js */

// Firebase SDK を Service Worker で読み込む
importScripts('https://www.gstatic.com/firebasejs/10.12.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.1/firebase-messaging-compat.js');

// Firebase 初期化（※ .env にある内容をそのまま書く）
firebase.initializeApp({
  apiKey: 'AIzaSyCxmHZGJiqocD-7UQtD6DdE9WBO17mW_4I',
  authDomain: 'pairkaji-alpha.firebaseapp.com',
  projectId: 'pairkaji-alpha',
  storageBucket: 'pairkaji-alpha.firebasestorage.app',
  messagingSenderId: '234090861945',
  appId: '1:234090861945:web:c0c768ace7073927008ba8',
});

// messaging を取得して通知処理（オプション）
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icons/icon-192.png',
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
