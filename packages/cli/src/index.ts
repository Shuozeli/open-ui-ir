#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { compileDocument, type CompilerTarget, type Diagnostic, validateDocument } from "@open-ui-ir/compiler-core";
import type { OpenUiDocument } from "@open-ui-ir/protocol";

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

type TargetName = "react-antd" | "react-mantine" | "angular" | "tui";

const targetLoaders: Record<TargetName, () => Promise<CompilerTarget>> = {
  "react-antd": async () => (await import("@open-ui-ir/react-antd")).reactAntdTarget,
  "react-mantine": async () => (await import("@open-ui-ir/react-mantine")).reactMantineTarget,
  angular: async () => (await import("@open-ui-ir/angular")).angularTarget,
  tui: async () => (await import("@open-ui-ir/tui")).tuiTarget,
};

const targetNames = Object.keys(targetLoaders) as TargetName[];

export async function runCli(argv: string[]): Promise<CliResult> {
  const [command, ...rest] = argv;
  try {
    if (command === "validate") return await validateCommand(rest);
    if (command === "compile") return await compileCommand(rest);
    return usage(command === undefined ? undefined : `unknown command: ${command}`);
  } catch (error) {
    return { exitCode: 1, stdout: "", stderr: `${error instanceof Error ? error.message : String(error)}\n` };
  }
}

async function validateCommand(argv: string[]): Promise<CliResult> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      json: { type: "boolean" },
    },
  });
  if (values.help === true) return usage();
  if (positionals.length === 0) return usage("validate requires at least one file");

  const results = await Promise.all(
    positionals.map(async (file) => ({ file, diagnostics: validateDocument(await readDocument(file)) })),
  );
  const diagnostics = results.flatMap((result) =>
    result.diagnostics.map((diagnostic) => ({ file: result.file, ...diagnostic })),
  );
  if (values.json === true) {
    return {
      exitCode: diagnostics.length === 0 ? 0 : 1,
      stdout: `${JSON.stringify({ diagnostics }, null, 2)}\n`,
      stderr: "",
    };
  }
  if (diagnostics.length === 0) {
    return { exitCode: 0, stdout: `${positionals.length} file(s) valid\n`, stderr: "" };
  }
  return { exitCode: 1, stdout: "", stderr: formatDiagnostics(diagnostics) };
}

async function compileCommand(argv: string[]): Promise<CliResult> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      target: { type: "string", short: "t" },
      out: { type: "string", short: "o" },
      json: { type: "boolean" },
    },
  });
  if (values.help === true) return usage();
  if (positionals.length !== 1) return usage("compile requires exactly one file");
  if (values.target === undefined) return usage("compile requires --target");

  const target = await loadTarget(values.target);
  if (target === undefined) return usage(`unknown target: ${values.target}`);

  const output = compileDocument(await readDocument(positionals[0]!), target);
  if (output.diagnostics.length > 0) {
    return { exitCode: 1, stdout: "", stderr: formatDiagnostics(output.diagnostics) };
  }

  if (values.out !== undefined) {
    await Promise.all(
      output.files.map(async (file) => {
        const path = join(resolveInputPath(values.out!), file.path);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, file.content, "utf8");
      }),
    );
    return { exitCode: 0, stdout: `wrote ${output.files.length} file(s) to ${values.out}\n`, stderr: "" };
  }

  if (values.json === true) {
    return { exitCode: 0, stdout: `${JSON.stringify(output.files, null, 2)}\n`, stderr: "" };
  }
  return { exitCode: 0, stdout: output.files.map((file) => `# ${file.path}\n${file.content}`).join("\n"), stderr: "" };
}

async function readDocument(file: string): Promise<OpenUiDocument> {
  return JSON.parse(await readFile(resolveInputPath(file), "utf8")) as OpenUiDocument;
}

function resolveInputPath(path: string): string {
  return isAbsolute(path) ? path : resolve(process.env.INIT_CWD ?? process.cwd(), path);
}

function formatDiagnostics(diagnostics: Array<Diagnostic & { file?: string }>): string {
  return diagnostics
    .map((diagnostic) => {
      const file = diagnostic.file === undefined ? "" : `${diagnostic.file}:`;
      return `${file}${diagnostic.path} ${diagnostic.severity} ${diagnostic.code}: ${diagnostic.message}`;
    })
    .join("\n")
    .concat("\n");
}

async function loadTarget(name: string): Promise<CompilerTarget | undefined> {
  if (!isTargetName(name)) return undefined;
  return targetLoaders[name]();
}

function isTargetName(name: string): name is TargetName {
  return targetNames.includes(name as TargetName);
}

function usage(error?: string): CliResult {
  const text = `Usage:
  open-ui-ir validate [--json] <file...>
  open-ui-ir compile --target <${targetNames.join("|")}> [--out <dir>] [--json] <file>
`;
  return {
    exitCode: error === undefined ? 0 : 1,
    stdout: error === undefined ? text : "",
    stderr: error === undefined ? "" : `${error}\n\n${text}`,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runCli(process.argv.slice(2));
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}
