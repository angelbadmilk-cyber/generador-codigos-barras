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
    
    const prompt = `Eres un asistente experto en extracción de datos de tablas logísticas. Analiza la imagen adjunta. Busca en la tabla las filas donde el cliente sea "VALENCIA MODULOS DE PUERTA". Extrae un MÁXIMO de 4 albaranes y sus fechas. Responde ÚNICAMENTE con este formato, sin markdown, sin negritas, sin explicaciones, sin saludo:
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

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message);
        }

        res.status(200).json({ 
            text: data.candidates[0].content.parts[0].text.trim() 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}