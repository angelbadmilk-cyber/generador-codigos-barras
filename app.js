// ===== CONFIGURACIÓN =====
const OCR_SPACE_API_KEY = 'K87772587088957'; // <-- MANTÉN AQUÍ TU CLAVE DE OCR.SPACE

// ===== ELEMENTOS DEL DOM =====
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.querySelector('.theme-icon');
const cameraBtn = document.getElementById('camera-btn');
const galleryBtn = document.getElementById('gallery-btn');
const cameraInput = document.getElementById('camera-input');
const galleryInput = document.getElementById('gallery-input');
const previewSection = document.getElementById('preview-section');
const previewImage = document.getElementById('preview-image');
const processBtn = document.getElementById('process-btn');
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
const newScanBtn = document.getElementById('new-scan-btn');
const errorSection = document.getElementById('error-section');
const errorText = document.getElementById('error-text');
const retryBtn = document.getElementById('retry-btn');

let currentImageData = null;
let worker = null;
let detectedAlbaranes = [];

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

// ===== GESTIÓN DE SECCIONES =====
function showSection(section) {
    const sections = [previewSection, loadingSection, verifySection, manualSection, resultsSection, errorSection];
    sections.forEach(s => s.classList.add('hidden'));
    if (section) section.classList.remove('hidden');
}

function showError(message) {
    errorText.textContent = message;
    showSection(errorSection);
}

// ===== CÁMARA Y GALERÍA =====
cameraBtn.addEventListener('click', () => cameraInput.click());
galleryBtn.addEventListener('click', () => galleryInput.click());

function handleImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        currentImageData = event.target.result;
        previewImage.src = currentImageData;
        showSection(previewSection);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

cameraInput.addEventListener('change', handleImageSelect);
galleryInput.addEventListener('change', handleImageSelect);

// ===== PROCESAR IMAGEN =====
processBtn.addEventListener('click', async () => {
    if (!currentImageData) return;
    showSection(loadingSection);
    
    try {
        loadingStatus.textContent = 'Leyendo con IA (OCR.space)...';
        let text = await callOcrSpace(currentImageData);
        
        if (!text || text.trim().length < 10) {
            throw new Error('No se detectó texto válido');
        }
        
        loadingStatus.textContent = 'Analizando datos...';
        detectedAlbaranes = extractAlbaranes(text);
        
        if (detectedAlbaranes.length === 0) {
            showSection(manualSection);
            return;
        }
        
        showVerificationScreen();
        
    } catch (error) {
        console.warn('OCR.space falló, usando respaldo local:', error.message);
        loadingStatus.textContent = 'Modo sin conexión: Leyendo localmente...';
        
        try {
            await processWithTesseract();
        } catch (tesseractError) {
            showError('No se pudo leer la imagen. Prueba a acercarte más o usa la entrada manual.');
        }
    }
});

// ===== OCR.SPACE API =====
async function callOcrSpace(imageDataUrl) {
    const formData = new FormData();
    formData.append('base64Image', imageDataUrl);
    formData.append('language', 'spa');
    formData.append('isOverlayRequired', 'false');
    formData.append('detectOrientation', 'true');
    formData.append('scale', 'true');

    const response = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        headers: {
            'apikey': OCR_SPACE_API_KEY
        },
        body: formData
    });

    if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.IsErroredOnProcessing) {
        throw new Error(data.ErrorMessage || 'Error en el procesamiento');
    }

    if (data.ParsedResults && data.ParsedResults.length > 0) {
        return data.ParsedResults[0].ParsedText;
    }
    
    throw new Error('No se encontró texto en la imagen');
}

// ===== TESSERACT (Respaldo Offline) =====
async function processWithTesseract() {
    if (!worker) {
        worker = await Tesseract.createWorker('spa+eng', 1, {
            logger: (m) => {
                if (m.status === 'recognizing text') {
                    loadingStatus.textContent = `Leyendo localmente... ${Math.round(m.progress * 100)}%`;
                }
            }
        });
        await worker.setParameters({
            tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
            tessedit_char_whitelist: '0123456789.:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ,/()-'
        });
    }
    
    const { data: { text } } = await worker.recognize(currentImageData);
    detectedAlbaranes = extractAlbaranes(text);
    
    if (detectedAlbaranes.length === 0) {
        showSection(manualSection);
        return;
    }
    
    showVerificationScreen();
}

// ===== PANTALLA DE VERIFICACIÓN =====
function showVerificationScreen() {
    verifyContainer.innerHTML = '';
    const rowsToEdit = 3;
    
    for (let i = 0; i < rowsToEdit; i++) {
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
        if (num && fecha) {
            finalAlbaranes.push({ numero: num, fecha: fecha });
        }
    });
    
    if (finalAlbaranes.length === 0) {
        showError('No hay datos válidos para generar.');
        return;
    }
    
    try {
        loadingStatus.textContent = 'Generando códigos...';
        showSection(loadingSection);
        await generateBarcodes(finalAlbaranes);
        showSection(resultsSection);
    } catch (error) {
        showError('Error al generar: ' + (error?.message || 'Error desconocido'));
    }
});

cancelVerifyBtn.addEventListener('click', () => {
    currentImageData = null;
    showSection(null);
});

// ===== EXTRAER ALBARANES =====
function extractAlbaranes(text) {
    const lines = text.split(/[\n\r]+/).map(line => line.trim()).filter(line => line.length > 0);
    const albaranes = [];
    
    const albaranPattern = /008\d{6,8}/g;
    const datePattern = /(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}\s+\d{1,2}:\d{2}(?::\d{2})?)/g;
    const clientPattern = /VALENCIA\s+MODULOS\s+DE\s+PUERTA/i;
    
    const fullText = text.replace(/[\n\r]+/g, ' ');
    const allAlbaranes = [...fullText.matchAll(new RegExp(albaranPattern.source, 'g'))].map(m => m[0]);
    
    for (const albaran of allAlbaranes) {
        if (albaranes.some(a => a.numero === albaran)) continue;
        
        let albaranLineIndex = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(albaran)) {
                albaranLineIndex = i;
                break;
            }
        }
        
        if (albaranLineIndex === -1) continue;
        
        let fechaEncontrada = '';
        const startLine = Math.max(0, albaranLineIndex - 3);
        const endLine = Math.min(lines.length - 1, albaranLineIndex + 3);
        
        for (let i = startLine; i <= endLine; i++) {
            const dateMatch = lines[i].match(new RegExp(datePattern.source));
            if (dateMatch) {
                fechaEncontrada = dateMatch[1];
                break;
            }
        }
        
        if (fechaEncontrada) {
            albaranes.push({ numero: albaran, fecha: fechaEncontrada });
            if (albaranes.length >= 3) break;
        }
    }
    return albaranes;
}

// ===== GENERAR MANUALMENTE =====
generateManualBtn.addEventListener('click', async () => {
    const albaranes = [];
    for (let i = 1; i <= 3; i++) {
        const num = document.getElementById(`manual-alb-${i}`).value.trim();
        const fecha = document.getElementById(`manual-fecha-${i}`).value.trim();
        if (num && fecha) albaranes.push({ numero: num, fecha: fecha });
    }
    if (albaranes.length === 0) { showError('Introduce al menos un albarán y su fecha.'); return; }
    try {
        await generateBarcodes(albaranes);
        showSection(resultsSection);
    } catch (error) {
        showError('Error al generar: ' + (error?.message || 'Error desconocido'));
    }
});

// ===== GENERAR CÓDIGOS =====
async function generateBarcodes(albaranes) {
    barcodesContainer.innerHTML = '';
    
    // CORRECCIÓN: Ahora pasamos 'Logisticaneo' también como texto para que se muestre la etiqueta
    await createBarcodeCard('Logisticaneo', 'Logisticaneo', 'logisticaneo');
    
    for (let index = 0; index < albaranes.length; index++) {
        const albaran = albaranes[index];
        const texto = `${albaran.numero} - ${albaran.fecha}`;
        await createBarcodeCard(albaran.numero, texto, `albaran-${index}`);
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
                JsBarcode(svg, codigo, {
                    format: 'CODE128', displayValue: false, height: 80, width: 2, margin: 10,
                    background: '#ffffff', lineColor: '#000000'
                });
                resolve();
            } catch (error) {
                barcodeDiv.innerHTML = `<p style="color: red; text-align: center;">Error</p>`;
                reject(error);
            }
        }, 150);
    });
}

// ===== NUEVA IMAGEN =====
newScanBtn.addEventListener('click', () => {
    currentImageData = null;
    barcodesContainer.innerHTML = '';
    for (let i = 1; i <= 3; i++) {
        const a = document.getElementById(`manual-alb-${i}`);
        const f = document.getElementById(`manual-fecha-${i}`);
        if (a) a.value = ''; if (f) f.value = '';
    }
    showSection(null);
});

retryBtn.addEventListener('click', () => showSection(null));

// ===== SERVICE WORKER =====
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then((reg) => console.log('SW registrado:', reg.scope))
            .catch((err) => console.log('Error SW:', err));
    });
}

initTheme();