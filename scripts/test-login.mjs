// Test the full login flow
import ZAI from 'z-ai-web-dev-sdk';

async function main() {
  const zai = await ZAI.create();
  
  // Login
  const response = await zai.chat.completions.create({
    messages: [
      { role: 'user', content: 'Say hello' }
    ]
  });
  console.log('SDK working:', !!response);
}
main().catch(e => console.log('SDK error:', e.message));
