import type { CompilerTarget } from "@open-ui-ir/compiler-core";
export interface TuiScreen {
    title: string;
    route: string;
    sections: Array<{
        kind: string;
        id: string;
        data_ref?: string;
        visualization?: string;
    }>;
}
export declare const tuiTarget: CompilerTarget;
//# sourceMappingURL=index.d.ts.map