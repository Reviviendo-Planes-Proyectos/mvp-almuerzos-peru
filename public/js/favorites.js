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
  const favoriteDishesList = document.getElementById("favorite-dishes-list");
  const backToHomeBtn = document.getElementById("back-to-home-btn");
  const myAccountBtn = document.getElementById("my-account-btn");
  const logoutText = document.getElementById("logout-text");

  let currentUserUid = null;

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
            <button class="remove-like-btn" data-dish-id="${
              dish.id
            }">Quitar Like</button>
        `;
      dishItem
        .querySelector(".remove-like-btn")
        .addEventListener("click", handleRemoveLike);
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

  async function handleRemoveLike(event) {
    const dishId = event.target.dataset.dishId;
    const user = auth.currentUser;

    if (!user) {
      console.warn("User not logged in, cannot unlike.");
      return;
    }

    try {
      const idToken = await user.getIdToken();
      const response = await fetch(`/api/dishes/${dishId}/like`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ action: "unlike" }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Error al quitar el like.`);
      }

      await loadFavoriteDishes(user.uid);
    } catch (error) {
      console.error("Error unliking dish from favorites list:", error);
    }
  }
});
