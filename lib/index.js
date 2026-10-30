import { z } from "zod";
//#region src/predict.ts
/** Prior weight, in steps, of the historical rate against the live turn's own rate. */
const HISTORY_PRIOR_STEPS = 1;
/**
* Percentile of the step-duration history used as the central per-step rate.
* The duration distribution is strongly right-skewed, so the central rate has to
* sit high in the distribution to track the steps that actually dominate a turn.
* Measured on a rebuilt 131-session archive (42,853 train / 70,586 held-out
* live predictions), raising this from 0.6 to 0.9 shrank the remaining-time
* error on both halves and removed most of the systematic under-prediction.
*/
const RATE_PERCENTILE = .9;
/**
* Fraction of the published total the turn must reach before the estimate may be
* re-anchored upward.
*
* Holding the total until the turn has *fully* outrun it (`1`) pins the bar to
* the first estimate of the turn: on a turn that keeps working, the real total
* is several times the early anchor, so the bar undershoots badly and the
* remaining time stays wrong for the whole turn. Releasing at the halfway point
* measured best on both halves of the rebuilt archive: median remaining-time
* bias -0.29 -> +0.02 on the train half and -0.46 -> -0.29 on the held-out
* half, with median APE improving on both (0.775 -> 0.769 and 0.771 -> 0.754)
* and the overrun share dropping below half on the train half (0.60 -> 0.49).
*/
const REANCHOR_AT = .5;
/** Cap, as a multiple of the median, applied before reading the high quantile. */
const OUTLIER_CAP = 8;
/** Safe bound on the blended per-step estimate relative to the historical median. */
const RATE_FLOOR = .25;
const RATE_CEILING = 4;
/** Runway kept when the turn already outran every finished turn in the session. */
const OUTRUN_GROWTH = .25;
const OUTRUN_MINIMUM = 2;
/**
* Expected step count assumed before the session has any finished turn, so the
* very first turn still gets a live estimate instead of an endless indeterminate
* bar. Every later turn replaces it with the session's own median.
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
/**
* Robust high quantile for a right-skewed sample: clamp the sample to its own
* median times a generous multiple first, so one 9-hour idle step cannot single
* handedly drag the central rate up, then take the quantile of the clamped list.
* @param sorted - ascending step durations.
* @param fraction - the quantile to read off the clamped list.
* @returns the robust quantile (0 for an empty list).
*/
function robustQuantile(sorted, fraction) {
	if (sorted.length === 0) return 0;
	const centre = median(sorted);
	if (!(centre > 0)) return quantile(sorted, fraction);
	const cap = centre * OUTLIER_CAP;
	if (sorted.length === 1) return Math.min(sorted[0], cap);
	const position = fraction * (sorted.length - 1);
	const lower = Math.floor(position);
	const upper = Math.ceil(position);
	const low = Math.min(sorted[lower], cap);
	if (lower === upper) return low;
	const high = Math.min(sorted[upper], cap);
	return low * (1 - (position - lower)) + high * (position - lower);
}
/**
* Memo of the ascending copy of a sample list, keyed by the list reference.
*
* A fold appends (`[...samples, next]`) rather than mutating, so one list
* instance lives per state change; caching by reference turns the sort into one
* per appended sample instead of one per prediction (the same list is read by
* both the anchor advance and the view of the same event).
*/
const sortedByReference = /* @__PURE__ */ new WeakMap();
/** Ascending copy of a numeric list, memoised for as long as the list lives. */
function sortedSamples(values) {
	const cached = sortedByReference.get(values);
	if (cached !== void 0) return cached;
	const sorted = ascending(values);
	sortedByReference.set(values, sorted);
	return sorted;
}
/** Rate profile of one sample list; cached per list reference, like the sort. */
const profiles = /* @__PURE__ */ new WeakMap();
/**
* Read the central, low and high step rates off one history.
*
* A sample list only changes when a step ends, while the estimator runs on every
* event inside the step (messages, tool calls, results). Caching the profile by
* list reference pays the clamp-quantile scan once per finished step instead of
* once per event, which is what keeps the fold linear in the event count rather
* than quadratic in it.
*/
function rateProfile(samples) {
	const cached = profiles.get(samples);
	if (cached !== void 0) return cached;
	const sorted = sortedSamples(samples);
	const profile = {
		historyRate: robustQuantile(sorted, RATE_PERCENTILE),
		lowRate: quantile(sorted, .25),
		highRate: quantile(sorted, .75)
	};
	profiles.set(samples, profile);
	return profile;
}
/**
* Insert one value into an ascending list, keeping it ascending.
* @param sorted - ascending numeric list.
* @param value - the value to insert.
* @returns a new ascending list (the input is untouched).
*/
function insertSorted(sorted, value) {
	const at = lowerBound(sorted, value);
	const out = new Array(sorted.length + 1);
	for (let i = 0; i < at; i++) out[i] = sorted[i];
	out[at] = value;
	for (let i = at; i < sorted.length; i++) out[i + 1] = sorted[i];
	return out;
}
/**
* Append one step duration to a sample list, warming the sorted memo for the
* result.
*
* The fold appends one sample per finished step; sorting the whole list again
* on every append would make a long session cost quadratic time per event, so
* the ascending copy is grown by insertion instead.
* @param samples - the previous sample list.
* @param value - the duration to append.
* @returns the new sample list.
*/
function withSample(samples, value) {
	const next = [...samples, value];
	sortedByReference.set(next, insertSorted(sortedSamples(samples), value));
	return next;
}
/** Ascending copy of a numeric list. */
function ascending(values) {
	return [...values].sort((left, right) => left - right);
}
/** Ascending copy of the completed-turn step counts, cached per list reference. */
const anchors = /* @__PURE__ */ new WeakMap();
/** Ascending step counts of the finished turns, memoised for as long as the list lives. */
function sortedCompletedSteps(completedTurnSteps) {
	const cached = anchors.get(completedTurnSteps);
	if (cached !== void 0) return cached;
	const sorted = ascending(completedTurnSteps);
	anchors.set(completedTurnSteps, sorted);
	return sorted;
}
/**
* Index of the first entry of an ascending list that is at least `value`.
* @param sorted - ascending numeric list.
* @param value - the lower bound to find.
* @returns the index, or the list length when every entry is smaller.
*/
function lowerBound(sorted, value) {
	let low = 0;
	let high = sorted.length;
	while (low < high) {
		const middle = low + high >>> 1;
		if (sorted[middle] < value) low = middle + 1;
		else high = middle;
	}
	return low;
}
/**
* Expected total step count for a turn that has already completed `completedSteps`.
*
* The anchor is the median of the completed turns that were at least this long:
* a turn that has already outlived the typical turn is expected to outlive it
* further, but no faster than the observed distribution suggests. When no
* completed turn was this long, grow the observed count by a fixed runway.
*
* Both the median of the whole history and the median of its `>= completedSteps`
* suffix are read off one ascending copy, so a live turn costs a binary search
* plus an index read per event instead of a filter and a sort.
* @param completedTurnSteps - step counts of this session's completed turns.
* @param completedSteps - steps completed in the open turn.
* @returns the expected total step count, or undefined without history.
*/
function expectedTotalSteps(completedTurnSteps, completedSteps) {
	const sorted = sortedCompletedSteps(completedTurnSteps);
	const base = median(sorted) ?? BOOTSTRAP_EXPECTED_STEPS;
	if (completedSteps <= 0) return base;
	const from = lowerBound(sorted, completedSteps);
	if (from < sorted.length) {
		const longer = sorted[from + Math.floor((sorted.length - from) / 2)];
		return Math.max(base, longer);
	}
	return Math.max(base, completedSteps + Math.max(OUTRUN_MINIMUM, Math.ceil(completedSteps * OUTRUN_GROWTH)));
}
/**
* Derive one remaining-time core from the open turn's facts.
*
* The estimate is a robust per-step rate times the anchored expected step count.
* The rate blends the live turn's own observed rate (elapsed over completed
* steps, so it includes per-turn overhead) with the historical median step
* duration. The published total is held while it still outruns the turn and
* re-anchored to the live estimate once the turn runs past it, so the estimate
* stays meaningful for arbitrarily long turns without reacting to every noisy
* sample. `insufficient-data` omits every numeric field rather than guessing.
* @param input - open-turn anchors and observed step samples.
* @returns the shared prediction core.
*/
function etaCore(input) {
	const completedSteps = input.stepDurations.length;
	const elapsedMs = Math.max(0, input.asOf - input.startTime);
	const historyRate = input.stepSamples.length === 0 ? void 0 : rateProfile(input.stepSamples).historyRate;
	const base = {
		elapsedMs,
		completedSteps,
		method: "insufficient-data"
	};
	if (historyRate === void 0 || historyRate <= 0) return base;
	const expectedSteps = expectedTotalSteps(input.completedTurnSteps, completedSteps);
	if (expectedSteps === void 0 || expectedSteps < 1) return base;
	const currentRate = completedSteps >= 1 ? elapsedMs / completedSteps : void 0;
	const blended = currentRate === void 0 ? historyRate : (completedSteps * currentRate + HISTORY_PRIOR_STEPS * historyRate) / (completedSteps + HISTORY_PRIOR_STEPS);
	const meanStepMs = Math.min(Math.max(blended, RATE_FLOOR * historyRate), RATE_CEILING * historyRate);
	const rawTotalMs = meanStepMs * expectedSteps;
	const previousTotalMs = input.previousTotalMs;
	let predictedTotalMs = previousTotalMs === void 0 ? rawTotalMs : rawTotalMs > previousTotalMs && elapsedMs >= previousTotalMs * REANCHOR_AT ? rawTotalMs : Math.min(rawTotalMs, previousTotalMs);
	if (predictedTotalMs <= elapsedMs) predictedTotalMs = Math.max(rawTotalMs, elapsedMs + Math.max(meanStepMs, 1));
	const remainingMs = Math.max(0, predictedTotalMs - elapsedMs);
	const { lowRate, highRate } = rateProfile(input.stepSamples);
	const interval = {
		lowMs: Math.max(0, Math.min(lowRate * expectedSteps, predictedTotalMs) - elapsedMs),
		highMs: Math.max(0, highRate * expectedSteps - elapsedMs)
	};
	return {
		...base,
		expectedSteps,
		meanStepMs,
		predictedTotalMs,
		remainingMs,
		interval,
		method: "step-mean"
	};
}
/**
* The estimator's tuning constants, exported so a host — or a future agent
* runtime that wants the same calibration — can read them instead of copying
* numbers. The comments above each constant carry the measurement behind it.
*/
const ETA_TUNING = {
	/** Prior weight, in steps, of the historical rate against the live rate. */
	HISTORY_PRIOR_STEPS,
	/** Percentile of the step-duration history read as the central rate. */
	RATE_PERCENTILE,
	/** Fraction of the published total the turn must reach before re-anchoring. */
	REANCHOR_AT,
	/** Cap, as a multiple of the median, applied before reading a high quantile. */
	OUTLIER_CAP,
	/** Safe bound on the blended per-step estimate, relative to the history. */
	RATE_FLOOR,
	RATE_CEILING,
	/** Runway kept when the turn already outran every finished turn. */
	OUTRUN_GROWTH,
	OUTRUN_MINIMUM,
	/** Expected number of steps before the session has any finished turn. */
	BOOTSTRAP_EXPECTED_STEPS
};
//#endregion
//#region src/projection.ts
/**
* The \`turnEta\` projection unit: a pure whole-log fold of turn and step
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
/** The empty-log state; a fresh instance per fold, since a unit owns its state. */
function emptyTurnEtaState() {
	return {
		completedTurnSteps: [],
		stepSamples: []
	};
}
/** The wire view for one fold state; cached per state reference. */
const views = /* @__PURE__ */ new WeakMap();
/**
* The prediction core already computed for one open-turn state, keyed by the
* open object reference.
*
* Advancing the open turn has to run the estimator to refresh the monotonic
* total anchor, and the view of the very same event would run it again with the
* refreshed anchor. That second run is pure idempotence (see `etaCore`: feeding
* back its own total can only reproduce it), so the first result is reused.
*/
const cores = /* @__PURE__ */ new WeakMap();
/**
* Advance the open turn to \`asOf\` with a patch, refreshing the monotonic total
* anchor so the next view reads the same total the estimator just published.
*/
function advanceOpen(state, open, asOf, patch) {
	const next = {
		...open,
		...patch,
		asOf
	};
	const core = etaCore({
		startTime: next.startTime,
		stepDurations: next.stepDurations,
		completedTurnSteps: state.completedTurnSteps,
		stepSamples: state.stepSamples,
		asOf,
		previousTotalMs: next.lastTotalMs
	});
	const anchored = core.predictedTotalMs === void 0 ? next : {
		...next,
		lastTotalMs: core.predictedTotalMs
	};
	cores.set(anchored, core);
	return anchored;
}
function computeView(state) {
	const open = state.open;
	if (open !== void 0) {
		const cached = cores.get(open);
		if (cached !== void 0) return {
			turn: open.turn,
			step: open.lastStep,
			open: true,
			startTime: open.startTime,
			...cached
		};
		const core = etaCore({
			startTime: open.startTime,
			stepDurations: open.stepDurations,
			completedTurnSteps: state.completedTurnSteps,
			stepSamples: state.stepSamples,
			asOf: open.asOf,
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
/** The \`turnEta\` unit registered on \`ctx.sessionProjections\` (exported for the unit spec). */
const turnEtaProjectionDefinition = {
	key: "turnEta",
	stateVersion: 2,
	stateSchema,
	init: (_header, _inheritedEventCount) => emptyTurnEtaState(),
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
				const stepDurations = open.openStepStart === void 0 ? open.stepDurations : [...open.stepDurations, Math.max(0, event.time - open.openStepStart)];
				const stepSamples = open.openStepStart === void 0 ? state.stepSamples : withSample(state.stepSamples, Math.max(0, event.time - open.openStepStart));
				const next = {
					...state,
					stepSamples
				};
				return {
					...next,
					open: advanceOpen(next, open, event.time, {
						stepDurations,
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
					completedTurnSteps: stepCount >= 1 ? [...state.completedTurnSteps, stepCount] : state.completedTurnSteps,
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
//#region src/fold.ts
/**
* Standalone driver for the `turnEta` fold: feed it the durable session events,
* read the prediction. No Cordis context, no registry, no `Session` object — the
* same fold the desktop app runs, usable from a script or from another agent's
* runtime that only wants the numbers.
*
* ```ts
* import { createTurnEtaFold } from '@dsh-external/dsh-session-turn-eta'
* const fold = createTurnEtaFold()
* for (const event of log) fold.apply(event)
* fold.view().remainingMs
* ```
*
* @module @deepseek-ai/dsh-session-turn-eta/fold
*/
/**
* Create an empty fold.
* @param seed - a previously captured state (e.g. a projection checkpoint) to
* continue from instead of replaying the whole log; its schema is not re-validated.
* @returns a fold ready to consume events.
*/
function createTurnEtaFold(seed) {
	let state = seed ?? emptyTurnEtaState();
	return {
		apply(event) {
			state = turnEtaProjectionDefinition.apply(state, event);
			return turnEtaProjectionDefinition.wire.view(state);
		},
		view: () => turnEtaProjectionDefinition.wire.view(state),
		state: () => state
	};
}
//#endregion
//#region src/index.ts
/** Cordis plugin name. */
const name = "session-turn-eta";
/** The projection registry is the client-facing half; without it the fiber stays pending. */
const inject = ["sessionProjections"];
/**
* Mint the `turn-eta/update` payload from one published projection view: the
* view carries every predicted field, only the session id lives elsewhere.
* @param session - session the view belongs to.
* @param view - the open turn's published projection view.
* @returns the event payload.
*/
function toPrediction(session, view) {
	return {
		sessionId: session.id,
		turn: view.turn,
		step: view.step,
		elapsedMs: view.elapsedMs,
		completedSteps: view.completedSteps,
		expectedSteps: view.expectedSteps,
		meanStepMs: view.meanStepMs,
		predictedTotalMs: view.predictedTotalMs,
		remainingMs: view.remainingMs,
		interval: view.interval,
		method: view.method
	};
}
/**
* Mint the `turn-eta/complete` payload for a closed-turn view. Returns
* undefined for the pre-first-turn empty view, so nothing is emitted before a
* turn has ever finished.
* @param session - session the view belongs to.
* @param view - the published projection view.
* @returns the event payload, or undefined when no turn has finished.
*/
function toRecord(session, view) {
	if (view.open || view.turn <= 0 || view.durationMs === void 0) return void 0;
	return {
		sessionId: session.id,
		turn: view.turn,
		durationMs: view.durationMs,
		stepCount: view.completedSteps,
		completed: view.completed === true,
		reason: view.reason ?? "unknown"
	};
}
/**
* Register the `turnEta` projection and bridge its change feed to the plugin's
* typed events. The registry notifies only when the published view changed by
* `Object.is`, which is exactly the emission granularity the two events want:
* one `turn-eta/update` per event that actually moved the bar, and one
* `turn-eta/complete` when the open turn closes.
* @param ctx - context whose projection registry receives the unit.
*/
function apply(ctx) {
	ctx.sessionProjections.register(turnEtaProjectionDefinition);
	ctx.sessionProjections.onChanged((session, key, value) => {
		if (key !== "turnEta") return;
		const view = value;
		if (view.open) {
			const prediction = toPrediction(session, view);
			ctx.logger.debug(`turn-eta: session "${String(session.id)}" turn ${prediction.turn} ${prediction.method} remaining=${String(prediction.remainingMs)}ms`);
			ctx.emit("turn-eta/update", prediction);
			return;
		}
		const record = toRecord(session, view);
		if (record === void 0) return;
		ctx.logger.info(`turn-eta: session "${String(session.id)}" turn ${record.turn} duration=${record.durationMs}ms steps=${record.stepCount} reason=${record.reason} completed=${String(record.completed)}`);
		ctx.emit("turn-eta/complete", record);
	});
}
//#endregion
export { ETA_TUNING, apply, ascending, createTurnEtaFold, emptyTurnEtaState, etaCore, expectedTotalSteps, inject, insertSorted, median, name, quantile, robustQuantile, turnEtaProjectionDefinition, withSample };

//# sourceMappingURL=index.js.map