// ===== CONFIGURACIÓN =====
const OCR_SPACE_API_KEY = 'TU_API_KEY_DE_OCR_SPACE'; // <-- MANTÉN AQUÍ TU CLAVE

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
const clearDataBtn = document.getElementById('clear-data-btn');
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
cameraBtn.addEventListener('click', () => {
    clearSavedData();
    cameraInput.click();
});

galleryBtn.addEventListener('click', () => {
    clearSavedData();
    galleryInput.click();
});

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

// ===== PREPROCESAMIENTO AVANZADO DE IMAGEN =====
async function preprocessImage(imageDataUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Escalar la imagen si es pequeña (mejora OCR)
            const minDimension = 1000;
            let scale = 1;
            if (img.width < minDimension || img.height < minDimension) {
                scale = Math.max(minDimension / img.width, minDimension / img.height);
            }
            
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            
            // Dibujar imagen escalada
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            // Obtener datos de píxeles
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            const width = canvas.width;
            const height = canvas.height;
            
            // 1. Convertir a escala de grises y aumentar contraste
            const gray = new Uint8Array(width * height);
            let minVal = 255, maxVal = 0;
            
            for (let i = 0, j = 0; i < data.length; i += 4, j++) {
                const grayVal = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
                gray[j] = grayVal;
                if (grayVal < minVal) minVal = grayVal;
                if (grayVal > maxVal) maxVal = grayVal;
            }
            
            // 2. Estirar contraste (normalización)
            const contrastRange = maxVal - minVal;
            for (let i = 0, j = 0; i < data.length; i += 4, j++) {
                let normalized = contrastRange > 0 ? ((gray[j] - minVal) / contrastRange) * 255 : 128;
                // Aumentar contraste adicional (factor 1.5)
                normalized = 128 + (normalized - 128) * 1.5;
                normalized = Math.max(0, Math.min(255, normalized));
                
                data[i] = normalized;
                data[i + 1] = normalized;
                data[i + 2] = normalized;
            }
            
            // 3. Aplicar filtro de nitidez (unsharp mask simple)
            const sharpened = new Uint8Array(width * height);
            for (let y = 1; y < height - 1; y++) {
                for (let x = 1; x < width - 1; x++) {
                    const idx = y * width + x;
                    const center = data[idx * 4];
                    const neighbors = [
                        data[((y-1) * width + x) * 4],
                        data[((y+1) * width + x) * 4],
                        data[(y * width + x - 1) * 4],
                        data[(y * width + x + 1) * 4]
                    ];
                    const avg = neighbors.reduce((a, b) => a + b, 0) / 4;
                    sharpened[idx] = Math.max(0, Math.min(255, center + (center - avg) * 0.5));
                }
            }
            
            // Aplicar sharpened a los píxeles
            for (let i = 0, j = 0; i < data.length; i += 4, j++) {
                if (j >= width && j < (height - 1) * width && j % width > 0 && j % width < width - 1) {
                    data[i] = sharpened[j];
                    data[i + 1] = sharpened[j];
                    data[i + 2] = sharpened[j];
                }
            }
            
            // 4. Binarización adaptativa (umbral de Otsu simplificado)
            const histogram = new Array(256).fill(0);
            for (let i = 0; i < gray.length; i++) histogram[gray[i]]++;
            
            const total = gray.length;
            let sum = 0;
            for (let i = 0; i < 256; i++) sum += i * histogram[i];
            
            let sumB = 0, wB = 0, wF = 0, maxVariance = 0, threshold = 128;
            for (let t = 0; t < 256; t++) {
                wB += histogram[t];
                if (wB === 0) continue;
                wF = total - wB;
                if (wF === 0) break;
                sumB += t * histogram[t];
                const mB = sumB / wB;
                const mF = (sum - sumB) / wF;
                const variance = wB * wF * (mB - mF) * (mB - mF);
                if (variance > maxVariance) {
                    maxVariance = variance;
                    threshold = t;
                }
            }
            
            // Aplicar umbral
            for (let i = 0, j = 0; i < data.length; i += 4, j++) {
                const final = gray[j] > threshold ? 255 : 0;
                data[i] = final;
                data[i + 1] = final;
                data[i + 2] = final;
            }
            
            ctx.putImageData(imageData, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => resolve(imageDataUrl);
        img.src = imageDataUrl;
    });
}

// ===== PROCESAR IMAGEN =====
processBtn.addEventListener('click', async () => {
    if (!currentImageData) return;
    showSection(loadingSection);
    
    try {
        loadingStatus.textContent = 'Mejorando calidad de imagen...';
        const enhancedImage = await preprocessImage(currentImageData);
        
        loadingStatus.textContent = 'Leyendo con IA (OCR.space)...';
        let text = await callOcrSpace(enhancedImage);
        
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
        headers: { 'apikey': OCR_SPACE_API_KEY },
        body: formData
    });

    if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
    const data = await response.json();
    
    if (data.IsErroredOnProcessing) throw new Error(data.ErrorMessage || 'Error en el procesamiento');
    if (data.ParsedResults && data.ParsedResults.length > 0) return data.ParsedResults[0].ParsedText;
    
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
        if (num && fecha) finalAlbaranes.push({ numero: num, fecha: fecha });
    });
    
    if (finalAlbaranes.length === 0) {
        showError('No hay datos válidos para generar.');
        return;
    }
    
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
    
    const fullText = text.replace(/[\n\r]+/g, ' ');
    const allAlbaranes = [...fullText.matchAll(new RegExp(albaranPattern.source, 'g'))].map(m => m[0]);
    
    for (const albaran of allAlbaranes) {
        if (albaranes.some(a => a.numero === albaran)) continue;
        
        let albaranLineIndex = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(albaran)) { albaranLineIndex = i; break; }
        }
        if (albaranLineIndex === -1) continue;
        
        let fechaEncontrada = '';
        const startLine = Math.max(0, albaranLineIndex - 3);
        const endLine = Math.min(lines.length - 1, albaranLineIndex + 3);
        
        for (let i = startLine; i <= endLine; i++) {
            const dateMatch = lines[i].match(new RegExp(datePattern.source));
            if (dateMatch) { fechaEncontrada = dateMatch[1]; break; }
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
        saveDataLocally(albaranes);
        showSection(resultsSection);
    } catch (error) {
        showError('Error al generar: ' + (error?.message || 'Error desconocido'));
    }
});

// ===== GENERAR CÓDIGOS =====
async function generateBarcodes(albaranes) {
    barcodesContainer.innerHTML = '';
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

// ===== FUNCIONES DE ALMACENAMIENTO LOCAL =====
function saveDataLocally(albaranes) {
    try {
        localStorage.setItem('savedAlbaranes', JSON.stringify(albaranes));
    } catch (e) {
        console.error('No se pudo guardar en local:', e);
    }
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
    } catch (e) {
        console.error('Error al cargar datos guardados:', e);
    }
    return false;
}

function clearSavedData() {
    localStorage.removeItem('savedAlbaranes');
    barcodesContainer.innerHTML = '';
    showSection(null);
}

// ===== BOTONES DE LIMPIEZA Y REINTENTO =====
clearDataBtn.addEventListener('click', () => {
    if (confirm('¿Estás seguro de que quieres borrar los códigos guardados?')) {
        clearSavedData();
    }
});

retryBtn.addEventListener('click', () => {
    currentImageData = null;
    showSection(null);
});

// ===== SERVICE WORKER =====
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then((reg) => console.log('SW registrado:', reg.scope))
            .catch((err) => console.log('Error SW:', err));
    });
}

// ===== INICIALIZACIÓN =====
initTheme();
loadSavedData();