function toggleSidebar() {
  document.querySelector(".sidebar")?.classList.toggle("open");
  document.querySelector(".overlay")?.classList.toggle("show");
}
function closeSidebar() {
  document.querySelector(".sidebar")?.classList.remove("open");
  document.querySelector(".overlay")?.classList.remove("show");
}

// Cerrar con ESC
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeSidebar();
});

/* document.addEventListener("click", (e) => {
  const item = e.target.closest(".menu-item");
  if (!item) return;

  const href = item.getAttribute("href");

  // Si tiene href válido (no es "#"), cierra sidebar y deja que el navegador navegue
  if (href && href !== "#" && href.trim() !== "") {
    closeSidebar();
    // No hacemos return, dejamos que el enlace funcione normalmente
    return;
  }

  // Si no tiene href o es "#", solo activamos visualmente
  e.preventDefault();
  document.querySelectorAll(".menu-item").forEach((i) =>
    i.classList.remove("active")
  );
  item.classList.add("active");
  closeSidebar();
}); */



window.addEventListener("DOMContentLoaded", () => {
  const mainName = document.getElementById("restaurant-name");
  const sideName = document.getElementById("sidebar-restaurant");
  if (mainName && sideName)
    sideName.textContent = mainName.textContent || "Restaurante";
});

function toggleSidebar() {
  document.querySelector(".sidebar")?.classList.toggle("open");
  document.querySelector(".overlay")?.classList.toggle("show");
}
function closeSidebar() {
  document.querySelector(".sidebar")?.classList.remove("open");
  document.querySelector(".overlay")?.classList.remove("show");
}


document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeSidebar();
});


document.addEventListener("click", (e) => {
  const item = e.target.closest(".menu-item");
  if (!item) return;
  const href = item.getAttribute("href");
  if (href && href !== "#" && href.trim() !== "") {
    closeSidebar();
    return;
  }
  e.preventDefault();
  document
    .querySelectorAll(".menu-item")
    .forEach((i) => i.classList.remove("active"));
  item.classList.add("active");
  closeSidebar();
});

const firebaseConfig = {
  apiKey: "AIzaSyDNbgT9yeSBMhsftW4FOe_SB7bfSg44CPI",
  authDomain: "cashma-8adfb.firebaseapp.com",
  projectId: "cashma-8adfb",
  storageBucket: "cashma-8adfb.appspot.com",
  messagingSenderId: "92623435008",
  appId: "1:92623435008:web:8d4b4d58c0ccb9edb5afe5",
};

// Variables de cache para QR
let qrCache = new Map();

// Variables globales de Firebase
let auth;

// Inicializar Firebase cuando esté disponible
function waitForFirebaseAndInitialize() {
  if (typeof firebase !== 'undefined' && firebase.apps) {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    auth = firebase.auth();
    console.log('Firebase initialized successfully in qr');
    return true;
  }
  return false;
}

// Intentar inicializar Firebase inmediatamente
if (!waitForFirebaseAndInitialize()) {
  // Si no está disponible, esperar un poco
  let attempts = 0;
  const maxAttempts = 20;
  const checkFirebase = setInterval(() => {
    attempts++;
    if (waitForFirebaseAndInitialize() || attempts >= maxAttempts) {
      clearInterval(checkFirebase);
      if (attempts >= maxAttempts) {
        console.error('Firebase failed to load after maximum attempts in qr');
      }
    }
  }, 100);
}

// Inicializar Firebase de forma lazy
document.addEventListener("DOMContentLoaded", () => {
  // Firebase ya está inicializado arriba
});



let CURRENT_QR_SRC = null; 
let CURRENT_QR_LINK = ""; 
let CURRENT_RESTAURANT_NAME = ""; 
let CURRENT_WHATSAPP = ""; 

async function loadQRForOwner() {
 
  if (!auth) {
    console.error("Firebase auth no está cargado en esta página.");
    return;
  }

  const user =
    auth.currentUser ||
    (await new Promise((res) => {
      const off = auth.onAuthStateChanged((u) => {
        off();
        res(u);
      });
    }));

  if (!user) {
   
    window.location.href = "/index.html";
    return;
  }


  const idToken = await user.getIdToken();
  const resp = await fetch(`/api/restaurants/user/${user.uid}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (!resp.ok) {
    console.error(
      "No se pudo cargar el restaurante:",
      resp.status,
      await resp.text()
    );
    return;
  }

  const restaurant = await resp.json(); 
  CURRENT_RESTAURANT_NAME = restaurant.name || "Tu Restaurante";


  const sideName = document.getElementById("sidebar-restaurant");
  if (sideName) sideName.textContent = CURRENT_RESTAURANT_NAME;
  const nameEl = document.querySelector(".qr-restaurant-name");
  if (nameEl) nameEl.textContent = CURRENT_RESTAURANT_NAME;


  let qrImgSrc = restaurant.qr || restaurant.qrUrl || null;


  if (!qrImgSrc) {
    const link = `https://mvp-almuerzos-peru.vercel.app/menu.html?restaurantId=${encodeURIComponent(
      restaurant.id
    )}`;
    CURRENT_QR_LINK = link;

    const gen = await fetch(
      `/api/qr?text=${encodeURIComponent(link)}&width=512&ecc=M&margin=2`
    );
    if (!gen.ok) {
      console.error(
        "Error generando QR on-the-fly:",
        gen.status,
        await gen.text()
      );
      return;
    }
    const blob = await gen.blob();
    qrImgSrc = URL.createObjectURL(blob); 
  } else {
  
    CURRENT_QR_LINK = `https://mvp-almuerzos-peru.vercel.app/menu.html?restaurantId=${encodeURIComponent(
      restaurant.id
    )}`;
  }

  CURRENT_QR_SRC = qrImgSrc;

  document.getElementById("btnShare").disabled = false;
  document.getElementById("btnPdf").disabled = false;


  const qrBox = document.querySelector(".qr-code");
  if (qrBox) {
    qrBox.innerHTML = ""; 
    const img = document.createElement("img");
    img.className = "qr-img";
    img.alt = "Código QR del restaurante";
    img.src = qrImgSrc;
    img.width = 256; // opcional
    img.height = 256;
    qrBox.appendChild(img);
  }
}



function buildWaText() {
  const name = CURRENT_RESTAURANT_NAME || "Tu Restaurante";
  const slogan = "ALMUERZOS PERÚ – El menú del día en un solo lugar";
  const link = CURRENT_QR_LINK;
  return `*${name}*\n${slogan}\n${link}`;
}

function shareWhatsApp() {
  const text = encodeURIComponent(buildWaText());
  const url = `https://wa.me/?text=${text}`;
  window.open(url, "_blank", "noopener"); 
}


async function getQRDataURLViaServer() {
  if (!CURRENT_QR_LINK) {
    throw new Error("No hay CURRENT_QR_LINK definido.");
  }
  const resp = await fetch(
    `/api/qr?text=${encodeURIComponent(
      CURRENT_QR_LINK
    )}&width=1024&ecc=M&margin=2`
  );
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Fallo /api/qr: ${resp.status} ${t}`);
  }
  const blob = await resp.blob();
  return await new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result); 
    fr.readAsDataURL(blob);
  });
}


async function downloadQRPDF() {
  try {
    if (!window.jspdf) throw new Error("jsPDF no está cargado.");
    const { jsPDF } = window.jspdf;

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 48;
    const topY = 80; 

    // Fondo elegante crema dorado
    doc.setFillColor(255, 251, 235);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    
    // Marco dorado principal
    doc.setDrawColor(255, 193, 7);
    doc.setLineWidth(3);
    doc.roundedRect(20, 20, pageWidth - 40, pageHeight - 40, 10, 10);
    
    // Marco interno
    doc.setDrawColor(255, 215, 0);
    doc.setLineWidth(1);
    doc.roundedRect(30, 30, pageWidth - 60, pageHeight - 60, 8, 8);

    // Icono decorativo superior
    doc.setFillColor(255, 193, 7);
    doc.circle(pageWidth / 2, topY - 15, 12, 'F');
    doc.setFillColor(255, 235, 59);
    doc.circle(pageWidth / 2, topY - 15, 8, 'F');
    doc.setTextColor(255, 143, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("QR", pageWidth / 2, topY - 10, { align: "center" });

    // Título del restaurante
    const title = CURRENT_RESTAURANT_NAME || "Tu Restaurante";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    doc.setTextColor(255, 143, 0);
    doc.text(title.toUpperCase(), pageWidth / 2, topY + 20, { align: "center" });

    // Línea decorativa bajo el título
    doc.setDrawColor(255, 193, 7);
    doc.setLineWidth(2);
    const lineY = topY + 35;
    const lineWidth = 200;
    doc.line((pageWidth - lineWidth) / 2, lineY, (pageWidth + lineWidth) / 2, lineY);
    
    // Puntos decorativos en la línea
    doc.setFillColor(255, 215, 0);
    for (let i = 0; i < 5; i++) {
      const x = (pageWidth - lineWidth) / 2 + 40 + (i * 30);
      doc.circle(x, lineY, 2, 'F');
    }

    // Slogan principal
    const slogan = "ALMUERZOS PERU";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(255, 165, 0);
    doc.text(slogan, pageWidth / 2, topY + 55, { align: "center" });
    
    // Subtítulo
    const subtitle = "El menu del dia en un solo lugar";
    doc.setFont("helvetica", "italic");
    doc.setFontSize(14);
    doc.setTextColor(200, 120, 0);
    doc.text(subtitle, pageWidth / 2, topY + 75, { align: "center" });

    // Llamada a la acción
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(255, 140, 0);
    doc.text("ESCANEA Y DESCUBRE NUESTROS PLATOS", pageWidth / 2, topY + 100, { align: "center" });

    // Obtener QR de alta calidad
    const qrDataUrl = await getQRDataURLViaServer();

    // Posicionamiento del QR
    const qrSize = 260;
    const qrX = (pageWidth - qrSize) / 2;
    const qrY = topY + 130;

    // Sombra del QR (dorada suave en lugar de negra)
    doc.setFillColor(255, 215, 0, 0.2);
    doc.roundedRect(qrX + 6, qrY + 6, qrSize, qrSize, 10, 10, 'F');

    // Marco dorado del QR
    doc.setFillColor(255, 215, 0);
    doc.roundedRect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20, 15, 15, 'F');
    
    // Marco blanco interno
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8, 10, 10, 'F');

    // Insertar QR
    doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

    // Marco decorativo exterior
    doc.setDrawColor(255, 193, 7);
    doc.setLineWidth(2);
    doc.roundedRect(qrX - 12, qrY - 12, qrSize + 24, qrSize + 24, 17, 17);

    // Sección de instrucciones
    const instrY = qrY + qrSize + 50;
    
    // Fondo para instrucciones
    doc.setFillColor(255, 248, 220, 0.8);
    doc.roundedRect(60, instrY - 15, pageWidth - 120, 100, 12, 12, 'F');
    
    // Borde de instrucciones
    doc.setDrawColor(255, 193, 7, 0.6);
    doc.setLineWidth(1);
    doc.roundedRect(60, instrY - 15, pageWidth - 120, 100, 12, 12);

    // Título de instrucciones
    doc.setTextColor(255, 140, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("COMO USAR ESTE QR", pageWidth / 2, instrY + 5, { align: "center" });

    // Instrucciones paso a paso
    const instructions = [
      "1. Abre la camara de tu celular",
      "2. Apunta al codigo QR",
      "3. Accede instantaneamente a nuestro menu",
      "4. Descubre nuestros deliciosos platos del dia"
    ];

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(150, 100, 30);
    
    instructions.forEach((instruction, index) => {
      doc.text(instruction, pageWidth / 2, instrY + 25 + (index * 16), { align: "center" });
    });

    // URL del enlace
    if (CURRENT_QR_LINK) {
      const linkY = instrY + 95;
      
      // Fondo para URL
      doc.setFillColor(255, 255, 255, 0.9);
      doc.roundedRect(80, linkY - 8, pageWidth - 160, 20, 6, 6, 'F');
      
      doc.setTextColor(0, 100, 200);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.textWithLink(CURRENT_QR_LINK, pageWidth / 2, linkY + 2, {
        url: CURRENT_QR_LINK,
        align: "center",
      });
    }

    // Footer elegante
    const footerY = pageHeight - 70;
    
    // Línea decorativa del footer
    doc.setDrawColor(255, 193, 7);
    doc.setLineWidth(2);
    doc.line(80, footerY - 20, pageWidth - 80, footerY - 20);
    
    // Círculos decorativos en la línea
    for (let i = 0; i < 5; i++) {
      const x = 150 + (i * 60);
      doc.setFillColor(255, 215, 0);
      doc.circle(x, footerY - 20, 3, 'F');
    }

    // Texto del footer
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(255, 143, 0);
    doc.text("POWERED BY ALMUERZOS PERU", pageWidth / 2, footerY - 5, { align: "center" });
    
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(180, 130, 50);
    doc.text("La mejor experiencia gastronomica al alcance de un QR", pageWidth / 2, footerY + 10, { align: "center" });
    
    // Timestamp
    const now = new Date();
    const timestamp = now.toLocaleDateString('es-PE') + ' - ' + now.toLocaleTimeString('es-PE');
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(160, 140, 80);
    doc.text(`Generado el: ${timestamp}`, pageWidth / 2, footerY + 25, { align: "center" });

    // Elementos decorativos en las esquinas (círculos dorados)
    const cornerSize = 8;
    
    // Esquina superior izquierda
    doc.setFillColor(255, 215, 0, 0.6);
    doc.circle(50, 50, cornerSize, 'F');
    doc.setFillColor(255, 193, 7);
    doc.circle(50, 50, cornerSize - 3, 'F');
    
    // Esquina superior derecha
    doc.setFillColor(255, 215, 0, 0.6);
    doc.circle(pageWidth - 50, 50, cornerSize, 'F');
    doc.setFillColor(255, 193, 7);
    doc.circle(pageWidth - 50, 50, cornerSize - 3, 'F');
    
    // Esquina inferior izquierda
    doc.setFillColor(255, 215, 0, 0.6);
    doc.circle(50, pageHeight - 50, cornerSize, 'F');
    doc.setFillColor(255, 193, 7);
    doc.circle(50, pageHeight - 50, cornerSize - 3, 'F');
    
    // Esquina inferior derecha
    doc.setFillColor(255, 215, 0, 0.6);
    doc.circle(pageWidth - 50, pageHeight - 50, cornerSize, 'F');
    doc.setFillColor(255, 193, 7);
    doc.circle(pageWidth - 50, pageHeight - 50, cornerSize - 3, 'F');

    // Guardar con nombre personalizado
    const restaurantSlug = (CURRENT_RESTAURANT_NAME || "restaurante")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    
    const fileName = `qr-${restaurantSlug}-almuerzos-peru-${now.getFullYear()}.pdf`;
    doc.save(fileName);
    
    console.log("PDF premium generado exitosamente!");
    
  } catch (e) {
    console.error("Error generando el PDF:", e);
    alert("No se pudo generar el PDF. Por favor, intentalo de nuevo.");
  }
}

window.addEventListener("DOMContentLoaded", () => {

  const mainName = document.getElementById("restaurant-name");
  const sideName = document.getElementById("sidebar-restaurant");
  if (mainName && sideName)
    sideName.textContent = mainName.textContent || "Restaurante";


  loadQRForOwner();
});


window.shareWhatsApp = shareWhatsApp;
window.downloadQRPDF = downloadQRPDF;
