/**
 * Architecture boundaries from the NKSquared Portfolio Blueprint.
 * `npm run check:boundaries` fails the build when any of these are broken.
 */
module.exports = {
  forbidden: [
    {
      name: 'module-public-interface-only',
      comment: 'A module may use another module only through that module\'s index.ts.',
      severity: 'error',
      from: { path: '^server/src/modules/([^/]+)/' },
      to: {
        path: '^server/src/modules/[^/]+/',
        pathNot: ['^server/src/modules/$1/', '^server/src/modules/[^/]+/index\\.ts$'],
      },
    },
    {
      name: 'controllers-never-touch-repositories',
      comment: 'Controllers validate input and call a service. Only services use repositories.',
      severity: 'error',
      from: { path: '\\.controller\\.ts$' },
      to: { path: '\\.repository\\.ts$' },
    },
    {
      name: 'shared-kernel-imports-nothing',
      comment: 'The shared kernel is pure functions: no modules, no database, no HTTP.',
      severity: 'error',
      from: { path: '^server/src/shared/' },
      to: { path: '^(server/src/(modules|database|common)/|node_modules/(@nestjs|pg|express))' },
    },
    {
      name: 'common-does-not-know-modules',
      severity: 'error',
      from: { path: '^server/src/common/' },
      to: { path: '^server/src/modules/' },
    },
    {
      name: 'web-never-imports-server',
      comment: 'The View talks to the server only over HTTP through web/lib/api.ts.',
      severity: 'error',
      from: { path: '^web/' },
      to: { path: '^server/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    exclude: { path: '(\\.next|/out/|/dist/)' },
  },
};
