const firebaseConfig = {
  apiKey: "AIzaSyDNbgT9yeSBMhsftW4FOe_SB7bfSg44CPI",
  authDomain: "cashma-8adfb.firebaseapp.com",
  projectId: "cashma-8adfb",
  storageBucket: "cashma-8adfb.appspot.com",
  messagingSenderId: "92623435008",
  appId: "1:92623435008:web:8d4b4d58c0ccb9edb5afe5",
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

document.addEventListener("DOMContentLoaded", () => {
  const restaurantsList = document.getElementById("restaurants-list");
  const loadMoreBtn = document.getElementById("load-more-btn");
  // const districtFilter = document.getElementById("district-filter"); // Comentado - no se usa
  const districtSearch = document.getElementById("district-search");
  const districtsList = document.getElementById("districts-list");
  const myRestaurantButton = document.getElementById("my-restaurant-btn");

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
  let currentUserFavorites = new Set();
  let tomSelectInstance = null;

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

  if (myRestaurantButton) {
    setupMyRestaurantButton();
  }

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

  auth.onAuthStateChanged(async (user) => {
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
        // Opcional: Si el owner ha llegado aquí, podrías asegurar que su 'lastLogin' en 'users' se actualice.
        // Esto lo manejará el backend si el login.js lo llama con role: 'owner'
      }
      // *** FIN Lógica INTELIGENTE ***

      // *** ESTE BLOQUE DE CÓDIGO ES EL QUE DEBES ELIMINAR ***
      // const userDocRef = db.collection("users").doc(user.uid);
      // try {
      //     const docSnapshot = await userDocRef.get();
      //     if (!docSnapshot.exists) {
      //         await userDocRef.set({
      //             uid: user.uid,
      //             displayName: user.displayName,
      //             email: user.email,
      //             createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      //             role: "customer",
      //         });
      //         console.log("New customer registered in Firestore:", user.uid);
      //     } else {
      //         await userDocRef.update({
      //             lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
      //         });
      //     }
      // } catch (error) {
      //     console.error("Error managing user data in Firestore:", error);
      // }
      // *** FIN DEL BLOQUE A ELIMINAR ***

      await loadUserFavorites(user.uid);
      favoritesCountDisplay.style.display = "flex";
      favoritesCounter.textContent = currentUserFavorites.size;

      loginModalOverlay.style.display = "none";
      loadRestaurants(true);
    } else {
      myAccountBtn.textContent = "Soy Comensal";
      logoutText.style.display = "none";
      favoritesCountDisplay.style.display = "none";
      currentUserFavorites.clear();

      const restaurantBtn = document.getElementById("my-restaurant");
      restaurantBtn.style.display = "flex";

      loadRestaurants(true);
    }
  });

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

  function setupMyRestaurantButton() {
    if (!myRestaurantButton) return;
    myRestaurantButton.textContent = "Mi Restaurante";
    myRestaurantButton.disabled = false;

    myRestaurantButton.onclick = async () => {
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
          window.location.href = "/dashboard.html";
        } else {
          showToast(
            "You do not have permission to access the restaurant dashboard.",
            "warning"
          );
          myRestaurantButton.textContent = "Mi Restaurante";
          myRestaurantButton.disabled = false;
        }
      } else {
        window.location.href = "/login.html";
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

  async function loadRestaurants(reset = false) {
    if (reset) {
      if (restaurantsList)
        restaurantsList.innerHTML =
          '<p style="text-align: center; grid-column: 1 / -1;">Cargando restaurantes...</p>';
      lastVisibleDocId = null;
      if (loadMoreBtn) loadMoreBtn.style.display = "none";
    }
    if (loadMoreBtn) loadMoreBtn.disabled = true;
    let url = `/api/restaurants-paginated?limit=12`;
    if (lastVisibleDocId) {
      url += `&lastDocId=${lastVisibleDocId}`;
    }
    if (currentDistrictFilter && currentDistrictFilter.trim() !== "") {
      url += `&district=${encodeURIComponent(currentDistrictFilter)}`;
    }
    if (currentSearchQuery && currentSearchQuery.trim() !== "") {
      url += `&search=${encodeURIComponent(currentSearchQuery)}`;
    }
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Error al cargar los restaurantes.");
      const data = await response.json();
      const restaurants = data.restaurants;
      lastVisibleDocId = data.lastDocId;
      if (reset) {
        restaurantsList.innerHTML = "";
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
          const deliveryText = restaurant.hasDelivery ? "Delivery disponible" : "Solo atención en local";
          const deliveryIcon = restaurant.hasDelivery ? "🚚" : "🏪";

          restaurantCard.innerHTML = `
            <img src="${imageUrl}" alt="${safeName}" class="restaurant-card-image">
            <div class="card-content">
              <h4 class="restaurant-title">${
                safeName.length > 50
                  ? safeName.substring(0, 50) + "..."
                  : safeName
              }</h4>
              <div class="restaurant-info">
                <div class="schedule-info">
                  <span class="schedule-icon">🕐</span>
                  <span class="schedule-text">${scheduleText}</span>
                </div>
                <div class="restaurant-likes">
                  <span class="heart-icon">❤️</span>
                  <span class="likes-count">${totalLikes}</span>
                </div>
                <div class="delivery-info">
                  <span class="delivery-icon">${deliveryIcon}</span>
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
      }
      if (loadMoreBtn) {
        loadMoreBtn.style.display = lastVisibleDocId ? "block" : "none";
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
    if (!districtSearch || !districtsList) return;

    try {
      const districts = await loadAllDistricts();
      
      // Limpiar opciones existentes
      districtsList.innerHTML = "";
      
      // Agregar opciones al datalist
      districts.forEach((district) => {
        const option = document.createElement("option");
        option.value = district;
        districtsList.appendChild(option);
      });

      // Agregar event listener para la búsqueda
      let searchTimeout;
      districtSearch.addEventListener("input", (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          const searchValue = e.target.value.trim();
          
          // Verificar si el valor coincide exactamente con un distrito
          const isExactDistrict = districts.includes(searchValue);
          
          if (isExactDistrict) {
            // Si es un distrito exacto, filtrar por distrito
            currentDistrictFilter = searchValue;
            currentSearchQuery = "";
          } else {
            // Si no es un distrito exacto, buscar por nombre
            currentSearchQuery = searchValue;
            currentDistrictFilter = "";
          }
          
          loadRestaurants(true);
        }, 300);
      });

    } catch (error) {
      console.error("Error initializing district search:", error);
    }
  }

  loadRestaurants(true);
});
