window.__ModuleLoader__.load({
	id: "@dsh-external/dsh-session-turn-eta",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region \0dsh-css:c49f61f9196d891917f0c922817cdee807adbae3
		const css = "/* Live turn progress bar under the composer, in the same dock row as the\n   session-stats pills. Fallbacks keep the bar visible under any theme. */\n\n.dsh-eta-root-aab3c8 {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  max-width: var(--dsh-chat-content-width);\n  width: 100%;\n  margin: 0 auto;\n  box-sizing: border-box;\n  padding: 2px calc(var(--dsh-composer-side-clearance) + 16px) 0px;\n  font-size: var(--dsh-content-font-size-secondary, 13px);\n  line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));\n  color: var(--dsw-alias-label-tertiary);\n  font-variant-numeric: tabular-nums;\n}\n\n.dsh-eta-track-aab3c8 {\n  position: relative;\n  flex: 1;\n  height: 4px;\n  border-radius: 999px;\n  overflow: hidden;\n  background: var(--dsw-alias-fill-tertiary, rgba(127, 127, 127, 0.25));\n}\n\n.dsh-eta-band-aab3c8 {\n  position: absolute;\n  top: 0;\n  bottom: 0;\n  border-radius: 999px;\n  background: var(--dsw-alias-brand-primary, #4c8dff);\n  opacity: 0.3;\n}\n\n.dsh-eta-fill-aab3c8 {\n  position: relative;\n  height: 100%;\n  width: 0;\n  border-radius: 999px;\n  background: var(--dsw-alias-brand-primary, #4c8dff);\n  transition: width 0.2s ease;\n}\n\n.dsh-eta-root-aab3c8[data-status='completed'] .dsh-eta-fill-aab3c8 {\n  background: var(--dsw-alias-status-success, #2e9e5b);\n}\n\n.dsh-eta-root-aab3c8[data-status='failed'] .dsh-eta-fill-aab3c8 {\n  background: var(--dsw-alias-status-danger, #d9534f);\n}\n\n.dsh-eta-root-aab3c8[data-exhausted='true'] .dsh-eta-fill-aab3c8 {\n  animation: eta-pulse 1.2s ease-in-out infinite;\n}\n\n@keyframes eta-pulse {\n  0%,\n  100% {\n    opacity: 1;\n  }\n\n  50% {\n    opacity: 0.45;\n  }\n}\n\n.dsh-eta-root-aab3c8[data-indeterminate='true'] .dsh-eta-fill-aab3c8 {\n  width: 35%;\n  animation: eta-indeterminate 1.4s ease-in-out infinite;\n}\n\n@keyframes eta-indeterminate {\n  0% {\n    margin-left: -35%;\n  }\n\n  100% {\n    margin-left: 100%;\n  }\n}\n\n.dsh-eta-label-aab3c8,\n.dsh-eta-remaining-aab3c8 {\n  white-space: nowrap;\n}\n\n.dsh-eta-label-aab3c8 {\n  min-width: 4.5em;\n}\n\n.dsh-eta-remaining-aab3c8 {\n  color: var(--dsw-alias-label-secondary, var(--dsw-alias-label-tertiary));\n}\n";
		if (typeof document !== "undefined" && document.querySelector("style[data-dsh-session-turn-eta]") === null) {
			const style = document.createElement("style");
			style.setAttribute("data-dsh-session-turn-eta", "");
			style.textContent = css;
			document.head.appendChild(style);
		}
		var _dsh_css_c49f61f9196d891917f0c922817cdee807adbae3_default = {
			"root": "dsh-eta-root-aab3c8",
			"track": "dsh-eta-track-aab3c8",
			"band": "dsh-eta-band-aab3c8",
			"fill": "dsh-eta-fill-aab3c8",
			"label": "dsh-eta-label-aab3c8",
			"remaining": "dsh-eta-remaining-aab3c8"
		};
		//#endregion
		//#region src/client/chat/TurnProgress.tsx
		/**
		* Live turn progress under the composer: a bar plus percentage fed by the
		* `turnEta` session projection. The host projects only on session events, so
		* the component adds a local tick while a turn is open and recomputes the
		* percentage from the projected total; a terminal turn renders its outcome.
		*
		* The estimate is a range, not a promise: when the projected interval is wide
		* the label reads `~1-3m left` and a translucent band marks where the turn is
		* predicted to end, so a heavy-tailed turn is shown as uncertain rather than as
		* a confidently wrong number.
		*/
		/** Local tick while a turn is open; the wire only advances on session events. */
		const TICK_MS = 250;
		/** Show the range once its upper bound exceeds the lower by this ratio. */
		const RANGE_RATIO = 1.8;
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
		* Human-readable duration: seconds under a minute, minutes and seconds under an
		* hour, then hours and minutes, so long estimates stay readable.
		* @param t - the dock locale seat.
		* @param ms - duration in milliseconds.
		* @returns the localized duration without any prefix.
		*/
		function durationText(t, ms) {
			const totalSeconds = Math.max(0, Math.round(ms / 1e3));
			if (totalSeconds < 60) return t("turnProgress.durationSeconds", { seconds: totalSeconds });
			const totalMinutes = Math.floor(totalSeconds / 60);
			if (totalMinutes < 60) return t("turnProgress.durationMinutes", {
				minutes: totalMinutes,
				seconds: totalSeconds % 60
			});
			return t("turnProgress.durationHours", {
				hours: Math.floor(totalMinutes / 60),
				minutes: totalMinutes % 60
			});
		}
		/**
		* The composer-dock progress bar. Renders nothing before a session's first turn.
		* @param props - the projection read seat and the dock locale seat.
		* @returns the bar, percentage label, and live remaining estimate or range.
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
			const elapsedMs = Math.max(0, now - eta.startTime);
			const totalMs = eta.predictedTotalMs;
			const percent = status === "running" ? turnProgressPercent(eta, now) : 100;
			const remainingMs = status === "running" && totalMs !== void 0 ? Math.max(0, totalMs - elapsedMs) : void 0;
			const exhausted = status === "running" && remainingMs === 0;
			const interval = eta.interval;
			const showRange = status === "running" && !exhausted && interval !== void 0 && interval.highMs > interval.lowMs * RANGE_RATIO;
			const label = status === "completed" ? t("turnProgress.completed") : status === "failed" ? t("turnProgress.failed") : exhausted ? t("turnProgress.finishing") : percent === void 0 ? t("turnProgress.indeterminate") : t("turnProgress.running", { percent });
			const remaining = remainingMs === void 0 || exhausted ? void 0 : showRange && interval !== void 0 ? t("turnProgress.etaRange", {
				low: durationText(t, interval.lowMs),
				high: durationText(t, interval.highMs)
			}) : t("turnProgress.eta", { duration: durationText(t, remainingMs) });
			const details = remaining === void 0 ? label : `${label} · ${remaining}`;
			const band = showRange && interval !== void 0 && totalMs !== void 0 && totalMs > 0 ? {
				left: `${Math.max(0, Math.min(100, (elapsedMs + interval.lowMs) / totalMs * 100))}%`,
				width: `${Math.max(0, Math.min(100, (interval.highMs - interval.lowMs) / totalMs * 100))}%`
			} : void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: _dsh_css_c49f61f9196d891917f0c922817cdee807adbae3_default.root,
				"data-turn-progress": true,
				"data-status": status,
				"data-indeterminate": percent === void 0 ? "true" : void 0,
				"data-exhausted": exhausted ? "true" : void 0,
				"data-range": band === void 0 ? void 0 : "true",
				title: details,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: _dsh_css_c49f61f9196d891917f0c922817cdee807adbae3_default.track,
						role: "progressbar",
						"aria-label": label,
						"aria-valuemin": 0,
						"aria-valuemax": 100,
						"aria-valuenow": percent,
						"aria-valuetext": details,
						children: [band !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: _dsh_css_c49f61f9196d891917f0c922817cdee807adbae3_default.band,
							style: band
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: _dsh_css_c49f61f9196d891917f0c922817cdee807adbae3_default.fill,
							style: percent === void 0 ? void 0 : { width: `${percent}%` }
						})]
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
			"turnProgress.finishing": "即将完成…",
			"turnProgress.failed": "进度已中断",
			"turnProgress.eta": "约剩 {duration}",
			"turnProgress.etaRange": "约剩 {low}~{high}",
			"turnProgress.durationSeconds": "{seconds} 秒",
			"turnProgress.durationMinutes": "{minutes} 分 {seconds} 秒",
			"turnProgress.durationHours": "{hours} 时 {minutes} 分"
		};
		/** English dictionary. */
		const en = {
			"turnProgress.running": "Progress {percent}%",
			"turnProgress.indeterminate": "In progress…",
			"turnProgress.completed": "Progress 100%",
			"turnProgress.finishing": "Finishing…",
			"turnProgress.failed": "Progress interrupted",
			"turnProgress.eta": "~{duration} left",
			"turnProgress.etaRange": "~{low}–{high} left",
			"turnProgress.durationSeconds": "{seconds}s",
			"turnProgress.durationMinutes": "{minutes}m {seconds}s",
			"turnProgress.durationHours": "{hours}h {minutes}m"
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