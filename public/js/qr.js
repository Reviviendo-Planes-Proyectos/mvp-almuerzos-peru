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
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();



let CURRENT_QR_SRC = null; 
let CURRENT_QR_LINK = ""; 
let CURRENT_RESTAURANT_NAME = ""; 
let CURRENT_WHATSAPP = ""; 

async function loadQRForOwner() {
 
  if (!window.firebase || !firebase.auth) {
    console.error("Firebase no está cargado en esta página.");
    return;
  }

  const auth = firebase.auth();
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
    const topY = 64; 

   
    const title = CURRENT_RESTAURANT_NAME || "Tu Restaurante";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text(title, pageWidth / 2, topY, { align: "center" });


    const slogan = "ALMUERZOS PERÚ – El menú del día en un solo lugar";
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(slogan, pageWidth / 2, topY + 22, { align: "center" });


    const qrDataUrl = await getQRDataURLViaServer();


    const qrSize = Math.min(pageWidth - marginX * 2, 360);
    const qrX = (pageWidth - qrSize) / 2;
    const qrY = topY + 60;

    doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

  
    doc.setDrawColor(200);
    doc.rect(qrX - 6, qrY - 6, qrSize + 12, qrSize + 12);

    
    if (CURRENT_QR_LINK) {
      const linkY = qrY + qrSize + 28;
      doc.setTextColor(0, 0, 255);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.textWithLink(CURRENT_QR_LINK, pageWidth / 2, linkY, {
        url: CURRENT_QR_LINK,
        align: "center",
      });
      doc.setTextColor(0, 0, 0);
    }


    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Generado por Almuerzos Perú", pageWidth / 2, pageHeight - 36, {
      align: "center",
    });


    doc.save("qr-restaurante.pdf");
  } catch (e) {
    console.error("No se pudo generar el PDF:", e);
    alert("No se pudo generar el PDF. Revisa la consola para más detalles.");
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
