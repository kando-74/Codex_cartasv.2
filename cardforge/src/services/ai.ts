import type { JSONSchema } from '../types'

const baseUrl = import.meta.env.VITE_AI_BASE_URL
const apiKey = import.meta.env.VITE_AI_API_KEY
const model = import.meta.env.VITE_AI_MODEL ?? 'qwen-plus'
const imageModel = import.meta.env.VITE_AI_IMAGE_MODEL ?? 'wanx-v1'
const imageSize = import.meta.env.VITE_AI_IMAGE_SIZE ?? '1024x1024'

const buildHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${apiKey}`,
})

const buildUrl = (path: string) => {
  const sanitized = baseUrl?.replace(/\/$/, '') ?? ''
  return `${sanitized}${path}`
}

export interface GenerateJSONOptions {
  systemPrompt?: string
  signal?: AbortSignal
}

type MessageContentItem = {
  type?: string
  text?: string
  value?: string
  data?: unknown
}

export async function generateJSON<T>(
  prompt: string,
  schema: JSONSchema,
  options?: GenerateJSONOptions,
): Promise<T> {
  if (!baseUrl || !apiKey) {
    throw new Error('Configura las variables AI_* en tu entorno para usar la IA.')
  }

  const response = await fetch(buildUrl('/v1/chat/completions'), {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content:
            options?.systemPrompt ??
            'Eres un asistente creativo que responde únicamente con JSON válido para cardforge.',
        },
        { role: 'user', content: prompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: schema.title ?? 'cardforge_schema',
          schema,
        },
      },
    }),
    signal: options?.signal,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Error al generar JSON: ${response.status} ${errorText}`)
  }

  const payload = await response.json()
  const message = payload.choices?.[0]?.message

  if (!message) {
    throw new Error('La respuesta de la IA no contiene un mensaje válido.')
  }

  let rawContent: string | undefined

  if (Array.isArray(message.content)) {
    const jsonPart = (message.content as MessageContentItem[]).find((part) =>
      ['json', 'json_schema', 'text', 'output_text'].includes(part?.type ?? ''),
    )
    rawContent = jsonPart?.text ?? jsonPart?.value
    if (!rawContent && jsonPart?.data) {
      rawContent =
        typeof jsonPart.data === 'string' ? jsonPart.data : JSON.stringify(jsonPart.data)
    }
  } else if (typeof message.content === 'string') {
    rawContent = message.content
  }

  if (!rawContent && message?.tool_calls?.[0]?.function?.arguments) {
    rawContent = message.tool_calls[0].function.arguments
  }

  if (!rawContent) {
    throw new Error('La IA no devolvió contenido interpretable.')
  }

  try {
    return JSON.parse(rawContent) as T
  } catch (error) {
    console.error('Contenido recibido:', rawContent)
    throw new Error('No se pudo parsear la respuesta JSON de la IA.')
  }
}

export async function generateImageBase64(prompt: string): Promise<string> {
  if (!prompt.trim()) {
    throw new Error('Proporciona una descripción para generar la imagen.')
  }

  if (!baseUrl || !apiKey) {
    throw new Error('Configura las variables AI_* en tu entorno para usar la IA.')
  }

  const response = await fetch(buildUrl('/v1/images/generations'), {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({
      model: imageModel,
      prompt,
      size: imageSize,
      response_format: 'b64_json',
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Error al generar imagen: ${response.status} ${errorText}`)
  }

  const payload = await response.json()

  const base64Content: string | undefined =
    payload?.data?.[0]?.b64_json ??
    payload?.data?.[0]?.base64 ??
    payload?.data?.[0]?.content ??
    payload?.image_base64 ??
    payload?.base64 ??
    payload?.b64_json

  if (!base64Content) {
    throw new Error('El servicio de imágenes no devolvió datos en base64.')
  }

  return base64Content.startsWith('data:')
    ? base64Content
    : `data:image/png;base64,${base64Content}`
}
