import type { ReactNode } from 'react'
import type {
  TemplateElement,
  TemplateImageElement,
  TemplateRectangleElement,
  TemplateTextElement,
} from '../../types'

interface TemplateElementContentProps {
  element: TemplateElement
}

const TemplateElementContent = ({ element }: TemplateElementContentProps): ReactNode => {
  if (element.type === 'text') {
    const textElement = element as TemplateTextElement
    return (
      <div
        className="h-full w-full"
        style={{
          color: textElement.color,
          fontFamily: textElement.fontFamily,
          fontSize: textElement.fontSize,
          fontWeight: textElement.fontWeight,
          textAlign: textElement.align,
          display: 'flex',
          alignItems: 'center',
          justifyContent:
            textElement.align === 'left'
              ? 'flex-start'
              : textElement.align === 'right'
              ? 'flex-end'
              : 'center',
          padding: '4px 6px',
          lineHeight: 1.3,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {textElement.text}
      </div>
    )
  }

  if (element.type === 'rectangle') {
    const rectangle = element as TemplateRectangleElement
    return (
      <div
        className="h-full w-full"
        style={{
          backgroundColor: rectangle.fill,
          borderRadius: rectangle.borderRadius,
          borderWidth: rectangle.borderWidth,
          borderColor: rectangle.borderColor,
          borderStyle: rectangle.borderWidth > 0 ? 'solid' : 'none',
          opacity: rectangle.opacity,
        }}
      />
    )
  }

  const imageElement = element as TemplateImageElement
  const borderWidth = Math.max(imageElement.strokeWidth, 0)
  return (
    <div
      className="flex h-full w-full items-center justify-center text-xs uppercase tracking-widest"
      style={{
        backgroundColor: imageElement.background,
        borderStyle: borderWidth > 0 ? 'solid' : 'none',
        borderColor: imageElement.strokeColor,
        borderWidth,
        color: 'rgba(148, 163, 184, 0.8)',
        letterSpacing: '0.2em',
      }}
    >
      {imageElement.placeholder ?? 'Área de imagen'}
    </div>
  )
}

export default TemplateElementContent
