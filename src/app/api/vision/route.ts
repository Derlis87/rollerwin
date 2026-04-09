import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { prompt, imageBase64 } = await request.json()
    
    if (!prompt || !imageBase64) {
      return NextResponse.json({ error: 'prompt and imageBase64 required' }, { status: 400 })
    }

    const config = {
      baseUrl: 'http://172.25.136.193:8080/v1',
      apiKey: 'Z.ai'
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    }

    // Forward any auth headers from the original request
    const xToken = request.headers.get('x-token')
    if (xToken) headers['X-Token'] = xToken
    const xChatId = request.headers.get('x-chat-id')
    if (xChatId) headers['X-Chat-Id'] = xChatId
    const xUserId = request.headers.get('x-user-id')
    if (xUserId) headers['X-User-Id'] = xUserId

    const response = await fetch(`${config.baseUrl}/chat/completions/vision`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'glm-4v',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}` } }
          ]
        }],
        thinking: { type: 'disabled' }
      })
    })

    const data = await response.json()
    
    if (!response.ok) {
      return NextResponse.json({ error: data.error || 'API error', status: response.status }, { status: response.status })
    }

    return NextResponse.json({ content: data.choices?.[0]?.message?.content || 'No response' })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
