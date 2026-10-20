/**
 * Firebase 配置模組 v2
 * Firebase Configuration Module
 */

// Firebase 配置
const firebaseConfig = {
    apiKey: "__FIREBASE_API_KEY__",
    authDomain: "__FIREBASE_AUTH_DOMAIN__",
    projectId: "__FIREBASE_PROJECT_ID__",
    storageBucket: "__FIREBASE_PROJECT_ID__.firebasestorage.app",
    messagingSenderId: "__FIREBASE_MESSAGING_SENDER_ID__",
    appId: "__FIREBASE_APP_ID__"
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

        // 啟用多分頁離線持久化：同一位老師開啟多個分頁時由 Firestore
        // 協調快取，避免舊版單分頁 persistence 互相搶鎖而拋出內部斷言。
        try {
            await firebaseDb.enablePersistence({ synchronizeTabs: true });
            console.log('Firestore 多分頁離線持久化已啟用');
        } catch (err) {
            if (err.code === 'failed-precondition') {
                console.warn('Firestore 多分頁離線持久化無法啟用，改用記憶體快取');
            } else if (err.code === 'unimplemented') {
                console.warn('當前瀏覽器不支援 Firestore 離線持久化，改用記憶體快取');
            } else if (/internal assertion failed|unexpected state|A newer version of the Firestore SDK was previously used|persisted data is not compatible/i.test(err?.message || '')) {
                // Firebase 9 compat 在舊版／損壞 IndexedDB 快取上可能拋出
                // INTERNAL ASSERTION FAILED。雲端同步仍可使用，讓 Firestore
                // 自動改用記憶體快取即可，不應中斷班級小管家或觸發錯誤 webhook。
                console.warn('Firestore 離線快取狀態不相容，改用記憶體快取');
            } else {
                console.warn('Firestore 離線持久化未啟用，改用記憶體快取:', err?.message || err);
            }
        }

        console.log('✅ Firebase 初始化成功');
        return true;
    } catch (error) {
        console.error('Firebase 初始化失敗:', error);
        return false;
    }
}

// 手機上 Google 登入彈窗可能先被判定「已關閉」，帳號選擇結果才慢一步回來，
// SDK 仍會完成登入。等候期間若出現新的 Google 使用者，就補走登入後續流程
// （記住帳號、登入通知、首次同步引導），否則老師會只看到右上角變成已登入。
const LATE_SIGN_IN_WAIT_MS = 60000;
let stopLateSignInWatch = null;

function watchLateGoogleSignIn(previousUid) {
    if (stopLateSignInWatch) stopLateSignInWatch();
    let unsubscribe = null;
    const timer = setTimeout(() => stopLateSignInWatch && stopLateSignInWatch(), LATE_SIGN_IN_WAIT_MS);
    const stop = () => {
        clearTimeout(timer);
        if (unsubscribe) unsubscribe();
        if (stopLateSignInWatch === stop) stopLateSignInWatch = null;
    };
    stopLateSignInWatch = stop;
    unsubscribe = firebaseAuth.onAuthStateChanged((user) => {
        if (!user || user.isAnonymous || user.uid === previousUid) return;
        stop();
        const profile = completeGoogleSignIn(user, false);
        console.log('✅ Google 登入在彈窗關閉後才完成，已補接登入流程');
        window.dispatchEvent(new CustomEvent('gauth:late-signin', { detail: profile }));
    });
}

function completeGoogleSignIn(user, isNewUser) {
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
    // 使用情形通知：老師登入（失敗不影響登入流程）
    try { if (window.UsageNotify) UsageNotify.login(currentUserProfile, isNewUser); } catch (e) { /* ignore */ }
    return currentUserProfile;
}

/**
 * Google 帳號登入（Popup 方式）
 */
async function signInWithGoogle() {
    if (!firebaseAuth) {
        console.error('Firebase Auth 尚未初始化');
        return null;
    }
    if (stopLateSignInWatch) stopLateSignInWatch();
    const previousUser = firebaseAuth.currentUser;
    const previousUid = previousUser && !previousUser.isAnonymous ? previousUser.uid : null;
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });

        const userCredential = await firebaseAuth.signInWithPopup(provider);
        const isNewUser = !!(userCredential.additionalUserInfo && userCredential.additionalUserInfo.isNewUser);
        return completeGoogleSignIn(userCredential.user, isNewUser);
    } catch (error) {
        // 使用者關閉 Popup = 正常取消，不顯示錯誤；但手機上可能只是結果慢一步
        if (error.code === 'auth/popup-closed-by-user' ||
            error.code === 'auth/cancelled-popup-request') {
            watchLateGoogleSignIn(previousUid);
        } else {
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
/**
 * 班級／學生資料能不能寫上雲端：只有 Google 帳號（非匿名）才可以。
 * 開頁自動建立的匿名身分只綁在這個瀏覽器，換裝置或清除瀏覽器資料就再也找不回，
 * 寫上雲端只會留下沒人認領的學生資料，所以匿名狀態的資料一律只留在這台裝置。
 * isConnected() 對匿名也是 true，任何「寫入」雲端的地方都要改用這個判斷。
 */
function canWriteCloud() {
    if (!isFirebaseConnected() || !isGoogleUser()) return false;
    try {
        const user = firebaseAuth && firebaseAuth.currentUser;
        return !!(user && !user.isAnonymous && user.uid === currentUserId);
    } catch (e) { return false; }
}

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
    canWriteCloud: canWriteCloud,
};

