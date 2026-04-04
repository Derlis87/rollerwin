import ZAI from 'z-ai-web-dev-sdk';
import * as fs from 'fs';

async function main() {
  const zai = await ZAI.create();
  const imgBuffer = fs.readFileSync('./upload/pasted_image_1775306741594.png');
  const b64 = imgBuffer.toString('base64');
  
  const response = await zai.chat.completions.createVision({
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Describe esta captura de pantalla del software de ruleta en detalle. Indica: wins, losses, profit, ROI, estrategia, tipo de apuesta, y cualquier resultado visible.' },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } }
      ]
    }],
    thinking: { type: 'disabled' }
  });
  
  console.log(response.choices[0]?.message?.content);
}

main().catch(console.error);
