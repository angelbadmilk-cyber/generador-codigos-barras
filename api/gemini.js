// Este archivo vive en el servidor de Vercel. Aquí es donde se guarda el secreto de forma segura.
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const { imageDataUrl } = req.body;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: 'La clave de API no está configurada en Vercel' });
    }

    const base64Data = imageDataUrl.split(',')[1];
    
    const prompt = `Eres un asistente experto en extracción de datos de tablas logísticas. Analiza la imagen adjunta. Busca en la tabla las filas donde el cliente sea "VALENCIA MODULOS DE PUERTA". Extrae un MÁXIMO de 5 albaranes y sus fechas. Responde ÚNICAMENTE con este formato, sin markdown, sin negritas, sin explicaciones, sin saludo:
ALBARAN: [numero] | FECHA: [fecha]
Si no encuentras ninguno que coincida, responde ÚNICAMENTE con la palabra: NO_ENCONTRADO`;

    const requestBody = {
        contents: [{
            parts: [
                { text: prompt },
                { inline_data: { mime_type: "image/jpeg", data: base64Data } }
            ]
        }]
    };

    // Lista de modelos a probar en orden (si uno falla, prueba el siguiente)
    const models = [
        'gemini-3.8-flash',
        'gemini-2.5-flash',
        'gemini-2.0-flash-001'
    ];

    let lastError = null;

    // Probar cada modelo hasta que uno funcione
    for (const model of models) {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (data.error) {
                // Si el error es por alta demanda, probar el siguiente modelo
                if (data.error.message.includes('high demand') || data.error.code === 429) {
                    lastError = data.error.message;
                    continue; // Probar siguiente modelo
                }
                // Otros errores (como modelo no encontrado), también probar siguiente
                lastError = data.error.message;
                continue;
            }

            // Si llegamos aquí, el modelo funcionó
            res.status(200).json({ 
                text: data.candidates[0].content.parts[0].text.trim(),
                model: model // Información útil para debugging
            });
            return;

        } catch (error) {
            lastError = error.message;
            continue; // Probar siguiente modelo
        }
    }

    // Si todos los modelos fallaron
    res.status(500).json({ 
        error: `Todos los modelos fallaron. Último error: ${lastError}` 
    });
}