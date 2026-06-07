export const tuiTarget = {
    name: "tui",
    compile(context) {
        const screens = context.document.routes.map((route) => ({
            title: route.title,
            route: route.route,
            sections: route.components.map((component) => ({
                kind: component.kind,
                id: component.id,
                ...(component.data_ref !== undefined ? { data_ref: component.data_ref } : {}),
                ...(component.kind === "chart" ? { visualization: readChartKind(component.props) } : {}),
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
function readChartKind(props) {
    const chart = "chart" in props ? props.chart : undefined;
    if (chart && typeof chart === "object" && "kind" in chart) {
        return String(chart.kind);
    }
    return "unknown";
}
//# sourceMappingURL=index.js.map