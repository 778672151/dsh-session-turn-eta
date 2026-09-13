window.__ModuleLoader__.load({
	id: "@dsh-external/dsh-session-turn-eta",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region \0dsh-css:c49f61f9196d891917f0c922817cdee807adbae3
		const css = "/* Live turn progress bar under the composer, in the same dock row as the\n   session-stats pills. Fallbacks keep the bar visible under any theme. */\n\n.dsh-eta-root-3f8048 {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  max-width: var(--dsh-chat-content-width);\n  width: 100%;\n  margin: 0 auto;\n  box-sizing: border-box;\n  padding: 2px calc(var(--dsh-composer-side-clearance) + 16px) 0px;\n  font-size: var(--dsh-content-font-size-secondary, 13px);\n  line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));\n  color: var(--dsw-alias-label-tertiary);\n  font-variant-numeric: tabular-nums;\n}\n\n.dsh-eta-track-3f8048 {\n  flex: 1;\n  height: 4px;\n  border-radius: 999px;\n  overflow: hidden;\n  background: var(--dsw-alias-fill-tertiary, rgba(127, 127, 127, 0.25));\n}\n\n.dsh-eta-fill-3f8048 {\n  height: 100%;\n  width: 0;\n  border-radius: 999px;\n  background: var(--dsw-alias-brand-primary, #4c8dff);\n  transition: width 0.2s ease;\n}\n\n.dsh-eta-root-3f8048[data-status='completed'] .dsh-eta-fill-3f8048 {\n  background: var(--dsw-alias-status-success, #2e9e5b);\n}\n\n.dsh-eta-root-3f8048[data-status='failed'] .dsh-eta-fill-3f8048 {\n  background: var(--dsw-alias-status-danger, #d9534f);\n}\n\n.dsh-eta-label-3f8048,\n.dsh-eta-remaining-3f8048 {\n  white-space: nowrap;\n}\n\n.dsh-eta-remaining-3f8048 {\n  color: var(--dsw-alias-label-secondary, var(--dsw-alias-label-tertiary));\n}\n";
		if (typeof document !== "undefined" && document.querySelector("style[data-dsh-session-turn-eta]") === null) {
			const style = document.createElement("style");
			style.setAttribute("data-dsh-session-turn-eta", "");
			style.textContent = css;
			document.head.appendChild(style);
		}
		var _dsh_css_c49f61f9196d891917f0c922817cdee807adbae3_default = {
			"root": "dsh-eta-root-3f8048",
			"track": "dsh-eta-track-3f8048",
			"fill": "dsh-eta-fill-3f8048",
			"label": "dsh-eta-label-3f8048",
			"remaining": "dsh-eta-remaining-3f8048"
		};
		//#endregion
		//#region src/client/chat/TurnProgress.tsx
		/**
		* Live turn progress under the composer: a bar plus percentage fed by the
		* `turnEta` session projection. The host projects only on session events, so
		* the component adds a local tick while a turn is open and recomputes the
		* percentage from the projected total; a terminal turn renders its outcome.
		*/
		/** Local tick while a turn is open; the wire only advances on session events. */
		const TICK_MS = 250;
		/**
		* Clamp a computed percentage into [0, 100] with integer rounding.
		* @param percent - raw percentage; non-finite values read as 0.
		* @returns the clamped integer percentage.
		*/
		function clampPercent(percent) {
			if (!Number.isFinite(percent)) return 0;
			return Math.max(0, Math.min(100, Math.round(percent)));
		}
		/**
		* Terminal or live status of the projected turn.
		* @param eta - the current `turnEta` value.
		* @returns undefined before the session's first turn.
		*/
		function turnProgressStatus(eta) {
			if (eta.open) return "running";
			if (eta.completed === true) return "completed";
			if (eta.completed === false) return "failed";
		}
		/**
		* Percentage for the projected turn: elapsed over the predicted total while
		* open, the observed step fraction when no total is available, and 100 once
		* the turn reaches a terminal state.
		* @param eta - the current `turnEta` value.
		* @param now - the locally observed epoch ms used for the live tick.
		* @returns the percentage, or undefined when the projection carries no total.
		*/
		function turnProgressPercent(eta, now) {
			if (!eta.open) return eta.completed === void 0 ? void 0 : 100;
			if (eta.predictedTotalMs !== void 0 && eta.predictedTotalMs > 0) return clampPercent((now - eta.startTime) / eta.predictedTotalMs * 100);
			if (eta.expectedSteps !== void 0 && eta.expectedSteps > 0) return clampPercent(eta.completedSteps / eta.expectedSteps * 100);
		}
		/**
		* The composer-dock progress bar. Renders nothing before a session's first turn.
		* @param props - the projection read seat and the dock locale seat.
		* @returns the bar, percentage label, and live remaining estimate.
		*/
		function TurnProgress({ useProjection, t }) {
			const eta = useProjection("turnEta");
			const status = eta === void 0 ? void 0 : turnProgressStatus(eta);
			const [now, setNow] = (0, react.useState)(() => Date.now());
			(0, react.useEffect)(() => {
				if (status !== "running") return;
				const id = setInterval(() => setNow(Date.now()), TICK_MS);
				return () => clearInterval(id);
			}, [status]);
			if (eta === void 0 || status === void 0) return null;
			const percent = status === "running" ? turnProgressPercent(eta, now) : 100;
			const remainingMs = status === "running" && eta.predictedTotalMs !== void 0 ? Math.max(0, eta.predictedTotalMs - Math.max(0, now - eta.startTime)) : void 0;
			const label = status === "completed" ? t("turnProgress.completed") : status === "failed" ? t("turnProgress.failed") : percent === void 0 ? t("turnProgress.indeterminate") : t("turnProgress.running", { percent });
			const remaining = remainingMs === void 0 ? void 0 : t("turnProgress.eta", { seconds: Math.ceil(remainingMs / 1e3) });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: _dsh_css_c49f61f9196d891917f0c922817cdee807adbae3_default.root,
				"data-turn-progress": true,
				"data-status": status,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: _dsh_css_c49f61f9196d891917f0c922817cdee807adbae3_default.track,
						role: "progressbar",
						"aria-label": label,
						"aria-valuemin": 0,
						"aria-valuemax": 100,
						"aria-valuenow": percent,
						"aria-valuetext": remaining === void 0 ? label : `${label} · ${remaining}`,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: _dsh_css_c49f61f9196d891917f0c922817cdee807adbae3_default.fill,
							style: { width: `${percent ?? 0}%` }
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: _dsh_css_c49f61f9196d891917f0c922817cdee807adbae3_default.label,
						children: label
					}),
					remaining !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: _dsh_css_c49f61f9196d891917f0c922817cdee807adbae3_default.remaining,
						children: remaining
					})
				]
			});
		}
		//#endregion
		//#region src/client/index.ts
		/**
		* @dsh-external/dsh-session-turn-eta — client entry and dock wiring only.
		* The UI itself lives verbatim in ./chat/TurnProgress.tsx + .module.css.
		*/
		/** Locale namespace for this plugin's composer-dock copy. */
		const NS = "dsh-session-turn-eta";
		/** Simplified Chinese dictionary. */
		const zh = {
			"turnProgress.running": "进度 {percent}%",
			"turnProgress.indeterminate": "进行中…",
			"turnProgress.completed": "进度 100%",
			"turnProgress.failed": "进度已中断",
			"turnProgress.eta": "约剩 {seconds} 秒"
		};
		/** English dictionary. */
		const en = {
			"turnProgress.running": "Progress {percent}%",
			"turnProgress.indeterminate": "In progress…",
			"turnProgress.completed": "Progress 100%",
			"turnProgress.failed": "Progress interrupted",
			"turnProgress.eta": "~{seconds}s left"
		};
		/** Client services required by this plugin. */
		const inject = ["slots", "locale"];
		/**
		* Register the composer-dock progress bar.
		* @param ctx - client context carrying the slots and locale services.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-session-turn-eta: dictionaries");
			ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
				name: "conversation.composer.dock",
				id: "dsh-session-turn-eta",
				order: -1,
				locale: NS
			}, TurnProgress));
		}
		//#endregion
		exports.NS = NS;
		exports.apply = apply;
		exports.en = en;
		exports.inject = inject;
		exports.zh = zh;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map