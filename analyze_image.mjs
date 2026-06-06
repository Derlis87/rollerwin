import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';

async function analyzeImage() {
  const imagePath = '/home/z/my-project/upload/pasted_image_1780670811255.png';
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');

  const zai = await ZAI.create();

  const response = await zai.chat.completions.createVision({
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analyze this roulette dashboard screenshot in EXTREME detail. Extract EVERY piece of data:

1. ALL numbers and statistics (Señales, Skips, Aciertos, Promedio, etc.)
2. Complete sequence of numbers
3. Charts or visual indicators
4. System state/status
5. Version labels
6. Errors or warnings
7. All section details
8. Color coding
9. Every single visible number

Be exhaustive - report EVERY number you see.`
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${base64Image}`
            }
          }
        ]
      },
      {
        role: 'user',
        content: 'Now provide a second pass - look again carefully for any numbers or text you might have missed. Include small text, timestamps, percentages, and any data in sidebars or corners.'
      }
    ],
    thinking: { type: 'disabled' }
  });

  console.log(response.choices[0]?.message?.content);
}

analyzeImage().catch(console.error);
