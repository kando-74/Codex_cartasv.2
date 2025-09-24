import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ErrorBoundary from '../ErrorBoundary'

describe('ErrorBoundary', () => {
  const originalLocation = window.location
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    Object.defineProperty(window, 'location', {
      value: {
        ...originalLocation,
        reload: vi.fn(),
      },
      writable: true,
    })
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
    Object.defineProperty(window, 'location', { value: originalLocation })
  })

  it('renderiza los hijos cuando no hay errores', () => {
    render(
      <ErrorBoundary>
        <div>Contenido seguro</div>
      </ErrorBoundary>,
    )

    expect(screen.getByText('Contenido seguro')).toBeInTheDocument()
  })

  it('muestra el fallback y permite recargar cuando hay un error', async () => {
    const ThrowingComponent = () => {
      throw new Error('boom')
    }

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    )

    expect(
      screen.getByText('Algo no funcionó como esperábamos'),
    ).toBeInTheDocument()

    const reloadButton = screen.getByRole('button', { name: /recargar/i })
    await userEvent.click(reloadButton)

    expect(window.location.reload).toHaveBeenCalledTimes(1)
  })
})
