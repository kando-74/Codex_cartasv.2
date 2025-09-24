import { describe, expect, it } from 'vitest'
import {
  autoMapImportFields,
  convertRecordsToImportedCards,
  parseCsvDataset,
  parseJsonDataset,
  type ImportFieldMapping,
} from '../dataImport'

const createRecord = (rowNumber: number, values: Record<string, unknown>) => ({
  rowNumber,
  values,
})

describe('parseCsvDataset', () => {
  it('interpreta encabezados y valores básicos', () => {
    const csv = `titulo,tipo,valor\nGuerrero,Personaje,3\n`;
    const result = parseCsvDataset(csv)
    expect(result.columns).toEqual(['titulo', 'tipo', 'valor'])
    expect(result.records).toHaveLength(1)
    expect(result.records[0].rowNumber).toBe(2)
    expect(result.records[0].values.titulo).toBe('Guerrero')
    expect(result.records[0].values.valor).toBe('3')
    expect(result.warnings).toHaveLength(0)
  })

  it('detecta delimitadores y preserva valores entrecomillados', () => {
    const csv = 'titulo;descripcion;iconos\n"Espada";"Golpea, ""doble""";fuego,acero\n'
    const result = parseCsvDataset(csv)
    expect(result.columns).toEqual(['titulo', 'descripcion', 'iconos'])
    expect(result.delimiter).toBe(';')
    expect(result.records[0].values.descripcion).toBe('Golpea, "doble"')
    expect(result.records[0].values.iconos).toBe('fuego,acero')
  })
})

describe('parseJsonDataset', () => {
  it('extrae objetos desde un arreglo y reporta descartes', () => {
    const json = JSON.stringify([
      { titulo: 'Mago', descripcion: 'Hechizo básico' },
      'invalido',
      { titulo: 'Arquera', valor: 2 },
    ])
    const result = parseJsonDataset(json)
    expect(result.columns.sort()).toEqual(['descripcion', 'titulo', 'valor'])
    expect(result.records).toHaveLength(2)
    expect(result.records[0].values.titulo).toBe('Mago')
    expect(result.warnings[0]).toContain('Se omitieron 1 registros')
  })
})

describe('autoMapImportFields', () => {
  it('asigna columnas coincidentes con sinónimos', () => {
    const columns = ['Titulo', 'descripcion', 'ICONOS', 'ancho', 'alto']
    const mapping = autoMapImportFields(columns)
    expect(mapping.title).toBe('Titulo')
    expect(mapping.actionDescription).toBe('descripcion')
    expect(mapping.icons).toBe('ICONOS')
    expect(mapping.sizeWidth).toBe('ancho')
    expect(mapping.sizeHeight).toBe('alto')
  })
})

describe('convertRecordsToImportedCards', () => {
  it('convierte registros en cartas normalizadas', () => {
    const mapping: ImportFieldMapping = {
      title: 'titulo',
      actionDescription: 'descripcion',
      icons: 'iconos',
      sizeWidth: 'ancho',
      sizeHeight: 'alto',
    }
    const records = [
      createRecord(2, {
        titulo: 'Invocador',
        descripcion: 'Llama a criaturas de apoyo.',
        iconos: 'fuego, sombra ,  ',
        ancho: '63',
        alto: '88',
      }),
    ]

    const result = convertRecordsToImportedCards(records, mapping, { iconSeparator: ',' })
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].title).toBe('Invocador')
    expect(result.entries[0].icons).toEqual(['fuego', 'sombra'])
    expect(result.entries[0].size?.width).toBe(63)
    expect(result.entries[0].size?.presetId).toBeDefined()
    expect(result.skipped).toBe(0)
  })

  it('reporta advertencias de valores numéricos inválidos', () => {
    const mapping: ImportFieldMapping = {
      id: 'identificador',
      sizeWidth: 'ancho',
      sizeHeight: 'alto',
    }
    const records = [
      createRecord(4, {
        identificador: 'carta_01',
        ancho: 'invalid',
        alto: '120',
      }),
    ]

    const result = convertRecordsToImportedCards(records, mapping)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].size?.height).toBe(120)
    expect(result.entries[0].size?.width).toBeUndefined()
    expect(result.warnings[0]).toContain('Fila 4: el valor de ancho "invalid" no es válido.')
  })

  it('omite filas sin datos relevantes', () => {
    const mapping: ImportFieldMapping = { title: 'titulo' }
    const records = [createRecord(3, { titulo: '  ' }), createRecord(4, { titulo: 'Vigía' })]
    const result = convertRecordsToImportedCards(records, mapping)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].title).toBe('Vigía')
    expect(result.skipped).toBe(1)
  })
})
