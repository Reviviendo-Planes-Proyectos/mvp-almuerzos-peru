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
  // Mostrar loading inmediatamente
  showSkeletonLoading();
  
  // Inicializar Firebase de forma asíncrona
  const { auth, db } = await initializeFirebaseAsync();
  const favoriteDishesList = document.getElementById("favorite-dishes-list");
  const backToHomeBtn = document.getElementById("back-to-home-btn");
  const myAccountBtn = document.getElementById("my-account-btn");
  const logoutText = document.getElementById("logout-text");

  let currentUserUid = null;

  // Función para mostrar skeleton loading
  function showSkeletonLoading() {
    const favoriteDishesList = document.getElementById("favorite-dishes-list");
    if (favoriteDishesList) {
      favoriteDishesList.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem;">
          ${Array(4).fill().map(() => `
            <div style="background: #f3f4f6; border-radius: 12px; padding: 1rem; animation: pulse 1.5s ease-in-out infinite alternate;">
              <div style="background: #e5e7eb; height: 150px; border-radius: 8px; margin-bottom: 1rem;"></div>
              <div style="background: #e5e7eb; height: 20px; border-radius: 4px; margin-bottom: 0.5rem;"></div>
              <div style="background: #e5e7eb; height: 16px; border-radius: 4px; width: 60%;"></div>
            </div>
          `).join('')}
        </div>
      `;
    }
  }

  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUserUid = user.uid;
      myAccountBtn.textContent = user.displayName || user.email;
      logoutText.style.display = "inline";
      loadFavoriteDishes(currentUserUid);
    } else {
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
    favoriteDishesList.innerHTML =
      '<p class="no-favorites-message">Cargando tus platos favoritos...</p>';
    try {
      const favoritesSnapshot = await db.collection('invited').doc(uid).collection('favorites').get();
            const favoriteDishIds = [];
            favoritesSnapshot.forEach(doc => {
                favoriteDishIds.push(doc.id);
      });

      if (favoriteDishIds.length === 0) {
        favoriteDishesList.innerHTML =
          '<p class="no-favorites-message">Todavía no tienes platos favoritos. ¡Explora nuestros restaurantes y dale "Me gusta" a los que más te gusten!</p>';
        return;
      }

      const favoriteDishesData = [];
      for (const dishId of favoriteDishIds) {
        const dishDoc = await db.collection("dishes").doc(dishId).get();
        if (dishDoc.exists) {
          const dishData = dishDoc.data();
          let restaurantName = "Restaurante Desconocido";
          let restaurantId = null;

          const cardDoc = await db
            .collection("cards")
            .doc(dishData.cardId)
            .get();
          if (cardDoc.exists) {
            const restaurantIdFromCard = cardDoc.data().restaurantId;
            const restaurantDoc = await db
              .collection("restaurants")
              .doc(restaurantIdFromCard)
              .get();
            if (restaurantDoc.exists) {
              restaurantName = restaurantDoc.data().name;
              restaurantId = restaurantDoc.id;
            }
          }

          favoriteDishesData.push({
            id: dishDoc.id,
            name: dishData.name,
            price: dishData.price,
            photoUrl: dishData.photoUrl,
            restaurantName: restaurantName,
            restaurantId: restaurantId,
          });
        } else {
          await db
            .collection("users")
            .doc(uid)
            .collection("favorites")
            .doc(dishId)
            .delete();
          console.warn(
            `Favorite dish ${dishId} not found, removed from favorites.`
          );
        }
      }

      displayFavoriteDishes(favoriteDishesData);
    } catch (error) {
      console.error("Error loading favorite dishes:", error);
      favoriteDishesList.innerHTML =
        '<p class="no-favorites-message" style="color: red;">Error al cargar tus favoritos. Por favor, inténtalo de nuevo.</p>';
    }
  }
  function displayFavoriteDishes(dishes) {
    favoriteDishesList.innerHTML = "";
    dishes.forEach((dish) => {
      const dishItem = document.createElement("div");
      dishItem.className = "favorite-dish-item";
      dishItem.innerHTML = `
            <img src="${
              dish.photoUrl || "https://placehold.co/80x80?text=Plato"
            }" alt="${dish.name}">
            <div class="favorite-dish-details">
                <h4>${dish.name}</h4>
                <p>S/ ${dish.price.toFixed(2)}</p>
                <a href="#" class="restaurant-name-link" data-restaurant-id="${
                  dish.restaurantId
                }">De: ${dish.restaurantName}</a>
            </div>
            <div class="like-status">❤️ Te gusta este plato</div>
        `;
      favoriteDishesList.appendChild(dishItem);
    });
    if (dishes.length === 0) {
      favoriteDishesList.innerHTML =
        '<p class="no-favorites-message">Todavía no tienes platos favoritos. ¡Explora nuestros restaurantes y dale "Me gusta" a los que más te gusten!</p>';
    }

    document.querySelectorAll(".restaurant-name-link").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        const restaurantId = event.target.dataset.restaurantId;
        if (restaurantId) {
          window.location.href = `/menu.html?restaurantId=${restaurantId}`;
        }
      });
    });
  }

  // Función handleRemoveLike eliminada - Los likes ahora son permanentes
});
