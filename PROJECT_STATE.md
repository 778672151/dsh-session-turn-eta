# 项目状态 / 交接记录

- **交接编号：** HO-2026-10-30-001
- **上一编号：** HO-2026-10-06-001（本文件已取代其内容）
- **更新时间：** 2026-10-30（本机 UTC+8）
- **交接状态：** 材料已核对（**仅保存**；未新建接手任务、未发起接续）
- **工作目录（项目根）：** `/home/zuoye/开发/dsh-session-turn-eta`
- **远端：** `git@github.com:778672151/dsh-session-turn-eta.git`（分支 `main`）

---

## 1. 任务与版本

**目标：** 为 DSH 做「当前这一轮任务的进度条 + 预计剩余时间」插件，已按 awesome-dsh-plugin 规范发布到插件市场（PR #5092 已合并，**不要再提 PR**）。

**当前版本：`0.4.0`**，目标桌面端 **`0.2.1-rc.5`**。

用户最近一次口径（按优先级）：
1. **适配最新桌面端 `0.2.1-rc.5`** —— **已完成**（见 §3）
2. 推到仓库 —— **已完成**
3. 优化实现逻辑、为未来整合进自有 agent 做准备 —— **已完成第一阶段**（见 §3.2），后续可继续

## 2. 桌面端事实（核对过）

- 安装目录：`C:/Users/zuoye/AppData/Local/Programs/DeepSeek-Harness/`（**目录名带空格**；WSL 内先 `ln -sfn` 再访问，否则 bash 拆词）
- `resources/runtime/primary-runtime/runtime.json` → `desktopVersion: 0.2.1-rc.5`，node 24.21.0，pnpm 11.28.5
- `app.asar` 只是 Electron 外壳，**不带** `dsh-client-*` 契约包；契约从 npm registry 取（`dsh-client-ui-slots` / `dsh-client-locale` / `dsh-client-ui-conversation` / `dsh-session` / `dsh-session-projection` 等 0.2.1-rc.5）
- WSL 内**没有** `dsh` CLI

## 3. 本次改动（0.3.0 → 0.4.0）

### 3.1 兼容 0.2.1-rc.5

- `package.json`：`dsh.manifestVersion: 1`、`engines.node >= 22`；peerDeps 改为 `cordis >=4.0.5 <5`、`dsh-session ^0.2.1-rc.1`、`dsh-session-projection ^0.2.1-rc.1`，客户端两个包（`dsh-client-ui-conversation` / `dsh-client-locale`）列为 `optional` peer
- `ProjectionDefinition.init(header, inheritedEventCount)` 改成两参（契约变更）
- `src/client/chat/TurnProgress.tsx` 不再自引用包名取类型（改为 `../../types.ts`）；`src/client/index.ts` 加 type-only 空导入让 `declare module` 可见
- 新增 `tsconfig.client.json`（客户端半独立类型检查）与 `src/client/css.d.ts`；`npm run typecheck` = 双半 tsc

### 3.2 实现逻辑优化："One fold, not two"

- **删掉 `src/eta.ts` 的 `TurnEtaModel`**：它自己 fold 一遍 session 事件，和 projection 的 fold 重复
- `turn-eta/update` / `turn-eta/complete` 改为由 `ctx.sessionProjections.onChanged` 驱动，只挂一条 change feed
- 抽出可嵌入原语：`etaCore()` + `ETA_TUNING` + `createTurnEtaFold(seed?)` + `emptyTurnEtaState()` / `turnEtaProjectionDefinition`，`createTurnEtaFold` 不依赖 Cordis，可被自有 agent 直接驱动（见 README `## Embedding the estimator`）
- `state()` 可取快照、JSON 往返后 `createTurnEtaFold(state)` 续跑，不用重放日志

## 4. 验证状态

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 构建 | `node node_modules/.bin/tsdown` | 通过（`lib/index.js` ≈17.3 kB、`lib/client.js` 17.34 kB）|
| 主机侧类型 | `tsc -p tsconfig.json --noEmit` | exit 0 |
| 客户端类型 | `tsc -p tsconfig.client.json --noEmit` | exit 0 |
| smoke | `node test/smoke.mjs` | 11 条 ALL PASS |
| 预测不变量 | `node test/predict.mjs` | 13 条 ALL PASS |
| 独立 fold | `node test/fold.mjs` | 5 条 ALL PASS |
| SSR 渲染 | `node test/render-real.mjs` | 5 条 ALL PASS（需 checkout 的 react 18.3.1）|
| 皮肤/CSS | `node test/skin.mjs` | 7 条 ALL PASS |

**未验证：** 没有在真实桌面端里加载运行（WSL 无 dsh CLI；桌面端在 Windows 侧）。`npm pack` dry-run 已确认产物 8 个文件 28.9 kB。

## 5. 构建环境

- `scripts/build.sh`：读 `DSH_CONTRACT_DIR`（候选 `$HOME/.dsh/contracts/0.2.1-rc.5`、`/tmp/eta-types/node_modules`）把 0.2.1-rc.5 的 `@deepseek-ai/*` link 进 `node_modules`；`DSH_REACT_TYPES` 指向含 `react/` 的 `@types` 目录
- 本机实测可用：`DSH_REACT_TYPES=/home/zuoye/开发/deepseek-harness/node_modules/.pnpm/@types+react@18.3.31/node_modules/@types bash scripts/build.sh`

## 6. 下一步（未开始）

1. 在真实桌面端里加载验证（需要在 Windows 侧装包 / 复制 profile 试装）
2. 把 `createTurnEtaFold` 接进自有 agent 时，注意 `ETA_TUNING` 的 `BOOTSTRAP_EXPECTED_STEPS`（首轮无历史时按 10 步估）是否合适
3. 可选的算法复标：`RATE_PERCENTILE` 0.9 与 `REANCHOR_AT` 0.5 是用 0.3.0 的样本调出来的，样本变了可复测
