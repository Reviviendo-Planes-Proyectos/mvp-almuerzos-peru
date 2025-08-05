const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Inicializar Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function cleanupCommentsWithoutRestaurantId() {
  try {
    console.log('�️ Iniciando limpieza de comentarios sin restaurantId...');
    
    // Obtener todos los comentarios
    const commentsSnapshot = await db.collection("comments_dishes").get();
    
    console.log(`� Total de comentarios encontrados: ${commentsSnapshot.size}`);
    
    const commentsToDelete = [];
    
    // Identificar comentarios sin restaurantId
    commentsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (!data.restaurantId) {
        commentsToDelete.push({ id: doc.id, data });
      }
    });
    
    console.log(`� Comentarios sin restaurantId a eliminar: ${commentsToDelete.length}`);
    
    if (commentsToDelete.length === 0) {
      console.log('✅ No hay comentarios que eliminar');
      process.exit(0);
    }
    
    // Mostrar información de los comentarios que se van a eliminar
    console.log('\n📋 Comentarios que se eliminarán:');
    commentsToDelete.forEach((comment, index) => {
      console.log(`${index + 1}. ID: ${comment.id}`);
      console.log(`   - dishId: ${comment.data.dishId}`);
      console.log(`   - content: ${comment.data.content ? comment.data.content.substring(0, 50) + '...' : 'N/A'}`);
      console.log(`   - createdAt: ${comment.data.createdAt ? comment.data.createdAt.toDate() : 'N/A'}`);
      console.log('');
    });
    
    // Confirmar antes de eliminar
    console.log('⚠️ ¿Proceder con la eliminación? Esta acción no se puede deshacer.');
    console.log('   Eliminando en 3 segundos...');
    
    // Esperar 3 segundos
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    let deleted = 0;
    let errors = 0;
    
    for (const comment of commentsToDelete) {
      try {
        await db.collection("comments_dishes").doc(comment.id).delete();
        console.log(`   ✅ Comentario eliminado: ${comment.id}`);
        deleted++;
      } catch (error) {
        console.error(`   ❌ Error eliminando comentario ${comment.id}:`, error.message);
        errors++;
      }
    }
    
    console.log(`\n📊 Resumen de limpieza:`);
    console.log(`   - Comentarios eliminados: ${deleted}`);
    console.log(`   - Errores: ${errors}`);
    
    if (deleted > 0) {
      console.log('\n🎉 ¡Limpieza completada exitosamente!');
      console.log('📝 Los nuevos comentarios ahora se asociarán correctamente con sus restaurantes.');
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error general:', error);
    process.exit(1);
  }
}

// Ejecutar la función
cleanupCommentsWithoutRestaurantId();
