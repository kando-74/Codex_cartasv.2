export {}

declare global {
  const describe: (...args: any[]) => void
  const it: (...args: any[]) => void
  const test: (...args: any[]) => void
  const expect: (...args: any[]) => any
  const beforeEach: (...args: any[]) => void
  const afterEach: (...args: any[]) => void
  const beforeAll: (...args: any[]) => void
  const afterAll: (...args: any[]) => void
  const vi: any
}
