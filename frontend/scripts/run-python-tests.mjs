import { spawnSync } from "node:child_process";

const configured = process.env.PYTHON ? [[process.env.PYTHON, []]] : [];
const candidates = process.platform === "win32"
  ? [...configured, ["py", ["-3"]], ["python", []]]
  : [...configured, ["python3", []], ["python", []]];

for (const [command, prefix] of candidates) {
  const result = spawnSync(command, [...prefix, "-m", "unittest", "python_tests/test_run_python.py"], {
    cwd: process.cwd(),
    stdio: "inherit",
  });
  if (result.error?.code === "ENOENT") continue;
  process.exit(result.status ?? 1);
}

console.error("Python was not found. Set PYTHON to a Python 3 executable and rerun npm test.");
process.exit(1);
