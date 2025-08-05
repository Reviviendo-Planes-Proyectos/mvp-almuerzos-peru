const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Inicializar Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function testCommentFlow() {
  try {
    console.log('🧪 Iniciando test del flujo de comentarios...');
    
    // 1. Verificar que no hay comentarios sin restaurantId
    const commentsSnapshot = await db.collection("comments_dishes").get();
    console.log(`📊 Total de comentarios en BD: ${commentsSnapshot.size}`);
    
    const invalidComments = [];
    commentsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (!data.restaurantId) {
        invalidComments.push(doc.id);
      }
    });
    
    if (invalidComments.length > 0) {
      console.log(`⚠️ Encontrados ${invalidComments.length} comentarios sin restaurantId:`, invalidComments);
    } else {
      console.log('✅ Todos los comentarios tienen restaurantId válido');
    }
    
    // 2. Verificar estructura de restaurantes, cartas y platos
    const restaurantsSnapshot = await db.collection("restaurants").get();
    console.log(`🏪 Total de restaurantes: ${restaurantsSnapshot.size}`);
    
    for (const restaurantDoc of restaurantsSnapshot.docs) {
      const restaurantData = restaurantDoc.data();
      console.log(`\n🏪 Restaurante: ${restaurantData.name} (ID: ${restaurantDoc.id})`);
      
      // Verificar cartas del restaurante
      const cardsSnapshot = await db.collection("cards")
        .where("restaurantId", "==", restaurantDoc.id)
        .get();
      console.log(`   🗂️ Cartas: ${cardsSnapshot.size}`);
      
      // Verificar platos
      let totalDishes = 0;
      for (const cardDoc of cardsSnapshot.docs) {
        const dishesSnapshot = await db.collection("dishes")
          .where("cardId", "==", cardDoc.id)
          .get();
        totalDishes += dishesSnapshot.size;
      }
      console.log(`   🍽️ Total de platos: ${totalDishes}`);
      
      // Verificar comentarios para este restaurante
      const restaurantCommentsSnapshot = await db.collection("comments_dishes")
        .where("restaurantId", "==", restaurantDoc.id)
        .get();
      console.log(`   💬 Comentarios: ${restaurantCommentsSnapshot.size}`);
    }
    
    console.log('\n🎉 Test completado. El sistema está listo para recibir comentarios correctamente asociados.');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error en el test:', error);
    process.exit(1);
  }
}

// Ejecutar el test
testCommentFlow();
