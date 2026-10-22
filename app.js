// ===== CONFIGURACIÓN =====
const MAX_RETRIES = 2;

// ===== ELEMENTOS DEL DOM =====
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.querySelector('.theme-icon');
const connectionStatus = document.getElementById('connection-status');
const cameraBtn = document.getElementById('camera-btn');
const galleryBtn = document.getElementById('gallery-btn');
const cameraInput = document.getElementById('camera-input');
const galleryInput = document.getElementById('gallery-input');
const previewSection = document.getElementById('preview-section');
const previewImage = document.getElementById('preview-image');
const rotateBtn = document.getElementById('rotate-btn');
const cropBtn = document.getElementById('crop-btn');
const processBtn = document.getElementById('process-btn');
const cropSection = document.getElementById('crop-section');
const cropImage = document.getElementById('crop-image');
const confirmCropBtn = document.getElementById('confirm-crop-btn');
const cancelCropBtn = document.getElementById('cancel-crop-btn');
const loadingSection = document.getElementById('loading-section');
const loadingStatus = document.getElementById('loading-status');
const verifySection = document.getElementById('verify-section');
const verifyContainer = document.getElementById('verify-container');
const confirmVerifyBtn = document.getElementById('confirm-verify-btn');
const cancelVerifyBtn = document.getElementById('cancel-verify-btn');
const manualSection = document.getElementById('manual-section');
const generateManualBtn = document.getElementById('generate-manual-btn');
const resultsSection = document.getElementById('results-section');
const barcodesContainer = document.getElementById('barcodes-container');
const clearDataBtn = document.getElementById('clear-data-btn');
const errorSection = document.getElementById('error-section');
const errorText = document.getElementById('error-text');
const retryBtn = document.getElementById('retry-btn');

let currentImageData = null;
let detectedAlbaranes = [];
let cropper = null;
let currentRotation = 0;

// ===== TEMA =====
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        document.body.classList.add('dark-mode');
        themeIcon.textContent = '☀️';
    } else {
        themeIcon.textContent = '🌙';
    }
}

themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    themeIcon.textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
});

// ===== INDICADOR DE CONEXIÓN =====
function updateConnectionStatus() {
    if (navigator.onLine) {
        connectionStatus.textContent = '🟢';
        connectionStatus.title = 'Conectado - Usará IA Gemini';
    } else {
        connectionStatus.textContent = '🔴';
        connectionStatus.title = 'Sin conexión';
    }
}
window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);

// ===== GESTIÓN DE SECCIONES =====
function showSection(section) {
    const sections = [previewSection, cropSection, loadingSection, verifySection, manualSection, resultsSection, errorSection];
    sections.forEach(s => s.classList.add('hidden'));
    if (section) section.classList.remove('hidden');
}

function showError(message) {
    errorText.textContent = message;
    showSection(errorSection);
}

// ===== CÁMARA Y GALERÍA =====
cameraBtn.addEventListener('click', () => {
    if (localStorage.getItem('savedAlbaranes') && confirm('¿Borrar los códigos actuales y empezar uno nuevo?')) {
        clearSavedData();
    }
    cameraInput.click();
});

galleryBtn.addEventListener('click', () => {
    if (localStorage.getItem('savedAlbaranes') && confirm('¿Borrar los códigos actuales y empezar uno nuevo?')) {
        clearSavedData();
    }
    galleryInput.click();
});

function handleImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        currentImageData = event.target.result;
        previewImage.src = currentImageData;
        currentRotation = 0;
        showSection(previewSection);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

cameraInput.addEventListener('change', handleImageSelect);
galleryInput.addEventListener('change', handleImageSelect);

// ===== ROTAR Y RECORTAR =====
rotateBtn.addEventListener('click', () => {
    if (!currentImageData) return;
    currentRotation = (currentRotation + 90) % 360;
    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (currentRotation === 90 || currentRotation === 270) {
            canvas.width = img.height; canvas.height = img.width;
        } else {
            canvas.width = img.width; canvas.height = img.height;
        }
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((currentRotation * Math.PI) / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        currentImageData = canvas.toDataURL('image/jpeg', 0.8);
        previewImage.src = currentImageData;
    };
    img.src = currentImageData;
});

cropBtn.addEventListener('click', () => {
    if (!currentImageData) return;
    cropImage.src = currentImageData;
    showSection(cropSection);
    setTimeout(() => {
        if (cropper) cropper.destroy();
        cropper = new Cropper(cropImage, { viewMode: 1, dragMode: 'move', autoCropArea: 0.8, cropBoxMovable: true, cropBoxResizable: true });
    }, 100);
});

confirmCropBtn.addEventListener('click', () => {
    if (cropper) {
        currentImageData = cropper.getCroppedCanvas().toDataURL('image/jpeg', 0.8);
        previewImage.src = currentImageData;
        cropper.destroy(); cropper = null;
        showSection(previewSection);
    }
});

cancelCropBtn.addEventListener('click', () => {
    if (cropper) { cropper.destroy(); cropper = null; }
    showSection(previewSection);
});

// ===== PREPARAR IMAGEN (COMPRESIÓN) =====
async function prepareImageForAPI(imageDataUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const maxWidth = 1000;
            let width = img.width;
            let height = img.height;
            if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
            }
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.src = imageDataUrl;
    });
}

// ===== PROCESAR CON GEMINI =====
processBtn.addEventListener('click', async () => {
    if (!currentImageData) return;
    showSection(loadingSection);
    
    try {
        loadingStatus.textContent = 'Optimizando imagen...';
        const compressedImage = await prepareImageForAPI(currentImageData);
        await processWithGemini(compressedImage);
    } catch (error) {
        console.error('Error al preparar la imagen:', error);
        showError('Error al preparar la imagen: ' + error.message);
    }
});

async function processWithGemini(imageDataUrl) {
    loadingStatus.textContent = 'Procesando con IA...';
    let text = null;
    let lastErrorMsg = 'Error desconocido';
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            if (attempt > 1) {
                loadingStatus.textContent = `Reintento ${attempt}/${MAX_RETRIES}...`;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            text = await callGeminiAPI(imageDataUrl);
            break;
        } catch (error) {
            lastErrorMsg = error.message;
            console.error(`Intento ${attempt} falló:`, error);
        }
    }
    
    if (!text) {
        showError('Error de IA: ' + lastErrorMsg);
        return;
    }
    
    if (text.includes('NO_ENCONTRADO')) {
        showSection(manualSection);
        return;
    }
    
    loadingStatus.textContent = 'Analizando datos...';
    detectedAlbaranes = parseGeminiResponse(text);
    
    if (detectedAlbaranes.length === 0) {
        showSection(manualSection);
        return;
    }
    showVerificationScreen();
}

async function callGeminiAPI(imageDataUrl) {
    const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Error desconocido del servidor' }));
        throw new Error(err.error || `Error del servidor: ${response.status}`);
    }

    const data = await response.json();
    return data.text;
}

function parseGeminiResponse(text) {
    const albaranes = [];
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    for (const line of lines) {
        const match = line.match(/ALBARAN:\s*(\d+)\s*\|\s*FECHA:\s*(.+)/i);
        if (match) {
            albaranes.push({ numero: match[1].trim(), fecha: match[2].trim() });
            if (albaranes.length >= 5) break;
        }
    }
    return albaranes;
}

// ===== VERIFICACIÓN Y GENERACIÓN =====
function showVerificationScreen() {
    verifyContainer.innerHTML = '';
    for (let i = 0; i < 5; i++) {
        const data = detectedAlbaranes[i] || { numero: '', fecha: '' };
        const row = document.createElement('div');
        row.className = 'verify-row';
        row.innerHTML = `
            <div class="verify-label">Fila ${i + 1}</div>
            <input type="text" class="verify-input alb-input" value="${data.numero}" placeholder="Albarán">
            <input type="text" class="verify-input fecha-input" value="${data.fecha}" placeholder="Fecha y hora">
        `;
        verifyContainer.appendChild(row);
    }
    showSection(verifySection);
}

confirmVerifyBtn.addEventListener('click', async () => {
    const rows = verifyContainer.querySelectorAll('.verify-row');
    const finalAlbaranes = [];
    rows.forEach(row => {
        const num = row.querySelector('.alb-input').value.trim();
        const fecha = row.querySelector('.fecha-input').value.trim();
        if (num && fecha) finalAlbaranes.push({ numero: num, fecha: fecha });
    });
    
    if (finalAlbaranes.length === 0) { showError('No hay datos válidos.'); return; }
    
    try {
        loadingStatus.textContent = 'Generando códigos...';
        showSection(loadingSection);
        await generateBarcodes(finalAlbaranes);
        saveDataLocally(finalAlbaranes);
        showSection(resultsSection);
    } catch (error) {
        showError('Error al generar: ' + (error?.message || 'Error desconocido'));
    }
});

cancelVerifyBtn.addEventListener('click', () => { currentImageData = null; showSection(null); });

generateManualBtn.addEventListener('click', async () => {
    const albaranes = [];
    for (let i = 1; i <= 5; i++) {
        const num = document.getElementById(`manual-alb-${i}`).value.trim();
        const fecha = document.getElementById(`manual-fecha-${i}`).value.trim();
        if (num && fecha) albaranes.push({ numero: num, fecha: fecha });
    }
    if (albaranes.length === 0) { showError('Introduce al menos un albarán y su fecha.'); return; }
    try {
        await generateBarcodes(albaranes);
        saveDataLocally(albaranes);
        showSection(resultsSection);
    } catch (error) {
        showError('Error al generar: ' + (error?.message || 'Error desconocido'));
    }
});

async function generateBarcodes(albaranes) {
    barcodesContainer.innerHTML = '';
    await createBarcodeCard('Logisticaneo', 'Logisticaneo', 'logisticaneo');
    for (let index = 0; index < albaranes.length; index++) {
        const albaran = albaranes[index];
        await createBarcodeCard(albaran.numero, `${albaran.numero} - ${albaran.fecha}`, `albaran-${index}`);
    }
}

function createBarcodeCard(codigo, texto, id) {
    return new Promise((resolve, reject) => {
        const card = document.createElement('div');
        card.className = 'barcode-card';
        const barcodeDiv = document.createElement('div');
        barcodeDiv.className = 'barcode-wrapper';
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('id', `barcode-${id}`);
        barcodeDiv.appendChild(svg);
        card.appendChild(barcodeDiv);
        if (texto) {
            const textDiv = document.createElement('div');
            textDiv.className = 'barcode-text';
            textDiv.textContent = texto;
            card.appendChild(textDiv);
        }
        barcodesContainer.appendChild(card);
        setTimeout(() => {
            try {
                if (typeof JsBarcode === 'undefined') throw new Error('Librería no cargada.');
                JsBarcode(svg, codigo, { format: 'CODE128', displayValue: false, height: 80, width: 2, margin: 10, background: '#ffffff', lineColor: '#000000' });
                resolve();
            } catch (error) {
                barcodeDiv.innerHTML = `<p style="color: red; text-align: center;">Error</p>`;
                reject(error);
            }
        }, 150);
    });
}

// ===== ALMACENAMIENTO LOCAL =====
function saveDataLocally(albaranes) {
    try { localStorage.setItem('savedAlbaranes', JSON.stringify(albaranes)); } catch (e) { console.error(e); }
}

function loadSavedData() {
    try {
        const savedData = localStorage.getItem('savedAlbaranes');
        if (savedData) {
            const albaranes = JSON.parse(savedData);
            if (albaranes && albaranes.length > 0) {
                generateBarcodes(albaranes);
                showSection(resultsSection);
                return true;
            }
        }
    } catch (e) { console.error(e); }
    return false;
}

function clearSavedData() {
    localStorage.removeItem('savedAlbaranes');
    barcodesContainer.innerHTML = '';
    showSection(null);
}

clearDataBtn.addEventListener('click', () => {
    if (confirm('¿Estás seguro de que quieres borrar los códigos guardados?')) clearSavedData();
});

retryBtn.addEventListener('click', () => { currentImageData = null; showSection(null); });

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then((reg) => console.log('SW registrado:', reg.scope))
            .catch((err) => console.log('Error SW:', err));
    });
}

initTheme();
updateConnectionStatus();
loadSavedData();