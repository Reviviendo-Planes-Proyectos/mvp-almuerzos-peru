const firebaseConfig = {
  apiKey: "AIzaSyDNbgT9yeSBMhsftW4FOe_SB7bfSg44CPI",
  authDomain: "cashma-8adfb.firebaseapp.com",
  projectId: "cashma-8adfb",
  storageBucket: "cashma-8adfb.appspot.com",
  messagingSenderId: "92623435008",
  appId: "1:92623435008:web:8d4b4d58c0ccb9edb5afe5",
};

// Variables globales de Firebase
let auth, db;

// Variables de cache global
let restaurantsCache = new Map();
let districtsCache = null;
let dishesCache = null;

// Inicializar Firebase cuando esté disponible
function waitForFirebaseAndInitialize() {
  if (typeof firebase !== 'undefined' && firebase.apps) {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    auth = firebase.auth();
    db = firebase.firestore();
    console.log('Firebase initialized successfully');
    return true;
  }
  return false;
}

// Intentar inicializar Firebase inmediatamente
if (!waitForFirebaseAndInitialize()) {
  // Si no está disponible, esperar un poco
  let attempts = 0;
  const maxAttempts = 20;
  const checkFirebase = setInterval(() => {
    attempts++;
    if (waitForFirebaseAndInitialize() || attempts >= maxAttempts) {
      clearInterval(checkFirebase);
      if (attempts >= maxAttempts) {
        console.error('Firebase failed to load after maximum attempts');
      }
    }
  }, 100);
}

document.addEventListener("DOMContentLoaded", () => {
  // Mostrar skeleton loading inmediatamente
  showSkeletonLoading();
  
  // Firebase ya está inicializado globalmente
  const restaurantsList = document.getElementById("restaurants-list");
  const loadMoreBtn = document.getElementById("load-more-btn");
  // const districtFilter = document.getElementById("district-filter"); // Comentado - no se usa
  const districtSearch = document.getElementById("district-search");
const customDropdown = document.getElementById("custom-dropdown");
const dropdownContent = document.getElementById("dropdown-content");
const dropdownArrow = document.querySelector(".dropdown-arrow");
  const myRestaurantButton = document.getElementById("my-restaurant-btn");
  const availableRestaurantsCount = document.querySelector(".available-restaurants-count");

  const myAccountBtn = document.getElementById("my-account-btn");
  const logoutText = document.getElementById("logout-text");
  const loginModalOverlay = document.getElementById("login-modal-overlay");
  const loginModalCloseBtn = document.getElementById("login-modal-close-btn");
  const googleLoginBtn = document.getElementById("google-login-btn");
  const favoritesCountDisplay = document.getElementById(
    "favorites-count-display"
  );
  const favoritesCounter = document.getElementById("favorites-counter");

  let lastVisibleDocId = null;
  let currentDistrictFilter = "";
  let currentSearchQuery = "";
  let currentDishFilter = "";
  let currentUserFavorites = new Set();
  let tomSelectInstance = null;
  let allDistricts = [];
  let allDishes = [];
  let totalRestaurantsCount = 0; // Nueva variable para contar total de restaurantes

  // Función para mostrar skeleton loading
  function showSkeletonLoading() {
    const restaurantsList = document.getElementById("restaurants-list");
    if (restaurantsList) {
      restaurantsList.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; padding: 1rem;">
          ${Array(6).fill().map(() => `
            <div style="background: #f3f4f6; border-radius: 12px; padding: 1rem; min-height: 200px; animation: pulse 1.5s ease-in-out infinite alternate;">
              <div style="background: #e5e7eb; height: 120px; border-radius: 8px; margin-bottom: 1rem;"></div>
              <div style="background: #e5e7eb; height: 20px; border-radius: 4px; margin-bottom: 0.5rem;"></div>
              <div style="background: #e5e7eb; height: 16px; border-radius: 4px; width: 70%;"></div>
            </div>
          `).join('')}
        </div>
        <style>
          @keyframes pulse {
            0% { opacity: 1; }
            100% { opacity: 0.5; }
          }
        </style>
      `;
    }
  }
  let currentRestaurantsLoaded = 0; // Nueva variable para contar restaurantes cargados

  function showToast(message, type, duration = 3000) {
    const toast = document.getElementById("toast-notification");
    if (toast) {
      toast.textContent = message;
      toast.className = `toast ${type} show`;
      setTimeout(() => {
        toast.className = `toast ${type}`;
      }, duration);
    }
  }

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", () => loadRestaurants(false));
  }

  // Inicializar Tom Select y cargar distritos
  // initializeDistrictFilter(); // Comentado - no se usa

  // Inicializar búsqueda de distritos
  initializeDistrictSearch();

  // Configurar eventos después de que Firebase esté listo
  setupEventListeners();

  // Configurar observador de autenticación
  auth.onAuthStateChanged(handleAuthStateChange);

  // Cargar restaurantes inicial
  loadRestaurants(true);

  async function upsertUser(user, role) {
    try {
      const response = await fetch("/api/users/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user.uid,
          displayName: user.displayName,
          email: user.email,
          role: role, // <-- ENVIAMOS EL ROL RECIBIDO
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        console.error("Failed to upsert user:", errorData.error);
      } else {
        console.log(
          `User ${user.uid} profile upserted successfully as '${role}'.`
        );
      }
    } catch (error) {
      console.error("Error calling upsert user API:", error);
    }
  }

  if (logoutText) {
    logoutText.addEventListener("click", async () => {
      try {
        await auth.signOut();
        localStorage.removeItem("commentedDishes");
        await showLogoutModal({ duration: 2500 }); // 2.5 s
      } catch (error) {
        console.error("Error during logout:", error);
        showToast("Error during logout. Please try again.", "error");
      }
    });
  }

  async function loadUserFavorites(uid) {
    try {
      const favoritesSnapshot = await db
        .collection("invited")
        .doc(uid)
        .collection("favorites")
        .get();
      currentUserFavorites.clear();
      favoritesSnapshot.forEach((doc) => {
        currentUserFavorites.add(doc.id);
      });
      console.log("User favorites loaded:", currentUserFavorites.size);
      if (favoritesCounter) {
        favoritesCounter.textContent = currentUserFavorites.size;
      }
      updateDishLikeButtons();
    } catch (error) {
      console.error("Error loading user favorites:", error);
    }
  }

  function updateDishLikeButtons() {
    document.querySelectorAll(".dish-like-btn").forEach((button) => {
      const dishId = button.dataset.dishId;
      const svgPath = button.querySelector("svg path");
      if (currentUserFavorites.has(dishId)) {
        button.classList.add("liked");
        if (svgPath) svgPath.setAttribute("fill", "currentColor");
      } else {
        button.classList.remove("liked");
        if (svgPath) svgPath.setAttribute("fill", "none");
      }
    });
  }

  function setupEventListeners() {
    if (myAccountBtn) {
      myAccountBtn.addEventListener("click", () => {
        if (!auth.currentUser) {
          loginModalOverlay.style.display = "flex";
        } else {
          window.location.href = "favorites.html";
        }
      });
    }

    if (loginModalCloseBtn) {
      loginModalCloseBtn.addEventListener("click", () => {
        loginModalOverlay.style.display = "none";
      });
    }

    if (loginModalOverlay) {
      loginModalOverlay.addEventListener("click", (event) => {
        if (event.target === loginModalOverlay) {
          loginModalOverlay.style.display = "none";
        }
      });
    }

    if (googleLoginBtn) {
      googleLoginBtn.addEventListener("click", async () => {
        const provider = new firebase.auth.GoogleAuthProvider();
        try {
          await auth.signInWithPopup(provider);
        } catch (error) {
          console.error("Error during Google login:", error);
          showToast("Error during login. Please try again.", "error");
        }
      });
    }

    // Configurar el botón Mi Restaurante con un pequeño delay para asegurar Firebase
    if (myRestaurantButton) {
      setTimeout(() => {
        setupMyRestaurantButton();
      }, 100);
    }
  }

  async function handleAuthStateChange(user) {
    if (user) {
      myAccountBtn.textContent = user.displayName || user.email;
      logoutText.style.display = "inline";

      // *** Lógica INTELIGENTE para upsert de comensales (QUEDA IGUAL) ***
      const userRoleResponse = await fetch(`/api/users/${user.uid}/role`);
      let userRole = null;
      if (userRoleResponse.ok) {
        const roleData = await userRoleResponse.json();
        userRole = roleData.role;
      }

      const restaurantBtn = document.getElementById("my-restaurant");
      if (userRole === "customer") {
        restaurantBtn.style.display = "none";
      } else {
        restaurantBtn.style.display = "flex";
      }

      if (userRole !== "owner") {
        await upsertUser(user, "customer"); // Esto lo guardará en 'invited'
      } else {
        console.log(
          `User ${user.uid} is an owner. Skipping customer upsert in index.js.`
        );
      }

      await loadUserFavorites(user.uid);
      favoritesCountDisplay.style.display = "flex";
      if (favoritesCounter) {
        favoritesCounter.textContent = currentUserFavorites.size;
      }
      loginModalOverlay.style.display = "none";
      updateDishLikeButtons();
      loadRestaurants(true);
    } else {
      myAccountBtn.textContent = "Soy Comensal";
      logoutText.style.display = "none";
      favoritesCountDisplay.style.display = "none";
      currentUserFavorites.clear();

      const restaurantBtn = document.getElementById("my-restaurant");
      restaurantBtn.style.display = "flex";

      updateDishLikeButtons();
      loadRestaurants(true);
    }
  }

  function setupMyRestaurantButton() {
    if (!myRestaurantButton) return;
    
    // Verificar que Firebase esté inicializado
    if (!auth || !firebase.apps.length) {
      console.error('Firebase not initialized when setting up restaurant button');
      return;
    }
    
    myRestaurantButton.textContent = "Mi Restaurante";
    myRestaurantButton.disabled = false;

    myRestaurantButton.onclick = async () => {
      try {
        // Verificar que Firebase esté disponible
        if (!auth || !firebase.apps.length) {
          showToast("Error: Sistema no inicializado. Recarga la página.", "error");
          return;
        }

        myRestaurantButton.textContent = "Verificando...";
        myRestaurantButton.disabled = true;

        const user = auth.currentUser;
        if (user) {
          const userRoleResponse = await fetch(`/api/users/${user.uid}/role`);
          if (!userRoleResponse.ok) {
            showToast("Error verifying user role. Please try again.", "error");
            myRestaurantButton.textContent = "Mi Restaurante";
            myRestaurantButton.disabled = false;
            return;
          }
          const userRoleData = await userRoleResponse.json();
          const userRole = userRoleData.role;

          if (userRole === "owner") {
            window.location.href = "dashboard.html";
          } else {
            showToast(
              "You do not have permission to access the restaurant dashboard.",
              "warning"
            );
            myRestaurantButton.textContent = "Mi Restaurante";
            myRestaurantButton.disabled = false;
          }
        } else {
          window.location.href = "login.html";
        }
      } catch (error) {
        console.error('Error in restaurant button:', error);
        showToast("Error inesperado. Intenta de nuevo.", "error");
        myRestaurantButton.textContent = "Mi Restaurante";
        myRestaurantButton.disabled = false;
      }
    };
  }

  async function checkUserRole(uid) {
    try {
      const response = await fetch(`/api/users/${uid}/role`);
      if (!response.ok) {
        console.error("Failed to fetch user role.");
        return null;
      }
      const data = await response.json();
      return data.role;
    } catch (error) {
      console.error("Error fetching user role from API:", error);
      return null;
    }
  }

  window.addEventListener("pageshow", function (event) {
    if (event.persisted) {
      if (myRestaurantButton) {
        myRestaurantButton.textContent = "Mi Restaurante";
        myRestaurantButton.disabled = false;
      }
      if (auth.currentUser) {
        loadUserFavorites(auth.currentUser.uid);
      }
    }
  });

  // Función para cargar distritos desde el backend
  async function loadDistricts() {
    try {
      const response = await fetch("/api/districts");
      if (!response.ok) {
        throw new Error("Error al cargar distritos");
      }
      const districts = await response.json();
      return districts;
    } catch (error) {
      console.error("Error loading districts:", error);
      return [];
    }
  }

  // Función para cargar todos los restaurantes para el buscador
  // Función para inicializar Tom Select
  async function initializeDistrictFilter() {
    if (!districtFilter) return;

    try {
      // Cargar distritos desde el backend
      const districts = await loadDistricts();

      // Limpiar opciones existentes
      districtFilter.innerHTML = "";

      // Agregar opción "Todos los Distritos" primero
      const allOption = document.createElement("option");
      allOption.value = "";
      allOption.textContent = "Todos los Distritos";
      districtFilter.appendChild(allOption);

      // Agregar distritos dinámicamente
      districts.forEach((district) => {
        const option = document.createElement("option");
        option.value = district;
        option.textContent = district;
        districtFilter.appendChild(option);
      });

      // Inicializar Tom Select
      tomSelectInstance = new TomSelect(districtFilter, {
        placeholder: "Buscar distrito...",
        searchField: ["text", "value"],
        maxOptions: null,
        create: false,
        allowEmptyOption: true,
        onChange: function (value) {
          currentDistrictFilter = value || "";
          loadRestaurants(true);
        },
        onClick: function () {
          // Permitir abrir el dropdown al hacer click
          if (!this.isOpen) {
            this.open();
          }
        },
      });

      // Forzar que inicie vacío y muestre el placeholder
      tomSelectInstance.clear();
      tomSelectInstance.clearOptions();

      // Volver a agregar las opciones
      districts.forEach((district) => {
        tomSelectInstance.addOption({
          value: district,
          text: district,
        });
      });

      // Asegurar que no hay valor seleccionado
      tomSelectInstance.setValue("");
    } catch (error) {
      console.error("Error initializing district filter:", error);
      // Fallback: usar select normal si Tom Select falla
      districtFilter.addEventListener("change", (event) => {
        currentDistrictFilter = event.target.value;
        loadRestaurants(true);
      });
    }
  }

  // Función para cargar todos los platillos únicos desde Firebase
  async function loadAllDishes() {
    try {
      const response = await fetch('/api/all-dishes');
      if (!response.ok) throw new Error('Error al cargar platillos');
      const dishes = await response.json();
      allDishes = dishes.map(dish => dish.toLowerCase());
      return allDishes;
    } catch (error) {
      console.error('Error loading dishes:', error);
      return [];
    }
  }

  // Función para interpretar el tipo de búsqueda
  function interpretSearchQuery(query) {
    if (!query || query.trim() === '') {
      return { type: 'none', value: '' };
    }

    const searchTerm = query.trim();
    const searchLower = searchTerm.toLowerCase();

    // Verificar si es un distrito exacto
    const exactDistrict = allDistricts.find(district => 
      district.toLowerCase() === searchLower
    );
    if (exactDistrict) {
      return { type: 'district', value: exactDistrict };
    }

    // Verificar si es un distrito parcial
    const partialDistrict = allDistricts.find(district => 
      district.toLowerCase().includes(searchLower)
    );
    if (partialDistrict && searchLower.length >= 3) {
      return { type: 'district', value: partialDistrict };
    }

    // Verificar si es un platillo
    const matchingDish = allDishes.find(dish => 
      dish.includes(searchLower) || searchLower.includes(dish)
    );
    if (matchingDish) {
      return { type: 'dish', value: searchTerm };
    }

    // Por defecto, buscar por nombre de restaurante
    return { type: 'restaurant', value: searchTerm };
  }

  // Función para cargar el contador de restaurantes disponibles
  async function loadRestaurantsCount() {
    try {
      let url = '/api/restaurants-paginated?limit=1&includeCount=true';
      
      if (currentDistrictFilter && currentDistrictFilter.trim() !== "") {
        url += `&district=${encodeURIComponent(currentDistrictFilter)}`;
      }
      if (currentSearchQuery && currentSearchQuery.trim() !== "") {
        url += `&search=${encodeURIComponent(currentSearchQuery)}`;
      }
      if (currentDishFilter && currentDishFilter.trim() !== "") {
        url += `&dish=${encodeURIComponent(currentDishFilter)}`;
      }

      const response = await fetch(url);
      if (!response.ok) throw new Error("Error al cargar el contador de restaurantes");
      
      const data = await response.json();
      
      if (availableRestaurantsCount && data.totalCount !== undefined) {
        availableRestaurantsCount.textContent = `(${data.totalCount})`;
      }
    } catch (error) {
      console.error("Error loading restaurants count:", error);
      if (availableRestaurantsCount) {
        availableRestaurantsCount.textContent = '';
      }
    }
  }

  async function loadRestaurants(reset = false) {
    if (reset) {
      if (restaurantsList)
        restaurantsList.innerHTML =
          '<p style="text-align: center; grid-column: 1 / -1;">Cargando restaurantes...</p>';
      lastVisibleDocId = null;
      currentRestaurantsLoaded = 0;
      if (loadMoreBtn) loadMoreBtn.style.display = "none";
    }
    if (loadMoreBtn) loadMoreBtn.disabled = true;
    let url = `/api/restaurants-paginated?limit=12`;
    
    // Incluir contador solo en el reset (primera carga)
    if (reset) {
      url += '&includeCount=true';
    }
    
    if (lastVisibleDocId) {
      url += `&lastDocId=${lastVisibleDocId}`;
    }
    if (currentDistrictFilter && currentDistrictFilter.trim() !== "") {
      url += `&district=${encodeURIComponent(currentDistrictFilter)}`;
    }
    if (currentSearchQuery && currentSearchQuery.trim() !== "") {
      url += `&search=${encodeURIComponent(currentSearchQuery)}`;
    }
    if (currentDishFilter && currentDishFilter.trim() !== "") {
      url += `&dish=${encodeURIComponent(currentDishFilter)}`;
    }
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Error al cargar los restaurantes.");
      const data = await response.json();
      const restaurants = data.restaurants;
      lastVisibleDocId = data.lastDocId;
      
      // Actualizar contador si está disponible (solo en reset)
      if (reset && data.totalCount !== undefined && availableRestaurantsCount) {
        availableRestaurantsCount.textContent = `(${data.totalCount})`;
      }
      
      if (reset) {
        restaurantsList.innerHTML = "";
        currentRestaurantsLoaded = 0;
      }
      if (restaurants.length === 0 && reset) {
        restaurantsList.innerHTML =
          '<p style="text-align: center; grid-column: 1 / -1;">No se encontraron restaurantes.</p>';
      } else {
        restaurants.forEach((restaurant, index) => {
          const restaurantCard = document.createElement("div");
          restaurantCard.className = "restaurant-card";
          const imageUrl =
            restaurant.logoUrl ||
            "https://placehold.co/600x400/cccccc/333333?text=Logo+del+restaurante";

          const totalLikes = restaurant.totalLikes || 0;

          const safeName =
            typeof restaurant.name === "string" ? restaurant.name : "";
          const safeDescription =
            typeof restaurant.description === "string"
              ? restaurant.description
              : "";
          // Función para obtener el horario actual
          const getCurrentSchedule = (schedule) => {
            if (!schedule) return "Horario no disponible";
            
            const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const today = new Date().getDay();
            const todaySchedule = schedule[days[today]];
            
            if (todaySchedule && todaySchedule.from && todaySchedule.to) {
              return todaySchedule.to; // Mostrar hora de cierre
            }
            return "Cerrado hoy";
          };

          const scheduleText = getCurrentSchedule(restaurant.schedule);
          
          // Lógica dinámica para mostrar opciones de atención
          let deliveryText = "";
          let deliveryIconsHTML = "";
          
          if (restaurant.hasDelivery && restaurant.hasLocalService) {
            deliveryText = "Delivery y atención local";
            deliveryIconsHTML = `<span class="delivery-icon">🚚</span><span class="delivery-icon">🏪</span>`;
          } else if (restaurant.hasDelivery) {
            deliveryText = "Solo delivery";
            deliveryIconsHTML = `<span class="delivery-icon">🚚</span>`;
          } else if (restaurant.hasLocalService) {
            deliveryText = "Solo atención en local";
            deliveryIconsHTML = `<span class="delivery-icon">🏪</span>`;
          } else {
            deliveryText = "Sin atención disponible";
            deliveryIconsHTML = `<span class="delivery-icon">❌</span>`;
          }

          restaurantCard.innerHTML = `
            <img src="${imageUrl}" alt="${safeName}" class="restaurant-card-image">
            <div class="card-content">
              <h4 class="restaurant-title">${
                safeName.length > 50
                  ? safeName.substring(0, 50) + "..."
                  : safeName
              }</h4>
              <div class="restaurant-info">
                <div class="schedule-likes-info">
                  <div class="schedule-info">
                    <span class="schedule-icon">🕐</span>
                    <span class="schedule-text">${scheduleText}</span>
                  </div>
                  <div class="restaurant-likes">
                    <span class="heart-icon">❤️</span>
                    <span class="likes-count">${totalLikes}</span>
                  </div>
                </div>
                <div class="delivery-info">
                  ${deliveryIconsHTML}
                  <span class="delivery-text">${deliveryText}</span>
                </div>
              </div>
            </div>
          `;
          
          // Hacer toda la tarjeta clickeable
          restaurantCard.style.cursor = 'pointer';
          restaurantCard.addEventListener('click', () => {
            window.location.href = `/menu.html?restaurantId=${restaurant.id}`;
          });
          restaurantsList.appendChild(restaurantCard);
          setTimeout(() => {
            restaurantCard.classList.add("is-visible");
          }, 10 * index);
        });
        
        // Actualizar contador de restaurantes cargados
        currentRestaurantsLoaded += restaurants.length;
      }
      
      // Lógica mejorada para mostrar el botón "Ver más"
      if (loadMoreBtn) {
        // Solo mostrar el botón si:
        // 1. Hay más restaurantes para cargar (lastVisibleDocId existe)
        // 2. Ya se han cargado al menos 10 restaurantes (para cumplir con el requisito)
        // 3. El número de restaurantes en esta carga es igual al límite (12), lo que indica que probablemente hay más
        const shouldShowButton = lastVisibleDocId && 
                                 currentRestaurantsLoaded >= 10 && 
                                 restaurants.length > 0;
        loadMoreBtn.style.display = shouldShowButton ? "block" : "none";
        
        // Log para debug (se puede remover en producción)
        console.log(`Botón Ver más - lastDocId: ${!!lastVisibleDocId}, cargados: ${currentRestaurantsLoaded}, nuevos: ${restaurants.length}, mostrar: ${shouldShowButton}`);
      }
    } catch (error) {
      console.error("Error al cargar restaurantes:", error);
      if (restaurantsList)
        restaurantsList.innerHTML =
          '<p style="text-align: center; color: red; grid-column: 1 / -1;">Error al cargar. Revisa que el servidor esté corriendo.</p>';
      if (loadMoreBtn) loadMoreBtn.style.display = "none";
    } finally {
      if (loadMoreBtn) loadMoreBtn.disabled = false;
    }

    updateDishLikeButtons();
  }

  function showLogoutModal({ duration = 2400 } = {}) {
    return new Promise((resolve) => {
      // Overlay
      const overlay = document.createElement("div");
      overlay.className = "logout-modal__overlay";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", "Sesión cerrada correctamente");

      // Tarjeta del modal
      overlay.innerHTML = `
      <div class="logout-modal__card">
        <div class="logout-modal__icon" aria-hidden="true">
          <!-- Check en SVG para no depender de librerías -->
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
            <path d="M20 6L9 17l-5-5" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="logout-modal__title">Sesión cerrada correctamente</div>
        <div class="logout-modal__text">Vuelve pronto 👋</div>
      </div>
    `;

      document.body.appendChild(overlay);

      // Programar autocierre
      const close = () => {
        overlay.classList.add("logout-modal--closing");
        // Espera a que termine la animación y limpia
        const removeAfter = () => {
          overlay.remove();
          resolve();
        };
        overlay.addEventListener("animationend", removeAfter, { once: true });
        // Fallback por si no dispara animationend
        setTimeout(removeAfter, 350);
      };

      setTimeout(close, duration);
    });
  }

  // Función para cargar todos los distritos únicos
  async function loadAllDistricts() {
    try {
      const snapshot = await db.collection("restaurants").get();
      const districts = new Set();
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.district && data.district.trim()) {
          districts.add(data.district.trim());
        }
      });
      
      return Array.from(districts).sort();
    } catch (error) {
      console.error("Error loading districts:", error);
      return [];
    }
  }

  // Función para inicializar el buscador de distritos
  async function initializeDistrictSearch() {
    if (!districtSearch || !customDropdown || !dropdownContent) return;

    try {
      // Cargar distritos
      const districts = await loadAllDistricts();
      allDistricts = [...districts];
      
      // Cargar platillos en paralelo
      await loadAllDishes();
      
      let isDropdownOpen = false;
      let filteredDistricts = [...districts];
      
      // Función para renderizar las opciones del dropdown
      function renderDropdownOptions(districtsToShow) {
        dropdownContent.innerHTML = "";
        
        // Agregar opción "Todos los distritos"
        const allOption = document.createElement("div");
        allOption.className = "dropdown-option";
        allOption.innerHTML = `
          <span>Todos los distritos</span>
          <svg class="dropdown-option-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        `;
        allOption.addEventListener("click", () => {
          districtSearch.value = "";
          currentDistrictFilter = "";
          currentSearchQuery = "";
          closeDropdown();
          loadRestaurants(true);
        });
        dropdownContent.appendChild(allOption);
        
        // Agregar opciones de distritos
        districtsToShow.forEach((district) => {
          const option = document.createElement("div");
          option.className = "dropdown-option";
          option.innerHTML = `
            <span>${district}</span>
            <svg class="dropdown-option-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          `;
          option.addEventListener("click", () => {
            districtSearch.value = district;
            currentDistrictFilter = district;
            currentSearchQuery = "";
            closeDropdown();
            loadRestaurants(true);
          });
          dropdownContent.appendChild(option);
        });
      }
      
      // Función para abrir el dropdown
      function openDropdown() {
        isDropdownOpen = true;
        customDropdown.classList.add("show");
        dropdownArrow.classList.add("rotated");
        renderDropdownOptions(filteredDistricts);
      }
      
      // Función para cerrar el dropdown
      function closeDropdown() {
        isDropdownOpen = false;
        customDropdown.classList.remove("show");
        dropdownArrow.classList.remove("rotated");
      }
      
      // Event listener para la flecha del dropdown
      dropdownArrow.addEventListener("click", (e) => {
        e.stopPropagation();
        if (isDropdownOpen) {
          closeDropdown();
        } else {
          openDropdown();
        }
      });
      
      // Event listener para el input de búsqueda
      let searchTimeout;
      districtSearch.addEventListener("input", (e) => {
        const searchValue = e.target.value.trim().toLowerCase();
        
        // Filtrar distritos basado en la búsqueda
        filteredDistricts = districts.filter(district => 
          district.toLowerCase().includes(searchValue)
        );
        
        // Mostrar dropdown si hay texto y hay resultados
        if (searchValue && filteredDistricts.length > 0) {
          openDropdown();
        } else if (!searchValue) {
          filteredDistricts = [...districts];
          if (isDropdownOpen) {
            renderDropdownOptions(filteredDistricts);
          }
        }
        
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          const searchResult = interpretSearchQuery(e.target.value);
          
          // Resetear todos los filtros
          currentDistrictFilter = "";
          currentSearchQuery = "";
          currentDishFilter = "";
          
          // Aplicar el filtro correspondiente según el tipo de búsqueda
          switch (searchResult.type) {
            case 'district':
              currentDistrictFilter = searchResult.value;
              break;
            case 'dish':
              currentDishFilter = searchResult.value;
              break;
            case 'restaurant':
              currentSearchQuery = searchResult.value;
              break;
          }
          
          loadRestaurants(true);
        }, 300);
      });
      
      // Event listener para hacer clic en el input
      districtSearch.addEventListener("click", () => {
        if (!isDropdownOpen) {
          openDropdown();
        }
      });
      
      // Event listener para cerrar el dropdown al hacer clic fuera
      document.addEventListener("click", (e) => {
        if (!districtSearch.contains(e.target) && !customDropdown.contains(e.target) && !dropdownArrow.contains(e.target)) {
          closeDropdown();
        }
      });
      
      // Event listener para teclas
      districtSearch.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          closeDropdown();
        }
      });

    } catch (error) {
      console.error("Error initializing district search:", error);
    }
  }

  // Event listener para el botón de localización
  const locationBtn = document.getElementById('location-btn');
  if (locationBtn) {
    locationBtn.addEventListener('click', () => {
      window.location.href = 'mapa.html';
    });
  }
});
