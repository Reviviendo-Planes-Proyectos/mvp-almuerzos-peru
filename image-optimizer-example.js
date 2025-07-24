// Ejemplo de uso de la función de optimización de imágenes con Sharp
// Este archivo demuestra cómo usar la API de optimización de imágenes

const path = require('path');
const fs = require('fs').promises;

// Función para probar la optimización de imágenes
async function testImageOptimization() {
    const baseUrl = 'http://localhost:3000';
    
    // Ejemplo de uso con diferentes configuraciones
    const examples = [
        {
            name: 'Optimización básica JPEG',
            config: {
                inputPath: path.join(__dirname, 'public/images/restaurant.png'),
                outputPath: path.join(__dirname, 'public/images/restaurant-optimized.jpg'),
                width: 800,
                quality: 80,
                format: 'jpeg'
            }
        },
        {
            name: 'Optimización WebP alta calidad',
            config: {
                inputPath: path.join(__dirname, 'public/images/logo.png'),
                outputPath: path.join(__dirname, 'public/images/logo-optimized.webp'),
                width: 400,
                quality: 90,
                format: 'webp'
            }
        },
        {
            name: 'Optimización JPEG baja calidad',
            config: {
                inputPath: path.join(__dirname, 'public/images/default-dish.jpg.png'),
                outputPath: path.join(__dirname, 'public/images/default-dish-optimized.jpg'),
                width: 600,
                quality: 60,
                format: 'jpeg'
            }
        }
    ];

    console.log('🚀 Iniciando pruebas de optimización de imágenes...\n');

    for (const example of examples) {
        console.log(`📝 Probando: ${example.name}`);
        console.log(`📁 Entrada: ${example.config.inputPath}`);
        console.log(`📁 Salida: ${example.config.outputPath}`);
        console.log(`⚙️  Configuración: ${example.config.width}px, ${example.config.quality}% calidad, formato ${example.config.format}`);
        
        try {
            // Verificar si el archivo de entrada existe
            await fs.access(example.config.inputPath);
            
            // Hacer la petición a la API
            const response = await fetch(`${baseUrl}/api/optimize-image`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(example.config)
            });

            const result = await response.json();
            
            if (response.ok) {
                console.log('✅ Éxito:', result.message);
                console.log(`📊 Tamaño original: ${result.originalSize}MB`);
                console.log(`📊 Tamaño optimizado: ${result.optimizedSize}MB`);
                console.log(`📊 Reducción: ${result.reduction}%`);
            } else {
                console.log('❌ Error:', result.error);
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('⚠️  Archivo de entrada no encontrado, saltando...');
            } else {
                console.log('❌ Error:', error.message);
            }
        }
        
        console.log('─'.repeat(50));
    }

    console.log('🏁 Pruebas completadas.');
}

// Función para usar directamente la función de optimización (sin API)
async function directOptimizationExample() {
    // Nota: Esta función requiere importar la función optimizeImage del servidor
    // const { optimizeImage } = require('./server');
    
    console.log('\n🔧 Ejemplo de uso directo de la función optimizeImage:');
    console.log(`
const result = await optimizeImage(
    'ruta/imagen-original.jpg',
    'ruta/imagen-optimizada.jpg',
    {
        width: 800,        // Ancho máximo en píxeles
        quality: 80,       // Calidad de compresión (1-100)
        format: 'jpeg'     // Formato: 'jpeg' o 'webp'
    }
);

if (result.success) {
    console.log('Imagen optimizada exitosamente');
    console.log('Tamaño original:', result.originalSize, 'MB');
    console.log('Tamaño optimizado:', result.optimizedSize, 'MB');
    console.log('Reducción:', result.reduction, '%');
} else {
    console.error('Error:', result.error);
}`);
}

// Ejecutar ejemplos si el archivo se ejecuta directamente
if (require.main === module) {
    console.log('🖼️  Ejemplos de Optimización de Imágenes con Sharp\n');
    
    // Mostrar ejemplo de uso directo
    directOptimizationExample();
    
    // Ejecutar pruebas de API (requiere servidor corriendo)
    console.log('\n⚠️  Para probar la API, asegúrate de que el servidor esté corriendo en http://localhost:3000');
    console.log('Luego ejecuta: node image-optimizer-example.js\n');
    
    // Descomentar la siguiente línea para ejecutar las pruebas automáticamente
    // testImageOptimization();
}

module.exports = {
    testImageOptimization,
    directOptimizationExample
};