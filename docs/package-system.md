# Package System

Open UI IR is split into small packages so applications only load the renderer
stack they choose. A Mantine frontend should not import Ant Design packages, and
an Ant Design frontend should not import Mantine packages.

## Package Layers

| Layer | Packages | Runtime Dependency Policy |
|-------|----------|---------------------------|
| Protocol | `@open-ui-ir/protocol` | No UI framework dependencies. |
| Compiler core | `@open-ui-ir/compiler-core` | No UI framework dependencies. |
| React AntD target | `@open-ui-ir/react-antd` | Peer depends on `antd`, `@ant-design/charts`, and `react`. |
| React Mantine target | `@open-ui-ir/react-mantine` | Peer depends on `@mantine/core`, `@mantine/charts`, `react`, and `react-dom`. |
| Other targets | `@open-ui-ir/angular`, `@open-ui-ir/tui` | Own only their target-specific peers. |
| Tools | `@open-ui-ir/cli`, `@open-ui-ir/demo-suite` | May aggregate targets because they are not shipped as frontend renderer bundles. |

## Frontend Rule

Frontend applications should depend on exactly one concrete renderer package for
their UI library:

```json
{
  "dependencies": {
    "@open-ui-ir/protocol": "^0.1.0",
    "@open-ui-ir/react-mantine": "^0.1.0",
    "@mantine/core": "^7.0.0",
    "@mantine/charts": "^7.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  }
}
```

or:

```json
{
  "dependencies": {
    "@open-ui-ir/protocol": "^0.1.0",
    "@open-ui-ir/react-antd": "^0.1.0",
    "antd": "^5.0.0",
    "@ant-design/charts": "^2.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  }
}
```

Do not import a shared React renderer barrel that re-exports both AntD and
Mantine targets. Such a barrel would make bundlers see both UI libraries and can
pull both into the frontend graph.

## Tooling Rule

Tooling packages can know about multiple targets, but they should lazy-load the
selected target. The CLI follows this rule: `open-ui-ir compile --target
react-mantine` dynamically imports only `@open-ui-ir/react-mantine`; `--target
react-antd` dynamically imports only `@open-ui-ir/react-antd`.

This keeps command startup and future bundled CLI builds from eagerly loading
every target adapter.

## Adding a New UI Package

1. Create a dedicated package, for example `@open-ui-ir/react-chakra`.
2. Keep `@open-ui-ir/protocol` and `@open-ui-ir/compiler-core` as the only
   Open UI runtime dependencies.
3. Put UI libraries in `peerDependencies`, not regular `dependencies`.
4. Export the target from that package only.
5. Add a lazy CLI loader for the new target.
6. Add demo-suite coverage so examples compile to the new target.

The invariant is that choosing one frontend target should only require that
target's UI library peers.
