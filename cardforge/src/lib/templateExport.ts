import { PDFDocument } from 'pdf-lib'
import type {
  Template,
  TemplateElement,
  TemplateImageElement,
  TemplateRectangleElement,
  TemplateTextElement,
} from '../types'

export type PdfPageSizeKey = 'A4' | 'Letter'

interface RenderOptions {
  scale?: number
}

export interface PngExportOptions extends RenderOptions {}

export interface PdfExportOptions extends RenderOptions {
  copies: number
  columns: number
  rows: number
  pageSize?: PdfPageSizeKey
  marginMm?: number
}

const PAGE_SIZES: Record<PdfPageSizeKey, { width: number; height: number }> = {
  A4: { width: 595.28, height: 841.89 },
  Letter: { width: 612, height: 792 },
}

const DEFAULT_FONT_FAMILY = 'Inter'

const mmToPoints = (value: number) => (value * 72) / 25.4

const waitForFonts = async () => {
  if (typeof document === 'undefined') {
    return
  }
  try {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
    if (fonts?.ready) {
      await fonts.ready
    }
  } catch (error) {
    console.warn('No se pudieron cargar todas las fuentes antes de exportar.', error)
  }
}

const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
        return
      }
      reject(new Error('No se pudo generar la imagen del lienzo.'))
    }, 'image/png')
  })

const sanitize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')

export const sanitizeFileName = (name: string, fallback = 'export'): string => {
  const trimmed = name.trim()
  const base = sanitize(trimmed || fallback)
  return base ? base.toLowerCase() : fallback
}

const downloadBlob = (blob: Blob, fileName: string) => {
  if (typeof document === 'undefined') {
    throw new Error('La descarga automática solo está disponible en el navegador.')
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.style.display = 'none'
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const applyElementTransform = (
  ctx: CanvasRenderingContext2D,
  element: TemplateElement,
  draw: (context: CanvasRenderingContext2D) => void,
  { clip = false }: { clip?: boolean } = {},
) => {
  ctx.save()
  const centerX = element.x + element.width / 2
  const centerY = element.y + element.height / 2
  ctx.translate(centerX, centerY)
  ctx.rotate((element.rotation * Math.PI) / 180)
  ctx.translate(-element.width / 2, -element.height / 2)
  if (clip) {
    ctx.beginPath()
    ctx.rect(0, 0, element.width, element.height)
    ctx.clip()
  }
  draw(ctx)
  ctx.restore()
}

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  radius: number,
) => {
  const clamped = Math.max(Math.min(radius, Math.min(width, height) / 2), 0)
  ctx.beginPath()
  ctx.moveTo(clamped, 0)
  ctx.lineTo(width - clamped, 0)
  ctx.quadraticCurveTo(width, 0, width, clamped)
  ctx.lineTo(width, height - clamped)
  ctx.quadraticCurveTo(width, height, width - clamped, height)
  ctx.lineTo(clamped, height)
  ctx.quadraticCurveTo(0, height, 0, height - clamped)
  ctx.lineTo(0, clamped)
  ctx.quadraticCurveTo(0, 0, clamped, 0)
  ctx.closePath()
}

const drawRectangleElement = (ctx: CanvasRenderingContext2D, element: TemplateRectangleElement) => {
  applyElementTransform(ctx, element, (context) => {
    context.save()
    const borderRadius = Number.isFinite(element.borderRadius)
      ? Number(element.borderRadius)
      : 0
    const borderWidth = Number.isFinite(element.borderWidth)
      ? Math.max(element.borderWidth, 0)
      : 0
    drawRoundedRect(context, element.width, element.height, borderRadius)
    context.globalAlpha = element.opacity ?? 1
    context.fillStyle = element.fill
    context.fill()
    if (borderWidth > 0) {
      context.globalAlpha = 1
      context.lineWidth = borderWidth
      context.strokeStyle = element.borderColor
      context.stroke()
    }
    context.restore()
  })
}

const wrapText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] => {
  const lines: string[] = []
  if (!text) {
    return lines
  }
  if (maxWidth <= 0) {
    return text.split(/\r?\n/)
  }
  const paragraphs = text.split(/\r?\n/)
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      lines.push('')
      continue
    }
    let currentLine = ''
    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word
      if (ctx.measureText(candidate).width <= maxWidth || currentLine === '') {
        currentLine = candidate
      } else {
        lines.push(currentLine)
        currentLine = word
      }
    }
    if (currentLine) {
      lines.push(currentLine)
    }
  }
  return lines
}

const drawTextElement = (ctx: CanvasRenderingContext2D, element: TemplateTextElement) => {
  applyElementTransform(
    ctx,
    element,
    (context) => {
      context.save()
      const padding = 8
      const innerWidth = Math.max(element.width - padding * 2, 0)
      const fontFamily = element.fontFamily.includes(' ')
        ? `"${element.fontFamily}"`
        : element.fontFamily || DEFAULT_FONT_FAMILY
      context.fillStyle = element.color
      context.textBaseline = 'top'
      context.font = `${element.fontWeight} ${element.fontSize}px ${fontFamily}`
      const lines = wrapText(context, element.text, innerWidth)
      const lineHeight = element.fontSize * 1.2
      const contentHeight = lines.length * lineHeight
      let startY = padding
      if (contentHeight < element.height - padding * 2) {
        startY += (element.height - padding * 2 - contentHeight) / 2
      }
      let textX = padding
      switch (element.align) {
        case 'center':
          context.textAlign = 'center'
          textX = element.width / 2
          break
        case 'right':
          context.textAlign = 'right'
          textX = element.width - padding
          break
        case 'left':
        default:
          context.textAlign = 'left'
          textX = padding
          break
      }
      let y = startY
      for (const line of lines) {
        context.fillText(line, textX, y)
        y += lineHeight
      }
      context.restore()
    },
    { clip: true },
  )
}

const drawImageElement = (ctx: CanvasRenderingContext2D, element: TemplateImageElement) => {
  applyElementTransform(
    ctx,
    element,
    (context) => {
      context.save()
      context.fillStyle = element.background
      context.fillRect(0, 0, element.width, element.height)
      const strokeWidth = Math.max(element.strokeWidth ?? 0, 0)
      if (strokeWidth > 0) {
        context.lineWidth = strokeWidth
        context.strokeStyle = element.strokeColor
        const inset = strokeWidth / 2
        context.strokeRect(
          inset,
          inset,
          element.width - strokeWidth,
          element.height - strokeWidth,
        )
      }
      const placeholder = element.placeholder ?? 'Área de imagen'
      context.fillStyle = 'rgba(148, 163, 184, 0.85)'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      const fontSize = Math.min(18, Math.max(12, element.height / 6))
      context.font = `600 ${fontSize}px ${DEFAULT_FONT_FAMILY}`
      context.fillText(placeholder, element.width / 2, element.height / 2)
      context.restore()
    },
    { clip: true },
  )
}

const drawElement = (ctx: CanvasRenderingContext2D, element: TemplateElement) => {
  if (element.visible === false) {
    return
  }
  switch (element.type) {
    case 'rectangle':
      drawRectangleElement(ctx, element as TemplateRectangleElement)
      break
    case 'text':
      drawTextElement(ctx, element as TemplateTextElement)
      break
    case 'image':
    default:
      drawImageElement(ctx, element as TemplateImageElement)
  }
}

export const renderTemplateToCanvas = async (
  template: Pick<Template, 'width' | 'height' | 'background' | 'elements'>,
  options: RenderOptions = {},
): Promise<HTMLCanvasElement> => {
  if (typeof document === 'undefined') {
    throw new Error('La exportación solo está disponible en el navegador.')
  }
  await waitForFonts()
  const scale = Math.max(options.scale ?? 1, 1)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(Math.round(template.width * scale), 1)
  canvas.height = Math.max(Math.round(template.height * scale), 1)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('No se pudo inicializar el contexto de dibujo.')
  }
  ctx.save()
  ctx.scale(scale, scale)
  ctx.fillStyle = template.background
  ctx.fillRect(0, 0, template.width, template.height)
  template.elements.forEach((element) => {
    drawElement(ctx, element)
  })
  ctx.restore()
  return canvas
}

const dataUrlToUint8Array = (dataUrl: string): Uint8Array => {
  const [, base64] = dataUrl.split(',')
  const binary = atob(base64)
  const length = binary.length
  const bytes = new Uint8Array(length)
  for (let index = 0; index < length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export const exportTemplateAsPng = async (
  template: Pick<Template, 'width' | 'height' | 'background' | 'elements'>,
  fileName: string,
  options: PngExportOptions = {},
): Promise<Blob> => {
  const canvas = await renderTemplateToCanvas(template, options)
  const blob = await canvasToBlob(canvas)
  downloadBlob(blob, fileName.endsWith('.png') ? fileName : `${fileName}.png`)
  return blob
}

export const exportTemplateAsJson = (
  template: Pick<Template, 'width' | 'height' | 'background' | 'showGrid' | 'elements' | 'name' | 'id'>,
  fileName: string,
): Blob => {
  const payload = {
    id: template.id,
    name: template.name,
    width: template.width,
    height: template.height,
    background: template.background,
    showGrid: template.showGrid,
    elements: template.elements,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  downloadBlob(blob, fileName.endsWith('.json') ? fileName : `${fileName}.json`)
  return blob
}

export const exportTemplateAsPdf = async (
  template: Pick<Template, 'width' | 'height' | 'background' | 'elements' | 'name'>,
  fileName: string,
  options: PdfExportOptions,
): Promise<Blob> => {
  const { copies, columns, rows, pageSize = 'A4', marginMm = 10, scale = 2 } = options
  if (copies <= 0) {
    throw new Error('Debes indicar al menos una carta para exportar.')
  }
  if (columns <= 0 || rows <= 0) {
    throw new Error('El diseño del PDF debe tener al menos una fila y una columna.')
  }
  const pageDefinition = PAGE_SIZES[pageSize] ?? PAGE_SIZES.A4
  const margin = Math.max(marginMm, 0)
  const marginPoints = mmToPoints(margin)
  const usableWidth = pageDefinition.width - marginPoints * 2
  const usableHeight = pageDefinition.height - marginPoints * 2
  if (usableWidth <= 0 || usableHeight <= 0) {
    throw new Error('Los márgenes seleccionados son demasiado grandes para el tamaño de página.')
  }
  const canvas = await renderTemplateToCanvas(template, { scale })
  const dataUrl = canvas.toDataURL('image/png')
  const imageBytes = dataUrlToUint8Array(dataUrl)
  const pdfDoc = await PDFDocument.create()
  const pngImage = await pdfDoc.embedPng(imageBytes)
  const aspectRatio = template.width / template.height
  const cardsPerPage = columns * rows
  const totalPages = Math.ceil(copies / cardsPerPage)
  const cellWidth = usableWidth / columns
  const cellHeight = usableHeight / rows
  for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
    const page = pdfDoc.addPage([pageDefinition.width, pageDefinition.height])
    for (let slot = 0; slot < cardsPerPage; slot += 1) {
      const cardIndex = pageIndex * cardsPerPage + slot
      if (cardIndex >= copies) {
        break
      }
      const column = slot % columns
      const row = Math.floor(slot / columns)
      let drawWidth = cellWidth
      let drawHeight = drawWidth / aspectRatio
      if (drawHeight > cellHeight) {
        drawHeight = cellHeight
        drawWidth = drawHeight * aspectRatio
      }
      const offsetX = marginPoints + column * cellWidth + (cellWidth - drawWidth) / 2
      const offsetY =
        marginPoints + usableHeight - row * cellHeight - cellHeight + (cellHeight - drawHeight) / 2
      page.drawImage(pngImage, {
        x: offsetX,
        y: offsetY,
        width: drawWidth,
        height: drawHeight,
      })
    }
  }
  const pdfBytes = await pdfDoc.save()
  const blob = new Blob([pdfBytes], { type: 'application/pdf' })
  downloadBlob(blob, fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`)
  return blob
}

export const buildExportFileName = (name: string, extension: string, suffix?: string) => {
  const base = sanitizeFileName(name)
  const safeSuffix = suffix ? `-${sanitizeFileName(suffix)}` : ''
  const trimmedSuffix = safeSuffix === '-export' ? '' : safeSuffix
  return `${base || 'export'}${trimmedSuffix}.${extension}`
}
