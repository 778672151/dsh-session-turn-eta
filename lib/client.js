window.__ModuleLoader__.load({
	id: "@dsh-external/dsh-session-turn-eta",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react = require("react");
		react = __toESM(react, 1);
		//#region src/client/index.ts
		/**
		* @dsh-external/dsh-session-turn-eta — client half.
		*
		* Registers the composer-dock progress bar that renders the host `turnEta`
		* session projection. Bundled by tsdown into lib/client.js in the DSH client
		* bundle format (window.__ModuleLoader__.load).
		*/
		/** Locale namespace for this plugin's composer-dock copy. */
		const NS = "dsh-session-turn-eta";
		/** Local tick while a turn is open; the wire only advances on session events. */
		const TICK_MS = 250;
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
		/** Clamp a computed percentage into [0, 100] with integer rounding. */
		function clampPercent(percent) {
			if (!Number.isFinite(percent)) return 0;
			return Math.max(0, Math.min(100, Math.round(percent)));
		}
		/** Live/terminal status of the projected turn. */
		function statusOf(eta) {
			if (eta.open) return "running";
			if (eta.completed === true) return "completed";
			if (eta.completed === false) return "failed";
		}
		/** Percentage: elapsed over predicted total while open, step fraction as fallback, 100 when terminal. */
		function percentOf(eta, now) {
			if (!eta.open) return eta.completed === void 0 ? void 0 : 100;
			if (eta.predictedTotalMs !== void 0 && eta.predictedTotalMs > 0) return clampPercent((now - eta.startTime) / eta.predictedTotalMs * 100);
			if (eta.expectedSteps !== void 0 && eta.expectedSteps > 0) return clampPercent(eta.completedSteps / eta.expectedSteps * 100);
		}
		const ROOT = {
			display: "flex",
			alignItems: "center",
			gap: "8px",
			boxSizing: "border-box",
			padding: "4px 0 0",
			fontSize: "12px",
			lineHeight: "16px",
			color: "var(--dsw-alias-label-tertiary, #8a8f98)",
			fontVariantNumeric: "tabular-nums"
		};
		const TRACK = {
			position: "relative",
			flex: "0 0 160px",
			height: "6px",
			borderRadius: "3px",
			overflow: "hidden",
			background: "var(--dsw-alias-fill-secondary, rgba(127,127,127,0.25))"
		};
		const LABEL = { whiteSpace: "nowrap" };
		const REMAIN = {
			whiteSpace: "nowrap",
			opacity: .8
		};
		const Fill = react.memo(function Fill(props) {
			return react.createElement("div", { style: {
				height: "100%",
				width: String(props.width) + "%",
				transition: "width 200ms linear",
				background: props.failed ? "var(--dsw-alias-fill-error, #e5484d)" : "var(--dsw-alias-fill-primary, #4b7bec)"
			} });
		});
		const Progress = react.memo(function Progress(props) {
			const { useProjection, t } = props;
			const eta = useProjection("turnEta");
			const [now, setNow] = react.useState(() => Date.now());
			const status = eta === void 0 ? void 0 : statusOf(eta);
			react.useEffect(() => {
				if (status !== "running") return;
				const id = setInterval(() => setNow(Date.now()), TICK_MS);
				return () => clearInterval(id);
			}, [status]);
			if (eta === void 0 || status === void 0) return null;
			const percent = status === "running" ? percentOf(eta, now) : 100;
			const remainingMs = status === "running" && eta.predictedTotalMs !== void 0 ? Math.max(0, eta.predictedTotalMs - Math.max(0, now - eta.startTime)) : void 0;
			const label = status === "completed" ? t("turnProgress.completed") : status === "failed" ? t("turnProgress.failed") : percent === void 0 ? t("turnProgress.indeterminate") : t("turnProgress.running", { percent });
			const remaining = remainingMs === void 0 ? void 0 : t("turnProgress.eta", { seconds: Math.ceil(remainingMs / 1e3) });
			return react.createElement("div", {
				"data-turn-progress": true,
				"data-status": status,
				style: ROOT
			}, react.createElement("div", {
				role: "progressbar",
				"aria-label": label,
				"aria-valuemin": 0,
				"aria-valuemax": 100,
				"aria-valuenow": percent,
				"aria-valuetext": remaining === void 0 ? label : label + " · " + remaining,
				style: TRACK
			}, react.createElement(Fill, {
				width: percent === void 0 ? 0 : percent,
				failed: status === "failed"
			})), react.createElement("span", { style: LABEL }, label), remaining === void 0 ? null : react.createElement("span", { style: REMAIN }, remaining));
		});
		/** Client services required by this plugin. */
		const inject = ["slots", "locale"];
		/**
		* Register this plugin's composer-dock progress bar.
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
			}, Progress));
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