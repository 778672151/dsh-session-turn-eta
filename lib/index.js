import { z } from "zod";
//#region src/predict.ts
/** Median of a non-empty numeric list, or undefined for an empty list. */
function median(values) {
	if (values.length === 0) return void 0;
	const sorted = [...values].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 1) return sorted[middle];
	return (sorted[middle - 1] + sorted[middle]) / 2;
}
function mean(values) {
	return values.reduce((total, value) => total + value, 0) / values.length;
}
/**
* Derive one remaining-time core from the open turn's facts.
*
* The estimate is the recent step mean times the median closed-step count of
* previously completed turns in this session; `insufficient-data` omits every
* numeric field rather than guessing.
* @param input - open-turn anchors and observed step samples.
* @returns the shared prediction core.
*/
function etaCore(input) {
	const completedSteps = input.stepDurations.length;
	const elapsedMs = Math.max(0, input.asOf - input.startTime);
	const expectedSteps = median(input.completedTurnSteps);
	const samples = completedSteps >= 1 ? input.stepDurations : input.stepSamples;
	const base = {
		elapsedMs,
		completedSteps,
		method: "insufficient-data"
	};
	if (expectedSteps === void 0 || expectedSteps < 1 || samples.length === 0) return base;
	const meanStepMs = mean(samples);
	const predictedTotalMs = meanStepMs * expectedSteps;
	const remainingMs = Math.max(0, predictedTotalMs - elapsedMs);
	const interval = samples.length >= 2 ? {
		lowMs: Math.max(0, Math.min(...samples) * expectedSteps - elapsedMs),
		highMs: Math.max(0, Math.max(...samples) * expectedSteps - elapsedMs)
	} : void 0;
	return {
		...base,
		expectedSteps,
		meanStepMs,
		predictedTotalMs,
		remainingMs,
		...interval === void 0 ? {} : { interval },
		method: "step-mean"
	};
}
//#endregion
//#region src/eta.ts
/**
* Per-session fold over durable turn and step events. One instance serves any
* number of sessions; state is keyed weakly by `Session`. Every applied event
* reduces to a prediction, a terminal record, both, or nothing.
*/
var TurnEtaModel = class {
	states = /* @__PURE__ */ new WeakMap();
	state(session) {
		const existing = this.states.get(session);
		if (existing !== void 0) return existing;
		const created = {
			seeded: false,
			open: void 0,
			completedTurnSteps: [],
			stepSamples: []
		};
		this.states.set(session, created);
		return created;
	}
	/**
	* Apply one live event, seeding the session from its own durable log once so a
	* resumed session can predict from turns recorded before this model existed.
	* Seeding applies prior events for their state only; their predictions and
	* records are not re-emitted.
	* @param session - session that owns the event.
	* @param event - the appended event.
	* @returns the prediction and/or record this event produced.
	*/
	observe(session, event) {
		const state = this.state(session);
		if (!state.seeded) {
			state.seeded = true;
			for (const prior of session.snapshotEvents()) {
				if (prior.seq >= event.seq) break;
				this.apply(session, prior);
			}
		}
		return this.apply(session, event);
	}
	/**
	* Apply one durable event without seeding. Public so tests can drive exact
	* timestamps; production callers go through {@link observe}.
	* @param session - session that owns the event.
	* @param event - the appended event.
	* @returns the prediction and/or record this event produced.
	*/
	apply(session, event) {
		const state = this.state(session);
		switch (event.type) {
			case "turn/start": {
				const open = {
					turn: event.data.turn,
					startTime: event.time,
					stepDurations: [],
					openStepStart: void 0,
					lastStep: 0
				};
				state.open = open;
				return { prediction: this.predict(session, open, event.time) };
			}
			case "step/start": {
				const open = state.open;
				if (open === void 0 || open.turn !== event.data.turn) return {};
				open.openStepStart = event.time;
				open.lastStep = event.data.step;
				return { prediction: this.predict(session, open, event.time) };
			}
			case "step/end": {
				const open = state.open;
				if (open === void 0 || open.turn !== event.data.turn) return {};
				if (open.openStepStart !== void 0) {
					const duration = Math.max(0, event.time - open.openStepStart);
					open.stepDurations.push(duration);
					state.stepSamples.push(duration);
				}
				open.openStepStart = void 0;
				open.lastStep = event.data.step;
				return { prediction: this.predict(session, open, event.time) };
			}
			case "assistant/message":
			case "tool/call":
			case "tool/result": {
				const open = state.open;
				if (open === void 0 || open.turn !== event.data.turn) return {};
				return { prediction: this.predict(session, open, event.time) };
			}
			case "turn/end": {
				const open = state.open;
				if (open === void 0 || open.turn !== event.data.turn) return {};
				state.open = void 0;
				const record = {
					sessionId: session.id,
					turn: open.turn,
					durationMs: Math.max(0, event.time - open.startTime),
					stepCount: open.stepDurations.length,
					completed: event.data.reason.kind === "completed",
					reason: event.data.reason.kind
				};
				if (record.completed) state.completedTurnSteps.push(record.stepCount);
				return { record };
			}
			default: return {};
		}
	}
	predict(session, open, asOf) {
		const state = this.state(session);
		return {
			sessionId: session.id,
			turn: open.turn,
			step: open.lastStep,
			...etaCore({
				startTime: open.startTime,
				stepDurations: open.stepDurations,
				completedTurnSteps: state.completedTurnSteps,
				stepSamples: state.stepSamples,
				asOf
			})
		};
	}
};
//#endregion
//#region src/projection.ts
/**
* The `turnEta` projection unit: a pure whole-log fold of turn and step
* events into the live remaining-time prediction the Web client renders under
* the composer. State is plain JSON so the persisted projection cache can seed
* a fold; the wire view reuses one object per state so an unchanged fold
* publishes nothing.
* @module @deepseek-ai/dsh-session-turn-eta/projection
*/
const openTurnSchema = z.object({
	turn: z.number().int().nonnegative(),
	startTime: z.number().nonnegative(),
	asOf: z.number().nonnegative(),
	stepDurations: z.array(z.number().nonnegative()),
	openStepStart: z.number().nonnegative().optional(),
	lastStep: z.number().int().nonnegative()
}).strict();
const stateSchema = z.object({
	open: openTurnSchema.optional(),
	completedTurnSteps: z.array(z.number().int().nonnegative()),
	stepSamples: z.array(z.number().nonnegative()),
	last: z.object({
		turn: z.number().int().nonnegative(),
		durationMs: z.number().nonnegative(),
		stepCount: z.number().int().nonnegative(),
		completed: z.boolean(),
		reason: z.string()
	}).strict().optional()
}).strict();
const viewSchema = z.object({
	turn: z.number().int().nonnegative(),
	step: z.number().int().nonnegative(),
	open: z.boolean(),
	startTime: z.number().nonnegative(),
	elapsedMs: z.number().nonnegative(),
	completedSteps: z.number().int().nonnegative(),
	expectedSteps: z.number().nonnegative().optional(),
	meanStepMs: z.number().nonnegative().optional(),
	predictedTotalMs: z.number().nonnegative().optional(),
	remainingMs: z.number().nonnegative().optional(),
	interval: z.object({
		lowMs: z.number().nonnegative(),
		highMs: z.number().nonnegative()
	}).strict().optional(),
	method: z.enum(["step-mean", "insufficient-data"]),
	completed: z.boolean().optional(),
	reason: z.string().optional(),
	durationMs: z.number().nonnegative().optional()
}).strict();
const EMPTY_STATE = {
	completedTurnSteps: [],
	stepSamples: []
};
/** The wire view for one fold state; cached per state reference. */
const views = /* @__PURE__ */ new WeakMap();
function computeView(state) {
	const open = state.open;
	if (open !== void 0) {
		const core = etaCore({
			startTime: open.startTime,
			stepDurations: open.stepDurations,
			completedTurnSteps: state.completedTurnSteps,
			stepSamples: state.stepSamples,
			asOf: open.asOf
		});
		return {
			turn: open.turn,
			step: open.lastStep,
			open: true,
			startTime: open.startTime,
			...core
		};
	}
	const last = state.last;
	if (last !== void 0) return {
		turn: last.turn,
		step: 0,
		open: false,
		startTime: 0,
		elapsedMs: 0,
		completedSteps: last.stepCount,
		method: "insufficient-data",
		completed: last.completed,
		reason: last.reason,
		durationMs: last.durationMs
	};
	return {
		turn: 0,
		step: 0,
		open: false,
		startTime: 0,
		elapsedMs: 0,
		completedSteps: 0,
		method: "insufficient-data"
	};
}
/** The `turnEta` unit registered on `ctx.sessionProjections` (exported for the unit spec). */
const turnEtaProjectionDefinition = {
	key: "turnEta",
	stateVersion: 1,
	stateSchema,
	init: () => EMPTY_STATE,
	apply: (state, event) => {
		switch (event.type) {
			case "turn/start": return {
				...state,
				open: {
					turn: event.data.turn,
					startTime: event.time,
					asOf: event.time,
					stepDurations: [],
					lastStep: 0
				}
			};
			case "step/start": {
				const open = state.open;
				if (open === void 0 || open.turn !== event.data.turn) return state;
				return {
					...state,
					open: {
						...open,
						asOf: event.time,
						openStepStart: event.time,
						lastStep: event.data.step
					}
				};
			}
			case "step/end": {
				const open = state.open;
				if (open === void 0 || open.turn !== event.data.turn) return state;
				if (open.openStepStart === void 0) return {
					...state,
					open: {
						...open,
						asOf: event.time,
						lastStep: event.data.step
					}
				};
				const duration = Math.max(0, event.time - open.openStepStart);
				return {
					...state,
					open: {
						turn: open.turn,
						startTime: open.startTime,
						asOf: event.time,
						stepDurations: [...open.stepDurations, duration],
						lastStep: event.data.step
					},
					stepSamples: [...state.stepSamples, duration]
				};
			}
			case "assistant/message":
			case "tool/call":
			case "tool/result": {
				const open = state.open;
				if (open === void 0 || open.turn !== event.data.turn) return state;
				return {
					...state,
					open: {
						...open,
						asOf: event.time,
						lastStep: event.data.step
					}
				};
			}
			case "turn/end": {
				const open = state.open;
				if (open === void 0 || open.turn !== event.data.turn) return state;
				const completed = event.data.reason.kind === "completed";
				return {
					completedTurnSteps: completed ? [...state.completedTurnSteps, open.stepDurations.length] : state.completedTurnSteps,
					stepSamples: state.stepSamples,
					last: {
						turn: open.turn,
						durationMs: Math.max(0, event.time - open.startTime),
						stepCount: open.stepDurations.length,
						completed,
						reason: event.data.reason.kind
					}
				};
			}
			default: return state;
		}
	},
	wire: {
		viewSchema,
		view: (state) => {
			const cached = views.get(state);
			if (cached !== void 0) return cached;
			const computed = computeView(state);
			views.set(state, computed);
			return computed;
		}
	}
};
//#endregion
//#region src/index.ts
/** Cordis plugin name. */
const name = "session-turn-eta";
/** The projection registry is the client-facing half; without it the fiber stays pending. */
const inject = ["sessionProjections"];
/**
* Register the `turnEta` projection and fold every durable session event into
* turn ETA predictions and duration records.
* @param ctx - context whose session event feed is observed and registry receives the unit.
*/
function apply(ctx) {
	ctx.sessionProjections.register(turnEtaProjectionDefinition);
	const model = new TurnEtaModel();
	ctx.on("session/event", (session, event) => {
		const emission = model.observe(session, event);
		if (emission.prediction !== void 0) {
			ctx.logger.debug(`turn-eta: session "${String(session.id)}" turn ${emission.prediction.turn} ${emission.prediction.method} remaining=${String(emission.prediction.remainingMs)}ms`);
			ctx.emit("turn-eta/update", emission.prediction);
		}
		if (emission.record !== void 0) {
			ctx.logger.info(`turn-eta: session "${String(session.id)}" turn ${emission.record.turn} duration=${emission.record.durationMs}ms steps=${emission.record.stepCount} reason=${emission.record.reason} completed=${String(emission.record.completed)}`);
			ctx.emit("turn-eta/complete", emission.record);
		}
	});
}
//#endregion
export { TurnEtaModel, apply, inject, name };

//# sourceMappingURL=index.js.map