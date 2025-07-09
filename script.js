document.addEventListener('DOMContentLoaded', () => {
    const mainContent = document.getElementById('main-content');
    const navButtons = document.querySelectorAll('.nav-btn');

    // --- MOCK DATA & STATE --- //
    const state = {
        currentView: 'dashboard',
        tripData: {
            name: "Goa Trip",
            totalBudget: 50000,
            members: [
                { id: 'user1', name: 'You' }, { id: 'user2', name: 'Priya' }, { id: 'user3', name: 'Rohan' }
            ],
            expenses: [
                 { id: 1, description: 'Lunch at Britto\'s', category: 'Food', amount: 3500, paidBy: 'user1', timestamp: new Date('2025-07-08T13:00:00')},
                 { id: 2, description: 'Scooter Rental', category: 'Transport', amount: 2000, paidBy: 'user2', timestamp: new Date('2025-07-08T10:00:00')},
            ],
            itinerary: [
                { type: 'flight', title: 'Flight to Goa', airline: 'IndiGo', pnr: 'XYZABC', dateTime: new Date('2025-07-08T08:00:00'), status: 'completed' },
                { type: 'hotel', title: 'Check-in: Taj Fort Aguada', details: 'Candolim, Goa', dateTime: new Date('2025-07-08T12:00:00'), status: 'completed' },
                { type: 'activity', title: 'Dinner at Thalassa', details: 'Vagator, Goa', dateTime: new Date('2025-07-09T20:00:00'), status: 'active' },
                { type: 'flight', title: 'Flight from Goa', airline: 'Vistara', pnr: 'QWERTY', dateTime: new Date('2025-07-12T18:00:00'), status: 'pending' },
            ],
            placesVisited: [
                { name: 'Baga Beach', image: 'https://placehold.co/400x400/009688/FFFFFF?text=Baga', notes: 'Great vibe in the evening.'},
                { name: 'Fort Aguada', image: 'https://placehold.co/400x400/795548/FFFFFF?text=Aguada', notes: 'Amazing history and views.'},
            ],
        },
        distanceTravelled: 42.5,
    };

    // --- VIEW RENDERING LOGIC --- //
    function renderView(view) {
        mainContent.innerHTML = '';
        const template = document.getElementById(`${view}-template`).content.cloneNode(true);
        mainContent.appendChild(template);
        
        // Call the specific render function for the view
        if (view === 'dashboard') renderDashboard();
        if (view === 'itinerary') renderItinerary();
        if (view === 'places') renderPlaces();
        if (view === 'expenses') renderExpenses();

        // Update active nav button
        navButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });
        state.currentView = view;
    }

    function renderDashboard() {
        const { name, totalBudget, expenses, placesVisited } = state.tripData;
        const totalSpent = expenses.reduce((sum, ex) => sum + ex.amount, 0);
        
        document.getElementById('tripName').textContent = name;
        document.getElementById('remainingBudget').textContent = `₹${(totalBudget - totalSpent).toLocaleString()}`;
        document.getElementById('totalSpent').textContent = `₹${totalSpent.toLocaleString()}`;
        document.getElementById('totalBudget').textContent = `₹${totalBudget.toLocaleString()}`;
        document.getElementById('budgetProgress').style.width = `${(totalSpent / totalBudget) * 100}%`;
        document.getElementById('placesVisitedCount').textContent = placesVisited.length;
        document.getElementById('distanceTravelled').textContent = `${state.distanceTravelled.toFixed(1)} km`;
        
        document.getElementById('shareTripBtn').onclick = () => alert("Share Trip Code: GOA2025");
    }

    function renderItinerary() {
        const container = document.getElementById('itineraryContainer');
        container.innerHTML = '';
        state.tripData.itinerary
            .sort((a,b) => a.dateTime - b.dateTime)
            .forEach(item => {
                const stepEl = document.createElement('div');
                stepEl.className = `stepper-step stepper-${item.status}`;
                const time = item.dateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'});
                
                let icon = 'fa-map-pin';
                if(item.type === 'flight') icon = 'fa-plane';
                if(item.type === 'hotel') icon = 'fa-hotel';
                
                let titleContent = `<div class="stepper-title">${item.title}</div>`;
                if(item.type === 'flight' && item.pnr) {
                    titleContent += `<div class="stepper-pnr">PNR: ${item.pnr}</div>`;
                }

                stepEl.innerHTML = `
                    <div class="stepper-circle"><i class="fas ${icon}"></i></div>
                    <div class="stepper-content">
                        ${titleContent}
                        <div class="stepper-time">${time}</div>
                        <div class="stepper-status">${item.status}</div>
                    </div>
                    <div class="stepper-line"></div>
                `;
                container.appendChild(stepEl);
            });
        document.getElementById('addItineraryItemBtn').onclick = () => openModal('addItineraryModal');
    }

    function renderPlaces() {
        const container = document.getElementById('placesContainer');
        container.innerHTML = '';
        state.tripData.placesVisited.forEach(place => {
            const placeEl = document.createElement('div');
            placeEl.className = 'place-card';
            placeEl.innerHTML = `
                <img src="${place.image || 'https://placehold.co/400x400/cccccc/FFFFFF?text=Place'}" alt="${place.name}">
                <div class="place-name">${place.name}</div>
            `;
            container.appendChild(placeEl);
        });
        document.getElementById('addPlaceBtn').onclick = () => openModal('addPlaceModal');
    }

    function renderExpenses() {
        const container = document.getElementById('expensesContainer');
        container.innerHTML = '';
        state.tripData.expenses
            .sort((a,b) => b.timestamp - a.timestamp)
            .forEach(expense => {
                const itemEl = document.createElement('div');
                itemEl.className = 'expense-item';
                itemEl.innerHTML = `
                    <div class="expense-icon" style="background-color: ${getCategoryColor(expense.category)};">
                        <i class="fas ${getCategoryIcon(expense.category)}"></i>
                    </div>
                    <div class="expense-details">
                        <div class="description">${expense.description}</div>
                        <div class="category">Paid by ${state.tripData.members.find(m => m.id === expense.paidBy)?.name}</div>
                    </div>
                    <div class="expense-amount">₹${expense.amount.toLocaleString()}</div>
                `;
                container.appendChild(itemEl);
            });
        document.getElementById('addExpenseBtn').onclick = () => openModal('addExpenseModal');
    }

    // --- MODAL & FORM HANDLING --- //
    function openModal(modalId) {
        document.getElementById(modalId).style.display = 'flex';
    }
    function closeModal(modalId) {
        document.getElementById(modalId).style.display = 'none';
    }
    
    document.querySelectorAll('.modal .close-modal').forEach(btn => {
        btn.onclick = () => btn.closest('.modal').style.display = 'none';
    });
    
    document.getElementById('itineraryType').onchange = (e) => {
        const isFlight = e.target.value === 'flight';
        document.getElementById('flight-fields').style.display = isFlight ? 'block' : 'none';
        document.getElementById('generic-fields').style.display = isFlight ? 'none' : 'block';
    };

    // --- EVENT LISTENERS --- //
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            renderView(button.dataset.view);
        });
    });

    // --- UTILITY FUNCTIONS --- //
    function getCategoryColor(category) {
        const colors = { 'Food': '#ff6347', 'Transport': '#1e90ff', 'Activity': '#9370db', 'Accommodation': '#3cb371', 'Other': '#708090' };
        return colors[category] || colors['Other'];
    }
    function getCategoryIcon(category) {
        const icons = { 'Food': 'fa-utensils', 'Transport': 'fa-car', 'Activity': 'fa-person-swimming', 'Accommodation': 'fa-hotel', 'Other': 'fa-cash-register' };
        return icons[category] || 'fa-dollar-sign';
    }

    // --- INITIALIZATION --- //
    renderView(state.currentView);
});