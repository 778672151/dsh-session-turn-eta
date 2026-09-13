import { z } from "zod";
//#region src/predict.ts
/** Prior weight, in steps, of the historical rate against the live turn's own rate. */
const HISTORY_PRIOR_STEPS = 1;
/** Safe bound on the blended per-step estimate relative to the historical rate. */
const RATE_FLOOR = .25;
const RATE_CEILING = 4;
/** Percentile of the step-duration history used as the central per-step rate. */
const RATE_PERCENTILE = .4;
/** Percentiles of the empirical predictive distribution reported as the range. */
const INTERVAL_LOW_PERCENTILE = .08;
const INTERVAL_HIGH_PERCENTILE = .92;
/** Cap on `remaining steps x sample` combinations evaluated per prediction. */
const MAX_INTERVAL_COMBINATIONS = 1500;
/** Runway kept when the turn already outran every finished turn in the session. */
const OUTRUN_GROWTH = .25;
const OUTRUN_MINIMUM = 2;
/**
* Expected step count assumed before the session has any finished turn, so the
* very first turn still gets a live estimate instead of an endless indeterminate
* bar.
*/
const BOOTSTRAP_EXPECTED_STEPS = 10;
/** Median of a non-empty ascending numeric list, or undefined for an empty list. */
function median(values) {
	if (values.length === 0) return void 0;
	return values[Math.floor(values.length / 2)];
}
/** Linear-interpolated quantile of an already ascending list. */
function quantile(sorted, fraction) {
	if (sorted.length === 0) return 0;
	if (sorted.length === 1) return sorted[0];
	const position = fraction * (sorted.length - 1);
	const lower = Math.floor(position);
	const upper = Math.ceil(position);
	if (lower === upper) return sorted[lower];
	const weight = position - lower;
	return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}
/** Ascending copy of a numeric list. */
function ascending(values) {
	return [...values].sort((left, right) => left - right);
}
/**
* Expected total step count for a turn that has already completed `completedSteps`.
*
* The anchor is the conditional median of the finished turns that were at least
* this long: a turn that has already outlived the typical turn is expected to
* outlive it further, but no faster than the observed distribution suggests.
* @param completedTurnSteps - step counts of the session's finished turns.
* @param completedSteps - steps completed in the open turn.
* @returns the expected total step count.
*/
function expectedTotalSteps(completedTurnSteps, completedSteps) {
	const base = median(ascending(completedTurnSteps)) ?? BOOTSTRAP_EXPECTED_STEPS;
	if (completedSteps <= 0) return base;
	const longer = completedTurnSteps.filter((count) => count >= completedSteps);
	if (longer.length > 0) return Math.max(base, median(ascending(longer)));
	return Math.max(base, completedSteps + Math.max(OUTRUN_MINIMUM, Math.ceil(completedSteps * OUTRUN_GROWTH)));
}
/**
* Empirical predictive distribution of the remaining wall time: every observed
* `remaining steps x step duration` combination the session's own history admits.
* @param input - fold samples.
* @param completedSteps - steps completed in the open turn.
* @returns ascending remaining-time samples, empty without usable history.
*/
function remainingCandidates(input, completedSteps) {
	const closed = input.completedTurnSteps.filter((count) => count >= completedSteps);
	const rates = input.stepSamples;
	if (closed.length === 0 || rates.length === 0) return [];
	const stride = Math.max(1, Math.ceil(closed.length * rates.length / MAX_INTERVAL_COMBINATIONS));
	const out = [];
	let index = 0;
	for (const count of closed) for (const rate of rates) if (index++ % stride === 0) out.push((count - completedSteps) * rate);
	return ascending(out);
}
/**
* Derive one remaining-time core from the open turn's facts.
*
* The estimate is a robust per-step rate times the expected total step count;
* `interval` is an empirical predictive range. The published total is held while
* it still outruns the turn and re-anchored to the live estimate once the turn
* runs past it, so the estimate stays meaningful for long turns without reacting
* to every noisy sample. `insufficient-data` omits every numeric field rather
* than guessing.
* @param input - open-turn anchors and observed step samples.
* @returns the shared prediction core.
*/
function etaCore(input) {
	const completedSteps = input.stepDurations.length;
	const elapsedMs = Math.max(0, input.asOf - input.startTime);
	const base = {
		elapsedMs,
		completedSteps,
		method: "insufficient-data"
	};
	const samples = ascending(input.stepSamples);
	const central = samples.length === 0 ? void 0 : quantile(samples, RATE_PERCENTILE);
	if (central === void 0 || central <= 0) return base;
	const expectedSteps = expectedTotalSteps(input.completedTurnSteps, completedSteps);
	const currentRate = completedSteps >= 1 ? elapsedMs / completedSteps : void 0;
	const blended = currentRate === void 0 ? central : (completedSteps * currentRate + HISTORY_PRIOR_STEPS * central) / (completedSteps + HISTORY_PRIOR_STEPS);
	const meanStepMs = Math.min(Math.max(blended, RATE_FLOOR * central), RATE_CEILING * central);
	const rawTotalMs = meanStepMs * expectedSteps;
	const previousTotalMs = input.previousTotalMs;
	const predictedTotalMs = previousTotalMs === void 0 ? rawTotalMs : rawTotalMs > previousTotalMs && elapsedMs >= previousTotalMs ? rawTotalMs : Math.min(rawTotalMs, previousTotalMs);
	const remainingMs = Math.max(0, predictedTotalMs - elapsedMs);
	const candidates = remainingCandidates(input, completedSteps);
	const lowMs = candidates.length > 0 ? Math.min(quantile(candidates, INTERVAL_LOW_PERCENTILE), remainingMs) : remainingMs * .5;
	const highMs = candidates.length > 0 ? Math.max(quantile(candidates, INTERVAL_HIGH_PERCENTILE), remainingMs) : remainingMs * 2;
	return {
		...base,
		expectedSteps,
		meanStepMs,
		predictedTotalMs,
		remainingMs,
		interval: {
			lowMs: Math.max(0, lowMs),
			highMs: Math.max(0, highMs)
		},
		method: "step-mean"
	};
}
//#endregion
//#region src/samples.ts
/** Append a sample to a bounded oldest-dropped history. */
function bounded(history, value, limit) {
	const next = [...history, value];
	return next.length > limit ? next.slice(next.length - limit) : next;
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
					lastStep: 0,
					lastTotalMs: void 0
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
					open.stepDurations = bounded(open.stepDurations, duration, 200);
					state.stepSamples = bounded(state.stepSamples, duration, 500);
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
				if (record.stepCount >= 1) state.completedTurnSteps = bounded(state.completedTurnSteps, record.stepCount, 200);
				return { record };
			}
			default: return {};
		}
	}
	predict(session, open, asOf) {
		const state = this.state(session);
		const core = etaCore({
			startTime: open.startTime,
			stepDurations: open.stepDurations,
			completedTurnSteps: state.completedTurnSteps,
			stepSamples: state.stepSamples,
			asOf,
			previousTotalMs: open.lastTotalMs
		});
		if (core.predictedTotalMs !== void 0) open.lastTotalMs = core.predictedTotalMs;
		return {
			sessionId: session.id,
			turn: open.turn,
			step: open.lastStep,
			...core
		};
	}
};
//#endregion
//#region src/projection.ts
/**
* The `turnEta` projection unit: a pure whole-log fold of turn and step events
* into the live remaining-time prediction the Web client renders under the
* composer. State is plain JSON so the persisted projection cache can seed a
* fold; the wire view reuses one object per state so an unchanged fold publishes
* nothing.
* @module @deepseek-ai/dsh-session-turn-eta/projection
*/
const openTurnSchema = z.object({
	turn: z.number().int().nonnegative(),
	startTime: z.number().nonnegative(),
	asOf: z.number().nonnegative(),
	stepDurations: z.array(z.number().nonnegative()),
	openStepStart: z.number().nonnegative().optional(),
	lastStep: z.number().int().nonnegative(),
	lastTotalMs: z.number().nonnegative().optional()
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
/** The estimator inputs implied by a fold state and one open turn. */
function inputsFor(state, open, asOf) {
	return {
		startTime: open.startTime,
		stepDurations: open.stepDurations,
		completedTurnSteps: state.completedTurnSteps,
		stepSamples: state.stepSamples,
		asOf
	};
}
/**
* Advance the open turn to `asOf` with a patch, refreshing the published total
* so the next view reads the same total the estimator just published.
*/
function advanceOpen(state, open, asOf, patch) {
	const next = {
		...open,
		...patch,
		asOf
	};
	const core = etaCore({
		...inputsFor(state, next, asOf),
		previousTotalMs: next.lastTotalMs
	});
	if (core.predictedTotalMs === void 0) return next;
	return {
		...next,
		lastTotalMs: core.predictedTotalMs
	};
}
function computeView(state) {
	const open = state.open;
	if (open !== void 0) {
		const core = etaCore({
			...inputsFor(state, open, open.asOf),
			previousTotalMs: open.lastTotalMs
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
	stateVersion: 2,
	stateSchema,
	init: () => EMPTY_STATE,
	apply: (state, event) => {
		switch (event.type) {
			case "turn/start": return {
				...state,
				open: advanceOpen(state, {
					turn: event.data.turn,
					startTime: event.time,
					asOf: event.time,
					stepDurations: [],
					lastStep: 0
				}, event.time, {})
			};
			case "step/start": {
				const open = state.open;
				if (open === void 0 || open.turn !== event.data.turn) return state;
				return {
					...state,
					open: advanceOpen(state, open, event.time, {
						openStepStart: event.time,
						lastStep: event.data.step
					})
				};
			}
			case "step/end": {
				const open = state.open;
				if (open === void 0 || open.turn !== event.data.turn) return state;
				if (open.openStepStart === void 0) return state;
				const duration = Math.max(0, event.time - open.openStepStart);
				const nextState = {
					...state,
					stepSamples: bounded(state.stepSamples, duration, 500)
				};
				return {
					...nextState,
					open: advanceOpen(nextState, open, event.time, {
						stepDurations: bounded(open.stepDurations, duration, 200),
						openStepStart: void 0,
						lastStep: event.data.step
					})
				};
			}
			case "assistant/message":
			case "tool/call":
			case "tool/result": {
				const open = state.open;
				if (open === void 0 || open.turn !== event.data.turn) return state;
				return {
					...state,
					open: advanceOpen(state, open, event.time, { lastStep: event.data.step })
				};
			}
			case "turn/end": {
				const open = state.open;
				if (open === void 0 || open.turn !== event.data.turn) return state;
				const completed = event.data.reason.kind === "completed";
				const stepCount = open.stepDurations.length;
				return {
					...state,
					completedTurnSteps: stepCount >= 1 ? bounded(state.completedTurnSteps, stepCount, 200) : state.completedTurnSteps,
					last: {
						turn: open.turn,
						durationMs: Math.max(0, event.time - open.startTime),
						stepCount,
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