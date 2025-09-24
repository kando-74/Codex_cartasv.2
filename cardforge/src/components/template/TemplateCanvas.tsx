import { useCallback, useMemo, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type { TemplateElement } from '../../types'
import TemplateElementContent from './TemplateElementContent'
import { TEMPLATE_GRID_IMAGE, TEMPLATE_GRID_SIZE } from './constants'

interface TemplateCanvasProps {
  width: number
  height: number
  background: string
  showGrid: boolean
  elements: TemplateElement[]
  selectedElementId?: string | null
  zoom: number
  interactive?: boolean
  onSelectElement?: (elementId: string | null) => void
  onUpdateElement?: (elementId: string, changes: Partial<TemplateElement>) => void
}

type InteractionMode = 'move' | 'resize'

const clamp = (value: number, min: number, max: number) => {
  if (value < min) return min
  if (value > max) return max
  return value
}

const TemplateCanvas = ({
  width,
  height,
  background,
  showGrid,
  elements,
  selectedElementId,
  zoom,
  interactive = true,
  onSelectElement,
  onUpdateElement,
}: TemplateCanvasProps) => {
  const canvasRef = useRef<HTMLDivElement | null>(null)

  const visibleElements = useMemo(
    () => elements.filter((element) => element.visible !== false),
    [elements],
  )

  const startInteraction = useCallback(
    (elementId: string, mode: InteractionMode, pointerEvent: ReactPointerEvent) => {
      if (!interactive || !onUpdateElement) {
        return
      }

      pointerEvent.preventDefault()
      pointerEvent.stopPropagation()

      const canvas = canvasRef.current
      if (!canvas) {
        return
      }

      const element = elements.find((item) => item.id === elementId)
      if (!element || element.locked) {
        return
      }

      const rect = canvas.getBoundingClientRect()
      const scale = zoom || 1
      const startX = (pointerEvent.clientX - rect.left) / scale
      const startY = (pointerEvent.clientY - rect.top) / scale
      const baseX = element.x
      const baseY = element.y
      const baseWidth = element.width
      const baseHeight = element.height

      const handlePointerMove = (event: PointerEvent) => {
        const pointerX = (event.clientX - rect.left) / scale
        const pointerY = (event.clientY - rect.top) / scale
        const deltaX = pointerX - startX
        const deltaY = pointerY - startY

        if (mode === 'move') {
          const nextX = clamp(Math.round(baseX + deltaX), 0, width - baseWidth)
          const nextY = clamp(Math.round(baseY + deltaY), 0, height - baseHeight)
          onUpdateElement(elementId, { x: nextX, y: nextY })
        } else if (mode === 'resize') {
          const nextWidth = clamp(Math.round(baseWidth + deltaX), 20, width - baseX)
          const nextHeight = clamp(Math.round(baseHeight + deltaY), 20, height - baseY)
          onUpdateElement(elementId, {
            width: nextWidth,
            height: nextHeight,
          })
        }
      }

      const stopInteraction = () => {
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', stopInteraction)
      }

      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', stopInteraction)
    },
    [interactive, onUpdateElement, elements, zoom, width, height],
  )

  const handleCanvasPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!interactive || !onSelectElement) {
        return
      }

      if (event.target === canvasRef.current) {
        onSelectElement(null)
      }
    },
    [interactive, onSelectElement],
  )

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-auto rounded-xl border border-slate-800 bg-slate-950/70 p-6">
      <div
        ref={canvasRef}
        className="relative shadow-2xl"
        style={{
          width,
          height,
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
          backgroundColor: background,
          backgroundImage: showGrid ? TEMPLATE_GRID_IMAGE : undefined,
          backgroundSize: showGrid ? `${TEMPLATE_GRID_SIZE}px ${TEMPLATE_GRID_SIZE}px` : undefined,
        }}
        onPointerDown={handleCanvasPointerDown}
      >
        {visibleElements.map((element) => {
          const isSelected = interactive && selectedElementId === element.id
          const baseStyle: CSSProperties = {
            position: 'absolute',
            left: element.x,
            top: element.y,
            width: element.width,
            height: element.height,
            transform: `rotate(${element.rotation}deg)`,
            pointerEvents: 'auto',
            opacity: element.visible === false ? 0.4 : 1,
            outline: isSelected
              ? '2px solid rgba(59, 130, 246, 0.8)'
              : '1px solid rgba(148, 163, 184, 0.45)',
            outlineOffset: 0,
            backgroundClip: 'padding-box',
            borderRadius: 4,
            boxShadow: '0 1px 4px rgba(15, 23, 42, 0.45)',
            cursor: interactive ? (element.locked ? 'not-allowed' : 'move') : 'default',
            overflow: 'hidden',
          }

          const handleElementPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
            if (!interactive) {
              return
            }
            event.stopPropagation()
            onSelectElement?.(element.id)
            if (!element.locked) {
              startInteraction(element.id, 'move', event)
            }
          }

          return (
            <div
              key={element.id}
              role="button"
              tabIndex={0}
              onPointerDown={handleElementPointerDown}
              onKeyDown={(event) => {
                if (!interactive) {
                  return
                }
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelectElement?.(element.id)
                }
              }}
              className="select-none"
              style={baseStyle}
            >
              <TemplateElementContent element={element} />
              {interactive && isSelected && !element.locked ? (
                <div
                  role="presentation"
                  className="absolute bottom-0 right-0 h-3 w-3 translate-x-1/2 translate-y-1/2 rounded-full border border-slate-900 bg-primary"
                  style={{ cursor: 'se-resize' }}
                  onPointerDown={(event) => startInteraction(element.id, 'resize', event)}
                />
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default TemplateCanvas
