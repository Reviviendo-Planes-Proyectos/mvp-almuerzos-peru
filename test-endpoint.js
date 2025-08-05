const axios = require('axios');

async function testCommentsEndpoint() {
  try {
    console.log('🧪 Probando endpoint /api/comments...');
    
    const data = {
      dishId: 'icTaRf02vOtjnoM6mluh',
      content: 'test comment from script',
      invitedId: 'wCbrqW55oMXYLpMXOWMpn1l4TED2', // Usuario que ahora sí existe
      restaurantId: 'pQXtNqw0MyDUtCIXUrdx'
    };
    
    console.log('📤 Enviando data:', data);
    
    const response = await axios.post('http://localhost:3000/api/comments', data, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log('✅ Respuesta exitosa:');
    console.log('Status:', response.status);
    console.log('Data:', response.data);
    
  } catch (error) {
    console.error('❌ Error:');
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
      console.error('Headers:', error.response.headers);
    } else if (error.request) {
      console.error('No se recibió respuesta:', error.request);
    } else {
      console.error('Error de configuración:', error.message);
    }
    
    console.error('Código de error:', error.code);
  }
}

testCommentsEndpoint();
