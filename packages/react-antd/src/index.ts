import type { CompileContext, CompileOutput, CompilerTarget } from "@open-ui-ir/compiler-core";

export const reactAntdTarget: CompilerTarget = {
  name: "react-antd",
  compile(context: CompileContext): CompileOutput {
    return {
      target: "react-antd",
      diagnostics: [],
      files: context.document.routes.map((route) => ({
        path: routeToFile(route.route, ".tsx"),
        content: compileRoute(route.title),
      })),
    };
  },
};

function compileRoute(title: string): string {
  return `import { Card, Table, Typography } from "antd";

export function GeneratedPage({ rows = [], loading = false }: { rows?: unknown[]; loading?: boolean }) {
  return (
    <div style={{ padding: 24 }}>
      <Typography.Title level={3}>${escapeText(title)}</Typography.Title>
      <Card size="small">
        <Table rowKey="name" dataSource={rows} loading={loading} pagination={false} />
      </Card>
    </div>
  );
}
`;
}

function routeToFile(route: string, suffix: string): string {
  const slug = route.replace(/^\/+/, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `react-antd/${slug || "index"}${suffix}`;
}

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");
}
