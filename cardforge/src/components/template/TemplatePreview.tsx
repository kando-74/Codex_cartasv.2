import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Template } from '../../types'
import TemplateElementContent from './TemplateElementContent'
import { TEMPLATE_GRID_IMAGE, TEMPLATE_GRID_SIZE } from './constants'

interface TemplatePreviewProps {
  template: Pick<Template, 'width' | 'height' | 'background' | 'showGrid' | 'elements'>
}

const TemplatePreview = ({ template }: TemplatePreviewProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(0.2)

  useEffect(() => {
    const updateScale = () => {
      const container = containerRef.current
      if (!container) {
        return
      }
      const bounds = container.getBoundingClientRect()
      if (!bounds.width || !bounds.height) {
        return
      }
      const scaleX = bounds.width / template.width
      const scaleY = bounds.height / template.height
      const nextScale = Math.max(0.05, Math.min(scaleX, scaleY))
      setScale(nextScale)
    }

    updateScale()
    window.addEventListener('resize', updateScale)
    return () => {
      window.removeEventListener('resize', updateScale)
    }
  }, [template.width, template.height])

  return (
    <div
      ref={containerRef}
      className="relative flex h-64 w-full items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-slate-950/70"
    >
      <div
        className="relative shadow-xl"
        style={{
          width: template.width,
          height: template.height,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          backgroundColor: template.background,
          backgroundImage: template.showGrid ? TEMPLATE_GRID_IMAGE : undefined,
          backgroundSize: template.showGrid
            ? `${TEMPLATE_GRID_SIZE}px ${TEMPLATE_GRID_SIZE}px`
            : undefined,
        }}
      >
        {template.elements
          .filter((element) => element.visible !== false)
          .map((element) => {
            const style: CSSProperties = {
              position: 'absolute',
              left: element.x,
              top: element.y,
              width: element.width,
              height: element.height,
              transform: `rotate(${element.rotation}deg)`,
              borderRadius: 4,
              overflow: 'hidden',
              outline: '1px solid rgba(148, 163, 184, 0.45)',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.25)',
            }
            return (
              <div key={element.id} style={style} className="select-none">
                <TemplateElementContent element={element} />
              </div>
            )
          })}
      </div>
    </div>
  )
}

export default TemplatePreview
