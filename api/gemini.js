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

    // Modelos estables y actuales (finales de 2026)
    const models = [
        'gemini-3.8-flash',
        'gemini-3.6-flash'
    ];

    let lastError = null;

    for (const model of models) {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (data.error) {
                lastError = data.error.message;
                
                // Si es por alta demanda, esperamos 1.5 segundos y probamos el siguiente modelo
                if (data.error.message.includes('high demand') || data.error.code === 429) {
                    await new Promise(r => setTimeout(r, 1500));
                    continue; 
                }
                
                // Si el modelo no existe o no está soportado, pasamos al siguiente inmediatamente
                if (data.error.message.includes('no longer available') || data.error.code === 404) {
                    continue;
                }
                
                throw new Error(lastError);
            }

            // Éxito: devolvemos el texto y el modelo que funcionó
            res.status(200).json({ 
                text: data.candidates[0].content.parts[0].text.trim(),
                model: model
            });
            return;

        } catch (error) {
            lastError = error.message;
            // Si fue un error de red, esperamos un poco y probamos el siguiente
            await new Promise(r => setTimeout(r, 1000));
            continue;
        }
    }

    // Si todos los modelos fallaron
    res.status(500).json({ 
        error: `La IA no pudo procesar la imagen. Detalle: ${lastError}` 
    });
}