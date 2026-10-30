window.__ModuleLoader__.load({
	id: "@dsh-external/dsh-session-turn-eta",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/chat/skins.ts
		/**
		* Skin presets for the composer-dock turn progress bar.
		*
		* A skin is a named set of CSS custom properties (fill gradient, leading-dot
		* glow, track tint, celebration colour) applied through the root's `data-skin`
		* attribute; the component itself never hard-codes a colour. `auto` follows the
		* harness theme tokens, so it is correct in both light and dark mode.
		* @module @deepseek-ai/dsh-session-turn-eta/client/skins
		*/
		/** Every selectable skin, in documentation order. */
		const TURN_ETA_SKINS = [
			"auto",
			"bilibili",
			"mint",
			"sunset",
			"ocean"
		];
		/** Skin used when no explicit or document-level choice is valid. */
		const TURN_ETA_DEFAULT_SKIN = "auto";
		/** Attribute read off `<body>`/`<html>` to pick a skin without a prop. */
		const TURN_ETA_SKIN_ATTRIBUTE = "data-turn-eta-skin";
		/** Whether a value names a known skin. */
		function isTurnEtaSkin(value) {
			return typeof value === "string" && TURN_ETA_SKINS.includes(value);
		}
		/** Read the document-level skin choice, if any (SSR-safe). */
		function documentSkin() {
			if (typeof document === "undefined") return void 0;
			const body = document.body?.getAttribute(TURN_ETA_SKIN_ATTRIBUTE);
			if (isTurnEtaSkin(body)) return body;
			const root = document.documentElement?.getAttribute(TURN_ETA_SKIN_ATTRIBUTE);
			return isTurnEtaSkin(root) ? root : void 0;
		}
		/**
		* Resolve the skin the bar should render with: an explicit prop wins, then the
		* document attribute, then `auto`. Unknown values fall back to `auto` rather
		* than breaking the bar.
		* @param explicit - the (optional) per-render skin choice.
		* @returns a valid skin name.
		*/
		function resolveTurnEtaSkin(explicit) {
			if (isTurnEtaSkin(explicit)) return explicit;
			return documentSkin() ?? "auto";
		}
		//#endregion
		//#region \0dsh-css:c49f61f9196d891917f0c922817cdee807adbae3
		const css = "/* Live turn progress bar under the composer, in the same dock row as the\n   session-stats pills. Colours come from the harness theme tokens by default and\n   from a named skin preset when `data-skin` selects one, so the bar stays\n   correct in both light and dark mode. */\n\n.dsh-eta-root-b91400 {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  max-width: var(--dsh-chat-content-width);\n  width: 100%;\n  margin: 0 auto;\n  box-sizing: border-box;\n  padding: 2px calc(var(--dsh-composer-side-clearance) + 16px) 0px;\n  font-size: var(--dsh-content-font-size-secondary, 13px);\n  line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));\n  color: var(--dsw-alias-label-tertiary);\n  font-variant-numeric: tabular-nums;\n}\n\n/* Skin tokens. `auto` rides the harness theme tokens; the named presets only\n   override the four things a skin owns (fill, glow, track, celebration). */\n.dsh-eta-root-b91400 {\n  --dsh-eta-fill: linear-gradient(90deg, var(--dsw-alias-brand-primary, #4c8dff), var(--dsw-alias-brand-primary, #4c8dff));\n  --dsh-eta-glow: var(--dsw-alias-brand-primary, #4c8dff);\n  --dsh-eta-track: var(--dsw-alias-fill-tertiary, rgba(127, 127, 127, 0.25));\n  --dsh-eta-celebrate: #ffd166;\n}\n\n.dsh-eta-root-b91400[data-skin='bilibili'] {\n  --dsh-eta-fill: linear-gradient(90deg, #fb7299, #ff9db8 70%, #ffd9e3);\n  --dsh-eta-glow: #fb7299;\n  --dsh-eta-track: color-mix(in srgb, #fb7299 18%, transparent);\n  --dsh-eta-celebrate: #fb7299;\n}\n\n.dsh-eta-root-b91400[data-skin='mint'] {\n  --dsh-eta-fill: linear-gradient(90deg, #12b3a8, #4ee0c4 70%, #c8fff0);\n  --dsh-eta-glow: #12b3a8;\n  --dsh-eta-track: color-mix(in srgb, #12b3a8 18%, transparent);\n  --dsh-eta-celebrate: #4ee0c4;\n}\n\n.dsh-eta-root-b91400[data-skin='sunset'] {\n  --dsh-eta-fill: linear-gradient(90deg, #f2762e, #ffb25e 70%, #ffe3ba);\n  --dsh-eta-glow: #f2762e;\n  --dsh-eta-track: color-mix(in srgb, #f2762e 18%, transparent);\n  --dsh-eta-celebrate: #ffb25e;\n}\n\n.dsh-eta-root-b91400[data-skin='ocean'] {\n  --dsh-eta-fill: linear-gradient(90deg, #2b6cf6, #57a4ff 70%, #cfe6ff);\n  --dsh-eta-glow: #2b6cf6;\n  --dsh-eta-track: color-mix(in srgb, #2b6cf6 18%, transparent);\n  --dsh-eta-celebrate: #57a4ff;\n}\n\n/* The shimmery highlight that slides across the filled area, Bilibili-style. */\n.dsh-eta-root-b91400 {\n  --dsh-eta-shine: rgba(255, 255, 255, 0.38);\n}\n\n.dsh-eta-track-b91400 {\n  position: relative;\n  flex: 1;\n  height: 4px;\n  border-radius: 999px;\n  background: var(--dsh-eta-track);\n}\n\n.dsh-eta-rail-b91400 {\n  position: absolute;\n  inset: 0;\n  border-radius: 999px;\n  overflow: hidden;\n}\n\n.dsh-eta-fill-b91400 {\n  position: relative;\n  height: 100%;\n  width: 0;\n  border-radius: 999px;\n  background: var(--dsh-eta-fill);\n  transition: width 0.2s ease;\n}\n\n/* A soft shimmer sweeping the fill; purely decorative. */\n.dsh-eta-fill-b91400::after {\n  content: '';\n  position: absolute;\n  inset: 0;\n  background: linear-gradient(100deg, transparent 20%, var(--dsh-eta-shine) 50%, transparent 80%);\n  transform: translateX(-100%);\n  animation: eta-shine 2.4s ease-in-out infinite;\n}\n\n/* The leading dot Bilibili draws at the tip of the filled track. */\n.dsh-eta-tip-b91400 {\n  position: absolute;\n  top: 50%;\n  left: var(--dsh-eta-percent, 0%);\n  width: 7px;\n  height: 7px;\n  margin-left: -3.5px;\n  border-radius: 50%;\n  background: var(--dsh-eta-glow);\n  box-shadow: 0 0 0 2px var(--dsw-alias-bg-base, #fff), 0 0 6px var(--dsh-eta-glow);\n  transform: translateY(-50%);\n  pointer-events: none;\n}\n\n/* A one-shot burst when the turn really finishes. */\n.dsh-eta-celebration-b91400 {\n  position: absolute;\n  top: 50%;\n  right: 0;\n  width: 10px;\n  height: 10px;\n  margin-right: -5px;\n  border-radius: 50%;\n  background: radial-gradient(circle, var(--dsh-eta-celebrate) 0%, transparent 70%);\n  transform: translateY(-50%) scale(0.4);\n  animation: eta-celebrate 700ms ease-out 1 forwards;\n  pointer-events: none;\n}\n\n.dsh-eta-root-b91400[data-status='completed'] .dsh-eta-fill-b91400 {\n  background: var(--dsw-alias-status-success, #2e9e5b);\n}\n\n.dsh-eta-root-b91400[data-status='failed'] .dsh-eta-fill-b91400 {\n  background: var(--dsw-alias-status-danger, #d9534f);\n}\n\n.dsh-eta-root-b91400[data-status='completed'] .dsh-eta-tip-b91400,\n.dsh-eta-root-b91400[data-status='failed'] .dsh-eta-tip-b91400 {\n  display: none;\n}\n\n.dsh-eta-root-b91400[data-exhausted='true'] .dsh-eta-fill-b91400 {\n  animation: eta-pulse 1.2s ease-in-out infinite;\n}\n\n@keyframes eta-pulse {\n  0%,\n  100% {\n    opacity: 1;\n  }\n\n  50% {\n    opacity: 0.45;\n  }\n}\n\n.dsh-eta-root-b91400[data-indeterminate='true'] .dsh-eta-fill-b91400 {\n  width: 35%;\n  animation: eta-indeterminate 1.4s ease-in-out infinite;\n}\n\n@keyframes eta-indeterminate {\n  0% {\n    margin-left: -35%;\n  }\n\n  100% {\n    margin-left: 100%;\n  }\n}\n\n@keyframes eta-shine {\n  0% {\n    transform: translateX(-100%);\n  }\n\n  60%,\n  100% {\n    transform: translateX(100%);\n  }\n}\n\n@keyframes eta-celebrate {\n  0% {\n    opacity: 0;\n    transform: translateY(-50%) scale(0.4);\n  }\n\n  40% {\n    opacity: 1;\n  }\n\n  100% {\n    opacity: 0;\n    transform: translateY(-50%) scale(2.6);\n  }\n}\n\n.dsh-eta-label-b91400,\n.dsh-eta-remaining-b91400 {\n  white-space: nowrap;\n}\n\n.dsh-eta-label-b91400 {\n  min-width: 4.5em;\n}\n\n.dsh-eta-remaining-b91400 {\n  color: var(--dsw-alias-label-secondary, var(--dsw-alias-label-tertiary));\n}\n\n/* Respect the user's motion preference: keep the information, drop the motion. */\n@media (prefers-reduced-motion: reduce) {\n  .dsh-eta-fill-b91400,\n  .dsh-eta-fill-b91400::after,\n  .dsh-eta-tip-b91400,\n  .dsh-eta-celebration-b91400 {\n    transition: none;\n    animation: none;\n  }\n\n  .dsh-eta-celebration-b91400 {\n    opacity: 0;\n  }\n}\n";
		if (typeof document !== "undefined" && document.querySelector("style[data-dsh-session-turn-eta]") === null) {
			const style = document.createElement("style");
			style.setAttribute("data-dsh-session-turn-eta", "");
			style.textContent = css;
			document.head.appendChild(style);
		}
		var _dsh_css_c49f61f9196d891917f0c922817cdee807adbae3_default = {
			"root": "dsh-eta-root-b91400",
			"track": "dsh-eta-track-b91400",
			"rail": "dsh-eta-rail-b91400",
			"fill": "dsh-eta-fill-b91400",
			"tip": "dsh-eta-tip-b91400",
			"celebration": "dsh-eta-celebration-b91400",
			"label": "dsh-eta-label-b91400",
			"remaining": "dsh-eta-remaining-b91400"
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
		/** Ceiling for an open turn, so the bar never claims completion before the turn ends. */
		const MAX_OPEN_PERCENT = 99;
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
			if (eta.predictedTotalMs !== void 0 && eta.predictedTotalMs > 0) return Math.min(MAX_OPEN_PERCENT, clampPercent((now - eta.startTime) / eta.predictedTotalMs * 100));
			if (eta.expectedSteps !== void 0 && eta.expectedSteps > 0) return Math.min(MAX_OPEN_PERCENT, clampPercent(eta.completedSteps / eta.expectedSteps * 100));
		}
		/**
		* Human-readable remaining time: seconds under a minute, minutes and seconds
		* under an hour, then hours and minutes, so long estimates stay readable.
		* @param t - the dock locale seat.
		* @param remainingMs - remaining milliseconds.
		* @returns the localized remaining-time label.
		*/
		function remainingLabel(t, remainingMs) {
			const totalSeconds = Math.max(0, Math.round(remainingMs / 1e3));
			if (totalSeconds < 60) return t("turnProgress.etaSeconds", { seconds: totalSeconds });
			const totalMinutes = Math.floor(totalSeconds / 60);
			if (totalMinutes < 60) return t("turnProgress.etaMinutes", {
				minutes: totalMinutes,
				seconds: totalSeconds % 60
			});
			return t("turnProgress.etaHours", {
				hours: Math.floor(totalMinutes / 60),
				minutes: totalMinutes % 60
			});
		}
		/**
		* The composer-dock progress bar. Renders nothing before a session's first turn.
		* @param props - the projection read seat and the dock locale seat.
		* @returns the bar, percentage label, and live remaining estimate.
		*/
		function TurnProgress({ useProjection, t, skin: skinProp }) {
			const eta = useProjection("turnEta");
			const skin = resolveTurnEtaSkin(skinProp);
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
			const exhausted = status === "running" && remainingMs === 0;
			const label = status === "completed" ? t("turnProgress.completed") : status === "failed" ? t("turnProgress.failed") : exhausted ? t("turnProgress.finishing") : percent === void 0 ? t("turnProgress.indeterminate") : t("turnProgress.running", { percent });
			const remaining = remainingMs === void 0 || exhausted ? void 0 : remainingLabel(t, remainingMs);
			const details = remaining === void 0 ? label : `${label} · ${remaining}`;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: _dsh_css_c49f61f9196d891917f0c922817cdee807adbae3_default.root,
				"data-turn-progress": true,
				"data-skin": skin,
				"data-status": status,
				"data-indeterminate": percent === void 0 ? "true" : void 0,
				"data-exhausted": exhausted ? "true" : void 0,
				title: details,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: _dsh_css_c49f61f9196d891917f0c922817cdee807adbae3_default.track,
						style: percent === void 0 ? void 0 : { "--dsh-eta-percent": `${percent}%` },
						role: "progressbar",
						"aria-label": label,
						"aria-valuemin": 0,
						"aria-valuemax": 100,
						"aria-valuenow": percent,
						"aria-valuetext": details,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: _dsh_css_c49f61f9196d891917f0c922817cdee807adbae3_default.rail,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: _dsh_css_c49f61f9196d891917f0c922817cdee807adbae3_default.fill,
									style: percent === void 0 ? void 0 : { width: `${percent}%` }
								})
							}),
							status === "running" && percent !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: _dsh_css_c49f61f9196d891917f0c922817cdee807adbae3_default.tip,
								"aria-hidden": "true"
							}),
							status === "completed" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: _dsh_css_c49f61f9196d891917f0c922817cdee807adbae3_default.celebration,
								"aria-hidden": "true"
							})
						]
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
		/** Locale namespace for this plugin's composer-dock copy. */
		const NS = "dsh-session-turn-eta";
		/** Simplified Chinese dictionary. */
		const zh = {
			"turnProgress.running": "进度 {percent}%",
			"turnProgress.indeterminate": "进行中…",
			"turnProgress.completed": "进度 100%",
			"turnProgress.finishing": "即将完成…",
			"turnProgress.failed": "进度已中断",
			"turnProgress.etaSeconds": "约剩 {seconds} 秒",
			"turnProgress.etaMinutes": "约剩 {minutes} 分 {seconds} 秒",
			"turnProgress.etaHours": "约剩 {hours} 时 {minutes} 分"
		};
		/** English dictionary. */
		const en = {
			"turnProgress.running": "Progress {percent}%",
			"turnProgress.indeterminate": "In progress…",
			"turnProgress.completed": "Progress 100%",
			"turnProgress.finishing": "Finishing…",
			"turnProgress.failed": "Progress interrupted",
			"turnProgress.etaSeconds": "~{seconds}s left",
			"turnProgress.etaMinutes": "~{minutes}m {seconds}s left",
			"turnProgress.etaHours": "~{hours}h {minutes}m left"
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
		exports.TURN_ETA_DEFAULT_SKIN = TURN_ETA_DEFAULT_SKIN;
		exports.TURN_ETA_SKINS = TURN_ETA_SKINS;
		exports.TURN_ETA_SKIN_ATTRIBUTE = TURN_ETA_SKIN_ATTRIBUTE;
		exports.apply = apply;
		exports.en = en;
		exports.inject = inject;
		exports.isTurnEtaSkin = isTurnEtaSkin;
		exports.resolveTurnEtaSkin = resolveTurnEtaSkin;
		exports.zh = zh;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map