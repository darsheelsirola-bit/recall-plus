import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as router from 'react-router-dom'

const packageMetadata = JSON.parse(
  await readFile(new URL('../node_modules/react-router-dom/package.json', import.meta.url), 'utf8'),
)
assert.equal(packageMetadata.version, '7.18.1', 'react-router-dom must stay pinned to the reviewed version')

const requiredExports = [
  'BrowserRouter',
  'Link',
  'MemoryRouter',
  'Navigate',
  'NavLink',
  'Route',
  'Routes',
  'matchRoutes',
  'useLocation',
  'useNavigate',
]
for (const exportName of requiredExports) {
  assert.ok(router[exportName], `react-router-dom must export ${exportName}`)
}

const matches = router.matchRoutes(
  [{ path: '/quiz/results/:resultId' }],
  '/quiz/results/router-compatibility-probe',
)
assert.equal(matches?.[0]?.params?.resultId, 'router-compatibility-probe')

const markup = renderToStaticMarkup(
  createElement(
    router.MemoryRouter,
    { initialEntries: ['/dashboard'] },
    createElement(
      router.Routes,
      null,
      createElement(router.Route, {
        path: '/dashboard',
        element: createElement('span', null, 'router-compatible'),
      }),
    ),
  ),
)
assert.match(markup, /router-compatible/)

console.log('React Router compatibility passed: 7.18.1 exports and declarative SPA matching/rendering are available.')
