// Script de prueba para la optimización de imágenes
const path = require('path');
const fs = require('fs').promises;

// Simular la función optimizeImage del servidor
const sharp = require('sharp');

async function optimizeImage(inputPath, outputPath, options = {}) {
    const {
        width = 800,
        quality = 80,
        format = 'jpeg'
    } = options;

    try {
        // Verificar si el archivo existe
        const stats = await fs.stat(inputPath);
        const fileSizeInMB = stats.size / (1024 * 1024);

        // Verificar si el archivo original excede 50MB
        if (fileSizeInMB > 50) {
            console.error('\x1b[31m%s\x1b[0m', `❌ ERROR: La imagen es demasiado grande (${fileSizeInMB.toFixed(2)}MB). El tamaño máximo permitido es 50MB.`);
            return {
                success: false,
                error: 'Imagen demasiado grande para procesar',
                originalSize: fileSizeInMB
            };
        }

        // Validar formato
        const allowedFormats = ['jpeg', 'png', 'webp'];
        const blockedFormats = ['avif', 'heic', 'heif'];
        const formatLower = format.toLowerCase();
        
        // Verificar formatos explícitamente bloqueados
        if (blockedFormats.includes(formatLower)) {
            console.error('\x1b[31m%s\x1b[0m', `❌ ERROR: El formato ${format.toUpperCase()} no está soportado. Los formatos AVIF, HEIC y HEIF no son compatibles.`);
            return {
                success: false,
                error: `Formato ${format.toUpperCase()} no soportado. Solo se permiten JPEG, PNG o WebP.`
            };
        }
        
        // Verificar formatos permitidos
        if (!allowedFormats.includes(formatLower)) {
            console.error('\x1b[31m%s\x1b[0m', '❌ ERROR: Solo se permiten formatos JPEG, PNG o WebP.');
            return {
                success: false,
                error: 'Formato no permitido. Solo JPEG, PNG o WebP.'
            };
        }

        // Procesar la imagen con Sharp
        let sharpInstance = sharp(inputPath)
            .resize(width, null, {
                withoutEnlargement: true,
                fit: 'inside'
            });

        // Aplicar formato y compresión
        if (format.toLowerCase() === 'jpeg') {
            sharpInstance = sharpInstance.jpeg({ quality });
        } else if (format.toLowerCase() === 'png') {
            sharpInstance = sharpInstance.png({ quality });
        } else if (format.toLowerCase() === 'webp') {
            sharpInstance = sharpInstance.webp({ quality });
        }

        // Guardar la imagen optimizada
        await sharpInstance.toFile(outputPath);

        // Verificar el tamaño del archivo optimizado
        const optimizedStats = await fs.stat(outputPath);
        const optimizedSizeInMB = optimizedStats.size / (1024 * 1024);

        // Verificar si el archivo optimizado aún excede 50MB
        if (optimizedSizeInMB > 50) {
            await fs.unlink(outputPath); // Eliminar archivo si es muy grande
            console.error('\x1b[31m%s\x1b[0m', `❌ ERROR: La imagen optimizada sigue siendo demasiado grande (${optimizedSizeInMB.toFixed(2)}MB).`);
            return {
                success: false,
                error: 'Imagen optimizada aún excede el límite de 50MB',
                optimizedSize: optimizedSizeInMB
            };
        }

        console.log('\x1b[32m%s\x1b[0m', `✅ ÉXITO: Imagen optimizada correctamente.`);
        console.log(`📊 Tamaño original: ${fileSizeInMB.toFixed(2)}MB`);
        console.log(`📊 Tamaño optimizado: ${optimizedSizeInMB.toFixed(2)}MB`);
        console.log(`📊 Reducción: ${((fileSizeInMB - optimizedSizeInMB) / fileSizeInMB * 100).toFixed(1)}%`);

        return {
            success: true,
            originalSize: fileSizeInMB,
            optimizedSize: optimizedSizeInMB,
            reduction: ((fileSizeInMB - optimizedSizeInMB) / fileSizeInMB * 100).toFixed(1),
            outputPath
        };

    } catch (error) {
        console.error('\x1b[31m%s\x1b[0m', `❌ ERROR al procesar la imagen: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
}

// Función de prueba
async function testOptimization() {
    console.log('🖼️  Prueba de Optimización de Imágenes con Sharp\n');
    
    const inputPath = path.join(__dirname, 'public/images/restaurant.png');
    const outputPath = path.join(__dirname, 'public/images/restaurant-optimized-test.jpg');
    
    console.log('📁 Archivo de entrada:', inputPath);
    console.log('📁 Archivo de salida:', outputPath);
    console.log('⚙️  Configuración: 800px ancho, 80% calidad, formato JPEG\n');
    
    try {
        // Verificar si el archivo existe
        await fs.access(inputPath);
        
        // Optimizar la imagen
        const result = await optimizeImage(inputPath, outputPath, {
            width: 800,
            quality: 80,
            format: 'jpeg'
        });
        
        if (result.success) {
            console.log('\n🎉 ¡Optimización completada exitosamente!');
            console.log('📄 Archivo optimizado guardado en:', result.outputPath);
        } else {
            console.log('\n💥 Error en la optimización:', result.error);
        }
        
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('⚠️  Archivo de entrada no encontrado.');
            console.log('💡 Tip: Coloca una imagen en public/images/restaurant.png para probar.');
        } else {
            console.log('❌ Error:', error.message);
        }
    }
}

// Ejecutar la prueba
testOptimization();