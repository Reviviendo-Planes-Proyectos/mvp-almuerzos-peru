const admin = require('firebase-admin');

// Configurar Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function debugDish() {
  try {
    const targetDishId = 'icTaRf02vOtjnoM6mluh';
    const targetRestaurantId = 'pQXtNqw0MyDUtCIXUrdx';
    
    console.log('🔍 Buscando plato:', targetDishId);
    console.log('🏪 En restaurante:', targetRestaurantId);
    console.log('='.repeat(50));
    
    // Verificar si el plato existe
    const dishDoc = await db.collection('dishes').doc(targetDishId).get();
    
    if (dishDoc.exists) {
      console.log('✅ PLATO ENCONTRADO:');
      console.log(dishDoc.data());
    } else {
      console.log('❌ PLATO NO ENCONTRADO');
      
      // Listar todos los platos para ver qué hay disponible
      console.log('\n📋 Listando todos los platos en la BD:');
      const allDishes = await db.collection('dishes').get();
      
      if (allDishes.empty) {
        console.log('❌ No hay platos en la base de datos');
      } else {
        allDishes.forEach(doc => {
          console.log(`ID: ${doc.id}`);
          console.log(`Datos:`, doc.data());
          console.log('-'.repeat(30));
        });
      }
      
      // Verificar cartas del restaurante específico
      console.log('\n🍽️ Verificando cartas del restaurante:', targetRestaurantId);
      const cardsQuery = await db.collection('cards')
        .where('restaurantId', '==', targetRestaurantId)
        .get();
      
      if (cardsQuery.empty) {
        console.log('❌ No hay cartas para este restaurante');
      } else {
        console.log('✅ Cartas encontradas:');
        for (const cardDoc of cardsQuery.docs) {
          console.log(`\nCarta ID: ${cardDoc.id}`);
          console.log(`Carta datos:`, cardDoc.data());
          
          // Buscar platos de esta carta
          const dishesQuery = await db.collection('dishes')
            .where('cardId', '==', cardDoc.id)
            .get();
          
          if (dishesQuery.empty) {
            console.log('  ❌ No hay platos en esta carta');
          } else {
            console.log(`  ✅ Platos en esta carta (${dishesQuery.size}):`);
            dishesQuery.forEach(dishDoc => {
              console.log(`    - ID: ${dishDoc.id}`);
              console.log(`      Nombre: ${dishDoc.data().name}`);
              console.log(`      Precio: ${dishDoc.data().price}`);
              console.log(`      Activo: ${dishDoc.data().isActive}`);
            });
          }
        }
      }
    }
    
    // Verificar el restaurante
    console.log('\n🏪 Verificando restaurante:', targetRestaurantId);
    const restaurantDoc = await db.collection('restaurants').doc(targetRestaurantId).get();
    
    if (restaurantDoc.exists) {
      console.log('✅ RESTAURANTE ENCONTRADO:');
      const data = restaurantDoc.data();
      console.log(`Nombre: ${data.name}`);
      console.log(`Activo: ${data.isActive}`);
    } else {
      console.log('❌ RESTAURANTE NO ENCONTRADO');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

debugDish();
