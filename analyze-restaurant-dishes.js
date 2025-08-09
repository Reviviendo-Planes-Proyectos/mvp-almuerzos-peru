const admin = require('firebase-admin');

// Inicializar Firebase Admin
if (!admin.apps.length) {
  const serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://cashma-8adfb-default-rtdb.firebaseio.com"
  });
}

const db = admin.firestore();

async function analyzeRestaurantDishes() {
  try {
    console.log('🔍 ANÁLISIS: Restaurantes y cantidad de platos');
    console.log('============================================================');

    // Obtener todos los restaurantes
    const restaurantsSnapshot = await db.collection('restaurants').get();
    
    if (restaurantsSnapshot.empty) {
      console.log('❌ No hay restaurantes en la base de datos');
      return;
    }

    console.log(`📊 Total de restaurantes en BD: ${restaurantsSnapshot.size}`);
    console.log('------------------------------------------------------------');

    let restaurantsWithMinDishes = 0;
    let restaurantsWithoutMinDishes = 0;
    const minDishes = 5;

    for (const restaurantDoc of restaurantsSnapshot.docs) {
      const restaurantData = restaurantDoc.data();
      const restaurantId = restaurantDoc.id;
      
      // Contar platos del restaurante
      let totalDishes = 0;
      
      // Obtener cartas del restaurante
      const cardsSnapshot = await db
        .collection('cards')
        .where('restaurantId', '==', restaurantId)
        .get();

      // Contar platos en todas las cartas
      for (const cardDoc of cardsSnapshot.docs) {
        const dishesSnapshot = await db
          .collection('dishes')
          .where('cardId', '==', cardDoc.id)
          .get();
        
        totalDishes += dishesSnapshot.size;
      }

      // Determinar si cumple el criterio
      const meetsMinimum = totalDishes >= minDishes;
      const status = meetsMinimum ? '✅' : '❌';
      const visibility = meetsMinimum ? 'VISIBLE' : 'OCULTO';
      
      console.log(`${status} ${restaurantData.name || 'Sin nombre'}`);
      console.log(`   📍 Distrito: ${restaurantData.district || 'No especificado'}`);
      console.log(`   🍽️  Platos: ${totalDishes} (mínimo requerido: ${minDishes})`);
      console.log(`   👁️  Estado: ${visibility} en el home`);
      console.log('   ' + '-'.repeat(50));

      if (meetsMinimum) {
        restaurantsWithMinDishes++;
      } else {
        restaurantsWithoutMinDishes++;
      }
    }

    console.log('\n============================================================');
    console.log('📈 RESUMEN DEL ANÁLISIS:');
    console.log(`✅ Restaurantes VISIBLES (≥${minDishes} platos): ${restaurantsWithMinDishes}`);
    console.log(`❌ Restaurantes OCULTOS (<${minDishes} platos): ${restaurantsWithoutMinDishes}`);
    console.log(`📊 Total de restaurantes: ${restaurantsSnapshot.size}`);
    
    const visibilityPercentage = ((restaurantsWithMinDishes / restaurantsSnapshot.size) * 100).toFixed(1);
    console.log(`📊 Porcentaje visible: ${visibilityPercentage}%`);
    
    if (restaurantsWithMinDishes === 0) {
      console.log('\n⚠️  ADVERTENCIA: Ningún restaurante será visible en el home');
      console.log('   Considera reducir el mínimo requerido de platos');
    } else if (restaurantsWithMinDishes < 3) {
      console.log('\n⚠️  ADVERTENCIA: Muy pocos restaurantes serán visibles');
      console.log('   Los usuarios podrían no encontrar suficientes opciones');
    }

  } catch (error) {
    console.error('❌ Error en el análisis:', error);
  } finally {
    process.exit(0);
  }
}

analyzeRestaurantDishes();
