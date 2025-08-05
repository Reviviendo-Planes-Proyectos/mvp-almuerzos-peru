const admin = require('firebase-admin');

// Configurar Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function simulateLoginProblem() {
  try {
    const targetUserId = 'wCbrqW55oMXYLpMXOWMpn1l4TED2';
    
    console.log('🧪 SIMULANDO EL PROBLEMA: Eliminando usuario de "invited"');
    console.log('Usuario a afectar:', targetUserId);
    console.log('='.repeat(60));
    
    // Eliminar el usuario de invited para simular el problema
    await db.collection('invited').doc(targetUserId).delete();
    console.log('❌ Usuario eliminado de la colección "invited"');
    
    // Verificar el estado
    console.log('\n📊 ESTADO DESPUÉS DE LA ELIMINACIÓN:');
    
    const userDoc = await db.collection('users').doc(targetUserId).get();
    const invitedDoc = await db.collection('invited').doc(targetUserId).get();
    
    console.log(`• En "users" (owner): ${userDoc.exists ? '✅' : '❌'}`);
    console.log(`• En "invited" (customer): ${invitedDoc.exists ? '✅' : '❌'}`);
    
    if (userDoc.exists && !invitedDoc.exists) {
      console.log('\n⚠️ PROBLEMA REPRODUCIDO: El usuario es owner pero NO puede comentar');
    }
    
    console.log('\n💡 Ahora puedes probar el login para verificar que se restaura automáticamente');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

simulateLoginProblem();
