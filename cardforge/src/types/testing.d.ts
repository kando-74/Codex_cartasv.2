export {}

type VitestImport = typeof import('vitest')

declare global {
  const describe: VitestImport['describe']
  const it: VitestImport['it']
  const test: VitestImport['test']
  const expect: VitestImport['expect']
  const beforeEach: VitestImport['beforeEach']
  const afterEach: VitestImport['afterEach']
  const beforeAll: VitestImport['beforeAll']
  const afterAll: VitestImport['afterAll']
  const vi: VitestImport['vi']
}
