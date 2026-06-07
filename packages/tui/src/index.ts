import type { CompileContext, CompileOutput, CompilerTarget } from "@open-ui-ir/compiler-core";

export interface TuiScreen {
  title: string;
  route: string;
  sections: Array<{ kind: string; id: string; data_ref?: string }>;
}

export const tuiTarget: CompilerTarget = {
  name: "tui",
  compile(context: CompileContext): CompileOutput {
    const screens: TuiScreen[] = context.document.routes.map((route) => ({
      title: route.title,
      route: route.route,
      sections: route.components.map((component) => ({
        kind: component.kind,
        id: component.id,
        ...(component.data_ref !== undefined ? { data_ref: component.data_ref } : {}),
      })),
    }));

    return {
      target: "tui",
      diagnostics: [],
      files: [
        {
          path: "tui/screens.json",
          content: `${JSON.stringify({ app: context.document.app_name, screens }, null, 2)}\n`,
        },
      ],
    };
  },
};
