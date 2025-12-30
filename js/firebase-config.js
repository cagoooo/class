/**
 * Firebase 配置模組
 * Firebase Configuration Module
 */

// Firebase 配置
const firebaseConfig = {
    apiKey: "AIzaSyDynhVxuEH5jlN3StcIpfiyVBQJBHZEfzo",
    authDomain: "class-4719f.firebaseapp.com",
    projectId: "class-4719f",
    storageBucket: "class-4719f.firebasestorage.app",
    messagingSenderId: "528903484088",
    appId: "1:528903484088:web:340a2300f9a110c02a3a4d"
};

// Firebase 實例
let firebaseApp = null;
let firebaseAuth = null;
let firebaseDb = null;
let currentUserId = null;

/**
 * 初始化 Firebase
 */
async function initializeFirebase() {
    try {
        // 檢查 Firebase SDK 是否已載入
        if (typeof firebase === 'undefined') {
            console.error('Firebase SDK 尚未載入');
            return false;
        }

        // 初始化 Firebase App
        if (!firebase.apps.length) {
            firebaseApp = firebase.initializeApp(firebaseConfig);
        } else {
            firebaseApp = firebase.app();
        }

        firebaseAuth = firebase.auth();
        firebaseDb = firebase.firestore();

        // 啟用離線持久化
        try {
            await firebaseDb.enablePersistence();
            console.log('Firestore 離線持久化已啟用');
        } catch (err) {
            if (err.code === 'failed-precondition') {
                console.warn('多個分頁開啟中，離線持久化僅在一個分頁中可用');
            } else if (err.code === 'unimplemented') {
                console.warn('當前瀏覽器不支援離線持久化');
            }
        }

        console.log('✅ Firebase 初始化成功');
        return true;
    } catch (error) {
        console.error('Firebase 初始化失敗:', error);
        return false;
    }
}

/**
 * 匿名登入
 */
async function signInAnonymously() {
    try {
        // 檢查是否已登入
        const currentUser = firebaseAuth.currentUser;
        if (currentUser) {
            currentUserId = currentUser.uid;
            console.log('已登入用戶:', currentUserId);
            return currentUserId;
        }

        // 執行匿名登入
        const userCredential = await firebaseAuth.signInAnonymously();
        currentUserId = userCredential.user.uid;

        // 儲存 userId 到本地
        localStorage.setItem('firebaseUserId', currentUserId);

        console.log('✅ 匿名登入成功:', currentUserId);

        if (typeof NotificationSystem !== 'undefined') {
            NotificationSystem.success('雲端連線成功');
        }

        return currentUserId;
    } catch (error) {
        console.error('匿名登入失敗:', error);

        if (typeof NotificationSystem !== 'undefined') {
            NotificationSystem.error('雲端連線失敗: ' + error.message);
        }

        return null;
    }
}

/**
 * 監聽認證狀態變化
 */
function onAuthStateChanged(callback) {
    if (firebaseAuth) {
        firebaseAuth.onAuthStateChanged((user) => {
            if (user) {
                currentUserId = user.uid;
                console.log('用戶狀態變化 - 已登入:', currentUserId);
            } else {
                currentUserId = null;
                console.log('用戶狀態變化 - 已登出');
            }
            if (callback) callback(user);
        });
    }
}

/**
 * 取得當前用戶 ID
 */
function getCurrentUserId() {
    return currentUserId;
}

/**
 * 取得 Firestore 資料庫實例
 */
function getFirestoreDb() {
    return firebaseDb;
}

/**
 * 檢查是否已連線
 */
function isFirebaseConnected() {
    return currentUserId !== null && firebaseDb !== null;
}

// 導出函數供其他模組使用
window.FirebaseConfig = {
    initialize: initializeFirebase,
    signIn: signInAnonymously,
    onAuthStateChanged: onAuthStateChanged,
    getCurrentUserId: getCurrentUserId,
    getDb: getFirestoreDb,
    isConnected: isFirebaseConnected
};
