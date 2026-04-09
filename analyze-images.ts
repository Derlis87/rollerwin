import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';

async function analyzeImage(imagePath: string) {
  const zai = await ZAI.create();
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const mimeType = 'image/png';

  const response = await zai.chat.completions.createVision({
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Describe in detail all the information visible in this image. It appears to be a backtesting results screenshot from a roulette analysis application called RollerWin. Extract ALL numbers, statistics, win/loss counts, percentages, bet types, peak levels, and any other data visible. Be extremely thorough.'
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`
            }
          }
        ]
      },
    ],
    thinking: { type: 'disabled' }
  });

  return response.choices[0]?.message?.content;
}

async function main() {
  try {
    console.log('=== IMAGE 1 ===');
    const r1 = await analyzeImage('/home/z/my-project/upload/pasted_image_1775735512054.png');
    console.log(r1);
    console.log('\n\n=== IMAGE 2 ===');
    const r2 = await analyzeImage('/home/z/my-project/upload/pasted_image_1775735530453.png');
    console.log(r2);
  } catch (e: any) {
    console.error('Error:', e.message);
  }
}

main();
