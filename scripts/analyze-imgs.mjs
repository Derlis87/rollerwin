import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';

async function main() {
  const zai = await ZAI.create();
  
  const img1 = fs.readFileSync('/home/z/my-project/upload/pasted_image_1774968733163.png');
  const b64_1 = img1.toString('base64');
  
  const img2 = fs.readFileSync('/home/z/my-project/upload/pasted_image_1774968751313.png');
  const b64_2 = img2.toString('base64');

  const response = await zai.chat.completions.createVision({
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Analiza estas 2 capturas de pantalla de una app web de análisis de ruleta. Para cada captura, describe: 1) Cuántos números se ven ingresados 2) Qué secciones/gráficas son visibles 3) Si hay números importados o no 4) Qué indicadores se muestran 5) Si hay algún error o problema visible. Sé muy específico con los números y textos que veas en pantalla.' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${b64_1}` } },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${b64_2}` } }
        ]
      }
    ],
    thinking: { type: 'disabled' }
  });

  console.log(response.choices[0]?.message?.content);
}

main().catch(console.error);
