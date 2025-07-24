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
  const districtFilter = document.getElementById("district-filter");
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
  let currentDistrictFilter = "Todos";
  let currentUserFavorites = new Set();

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
  if (districtFilter) {
    districtFilter.addEventListener("change", (event) => {
      currentDistrictFilter = event.target.value;
      loadRestaurants(true);
    });
  }
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
        showToast("You have been logged out.", "info");
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
    if (currentDistrictFilter !== "Todos") {
      url += `&district=${encodeURIComponent(currentDistrictFilter)}`;
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
            restaurant.photoUrl ||
            "https://placehold.co/600x400/cccccc/333333?text=Sin+Imagen";

          const totalLikes = restaurant.totalLikes || 0;

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
        if (currentDistrictFilter !== "Todos") {
            url += `&district=${encodeURIComponent(currentDistrictFilter)}`;
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
                        restaurant.photoUrl ||
                        "https://placehold.co/600x400/cccccc/333333?text=Sin+Imagen";

                    const totalLikes = restaurant.totalLikes || 0;

                    restaurantCard.innerHTML = `
                               <img src="${imageUrl}" alt="${restaurant.name}" class="restaurant-card-image">

                <div class="card-content">
             <div class="restaurant-title">
             <h4>${restaurant.name.length > 35 ? restaurant.name.substring(0, 35) + '...' : restaurant.name}</h4>
             <span class="restaurant-likes-inline">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="red" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-heart">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
             </svg>
           <span>${totalLikes}</span>
            </span>
             </div>


               <p>${restaurant.description.length > 30 ? restaurant.description.substring(0, 30) + '...' : restaurant.description}</p>
               <a href="/menu.html?restaurantId=${restaurant.id}" class="card-button">Ver menú</a>
                </div>

                                    `;
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

  loadRestaurants(true);
});
