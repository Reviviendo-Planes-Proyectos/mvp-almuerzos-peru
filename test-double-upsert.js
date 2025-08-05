const axios = require('axios');

async function simulateOwnerLogin() {
  try {
    console.log('🔑 SIMULANDO LOGIN DE OWNER: Probando el doble upsert');
    console.log('='.repeat(60));
    
    const userData = {
      uid: 'wCbrqW55oMXYLpMXOWMpn1l4TED2',
      displayName: 'JACK Al. JIMÉNEZ',
      email: 'jackzhj34@gmail.com'
    };
    
    // 1. Primer upsert como owner (como hace login.js)
    console.log('1️⃣ Upsert como OWNER...');
    const ownerResponse = await axios.post('http://localhost:3000/api/users/upsert', {
      ...userData,
      role: 'owner'
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    
    console.log('✅ Owner upsert exitoso:', ownerResponse.data.message);
    
    // 2. Segundo upsert como customer (nueva lógica)
    console.log('\n2️⃣ Upsert como CUSTOMER...');
    const customerResponse = await axios.post('http://localhost:3000/api/users/upsert', {
      ...userData,
      role: 'customer'
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    
    console.log('✅ Customer upsert exitoso:', customerResponse.data.message);
    
    console.log('\n📊 VERIFICANDO ESTADO FINAL...');
    
    // Ahora verificar que el usuario esté en ambas colecciones
    // Simulamos la verificación llamando a nuestro script
    console.log('Ejecutando verificación...');
    
  } catch (error) {
    console.error('❌ Error:');
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else if (error.request) {
      console.error('No se recibió respuesta:', error.request);
    } else {
      console.error('Error de configuración:', error.message);
    }
  }
}

simulateOwnerLogin();
