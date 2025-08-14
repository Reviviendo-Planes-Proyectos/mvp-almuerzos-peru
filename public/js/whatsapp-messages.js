// Firebase configuration and initialization
let auth, firestore;

// Initialize Firebase if not already initialized
if (!firebase.apps.length) {
    const firebaseConfig = {
        apiKey: "AIzaSyDNbgT9yeSBMhsftW4FOe_SB7bfSg44CPI",
        authDomain: "cashma-8adfb.firebaseapp.com",
        projectId: "cashma-8adfb",
        storageBucket: "cashma-8adfb.appspot.com",
        messagingSenderId: "92623435008",
        appId: "1:92623435008:web:8d4b4d58c0ccb9edb5afe5"
    };
    firebase.initializeApp(firebaseConfig);
}

auth = firebase.auth();
firestore = firebase.firestore();

// Global variables
let currentUser = null;
let restaurantData = null;
let currentEditingTemplate = null;

// Default message templates
const defaultTemplates = {
    single: `👋 ¡Hola! Hoy tenemos platos caseros recién hechos en [NOMBRE_RESTAURANTE] 🍽️

🔗 Mira nuestro menú aquí: [ENLACE_MENU]

🍽️ [NOMBRE_CARTA]
• [PLATO_1] - S/[PRECIO_1]
• [PLATO_2] - S/[PRECIO_2]

🕒 Horario de atención (hoy):
[HORARIO]

📱 Yape: [NUMERO_YAPE]

📥 ¿Quieres separar tu plato? Escríbenos por aquí y te lo dejamos listo 🤗

✨ ¡Gracias por preferirnos! ¡Buen provecho! ✨`,

    all: `👋 ¡Hola! Hoy tenemos platos caseros recién hechos en [NOMBRE_RESTAURANTE] 🍽️

🔗 Mira nuestro menú completo aquí: [ENLACE_MENU]

🍽️ [CARTA_1]
• [PLATOS_CARTA_1]

🍽️ [CARTA_2]
• [PLATOS_CARTA_2]

🕒 Horario de atención (hoy):
[HORARIO]

📱 Yape: [NUMERO_YAPE]

📥 ¿Quieres separar tu plato? Escríbenos por aquí y te lo dejamos listo 🤗

✨ ¡Gracias por preferirnos! ¡Buen provecho! ✨`
};

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('WhatsApp Messages page loaded');
    checkAuthState();
});

// Check authentication state
function checkAuthState() {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            console.log('User authenticated:', user.email);
            await loadRestaurantData();
            updateUI();
        } else {
            console.log('No user authenticated, redirecting to login');
            // Añadir un pequeño delay para evitar redirecciones inmediatas
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 100);
        }
    });
}

// Load restaurant data
async function loadRestaurantData() {
    try {
        const restaurantDoc = await firestore.collection('restaurants').doc(currentUser.uid).get();
        if (restaurantDoc.exists) {
            restaurantData = restaurantDoc.data();
            
            // Update sidebar restaurant name
            const sidebarRestaurant = document.getElementById('sidebar-restaurant');
            if (sidebarRestaurant && restaurantData.nombre) {
                sidebarRestaurant.textContent = restaurantData.nombre;
            }
            
            // Load templates if they exist
            await loadMessageTemplates();
        } else {
            console.error('Restaurant data not found');
            showToast('Error: Datos del restaurante no encontrados', 'error');
        }
    } catch (error) {
        console.error('Error loading restaurant data:', error);
        showToast('Error al cargar datos del restaurante', 'error');
    }
}

// Load message templates
async function loadMessageTemplates() {
    try {
        const templatesDoc = await firestore.collection('whatsapp_templates').doc(currentUser.uid).get();
        
        if (templatesDoc.exists) {
            const templates = templatesDoc.data();
            
            // Update template previews
            if (templates.single) {
                updateTemplatePreview('single', templates.single);
            }
            if (templates.all) {
                updateTemplatePreview('all', templates.all);
            }
        } else {
            // Use default templates if none exist
            await saveDefaultTemplates();
        }
    } catch (error) {
        console.error('Error loading templates:', error);
        showToast('Error al cargar plantillas de mensajes', 'error');
    }
}

// Save default templates to Firestore
async function saveDefaultTemplates() {
    try {
        await firestore.collection('whatsapp_templates').doc(currentUser.uid).set({
            single: defaultTemplates.single,
            all: defaultTemplates.all,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        updateTemplatePreview('single', defaultTemplates.single);
        updateTemplatePreview('all', defaultTemplates.all);
    } catch (error) {
        console.error('Error saving default templates:', error);
    }
}

// Update template preview
function updateTemplatePreview(templateType, content) {
    const templateCard = document.querySelector(`.template-card:nth-child(${templateType === 'single' ? '1' : '2'})`);
    if (templateCard) {
        const messageBubble = templateCard.querySelector('.message-bubble');
        if (messageBubble) {
            // Convert line breaks to <br> tags and format the message
            const formattedContent = content.replace(/\n/g, '<br>');
            messageBubble.innerHTML = `<p>${formattedContent.replace(/<br><br>/g, '</p><p>')}</p>`;
        }
    }
}

// Edit template function
function editTemplate(templateType) {
    currentEditingTemplate = templateType;
    
    // Set modal title
    const modalTitle = document.getElementById('modalTitle');
    if (modalTitle) {
        modalTitle.textContent = templateType === 'single' ? 
            'Editar Mensaje de Carta Individual' : 
            'Editar Mensaje de Todas las Cartas';
    }
    
    // Load current template content
    loadCurrentTemplateToModal(templateType);
    
    // Show modal
    const modal = document.getElementById('editTemplateModal');
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        
        // Focus on textarea
        setTimeout(() => {
            const textarea = document.getElementById('templateMessage');
            if (textarea) textarea.focus();
        }, 100);
    }
}

// Load current template to modal
async function loadCurrentTemplateToModal(templateType) {
    try {
        const templatesDoc = await firestore.collection('whatsapp_templates').doc(currentUser.uid).get();
        let content = defaultTemplates[templateType];
        
        if (templatesDoc.exists) {
            const templates = templatesDoc.data();
            content = templates[templateType] || defaultTemplates[templateType];
        }
        
        const textarea = document.getElementById('templateMessage');
        if (textarea) {
            textarea.value = content;
            updateCharacterCount();
        }
    } catch (error) {
        console.error('Error loading template:', error);
        showToast('Error al cargar plantilla', 'error');
    }
}

// Preview template function
function previewTemplate(templateType) {
    // This could open a modal with a more detailed preview
    // For now, we'll just show a toast
    showToast(`Vista previa del ${templateType === 'single' ? 'mensaje individual' : 'mensaje completo'}`);
}

// Close edit modal
function closeEditModal() {
    const modal = document.getElementById('editTemplateModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
    currentEditingTemplate = null;
}

// Save template
async function saveTemplate() {
    if (!currentEditingTemplate) return;
    
    const textarea = document.getElementById('templateMessage');
    if (!textarea) return;
    
    const content = textarea.value.trim();
    if (!content) {
        showToast('El mensaje no puede estar vacío', 'error');
        return;
    }
    
    try {
        // Get current templates
        const templatesDoc = await firestore.collection('whatsapp_templates').doc(currentUser.uid).get();
        let templates = {};
        
        if (templatesDoc.exists) {
            templates = templatesDoc.data();
        }
        
        // Update the specific template
        templates[currentEditingTemplate] = content;
        templates.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        
        // Save to Firestore
        await firestore.collection('whatsapp_templates').doc(currentUser.uid).set(templates);
        
        // Update UI
        updateTemplatePreview(currentEditingTemplate, content);
        
        // Close modal
        closeEditModal();
        
        showToast('Plantilla guardada exitosamente');
        
    } catch (error) {
        console.error('Error saving template:', error);
        showToast('Error al guardar plantilla', 'error');
    }
}

// Update character count
function updateCharacterCount() {
    const textarea = document.getElementById('templateMessage');
    const charCount = document.getElementById('charCount');
    
    if (textarea && charCount) {
        charCount.textContent = textarea.value.length;
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Character count for textarea
    const textarea = document.getElementById('templateMessage');
    if (textarea) {
        textarea.addEventListener('input', updateCharacterCount);
    }
    
    // Close modal when clicking outside
    const modal = document.getElementById('editTemplateModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeEditModal();
            }
        });
    }
    
    // ESC key to close modal
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeEditModal();
        }
    });
});

// Update UI function
function updateUI() {
    // Any additional UI updates can go here
    console.log('UI updated for WhatsApp messages');
}

// Logout function
function logout() {
    auth.signOut().then(() => {
        window.location.href = 'login.html';
    }).catch((error) => {
        console.error('Error signing out:', error);
        showToast('Error al cerrar sesión', 'error');
    });
}

// Show toast notification
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast-notification');
    const toastMessage = document.getElementById('toast-message');
    
    if (toast && toastMessage) {
        toastMessage.textContent = message;
        toast.className = `toast ${type} show`;
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

// Utility function to replace variables in template
function replaceTemplateVariables(template, data) {
    let result = template;
    
    if (data.restaurantName) {
        result = result.replace(/\[NOMBRE_RESTAURANTE\]/g, data.restaurantName);
    }
    
    if (data.menuLink) {
        result = result.replace(/\[ENLACE_MENU\]/g, data.menuLink);
    }
    
    if (data.cardName) {
        result = result.replace(/\[NOMBRE_CARTA\]/g, data.cardName);
    }
    
    if (data.schedule) {
        result = result.replace(/\[HORARIO\]/g, data.schedule);
    }
    
    if (data.yapeNumber) {
        result = result.replace(/\[NUMERO_YAPE\]/g, data.yapeNumber);
    }
    
    // Replace dish-specific variables
    if (data.dishes) {
        data.dishes.forEach((dish, index) => {
            result = result.replace(new RegExp(`\\[PLATO_${index + 1}\\]`, 'g'), dish.name);
            result = result.replace(new RegExp(`\\[PRECIO_${index + 1}\\]`, 'g'), dish.price);
        });
    }
    
    return result;
}

// Function to generate WhatsApp message for sharing
function generateWhatsAppMessage(templateType, cardData) {
    return new Promise(async (resolve, reject) => {
        try {
            const templatesDoc = await firestore.collection('whatsapp_templates').doc(currentUser.uid).get();
            let template = defaultTemplates[templateType];
            
            if (templatesDoc.exists()) {
                const templates = templatesDoc.data();
                template = templates[templateType] || defaultTemplates[templateType];
            }
            
            const message = replaceTemplateVariables(template, cardData);
            resolve(message);
        } catch (error) {
            reject(error);
        }
    });
}

// Export functions for use in other files
window.whatsappMessages = {
    generateWhatsAppMessage,
    replaceTemplateVariables
};
