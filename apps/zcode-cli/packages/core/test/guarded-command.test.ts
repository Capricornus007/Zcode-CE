import assert from "node:assert/strict";
import test from "node:test";
import { analyzeBashCommand } from "../src/tool/handlers/bash-command-parser.js";
import { matchDangerousCommand } from "../src/tool/handlers/guarded/command.js";
import { optionTable, parseOptions } from "../src/tool/handlers/guarded/options.js";

/**
 * F3（170）：guarded 模式危险命令匹配器的纯函数判定。
 *
 * 判据来自上游 tests/guarded-command.test.ts 与 guarded-deletion-oracle.mjs 的核心 case
 * （上游为 vitest + 行为 oracle，CE 移植为 node:test 纯函数断言——运行环境不保证有 cmd.exe，
 * 行为 oracle 的 Windows 部分以 cmd dialect 的 matcher 断言代替）。
 *
 * 运行：cd apps/zcode-cli/packages/core && node --import tsx --test test/guarded-command.test.ts
 */

function expectMatch(command: string, dialect: "posix" | "git-bash" | "cmd", ruleId: string) {
  const result = matchDangerousCommand(command, dialect);
  assert.equal(result.status, "matched", command);
  if (result.status === "matched") {
    assert.equal(result.ruleId, `safety.bash.${ruleId}`, command);
  }
}

function expectNotMatched(command: string, dialect: "posix" | "git-bash" | "cmd" = "posix") {
  // 上游契约是「不等于 matched」：跨 dialect（git-bash/cmd 的 glob 处理不同）
  // 允许 notMatched 或 unsupported，只要不产生危险判定即可。
  assert.notEqual(matchDangerousCommand(command, dialect).status, "matched", command);
}

function expectExactlyNotMatched(command: string, dialect: "posix" | "git-bash" | "cmd" = "posix") {
  assert.equal(matchDangerousCommand(command, dialect).status, "notMatched", command);
}

function expectUnsupported(command: string, dialect: "posix" | "git-bash" | "cmd" = "posix") {
  assert.equal(matchDangerousCommand(command, dialect).status, "unsupported", command);
}

// ── A1/A2/A4：核心命中表 ────────────────────────────────────────────────

test("A1 remove-critical-path：rm 递归强删命中", () => {
  for (const command of [
    "rm -rf build",
    "rm -f -R build",
    "rm --recursive --force build",
    "rm -rf \"$target\"",
    "rm -rf -- -i",
    "rm -rfi build",
  ]) {
    expectMatch(command, "posix", "remove-critical-path");
  }
});

test("A2 system-storage：块设备与文件系统命令命中", () => {
  for (const command of ["dd if=in of=out", "mount /dev/disk /mnt", "umount /mnt", "mkfs /dev/disk", "mkfs.ext4 /dev/disk"]) {
    expectMatch(command, "posix", "system-storage");
  }
});

test("A2 git 三件套：reset --hard / clean -fd / push --force 命中", () => {
  for (const command of ["git reset --hard", "git -C repo reset --hard HEAD", "git --git-dir=repo reset --hard"]) {
    expectMatch(command, "posix", "git-reset-hard");
  }
  for (const command of ["git clean -fd", "git clean -dfx", "git clean -f file", "git clean -f -- --dry-run"]) {
    expectMatch(command, "posix", "git-clean-force");
  }
  for (const command of [
    "git push -f origin main",
    "git push --force-with-lease",
    "git push --mirror",
    "git push origin +HEAD:main",
    "git push --force origin 'refs/heads/*:refs/heads/*'",
    "git push --force --no-dry-run",
  ]) {
    expectMatch(command, "posix", "git-push-force");
  }
});

test("A2 其余 git 规则：discard-tree / stash-clear / worktree 命中", () => {
  for (const command of ["git checkout -f main", "git checkout HEAD -- .", "git restore .", "git restore --staged --worktree ./", "git restore --source=HEAD :/"]) {
    expectMatch(command, "posix", "git-discard-tree");
  }
  expectMatch("git stash clear", "posix", "git-stash-clear");
  for (const command of ["git worktree remove -ff path", "git worktree remove --force path"]) {
    expectMatch(command, "posix", "git-worktree-force-remove");
  }
});

test("rsync --delete 家族命中", () => {
  for (const command of [
    "rsync -a --delete src/ dest/",
    "rsync --del src/ dest/",
    "rsync --delete-before src/ dest/",
    "rsync --delete-during src/ dest/",
    "rsync --delete-delay src/ dest/",
    "rsync --delete-after src/ dest/",
    "rsync --delete-excluded src/ dest/",
  ]) {
    expectMatch(command, "posix", "rsync-delete");
  }
});

// ── A4：wrapper 链（env / time / sudo / 管道 / 分号）解开后仍命中 ────────

test("A4 wrapper 链：env / time / sudo / 复合结构 解包后仍命中", () => {
  for (const command of [
    "env A=b rm -rf build",
    "env -u A rm -rf build",
    "time -o file rm -rf build",
    "/usr/bin/time --output=file rm -rf build",
    "sudo -u root rm -rf build",
    "env -C repo time -f '%e' sudo --user=root rm -rf build",
    "echo hello; rm -rf build",
    "false || rm -rf build",
    "true && rm -rf build",
    "echo hi | rm -rf build",
    '"/bin/rm" -rf build',
    "r\\m -rf build",
    "for x in a; do echo hi; done; rm -rf build",
  ]) {
    expectMatch(command, "posix", "remove-critical-path");
  }
});

// ── A3：无害命令不命中（不产生确认噪声） ────────────────────────────────

test("A3 安全形态不命中：不会凭空造出删除效果", () => {
  for (const command of [
    "rm -f file",
    "rm -- -rf",
    "rm --help",
    "rm --version",
    "mount",
    "dd --help",
    "mkfs --help",
    "git reset --soft HEAD",
    "git reset -- --hard",
    "git clean -nfd",
    "git clean -fd --dry-run",
    "git push -nf",
    "git push --force --no-force",
    "git push --force-if-includes",
    "git push --mirror --no-mirror",
    "git push --repo +not-a-refspec",
    "git push --push-option=--force",
    "git restore --staged .",
    "git restore file",
    "git checkout -b branch",
    "git stash drop",
    "git worktree remove path",
    "rsync --delete -n src/ dest/",
    "echo 'rm -rf build'",
    "echo hi # rm -rf build",
    "echo hi > 'rm -rf build'",
    "time -o 'rm -rf build' echo ok",
    "sudo -u rm echo -rf build",
    "env A='rm -rf build' echo ok",
  ]) {
    expectNotMatched(command);
  }
});

test("force refspec 边界：跨 dialect 一致", () => {
  for (const dialect of ["posix", "git-bash", "cmd"] as const) {
    for (const command of [
      "git push origin +refs/heads/*:refs/heads/*",
      'git push origin "+refs/heads/*:refs/heads/*"',
      'git push origin "+main"',
      'git push --force origin "refs/heads/*:refs/heads/*"',
      "git push --repo origin +refs/heads/*:refs/heads/*",
    ]) {
      expectMatch(command, dialect, "git-push-force");
    }
    for (const command of [
      "git push --dry-run origin +refs/heads/*:refs/heads/*",
      "git push -n origin +refs/heads/*:refs/heads/*",
      "git push origin refs/heads/*:refs/heads/*",
      'git push --push-option "+refs/heads/*:refs/heads/*" origin main',
      'git push --repo "+refs/heads/*:refs/heads/*" main',
      'git push "+refs/heads/*:refs/heads/*" main',
    ]) {
      expectNotMatched(command, dialect);
    }
  }
});

test("豁免词与取值/取消的边界保持区分", () => {
  const cases: Array<[string, string, string]> = [
    ["git clean -fd -e --dry-run", "git clean -fd --dry-run", "git-clean-force"],
    ["git clean -nfd --no-dry-run", "git clean -fd --no-dry-run -n", "git-clean-force"],
    ["git push -f --push-option --dry-run", "git push -f --dry-run", "git-push-force"],
    ["git push -nf --no-dry-run", "git push -f --no-dry-run -n", "git-push-force"],
    ["git push --mirror --no-force", "git push --mirror --no-mirror", "git-push-force"],
    ["rsync --delete --exclude --help src/ dest/", "rsync --delete --help", "rsync-delete"],
    ["rsync --delete --filter --dry-run src/ dest/", "rsync --delete -n src/ dest/", "rsync-delete"],
  ];
  for (const [dangerous, exempt, rule] of cases) {
    expectMatch(dangerous, "posix", rule);
    expectExactlyNotMatched(exempt);
  }
});

// ── A5：unsupported 语义（无法判定危险时不假装判定） ────────────────────

test("A5 unsupported 边界：解释器 / 动态词 / 未闭合 / 超长 / legacy-shell", () => {
  for (const command of [
    "bash -c 'rm -rf build'",
    "powershell -Command 'rm -rf build'",
    "eval 'rm -rf build'",
    "$exe -rf build",
    "git -c alias.wipe='reset --hard' wipe",
    "env -S 'rm -rf build'",
    "time --unknown rm -rf build",
    "for x in a; do rm -rf build; done",
    "rm 'unterminated",
    "x".repeat(10_001),
  ]) {
    expectUnsupported(command);
  }
  // legacy-shell dialect 一律 unsupported（基础设施状态不能静默退回 YOLO 判定）
  expectUnsupported("rm -rf build", "legacy-shell");
});

test("未知选项不消费下一个词、不进入 flags（interspersed 扫描）", () => {
  const words = analyzeBashCommand("rm --unknown -rf target").commands[0]!.words.slice(1);
  const parsed = parseOptions(words, optionTable("-r -f"), {
    ordering: "interspersed",
    unknown: "continue",
  });
  assert.equal(parsed.unsupported, true);
  assert.deepEqual(parsed.flags, ["-r", "-f"]);
  assert.deepEqual(
    parsed.operands.map((word) => word.value),
    ["target"],
  );
});

test("已识别的危险选项不因同命令内的未知选项失效（存在性规则）", () => {
  const cases: Array<[string, string]> = [
    ["rm -rfx build", "remove-critical-path"],
    ["rm -rf -W build", "remove-critical-path"],
    ["rm -rf --totally-unknown build", "remove-critical-path"],
    ["rsync -a --delete --info=progress2 src/ dest/", "rsync-delete"],
    ["rsync --unknown-flag --delete src/ dest/", "rsync-delete"],
    ["git push --force --no-verify origin main", "git-push-force"],
    ["git -c core.pager=cat reset --hard HEAD~1", "git-reset-hard"],
    ["git --exec-path=/opt/git reset --hard", "git-reset-hard"],
    ["git checkout -f -t origin/main", "git-discard-tree"],
    ["git stash clear --totally-unknown", "git-stash-clear"],
    ["git worktree remove --force --totally-unknown path", "git-worktree-force-remove"],
  ];
  for (const [command, rule] of cases) {
    expectMatch(command, "posix", rule);
  }
  for (const command of [
    "rm --totally-unknown build",
    "rsync --unknown-flag src/ dest/",
    "git push --totally-unknown origin main",
    "git reset --totally-unknown",
  ]) {
    expectUnsupported(command);
  }
});

// ── A6：Windows dialect（cmd） ─────────────────────────────────────────

test("A6 cmd dialect：rd / del / robocopy / 重定向 保持判定", () => {
  expectMatch("rd /s /q target", "cmd", "cmd-remove-tree");
  expectMatch("rd /s/q target", "cmd", "cmd-remove-tree");
  expectMatch("rd target/s/q", "cmd", "cmd-remove-tree");
  expectMatch("rd/s/q target", "cmd", "cmd-remove-tree");
  expectMatch("del/q target\\one.txt", "cmd", "cmd-delete-files");
  expectMatch("robocopy /MIR a b", "cmd", "robocopy-delete");
  // CMD 尾随重定向目标不改变命中
  for (const command of [
    "git reset --hard 2>nul",
    "git reset --hard > out.txt",
    "git reset --hard >> out.txt",
    "git push --force origin main 2>nul",
    "rm -rf build 2>nul",
    "rm -rf build 2> nul",
  ]) {
    assert.equal(matchDangerousCommand(command, "cmd").status, "matched", command);
  }
});
