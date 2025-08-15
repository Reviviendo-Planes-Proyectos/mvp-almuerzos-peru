const firebaseConfig = {
  apiKey: "AIzaSyDNbgT9yeSBMhsftW4FOe_SB7bfSg44CPI",
  authDomain: "cashma-8adfb.firebaseapp.com",
  projectId: "cashma-8adfb",
  storageBucket: "cashma-8adfb.appspot.com",
  messagingSenderId: "92623435008",
  appId: "1:92623435008:web:8d4b4d58c0ccb9edb5afe5",
};

// Variables de cache global para favoritos
let favoritesCache = new Map();

// Variables globales de Firebase
let auth, db;

// Inicializar Firebase cuando esté disponible
function waitForFirebaseAndInitialize() {
  if (typeof firebase !== 'undefined' && firebase.apps && firebase.auth && firebase.firestore) {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    auth = firebase.auth();
    db = firebase.firestore();
    console.log('Firebase initialized successfully in favorites');
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
        console.error('Firebase failed to load after maximum attempts in favorites');
      }
    }
  }, 100);
}

// Inicialización asíncrona (versión simplificada)
async function initializeFirebaseAsync() {
  return new Promise((resolve) => {
    const checkAuth = () => {
      if (auth && db) {
        resolve({ auth, db });
      } else {
        setTimeout(checkAuth, 100);
      }
    };
    checkAuth();
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  // Mostrar modal de carga inmediatamente
  showLoadingModal();
  
  // Inicializar Firebase de forma asíncrona
  const { auth, db } = await initializeFirebaseAsync();
  const favoriteDishesList = document.getElementById("favorite-dishes-list");
  const backToHomeBtn = document.getElementById("back-to-home-btn");
  const myAccountBtn = document.getElementById("my-account-btn");
  const logoutText = document.getElementById("logout-text");

  let currentUserUid = null;

  // Función para mostrar el modal de carga
  function showLoadingModal() {
    const modal = document.getElementById("loading-modal");
    if (modal) {
      modal.classList.remove("hidden");
    }
  }

  // Función para ocultar el modal de carga
  function hideLoadingModal() {
    const modal = document.getElementById("loading-modal");
    if (modal) {
      setTimeout(() => {
        modal.classList.add("hidden");
      }, 500); // Pequeño delay para una transición suave
    }
  }

  // Función para mostrar skeleton loading en el grid
  function showSkeletonLoading() {
    const favoriteDishesList = document.getElementById("favorite-dishes-list");
    if (favoriteDishesList) {
      favoriteDishesList.innerHTML = `
        ${Array(6).fill().map(() => `
          <div class="favorite-dish-item" style="background: #f3f4f6; animation: pulse 1.5s ease-in-out infinite alternate; min-height: 100px;">
            <div class="dish-image-container">
              <div style="background: #e5e7eb; width: 70px; height: 70px; border-radius: 50%; margin-right: 1rem;"></div>
            </div>
            <div class="favorite-dish-details" style="flex-grow: 1;">
              <div style="background: #e5e7eb; height: 18px; border-radius: 4px; margin-bottom: 0.25rem; width: 80%;"></div>
              <div style="background: #e5e7eb; height: 16px; border-radius: 4px; margin-bottom: 0.25rem; width: 40%;"></div>
              <div style="background: #e5e7eb; height: 14px; border-radius: 4px; width: 60%;"></div>
              <div style="background: #e5e7eb; height: 12px; border-radius: 4px; margin-top: 0.25rem; width: 50%;"></div>
            </div>
            <div style="background: #e5e7eb; height: 32px; width: 80px; border-radius: 20px; margin-left: 1rem;"></div>
          </div>
        `).join('')}
      `;
    }
  }

  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUserUid = user.uid;
      myAccountBtn.textContent = user.displayName || user.email;
      logoutText.style.display = "inline";
      await loadFavoriteDishes(currentUserUid);
      hideLoadingModal(); // Ocultar modal después de cargar
    } else {
      hideLoadingModal();
      window.location.href = "index.html";
    }
  });

  if (logoutText) {
    logoutText.addEventListener("click", async () => {
      try {
        await auth.signOut();
      } catch (error) {
        console.error("Error during logout:", error);
      }
    });
  }

  if (backToHomeBtn) {
    backToHomeBtn.addEventListener("click", () => {
      window.location.href = "index.html";
    });
  }

  async function loadFavoriteDishes(uid) {
    // Mostrar skeleton loading mientras carga
    showSkeletonLoading();
    
    try {
      const favoritesSnapshot = await db.collection('invited').doc(uid).collection('favorites').get();
      const favoriteDishIds = [];
      
      // Obtener IDs y fechas de favoritos
      favoritesSnapshot.forEach(doc => {
        const data = doc.data();
        favoriteDishIds.push({
          dishId: doc.id,
          addedAt: data.addedAt || new Date(), // Si no hay fecha, usar fecha actual
          timestamp: data.addedAt ? data.addedAt.toDate() : new Date()
        });
      });

      if (favoriteDishIds.length === 0) {
        favoriteDishesList.innerHTML = `
          <div class="no-favorites-message" style="grid-column: 1 / -1;">
            <h3>🍽️ ¡Aún no tienes platos favoritos!</h3>
            <p>Explora nuestros restaurantes y marca como favoritos los platos que más te gusten. ¡Haz clic en el corazón ❤️ de cualquier plato para agregarlo aquí!</p>
            <button onclick="window.location.href='index.html'" style="margin-top: 1rem; padding: 0.75rem 1.5rem; background: var(--brand-primary); border: none; border-radius: 25px; font-weight: 600; cursor: pointer;">
              Explorar Restaurantes
            </button>
          </div>
        `;
        return;
      }

      // Ordenar por fecha (más reciente primero)
      favoriteDishIds.sort((a, b) => b.timestamp - a.timestamp);

      const favoriteDishesData = [];
      
      // Cargar datos de platos en paralelo para mejor rendimiento
      const dishPromises = favoriteDishIds.map(async (favoriteItem) => {
        const dishDoc = await db.collection("dishes").doc(favoriteItem.dishId).get();
        if (dishDoc.exists) {
          const dishData = dishDoc.data();
          let restaurantName = "Restaurante Desconocido";
          let restaurantId = null;

          const cardDoc = await db.collection("cards").doc(dishData.cardId).get();
          if (cardDoc.exists) {
            const restaurantIdFromCard = cardDoc.data().restaurantId;
            const restaurantDoc = await db.collection("restaurants").doc(restaurantIdFromCard).get();
            if (restaurantDoc.exists) {
              restaurantName = restaurantDoc.data().name;
              restaurantId = restaurantDoc.id;
            }
          }

          return {
            id: dishDoc.id,
            name: dishData.name,
            price: dishData.price,
            photoUrl: dishData.photoUrl,
            restaurantName: restaurantName,
            restaurantId: restaurantId,
            addedAt: favoriteItem.timestamp,
          };
        } else {
          // Limpiar favorito inexistente
          await db.collection("invited").doc(uid).collection("favorites").doc(favoriteItem.dishId).delete();
          console.warn(`Favorite dish ${favoriteItem.dishId} not found, removed from favorites.`);
          return null;
        }
      });

      const results = await Promise.all(dishPromises);
      const validDishes = results.filter(dish => dish !== null);
      
      displayFavoriteDishes(validDishes);
    } catch (error) {
      console.error("Error loading favorite dishes:", error);
      favoriteDishesList.innerHTML = `
        <div class="no-favorites-message" style="grid-column: 1 / -1; color: #ef4444;">
          <h3>❌ Error al cargar tus favoritos</h3>
          <p>Hubo un problema al cargar tus platos favoritos. Por favor, inténtalo de nuevo.</p>
          <button onclick="location.reload()" style="margin-top: 1rem; padding: 0.75rem 1.5rem; background: #ef4444; color: white; border: none; border-radius: 25px; font-weight: 600; cursor: pointer;">
            Reintentar
          </button>
        </div>
      `;
    }
  }
  function displayFavoriteDishes(dishes) {
    favoriteDishesList.innerHTML = "";
    
    if (dishes.length === 0) {
      favoriteDishesList.innerHTML = `
        <div class="no-favorites-message" style="grid-column: 1 / -1;">
          <h3>🍽️ ¡Aún no tienes platos favoritos!</h3>
          <p>Explora nuestros restaurantes y marca como favoritos los platos que más te gusten. ¡Haz clic en el corazón ❤️ de cualquier plato para agregarlo aquí!</p>
          <button onclick="window.location.href='index.html'" style="margin-top: 1rem; padding: 0.75rem 1.5rem; background: var(--brand-primary); border: none; border-radius: 25px; font-weight: 600; cursor: pointer;">
            Explorar Restaurantes
          </button>
        </div>
      `;
      return;
    }

    // Función para formatear la fecha de manera amigable
    function formatFavoriteDate(date) {
      const now = new Date();
      const diffTime = Math.abs(now - date);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 1) {
        return "Agregado hoy";
      } else if (diffDays === 2) {
        return "Agregado ayer";
      } else if (diffDays <= 7) {
        return `Agregado hace ${diffDays - 1} días`;
      } else if (diffDays <= 30) {
        const weeks = Math.floor((diffDays - 1) / 7);
        return `Agregado hace ${weeks} semana${weeks > 1 ? 's' : ''}`;
      } else {
        return `Agregado el ${date.toLocaleDateString('es-PE', { 
          day: 'numeric', 
          month: 'short',
          year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        })}`;
      }
    }

    dishes.forEach((dish, index) => {
      const dishItem = document.createElement("div");
      dishItem.className = "favorite-dish-item";
      dishItem.style.animationDelay = `${index * 0.1}s`; // Animación escalonada
      
      dishItem.innerHTML = `
        <div class="dish-image-container">
          <img src="${dish.photoUrl || "images/default-dish.jpg.png"}" 
               alt="${dish.name}"
               loading="lazy"
               onerror="this.src='images/default-dish.jpg.png'">
        </div>
        <div class="favorite-dish-details">
          <h4 title="${dish.name}">${dish.name}</h4>
          <p class="price">S/ ${dish.price.toFixed(2)}</p>
          <a href="#" class="restaurant-name restaurant-name-link" data-restaurant-id="${dish.restaurantId}" title="${dish.restaurantName}">
            📍 ${dish.restaurantName}
          </a>
          <div class="favorite-date">${formatFavoriteDate(dish.addedAt)}</div>
        </div>
        <div class="like-status">
          ❤️ <span>Favorito</span>
        </div>
      `;
      
      favoriteDishesList.appendChild(dishItem);
    });

    // Agregar eventos a los enlaces de restaurantes
    document.querySelectorAll(".restaurant-name-link").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        const restaurantId = event.target.dataset.restaurantId;
        if (restaurantId) {
          // Efecto de transición suave
          event.target.style.transform = "scale(0.95)";
          setTimeout(() => {
            window.location.href = `/menu.html?restaurantId=${restaurantId}`;
          }, 150);
        }
      });
    });

    // Agregar animación de entrada
    const items = document.querySelectorAll('.favorite-dish-item');
    items.forEach((item, index) => {
      item.style.opacity = '0';
      item.style.transform = 'translateY(20px)';
      setTimeout(() => {
        item.style.transition = 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
        item.style.opacity = '1';
        item.style.transform = 'translateY(0)';
      }, index * 100);
    });
  }

  // Función handleRemoveLike eliminada - Los likes ahora son permanentes
});
