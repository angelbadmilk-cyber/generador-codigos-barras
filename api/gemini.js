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
    
    // Prompt ultra-corto para máxima velocidad de procesamiento
    const prompt = `Extrae MÁXIMO 5 albaranes y fechas de filas con cliente "VALENCIA MODULOS DE PUERTA". Formato exacto, sin markdown:
ALBARAN: [numero] | FECHA: [fecha]
Si no hay, responde: NO_ENCONTRADO`;

    const requestBody = {
        contents: [{
            parts: [
                { text: prompt },
                { inline_data: { mime_type: "image/jpeg", data: base64Data } }
            ]
        }]
    };

    const models = ['gemini-3.8-flash', 'gemini-3.6-flash'];
    let lastError = null;

    for (const model of models) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 segundos máximo por modelo

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            const data = await response.json();

            if (data.error) {
                lastError = data.error.message;
                if (data.error.message.includes('high demand') || data.error.code === 429) {
                    await new Promise(r => setTimeout(r, 1000));
                    continue; 
                }
                if (data.error.message.includes('no longer available') || data.error.code === 404) {
                    continue;
                }
                throw new Error(lastError);
            }

            res.status(200).json({ text: data.candidates[0].content.parts[0].text.trim(), model: model });
            return;

        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                lastError = 'Timeout: La IA tardó más de 10s en responder.';
            } else {
                lastError = error.message;
            }
            continue;
        }
    }

    res.status(500).json({ error: `La IA no respondió a tiempo. Detalle: ${lastError}` });
}