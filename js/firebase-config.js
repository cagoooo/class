/**
 * Firebase 配置模組 v2
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
let currentUserProfile = null; // { uid, displayName, email, photoURL, isAnonymous }

/**
 * 初始化 Firebase
 */
async function initializeFirebase() {
    try {
        if (typeof firebase === 'undefined') {
            console.error('Firebase SDK 尚未載入');
            return false;
        }

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
 * Google 帳號登入（Popup 方式）
 */
async function signInWithGoogle() {
    try {
        if (!firebaseAuth) {
            console.error('Firebase Auth 尚未初始化');
            return null;
        }

        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });

        const userCredential = await firebaseAuth.signInWithPopup(provider);
        const user = userCredential.user;

        currentUserId = user.uid;
        currentUserProfile = {
            uid: user.uid,
            displayName: user.displayName || '老師',
            email: user.email || '',
            photoURL: user.photoURL || '',
            isAnonymous: false,
        };

        localStorage.setItem('firebaseUserId', currentUserId);
        localStorage.setItem('firebaseUserProfile', JSON.stringify(currentUserProfile));

        console.log('✅ Google 登入成功:', currentUserProfile.email);
        return currentUserProfile;
    } catch (error) {
        // 使用者關閉 Popup = 正常取消，不顯示錯誤
        if (error.code !== 'auth/popup-closed-by-user' &&
            error.code !== 'auth/cancelled-popup-request') {
            console.error('Google 登入失敗:', error);
        }
        return null;
    }
}

/**
 * 登出
 */
async function signOutGoogle() {
    try {
        await firebaseAuth.signOut();
        currentUserId = null;
        currentUserProfile = null;
        localStorage.removeItem('firebaseUserId');
        localStorage.removeItem('firebaseUserProfile');
        console.log('✅ 已登出');
        return true;
    } catch (error) {
        console.error('登出失敗:', error);
        return false;
    }
}

/**
 * 匿名登入（Fallback / 離線模式）
 */
async function signInAnonymously() {
    try {
        const currentUser = firebaseAuth.currentUser;
        if (currentUser) {
            currentUserId = currentUser.uid;
            if (!currentUserProfile) {
                currentUserProfile = {
                    uid: currentUser.uid,
                    displayName: currentUser.displayName || '訪客',
                    email: currentUser.email || '',
                    photoURL: currentUser.photoURL || '',
                    isAnonymous: currentUser.isAnonymous,
                };
            }
            console.log('已登入用戶:', currentUserId);
            return currentUserId;
        }

        const userCredential = await firebaseAuth.signInAnonymously();
        currentUserId = userCredential.user.uid;
        currentUserProfile = {
            uid: currentUserId,
            displayName: '訪客',
            email: '',
            photoURL: '',
            isAnonymous: true,
        };
        localStorage.setItem('firebaseUserId', currentUserId);
        console.log('✅ 匿名登入成功:', currentUserId);
        return currentUserId;
    } catch (error) {
        console.error('匿名登入失敗:', error);
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
                currentUserProfile = {
                    uid: user.uid,
                    displayName: user.displayName || (user.isAnonymous ? '訪客' : '老師'),
                    email: user.email || '',
                    photoURL: user.photoURL || '',
                    isAnonymous: user.isAnonymous,
                };
                console.log('用戶狀態 - 已登入:', user.email || '匿名');
            } else {
                currentUserId = null;
                currentUserProfile = null;
                console.log('用戶狀態 - 已登出');
            }
            if (callback) callback(user, currentUserProfile);
        });
    }
}

function getCurrentUserId() { return currentUserId; }
function getCurrentUserProfile() { return currentUserProfile; }
function getFirestoreDb() { return firebaseDb; }
function isFirebaseConnected() { return currentUserId !== null && firebaseDb !== null; }
function isGoogleUser() { return currentUserProfile && !currentUserProfile.isAnonymous; }

// 導出
window.FirebaseConfig = {
    initialize: initializeFirebase,
    signIn: signInAnonymously,      // 舊相容性
    signInWithGoogle: signInWithGoogle,
    signOut: signOutGoogle,
    onAuthStateChanged: onAuthStateChanged,
    getCurrentUserId: getCurrentUserId,
    getCurrentProfile: getCurrentUserProfile,
    getDb: getFirestoreDb,
    isConnected: isFirebaseConnected,
    isGoogleUser: isGoogleUser,
};

