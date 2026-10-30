# 项目状态 / 交接记录

- **交接编号：** HO-2026-10-30-002
- **上一编号：** HO-2026-10-30-001（本文件已取代其内容）
- **更新时间：** 2026-10-30（本机 UTC+8）
- **交接状态：** 材料已核对（**仅保存**；未新建接手任务、未发起接续）
- **工作目录（项目根）：** `/home/zuoye/开发/dsh-session-turn-eta`
- **远端：** `git@github.com:778672151/dsh-session-turn-eta.git`（分支 `main`）

---

## 1. 任务与版本

**目标：** 为 DSH 做「当前这一轮任务的进度条 + 预计剩余时间」插件，已按 awesome-dsh-plugin 规范发布到插件市场（PR #5092 已合并，**不要再提 PR**）。

**当前版本：`0.4.1`**，目标桌面端 **`0.2.1-rc.5`**。

用户最近一次口径（按优先级）：
1. **适配最新桌面端 `0.2.1-rc.5`** —— **已完成**（见 §3.1）
2. 推到仓库 —— **已完成**（0.4.0 已推；0.4.1 见 §7）
3. 优化实现逻辑、为未来整合进自有 agent 做准备 —— **已完成两阶段**（见 §3.2、§3.3），后续可继续

## 2. 桌面端事实（核对过）

- 安装目录：`C:/Users/zuoye/AppData/Local/Programs/DeepSeek-Harness/`（**目录名带空格**；WSL 内先 `ln -sfn` 再访问，否则 bash 拆词）
- `resources/runtime/primary-runtime/runtime.json` → `desktopVersion: 0.2.1-rc.5`，node 24.21.0，pnpm 11.28.5
- `app.asar` 只是 Electron 外壳，**不带** `dsh-client-*` 契约包；契约从 npm registry 取（`dsh-client-ui-slots` / `dsh-client-locale` / `dsh-client-ui-conversation` / `dsh-session` / `dsh-session-projection` 等 0.2.1-rc.5）
- WSL 内**没有** `dsh` CLI；桌面 profile 在 `C:/Users/zuoye/.dsh/profiles/desktop`，其中**没有装本插件**

## 3. 改动（0.3.0 → 0.4.1）

### 3.1 兼容 0.2.1-rc.5（→ 0.4.0）

- `package.json`：`dsh.manifestVersion: 1`、`engines.node >= 22`；peerDeps 改为 `cordis >=4.0.5 <5`、`dsh-session ^0.2.1-rc.1`、`dsh-session-projection ^0.2.1-rc.1`，客户端两个包（`dsh-client-ui-conversation` / `dsh-client-locale`）列为 `optional` peer
- `ProjectionDefinition.init(header, inheritedEventCount)` 改成两参（契约变更）
- `src/client/chat/TurnProgress.tsx` 不再自引用包名取类型（改为 `../../types.ts`）；`src/client/index.ts` 加 type-only 空导入让 `declare module` 可见
- 新增 `tsconfig.client.json`（客户端半独立类型检查，`exclude: []` 必须写，否则继承 host 的 `exclude: [src/client]`）与 `src/client/css.d.ts`；`npm run typecheck` = 双半 tsc

### 3.2 实现逻辑优化一："One fold, not two"（→ 0.4.0）

- **删掉 `src/eta.ts` 的 `TurnEtaModel`**：它自己 fold 一遍 session 事件，和 projection 的 fold 重复
- `turn-eta/update` / `turn-eta/complete` 改为由 `ctx.sessionProjections.onChanged` 驱动，只挂一条 change feed
- 抽出可嵌入原语：`etaCore()` + `ETA_TUNING` + `createTurnEtaFold(seed?)` + `emptyTurnEtaState()` / `turnEtaProjectionDefinition`，`createTurnEtaFold` 不依赖 Cordis，可被自有 agent 直接驱动（见 README `## Embedding the estimator`）
- `state()` 可取快照、JSON 往返后 `createTurnEtaFold(state)` 续跑，不用重放日志

### 3.3 实现逻辑优化二：热路径 O(1) 摊还（→ 0.4.1）

原来每次预测都全量排序 + winsorize 扫描，session 成本对步数是二次的。改动（`src/predict.ts` / `src/projection.ts`）：

- `withSample(samples, value)` 增量维护升序副本，按新列表引用 memo（排序每步只付一次）
- `rateProfile(samples)` 缓存 0.9 / 0.25 / 0.75 三个分位（消息/tool 事件不改样本，原来却每次重算）
- `robustQuantile` 去掉 `map` 造数组，改为两端点取 `min(value, cap)` 后插值
- `expectedTotalSteps` 的 `>= completedSteps` 中位数改用 `lowerBound` 二分 + 索引读，不再 filter + 重排
- `computeView` 复用 `advanceOpen` 已算过的 core（把 own total 喂回 `etaCore` 幂等，第二次纯浪费）
- 导出面扩到 `median / quantile / robustQuantile / ascending / expectedTotalSteps / insertSorted / withSample`

实测（`npm run bench`，只测 fold，warmup 后计时）：12,864 事件 / 8 轮 × 50 步，**~9.5k → ~245k events/s**；80 轮 32,160 事件仍 ~150k events/s（成本对历史规模基本平坦）。

## 4. 验证状态（0.4.1 全绿）

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 构建 | `node node_modules/.bin/tsdown` | 通过（host + client 各 1 次 Build complete）|
| 主机侧类型 | `tsc -p tsconfig.json --noEmit` | exit 0 |
| 客户端类型 | `tsc -p tsconfig.client.json --noEmit` | exit 0 |
| smoke | `node test/smoke.mjs` | 11 条 ALL PASS |
| 预测不变量 | `node test/predict.mjs` | 13 条 ALL PASS |
| 独立 fold | `node test/fold.mjs` | 5 条 ALL PASS |
| 原语等价 | `node test/equiv.mjs` | ALL PASS（9300 equivalence checks）|
| SSR 渲染 | `node test/render-real.mjs` | 5 条 ALL PASS（需 checkout 的 react 18.3.1）|
| 皮肤/CSS | `node test/skin.mjs` | 7 条 ALL PASS |
| 打包 | `npm pack --dry-run` | 8 个文件 |

**真机集成：** 已用**真实 0.2.1-rc.5 注册表**（`/tmp/eta-it` `npm i` 装出的完整依赖树）跑过探针 `/tmp/eta-it/it.mjs`：`new Context()` + `ctx.plugin(SessionProjectionRegistry)` + 本插件 `apply`，7 个事件 → 6 条 `turn-eta/update` + 1 条 `turn-eta/complete`，`snapshot(s,['turnEta'])` 返回闭轮视图，字段与预期一致。

**未验证：** 没有在真实桌面端 GUI 里加载显示（WSL 无 `dsh` CLI；插件未装进桌面 profile）。

## 5. 构建环境

- `scripts/build.sh`：读 `DSH_CONTRACT_DIR`（候选 `$HOME/.dsh/contracts/0.2.1-rc.5`、`/tmp/eta-types/node_modules`）把 0.2.1-rc.5 的 `@deepseek-ai/*` link 进 `node_modules`；`DSH_REACT_TYPES` 指向含 `react/` 的 `@types` 目录
- 本机实测可用：`DSH_REACT_TYPES=/home/zuoye/开发/deepseek-harness/node_modules/.pnpm/@types+react@18.3.31/node_modules/@types bash scripts/build.sh`
- 教训：`/tmp/eta-types/node_modules`（tarball 解包树）**不能直接 import**，只有 `npm i` 装出的完整依赖树能跑（缺 `@deepseek-ai/dsh-scope` 等传递依赖）

## 6. 下一步（未开始）

1. 在真实桌面端 GUI 里加载验证（需要在 Windows 侧装包 / 复制 profile 试装）
2. 把 `createTurnEtaFold` 接进自有 agent 时，注意 `ETA_TUNING.BOOTSTRAP_EXPECTED_STEPS`（首轮无历史按 10 步估）是否合适
3. 可选算法复标：`RATE_PERCENTILE` 0.9 与 `REANCHOR_AT` 0.5 是用 0.3.0 的样本调出来的，样本变了可复测
4. WeakMap memo 以列表引用为键，live fold 每次追加换新引用（正确）；但**重放同一不可变日志两次**会各建一份 memo，属可接受开销

## 7. 0.4.1 发布

- 改动文件：`src/predict.ts`、`src/projection.ts`、`src/index.ts`、`lib/index.js(.map)`、`package.json`、`README.md`（新增 `## Cost`）、`CHANGELOG.md`（新增 `## 0.4.1`）、`PROJECT_STATE.md`、新增 `test/equiv.mjs`、`bench/bench.mjs`、`bench/scale.mjs`
- `.gitignore` 仍只有 `node_modules/`、`*.tgz`、`*.log`（bench/ 与 HANDOFF_PROMPT.md / PROJECT_STATE.md 一并入库）
