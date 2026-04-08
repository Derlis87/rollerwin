
import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';

async function main() {
  const zai = await ZAI.create();
  
  const img1 = fs.readFileSync('/home/z/my-project/upload/pasted_image_1775659787975.png');
  const b64_1 = img1.toString('base64');
  
  const img2 = fs.readFileSync('/home/z/my-project/upload/pasted_image_1775659808079.png');
  const b64_2 = img2.toString('base64');

  const response = await zai.chat.completions.createVision({
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe these 2 screenshots of a roulette analytics dashboard in detail. Focus on: backtesting results (wins, losses, profit, ROI), Fibonacci cycle details, and any issues you see with the data or layout. Answer in Spanish.' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${b64_1}` } },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${b64_2}` } }
        ]
      },
      { type: 'system', content: 'You are a helpful assistant that analyzes UI screenshots.' }
    ],
    thinking: { type: 'disabled' }
  });

  console.log(response.choices[0]?.message?.content);
}

main().catch(console.error);
