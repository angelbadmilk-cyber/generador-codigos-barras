// ===== CONFIGURACIÓN =====
const OCR_SPACE_API_KEY = 'K87772587088957'; // <-- PEGA AQUÍ TU CLAVE REAL
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
const enhancedPreviewSection = document.getElementById('enhanced-preview-section');
const enhancedImage = document.getElementById('enhanced-image');
const confirmEnhancedBtn = document.getElementById('confirm-enhanced-btn');
const cancelEnhancedBtn = document.getElementById('cancel-enhanced-btn');
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
const apiWarningSection = document.getElementById('api-warning-section');
const apiWarningText = document.getElementById('api-warning-text');
const dismissApiWarning = document.getElementById('dismiss-api-warning');

let currentImageData = null;
let enhancedImageData = null;
let worker = null;
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
        connectionStatus.title = 'Conectado - Usará IA';
    } else {
        connectionStatus.textContent = '';
        connectionStatus.title = 'Sin conexión - Modo local';
    }
}

window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);

// ===== VALIDACIÓN API KEY =====
async function validateApiKey() {
    if (!OCR_SPACE_API_KEY || OCR_SPACE_API_KEY === 'TU_API_KEY_DE_OCR_SPACE') {
        apiWarningText.textContent = '⚠️ La clave de OCR no está configurada. Edita el archivo app.js y añade tu API key.';
        showSection(apiWarningSection);
        return false;
    }
    
    try {
        const response = await fetch('https://api.ocr.space/parse/image', {
            method: 'POST',
            headers: { 'apikey': OCR_SPACE_API_KEY },
            body: new FormData()
        });
        
        if (response.status === 401 || response.status === 403) {
            apiWarningText.textContent = '️ La clave de OCR es inválida. Revisa tu API key en app.js.';
            showSection(apiWarningSection);
            return false;
        }
        
        return true;
    } catch (error) {
        console.warn('No se pudo validar la API key:', error);
        return true;
    }
}

// ===== GESTIÓN DE SECCIONES =====
function showSection(section) {
    const sections = [previewSection, cropSection, loadingSection, enhancedPreviewSection, verifySection, manualSection, resultsSection, errorSection, apiWarningSection];
    sections.forEach(s => s.classList.add('hidden'));
    if (section) section.classList.remove('hidden');
}

function showError(message) {
    errorText.textContent = message;
    showSection(errorSection);
}

// ===== CÁMARA Y GALERÍA =====
cameraBtn.addEventListener('click', () => {
    const savedData = localStorage.getItem('savedAlbaranes');
    if (savedData) {
        if (confirm('¿Borrar los códigos actuales y empezar uno nuevo?')) {
            clearSavedData();
            cameraInput.click();
        }
    } else {
        cameraInput.click();
    }
});

galleryBtn.addEventListener('click', () => {
    const savedData = localStorage.getItem('savedAlbaranes');
    if (savedData) {
        if (confirm('¿Borrar los códigos actuales y empezar uno nuevo?')) {
            clearSavedData();
            galleryInput.click();
        }
    } else {
        galleryInput.click();
    }
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

// ===== ROTAR IMAGEN =====
rotateBtn.addEventListener('click', () => {
    if (!currentImageData) return;
    
    currentRotation = (currentRotation + 90) % 360;
    
    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (currentRotation === 90 || currentRotation === 270) {
            canvas.width = img.height;
            canvas.height = img.width;
        } else {
            canvas.width = img.width;
            canvas.height = img.height;
        }
        
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((currentRotation * Math.PI) / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        
        currentImageData = canvas.toDataURL('image/png');
        previewImage.src = currentImageData;
    };
    img.src = currentImageData;
});

// ===== RECORTAR IMAGEN =====
cropBtn.addEventListener('click', () => {
    if (!currentImageData) return;
    
    cropImage.src = currentImageData;
    showSection(cropSection);
    
    setTimeout(() => {
        if (cropper) cropper.destroy();
        cropper = new Cropper(cropImage, {
            viewMode: 1,
            dragMode: 'move',
            autoCropArea: 0.8,
            restore: false,
            guides: true,
            center: true,
            highlight: false,
            cropBoxMovable: true,
            cropBoxResizable: true,
            toggleDragModeOnDblclick: false,
        });
    }, 100);
});

confirmCropBtn.addEventListener('click', () => {
    if (cropper) {
        const canvas = cropper.getCroppedCanvas();
        currentImageData = canvas.toDataURL('image/png');
        previewImage.src = currentImageData;
        cropper.destroy();
        cropper = null;
        showSection(previewSection);
    }
});

cancelCropBtn.addEventListener('click', () => {
    if (cropper) {
        cropper.destroy();
        cropper = null;
    }
    showSection(previewSection);
});

// ===== PREPROCESAMIENTO AVANZADO DE IMAGEN =====
async function preprocessImage(imageDataUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Escalar la imagen si es pequeña
            const minDimension = 1000;
            let scale = 1;
            if (img.width < minDimension || img.height < minDimension) {
                scale = Math.max(minDimension / img.width, minDimension / img.height);
            }
            
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            const width = canvas.width;
            const height = canvas.height;
            
            // 1. Convertir a escala de grises
            const gray = new Uint8Array(width * height);
            for (let i = 0, j = 0; i < data.length; i += 4, j++) {
                gray[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
            }
            
            // 2. Filtro de mediana 3x3 (elimina ruido de pantalla)
            const medianFiltered = new Uint8Array(width * height);
            for (let y = 1; y < height - 1; y++) {
                for (let x = 1; x < width - 1; x++) {
                    const neighbors = [
                        gray[(y-1) * width + (x-1)],
                        gray[(y-1) * width + x],
                        gray[(y-1) * width + (x+1)],
                        gray[y * width + (x-1)],
                        gray[y * width + x],
                        gray[y * width + (x+1)],
                        gray[(y+1) * width + (x-1)],
                        gray[(y+1) * width + x],
                        gray[(y+1) * width + (x+1)]
                    ];
                    neighbors.sort((a, b) => a - b);
                    medianFiltered[y * width + x] = neighbors[4]; // Valor mediano
                }
            }
            
            // 3. CLAHE simplificado (contraste adaptativo por zonas)
            const tileSize = 64;
            const tilesX = Math.ceil(width / tileSize);
            const tilesY = Math.ceil(height / tileSize);
            const claheImage = new Uint8Array(width * height);
            
            for (let ty = 0; ty < tilesY; ty++) {
                for (let tx = 0; tx < tilesX; tx++) {
                    const startX = tx * tileSize;
                    const startY = ty * tileSize;
                    const endX = Math.min(startX + tileSize, width);
                    const endY = Math.min(startY + tileSize, height);
                    
                    // Calcular histograma del tile
                    const histogram = new Array(256).fill(0);
                    let pixelCount = 0;
                    for (let y = startY; y < endY; y++) {
                        for (let x = startX; x < endX; x++) {
                            histogram[medianFiltered[y * width + x]]++;
                            pixelCount++;
                        }
                    }
                    
                    // Ecualización del histograma
                    const cdf = new Array(256).fill(0);
                    cdf[0] = histogram[0];
                    for (let i = 1; i < 256; i++) {
                        cdf[i] = cdf[i-1] + histogram[i];
                    }
                    
                    const cdfMin = cdf.find(v => v > 0) || 0;
                    const scale = 255 / (pixelCount - cdfMin);
                    
                    // Aplicar ecualización
                    for (let y = startY; y < endY; y++) {
                        for (let x = startX; x < endX; x++) {
                            const idx = y * width + x;
                            const val = medianFiltered[idx];
                            claheImage[idx] = Math.min(255, Math.max(0, Math.round((cdf[val] - cdfMin) * scale)));
                        }
                    }
                }
            }
            
            // 4. Detectar y corregir inclinación (Deskew)
            let skewAngle = 0;
            const projectionAngles = [-3, -2, -1, 0, 1, 2, 3]; // Ángulos a probar
            let bestVariance = 0;
            let bestAngle = 0;
            
            for (const angle of projectionAngles) {
                const rotated = rotateImage(claheImage, width, height, angle);
                const projection = new Array(rotated.height).fill(0);
                
                for (let y = 0; y < rotated.height; y++) {
                    for (let x = 0; x < rotated.width; x++) {
                        projection[y] += rotated.data[y * rotated.width + x];
                    }
                }
                
                // Calcular varianza de la proyección
                const mean = projection.reduce((a, b) => a + b, 0) / projection.length;
                const variance = projection.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0);
                
                if (variance > bestVariance) {
                    bestVariance = variance;
                    bestAngle = angle;
                }
            }
            
            skewAngle = bestAngle;
            
            // Aplicar rotación si es necesario
            let finalImage = claheImage;
            let finalWidth = width;
            let finalHeight = height;
            
            if (skewAngle !== 0) {
                const rotated = rotateImage(claheImage, width, height, skewAngle);
                finalImage = rotated.data;
                finalWidth = rotated.width;
                finalHeight = rotated.height;
            }
            
            // 5. Aplicar umbral adaptativo (binarización suave)
            const threshold = 128;
            for (let i = 0; i < finalImage.length; i++) {
                finalImage[i] = finalImage[i] > threshold ? 255 : 0;
            }
            
            // Crear canvas final
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = finalWidth;
            finalCanvas.height = finalHeight;
            const finalCtx = finalCanvas.getContext('2d');
            const finalImageData = finalCtx.createImageData(finalWidth, finalHeight);
            
            for (let i = 0, j = 0; i < finalImageData.data.length; i += 4, j++) {
                finalImageData.data[i] = finalImage[j];
                finalImageData.data[i + 1] = finalImage[j];
                finalImageData.data[i + 2] = finalImage[j];
                finalImageData.data[i + 3] = 255;
            }
            
            finalCtx.putImageData(finalImageData, 0, 0);
            resolve(finalCanvas.toDataURL('image/png'));
        };
        img.onerror = () => resolve(imageDataUrl);
        img.src = imageDataUrl;
    });
}

// ===== FUNCIÓN AUXILIAR: ROTAR IMAGEN =====
function rotateImage(imageData, width, height, angleDegrees) {
    const angle = (angleDegrees * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    
    // Calcular nuevas dimensiones
    const newWidth = Math.round(Math.abs(width * cos) + Math.abs(height * sin));
    const newHeight = Math.round(Math.abs(width * sin) + Math.abs(height * cos));
    
    const rotated = new Uint8Array(newWidth * newHeight);
    const centerX = width / 2;
    const centerY = height / 2;
    const newCenterX = newWidth / 2;
    const newCenterY = newHeight / 2;
    
    for (let y = 0; y < newHeight; y++) {
        for (let x = 0; x < newWidth; x++) {
            // Coordenadas relativas al centro
            const dx = x - newCenterX;
            const dy = y - newCenterY;
            
            // Rotación inversa
            const srcX = Math.round(dx * cos + dy * sin + centerX);
            const srcY = Math.round(-dx * sin + dy * cos + centerY);
            
            if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
                rotated[y * newWidth + x] = imageData[srcY * width + srcX];
            } else {
                rotated[y * newWidth + x] = 255; // Fondo blanco
            }
        }
    }
    
    return { data: rotated, width: newWidth, height: newHeight };
}

// ===== PROCESAR IMAGEN =====
processBtn.addEventListener('click', async () => {
    if (!currentImageData) return;
    showSection(loadingSection);
    
    try {
        loadingStatus.textContent = 'Mejorando calidad de imagen...';
        enhancedImageData = await preprocessImage(currentImageData);
        
        // Mostrar imagen mejorada para confirmar
        enhancedImage.src = enhancedImageData;
        showSection(enhancedPreviewSection);
        
    } catch (error) {
        console.error('Error preprocesando:', error);
        enhancedImageData = currentImageData;
        await processWithOCR();
    }
});

// Confirmar imagen mejorada
confirmEnhancedBtn.addEventListener('click', async () => {
    await processWithOCR();
});

// Usar imagen original
cancelEnhancedBtn.addEventListener('click', async () => {
    enhancedImageData = currentImageData;
    await processWithOCR();
});

// ===== PROCESAR CON OCR (CON REINTENTOS) =====
async function processWithOCR() {
    showSection(loadingSection);
    loadingStatus.textContent = 'Leyendo con IA (OCR.space)...';
    
    let text = null;
    let lastError = null;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            if (attempt > 1) {
                loadingStatus.textContent = `Reintento ${attempt}/${MAX_RETRIES}...`;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            text = await callOcrSpace(enhancedImageData);
            break;
            
        } catch (error) {
            lastError = error;
            console.warn(`Intento ${attempt} falló:`, error.message);
        }
    }
    
    if (!text || text.trim().length < 10) {
        console.warn('OCR.space falló, usando respaldo local:', lastError?.message);
        loadingStatus.textContent = 'Modo sin conexión: Leyendo localmente...';
        
        try {
            await processWithTesseract();
        } catch (tesseractError) {
            showError('No se pudo leer la imagen. Prueba a acercarte más o usa la entrada manual.');
        }
        return;
    }
    
    loadingStatus.textContent = 'Analizando datos...';
    detectedAlbaranes = extractAlbaranes(text);
    
    if (detectedAlbaranes.length === 0) {
        showSection(manualSection);
        return;
    }
    
    showVerificationScreen();
}

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
    enhancedImageData = null;
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
    enhancedImageData = null;
    showSection(null);
});

dismissApiWarning.addEventListener('click', () => {
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
updateConnectionStatus();
validateApiKey();
loadSavedData();