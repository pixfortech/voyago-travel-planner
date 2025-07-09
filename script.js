// =================================================================
// FIREBASE INITIALIZATION (Your new script)
// =================================================================

// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, collection, query, where, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCGZmWvLg8-8HYKQEo6srRH5HbY9VS2zB8",
  authDomain: "voyago-travel-planner.firebaseapp.com",
  projectId: "voyago-travel-planner",
  storageBucket: "voyago-travel-planner.firebasestorage.app",
  messagingSenderId: "797731610521",
  appId: "1:797731610521:web:d4197240c2eac32a3c3d08",
  measurementId: "G-H8Z7PYMJ9X"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);


// =================================================================
// VoyaGO APPLICATION LOGIC
// =================================================================

document.addEventListener('DOMContentLoaded', () => {
    // App State
    let currentUser = null;
    let userProfile = null;
    let currentTripId = null;

    // UI Elements
    const loadingScreen = document.getElementById('loading-screen');
    const mainApp = document.getElementById('main-app');
    const modal = document.getElementById('formModal');

    // --- 1. AUTHENTICATION & PROFILE SETUP --- //
    
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            const userDocRef = doc(db, "users", user.uid);
            const userDocSnap = await getDoc(userDocRef);

            if (userDocSnap.exists()) {
                userProfile = userDocSnap.data();
                showMyTrips();
            } else {
                promptForProfile();
            }
        } else {
            signInAnonymously(auth).catch(error => console.error("Anonymous sign-in failed:", error));
        }
        loadingScreen.classList.add('hidden');
        mainApp.classList.remove('hidden');
    });

    function promptForProfile() {
        const template = document.getElementById('welcome-modal-template').content.cloneNode(true);
        modal.querySelector('.modal-content').innerHTML = '';
        modal.querySelector('.modal-content').appendChild(template);
        modal.classList.add('active');

        const profileForm = modal.querySelector('#profileForm');
        profileForm.onsubmit = async (e) => {
            e.preventDefault();
            const newProfile = {
                name: modal.querySelector('#userNameInput').value,
                age: modal.querySelector('#userAgeInput').value,
                color: generateColor(currentUser.uid)
            };
            await setDoc(doc(db, "users", currentUser.uid), newProfile);
            userProfile = newProfile;
            modal.classList.remove('active');
            showMyTrips();
        };
    }

    // --- 2. MAIN NAVIGATION (My Trips vs Trip Planner) --- //

    function showMyTrips() {
        currentTripId = null;
        const template = document.getElementById('my-trips-template').content.cloneNode(true);
        mainApp.innerHTML = '';
        mainApp.appendChild(template);
        
        mainApp.querySelector('#createTripBtn').onclick = showCreateTripModal;

        // Listen for trips where the user is a member
        const q = query(collection(db, "trips"), where(`members.${currentUser.uid}`, '==', true));
        onSnapshot(q, (snapshot) => {
            const container = document.getElementById('tripsListContainer');
            if(!container) return; // If user navigated away, do nothing
            container.innerHTML = '';
            if (snapshot.empty) {
                container.innerHTML = '<p class="placeholder">No trips yet. Create one to get started!</p>';
                return;
            }
            snapshot.docs.forEach(doc => {
                const trip = { id: doc.id, ...doc.data() };
                const card = document.createElement('div');
                card.className = 'trip-list-card';
                card.innerHTML = `<h3>${trip.name}</h3><p>${trip.type}</p>`;
                card.onclick = () => showTripPlanner(trip.id);
                container.appendChild(card);
            });
        });
    }

    function showTripPlanner(tripId) {
        currentTripId = tripId;
        const template = document.getElementById('trip-planner-template').content.cloneNode(true);
        mainApp.innerHTML = '';
        mainApp.appendChild(template);

        mainApp.querySelector('#backToTripsBtn').onclick = showMyTrips;
        // Further setup for the trip planner (listeners, rendering views) would go here
        const tripContent = mainApp.querySelector('#trip-main-content');
        tripContent.innerHTML = `<div class="screen"><h2>Welcome to your trip!</h2><p>Select an option below to start planning.</p></div>`;
    }

    // --- 3. MODALS & FORMS --- //
    
    function showCreateTripModal() {
        const template = document.getElementById('create-trip-modal-template').content.cloneNode(true);
        const content = modal.querySelector('.modal-content');
        content.innerHTML = '';
        content.appendChild(template);
        modal.classList.add('active');
        
        const tripForm = content.querySelector('#createTripForm');
        let tripType = 'solo';

        content.querySelectorAll('.scope-switch button').forEach(btn => {
            btn.onclick = () => {
                content.querySelector('.scope-switch button.active').classList.remove('active');
                btn.classList.add('active');
                tripType = btn.dataset.type;
            };
        });

        tripForm.onsubmit = async (e) => {
            e.preventDefault();
            const tripName = content.querySelector('#tripNameInput').value;
            const newTrip = {
                name: tripName,
                type: tripType,
                ownerId: currentUser.uid,
                createdAt: serverTimestamp(),
                members: {
                    [currentUser.uid]: true // Add creator as the first member
                },
                budget: null // Optional budget
            };
            const tripRef = await addDoc(collection(db, "trips"), newTrip);
            modal.classList.remove('active');
            showTripPlanner(tripRef.id);
        };
    }
    
    // Close modal on outside click
    modal.onclick = (e) => {
        if(e.target === modal) modal.classList.remove('active');
    };

    // --- UTILITY FUNCTIONS --- //
    function generateColor(uid) {
        let hash = 0;
        for (let i = 0; i < uid.length; i++) {
            hash = uid.charCodeAt(i) + ((hash << 5) - hash);
        }
        const colors = ['#F44336', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5', '#2196F3', '#009688', '#FF5722'];
        return colors[Math.abs(hash) % colors.length];
    }
});
