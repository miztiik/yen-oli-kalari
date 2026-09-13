/* Voice evaluation surface - behaviour.
 *
 * No framework and no build step. The page must open from a file path on any
 * machine, which is why the data arrives as a script that assigns a global
 * rather than a fetch a browser would refuse against `file://`.
 *
 * The state this page owns is one object keyed by run id and then clip id, so
 * judging a second model never overwrites the first. It persists to
 * localStorage on every change, because a listener who gets through twenty
 * clips and loses them to a refresh will not do it twice.
 */

(function () {
	'use strict';

	/* The page is a SHELL. It fetches an index naming the runs, then fetches one
	   manifest at a time as a voice is selected - rather than being prerendered
	   with every clip of every model inlined, which reached half a megabyte at
	   six voices and would have grown linearly with each one added.
	   A reader pays for the voice they open and nothing else. */
	var DATA = { runs: [], catalogue: {}, generatedAt: new Date().toISOString() };
	var manifestCache = {};
	var STORE_KEY = 'yen-oli-kalari:voice-evaluation:v2';

	/* Past this the dock says it is fetching. A spinner spins at the same rate on
	   a 200 ms wait and a dead socket, so it measures nothing. */
	var SLOW_MS = 400;

	var SCORES = [
		{ key: 'intelligibility', label: 'Intelligibility', hint: 'every word made out, no replay' },
		{ key: 'pronunciation', label: 'Pronunciation', hint: 'names, numbers, acronyms' },
		{ key: 'prosody', label: 'Prosody', hint: 'rhythm, emphasis, pauses' },
		{ key: 'seams', label: 'Seams', hint: '5 = no join heard' }
	];

	var DEFECT_KINDS = [
		'mispronunciation', 'audible-seam', 'truncation',
		'artifact', 'wrong-pace', 'wrong-emphasis', 'other'
	];

	var HAZARD_LABELS = {
		currency: 'currency', percent: 'percentage', bigNumber: 'number',
		acronym: 'acronym', date: 'date', hyphenate: 'hyphenated', quoted: 'quote'
	};

	// ---------------------------------------------------------------- state

	var state = { runs: {}, pairs: [] };
	/* Set by boot() once the index has been fetched. Nothing may read a run
	   before then, which is why the shell renders only after the fetch. */
	var activeRunId = null;
	var current = -1;
	var abIndex = 0;
	var abBlind = true;

	/* State is held in memory and mirrored to IndexedDB. Writes are debounced
	   because a listener dragging across five score buttons should cost one
	   write rather than five, and a failed write must never lose the click that
	   caused it. */
	var saveTimer = null;

	function save() {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(function () {
			window.EvaluationStore.put('state', state).then(function (ok) {
				if (!ok) $('storage-status').textContent = 'Could not save - storage is full or blocked.';
			});
		}, 250);
	}

	function entry(runId, clipId) {
		if (!state.runs[runId]) state.runs[runId] = {};
		if (!state.runs[runId][clipId]) {
			state.runs[runId][clipId] = { scores: {}, defects: [], verdict: null, note: '' };
		}
		return state.runs[runId][clipId];
	}

	function runById(id) {
		for (var i = 0; i < DATA.runs.length; i += 1) if (DATA.runs[i].runId === id) return DATA.runs[i];
		return DATA.runs[0];
	}

	function activeRun() {
		var run = runById(activeRunId);
		/* Until its manifest lands a run has no clips. Every caller already
		   handles an empty list, because a run with nothing voiced is a state
		   the page has to draw anyway. */
		return Object.assign({ clips: [] }, run, manifestCache[run.runId] || {});
	}

	/** Fetch one run's manifest, once, then redraw. */
	function loadRun(runId) {
		var run = runById(runId);
		if (manifestCache[runId]) return Promise.resolve(manifestCache[runId]);
		return fetch(run.manifestUrl)
			.then(function (response) {
				if (!response.ok) throw new Error('HTTP ' + response.status);
				return response.json();
			})
			.then(function (manifest) {
				if (run.clipExtension) {
					manifest.clips.forEach(function (clip) {
						clip.clip = clip.clip.replace(/\.wav$/, run.clipExtension);
					});
				}
				manifest.clipBase = run.clipBase;
				manifestCache[runId] = manifest;
				return manifest;
			})
			.catch(function (error) {
				/* A run whose manifest will not load is reported where the clips
				   would have been, rather than leaving an empty list that reads
				   as a model with nothing to say. */
				manifestCache[runId] = { clips: [], loadError: String(error.message) };
				return manifestCache[runId];
			});
	}

	/* What a run says about itself wins over the catalogue.
	   The manifest is written by the arm that actually ran, so its licence,
	   parameters and accent are facts about the thing measured; the catalogue is
	   a lookup that goes stale the moment a config row is renamed. It stays as a
	   fallback for anything the manifest does not carry, and it is the ONLY
	   source for what is true of a model rather than of a reading of it - the
	   source URLs, the architecture note, the Arena standing, the warning.

	   IT IS KEYED ON THE HUGGING FACE REPOSITORY ID. It used to be looked up by
	   `run.modelSlug`, which is the results directory - a RUN id like
	   `kokoro-fp32-uk`, never a model slug - and the index never shipped a
	   catalogue at all, so `DATA.catalogue` was `{}` on every load and this
	   whole merge resolved to undefined. Two bugs, one symptom: no source URL
	   has ever been on screen. */
	function known(run) {
		var catalogued =
			(DATA.catalogue &&
				(DATA.catalogue[run.modelId] ||
					DATA.catalogue[run.modelSlug] ||
					DATA.catalogue[run.runId])) ||
			{};
		function pick(key) {
			return run[key] !== undefined && run[key] !== null ? run[key] : catalogued[key];
		}
		return {
			name: pick('name'),
			params: pick('params'),
			architecture: pick('architecture'),
			architectureNote: catalogued.architectureNote,
			licence: pick('licence'),
			commercialUse: pick('commercialUse'),
			accent: pick('accent'),
			accentKnown: pick('accentKnown'),
			languages: catalogued.languages,
			voices: catalogued.voices,
			sampleRateHz: run.sampleRate || catalogued.sampleRateHz,
			sizeGb: pick('sizeGb'),
			releasedOn: catalogued.releasedOn,
			arenaElo: pick('arenaElo'),
			arenaRank: catalogued.arenaRank,
			arenaNote: catalogued.arenaNote,
			incumbent: pick('incumbent'),
			warning: catalogued.warning,
			links: catalogued.links || null
		};
	}

	/* ------------------------------------------------- telling runs apart

	   A run is one model at ONE CONFIGURATION, so two runs of the same model at
	   different settings are different readings and must never look like the
	   same row. The page used to label every run `name + quantisation`, which
	   made `kokoro-fp32-uk` at 40-word chunks and the same model at 25-word
	   chunks render identically in six places - the model card, both cross-run
	   charts, the dock title, the A/B selector and the A/B tally. That is the
	   false comparison the whole run contract exists to prevent, reintroduced
	   at the last step.

	   The configuration lives in `run.config` (index) or `run.run.config`
	   (manifest), depending on which the page has fetched. Both are read. */

	function configOf(r) {
		return (r && ((r.run && r.run.config) || r.config)) || null;
	}

	function isolatedOf(r) {
		if (!r) return false;
		if (r.run && typeof r.run.isolated === 'boolean') return r.run.isolated;
		return r.isolated === true;
	}

	function notIsolatedBecauseOf(r) {
		return (r && ((r.run && r.run.notIsolatedBecause) || r.notIsolatedBecause)) || '';
	}

	/* How a knob reads to a person. `0` means "no limit" for two of them, and a
	   reader should not have to know that. */
	var KNOB_LABELS = {
		maxWordsAChunk: function (v) { return v + 'w chunks'; },
		repeats: function (v) { return v + ' repeats'; },
		threads: function (v) { return v ? v + ' threads' : 'auto threads'; },
		maxItems: function (v) { return v ? v + ' items' : 'all items'; },
		shards: function (v) { return v + ' shards'; }
	};
	var KNOB_SHORT = {
		maxWordsAChunk: function (v) { return 'c' + v; },
		repeats: function (v) { return 'r' + v; },
		threads: function (v) { return 't' + (v || 'auto'); },
		maxItems: function (v) { return 'i' + (v || 'all'); },
		shards: function (v) { return 's' + v; }
	};

	/* Which knobs actually DIFFER across the runs on the page.
	   Showing all five on every label would be noise when every run shares
	   them; showing none is the bug. So the label carries exactly the knobs
	   that distinguish this run from the others, which is the smallest honest
	   answer and shrinks to nothing when there is nothing to say. */
	function varyingKnobs() {
		var seen = {};
		var any = false;
		DATA.runs.forEach(function (r) {
			var c = configOf(r);
			if (!c) return;
			any = true;
			Object.keys(KNOB_LABELS).forEach(function (k) {
				if (!seen[k]) seen[k] = {};
				seen[k][String(c[k])] = true;
			});
		});
		if (!any) return [];
		return Object.keys(KNOB_LABELS).filter(function (k) {
			return Object.keys(seen[k] || {}).length > 1;
		});
	}

	/* THE ONE PLACE A RUN IS NAMED. Every surface calls this, so a run cannot
	   be labelled one way on a card and another in a chart. */
	function runLabel(r, opts) {
		opts = opts || {};
		var meta = known(r);
		var base = (meta.name || r.modelSlug || r.runId);
		if (opts.short) base = base.split(' ')[0];
		var parts = [base];
		if (r.quantisation) parts.push(r.quantisation);
		if (r.voice && !opts.short) parts.push(r.voice);

		var vary = varyingKnobs();
		var c = configOf(r);
		if (c && vary.length) {
			var table = opts.short ? KNOB_SHORT : KNOB_LABELS;
			parts.push(vary.map(function (k) { return table[k](c[k]); }).join(opts.short ? '-' : ', '));
		}
		return parts.join(' \u00b7 ');
	}

	// ------------------------------------------------------------- helpers

	function el(tag, attrs, kids) {
		var node = document.createElement(tag);
		if (attrs) {
			Object.keys(attrs).forEach(function (k) {
				if (k === 'text') node.textContent = attrs[k];
				else if (k === 'html') node.innerHTML = attrs[k];
				else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
			});
		}
		(kids || []).forEach(function (kid) { if (kid) node.appendChild(kid); });
		return node;
	}

	function clock(seconds) {
		if (!isFinite(seconds) || seconds < 0) seconds = 0;
		var m = Math.floor(seconds / 60);
		var s = Math.floor(seconds % 60);
		return m + ':' + (s < 10 ? '0' : '') + s;
	}

	function $(id) { return document.getElementById(id); }

	/* One icon set, referenced rather than pasted. The controls used to carry
	   arrowhead CHARACTERS - a black right-pointing triangle, two vertical bars -
	   and a text glyph is whatever the reader's font decides it is. On a Windows
	   default stack that is a set of black rectangles, which is what "ugly blocks
	   view" was describing. */
	function icon(name) {
		var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('class', 'icon');
		svg.setAttribute('aria-hidden', 'true');
		var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
		use.setAttribute('href', '#i-' + name);
		svg.appendChild(use);
		return svg;
	}

	function setIcon(button, name) {
		var use = button.querySelector('use');
		if (use) use.setAttribute('href', '#i-' + name);
		else button.appendChild(icon(name));
	}

	// -------------------------------------------------------------- charts

	/* d3, from the vendored bundle. It replaced a hand-rolled SVG string builder
	   that concatenated every rect, line and label by hand - which was the right
	   call when the alternative was a 197 KB general-purpose charting engine,
	   and the wrong one once d3 was on the page anyway for the score rails. The
	   trimmed bundle is nine modules; what it weighs is measured into
	   page/vendor/d3-micro.json by the script that builds it. */
	var d3 = window.d3;

	/* One motion rule for the whole page, read once. A reader who has asked for
	   no motion still gets the value - it arrives rather than travelling. */
	function motionMs(ms) {
		return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms;
	}

	function barChart(mount, opts) {
		var values = opts.values;
		var labels = opts.labels.map(String);
		var w = 820, h = 280, padL = 52, padR = 14, padT = 18, padB = 56;
		var plotW = w - padL - padR, plotH = h - padT - padB;
		var top = Math.max.apply(null, values.concat([opts.target || 0])) * 1.18 || 1;

		var y = d3.scaleLinear().domain([0, top]).range([padT + plotH, padT]);
		var x = d3.scaleBand().domain(labels.map(function (l, i) { return i + '|' + l; }))
			.range([padL, padL + plotW]).paddingInner(0.42).paddingOuter(0.2);
		var barW = Math.min(x.bandwidth(), 56);
		var digits = opts.decimals || 0;
		var round = d3.format('.' + digits + 'f');

		mount.innerHTML = '';
		var svg = d3.select(mount).append('svg')
			.attr('viewBox', '0 0 ' + w + ' ' + h)
			.attr('role', 'img')
			.attr('aria-label', opts.title);

		/* The axes are d3's now rather than five hand-placed line elements, so a
		   tick count is a number instead of a loop bound. */
		svg.append('g').attr('transform', 'translate(0,' + (padT + plotH) + ')')
			.call(d3.axisBottom(x).tickFormat(function (key) { return key.split('|').slice(1).join('|'); }).tickSize(0).tickPadding(9))
			.attr('class', 'axis');
		svg.append('g').attr('transform', 'translate(' + padL + ',0)')
			.call(d3.axisLeft(y).ticks(4).tickFormat(round).tickSize(-plotW).tickPadding(8))
			.attr('class', 'axis axis--y');

		var bars = svg.append('g').selectAll('g').data(values).join('g')
			.attr('transform', function (v, i) { return 'translate(' + (x(i + '|' + labels[i]) + x.bandwidth() / 2) + ',0)'; });

		bars.append('rect')
			.attr('x', -barW / 2)
			.attr('width', barW)
			.attr('rx', 4)
			.attr('fill', function (v, i) {
				if (opts.target && opts.higherIsWorse && v > opts.target) return 'var(--band-low)';
				return opts.colours ? opts.colours[i] : opts.colour;
			})
			.attr('y', y(0))
			.attr('height', 0)
			.transition().duration(motionMs(420)).delay(function (v, i) { return motionMs(i * 40); })
			.ease(d3.easeCubicOut)
			.attr('y', function (v) { return y(v); })
			.attr('height', function (v) { return y(0) - y(v); });

		bars.append('text')
			.attr('class', 'bar-value')
			.attr('text-anchor', 'middle')
			.attr('y', function (v) { return y(v) - 7; })
			.text(function (v) { return round(v); })
			.attr('opacity', 0)
			.transition().delay(motionMs(260)).duration(motionMs(240))
			.attr('opacity', 1);

		if (opts.target) {
			svg.append('line').attr('class', 'target-line')
				.attr('x1', padL).attr('x2', w - padR)
				.attr('y1', y(opts.target)).attr('y2', y(opts.target));
			svg.append('text').attr('class', 'target-text')
				.attr('x', w - padR).attr('y', y(opts.target) - 6)
				.attr('text-anchor', 'end').text(opts.targetLabel);
		}

		svg.append('text').attr('class', 'axis-text')
			.attr('x', padL + plotW / 2).attr('y', h - 10)
			.attr('text-anchor', 'middle').text(opts.xLabel);
	}

	// ----------------------------------------------------------- run panel

	/* An index row carries no clips until its manifest is fetched, so the tally
	   counts against whatever is known: the cached manifest if there is one, the
	   clip count from the index otherwise. The panel must draw before its
	   manifest lands or it is empty on first paint. */
	function tallyFor(runId, run) {
		var counts = { publishable: 0, borderline: 0, reject: 0, unjudged: 0, defects: 0, up: 0, down: 0 };
		var clips = (manifestCache[runId] && manifestCache[runId].clips) || run.clips || [];
		counts.total = clips.length || run.clipCount || 0;
		clips.forEach(function (c) {
			var e = state.runs[runId] && state.runs[runId][c.id];
			var v = e && e.verdict;
			if (v === 'publishable') counts.publishable += 1;
			else if (v === 'borderline') counts.borderline += 1;
			else if (v === 'reject') counts.reject += 1;
			else counts.unjudged += 1;
			if (e) {
				counts.defects += (e.defects || []).length;
				if (e.thumb === 'up') counts.up += 1;
				if (e.thumb === 'down') counts.down += 1;
			}
		});
		return counts;
	}

	/* Where this run sits among the others on one axis, so the cheap comparison
	   a column of cards used to give survives the move to one picker. */
	function speedRank(run) {
		var ordered = DATA.runs.slice().sort(function (a, b) {
			return (a.totals ? a.totals.realTimeFactor : Infinity) - (b.totals ? b.totals.realTimeFactor : Infinity);
		});
		for (var i = 0; i < ordered.length; i += 1) if (ordered[i].runId === run.runId) return i + 1;
		return null;
	}

	function ordinal(n) {
		var tens = n % 100;
		if (tens >= 11 && tens <= 13) return n + 'th';
		return n + ['th', 'st', 'nd', 'rd'][n % 10] || n + 'th';
	}

	function verbalAccuracy(run) {
		var v = run.verbalization || run.verbalizationGrades;
		if (!v) return null;
		var accuracy = v.accuracy !== undefined ? v.accuracy : v.verbalizationAccuracy;
		return typeof accuracy === 'number' ? accuracy : null;
	}

	/* THE PICKER. One option a run, each carrying the two figures that decide
	   which to open - how fast it ran, and how much of the verbalization suite
	   it said correctly - so a listener can choose without opening six. */
	function renderRunPicker() {
		var select = $('run-pick');
		select.innerHTML = '';

		DATA.runs.forEach(function (run) {
			var rank = speedRank(run);
			var accuracy = verbalAccuracy(run);
			/* THE RANK LEADS. A native select clips its own text at the width of
			   the control, so whatever is first is what a listener reads without
			   opening it - and the position in the field is the fact that makes
			   a choice, where a trailing figure is the one that gets cut. */
			var parts = [(rank ? rank + '. ' : '') + runLabel(run)];
			if (run.totals && run.totals.realTimeFactor !== null) {
				parts.push('RTF ' + run.totals.realTimeFactor.toFixed(3));
			}
			if (accuracy !== null) parts.push((accuracy * 100).toFixed(0) + '% said correctly');
			if (known(run).incumbent) parts.push('incumbent');
			select.appendChild(el('option', { value: run.runId, text: parts.join('  \u00b7  ') }));
		});

		select.value = activeRunId;
		$('run-count').textContent =
			DATA.runs.length + ' run' + (DATA.runs.length === 1 ? '' : 's') + ' measured';

		var run = runById(activeRunId);
		var rank = speedRank(run);
		var hosts = {};
		DATA.runs.forEach(function (r) { hosts[r.host.cpuModel] = true; });
		/* The same figures the option carries, spelled out underneath. A native
		   select clips its own text, so anything past the name is a fact the
		   reader may never see - it is repeated here where it has room. */
		var said = [];
		if (rank && DATA.runs.length > 1) said.push('Ranks ' + ordinal(rank) + ' of ' + DATA.runs.length + ' by speed');
		else said.push('The only run on this page');
		if (run.totals && run.totals.realTimeFactor !== null) {
			said.push('real-time factor ' + run.totals.realTimeFactor.toFixed(3));
		}
		if (verbalAccuracy(run) !== null) {
			said.push((verbalAccuracy(run) * 100).toFixed(0) + '% of the verbalization cases said correctly');
		}
		if (DATA.runs.length > 1) {
			said.push(Object.keys(hosts).length === 1
				? 'every run here was timed on one machine'
				: 'the runs here were NOT all timed on one machine, so the speeds are not comparable');
		}
		$('run-rank').textContent = said.join(' \u00b7 ') + '.';
	}

	/* How far through this run the listener is, as an arc rather than a
	   sentence. It is the one thing in this panel the eye should land on. */
	function renderRunProgress() {
		var run = activeRun();
		var counts = tallyFor(run.runId, run);
		var judged = counts.publishable + counts.borderline + counts.reject;
		var through = counts.total ? judged / counts.total : 0;
		var mount = d3.select($('run-progress'));
		mount.selectAll('*').remove();

		var size = 54, stroke = 6, radius = (size - stroke) / 2;
		var ring = d3.arc().innerRadius(radius - stroke / 2).outerRadius(radius + stroke / 2).cornerRadius(stroke / 2);

		var svg = mount.append('svg')
			.attr('width', size).attr('height', size)
			.attr('viewBox', '0 0 ' + size + ' ' + size)
			.attr('aria-hidden', 'true')
			.append('g').attr('transform', 'translate(' + size / 2 + ',' + size / 2 + ')');

		svg.append('path').attr('fill', 'var(--audio-track)')
			.attr('d', ring({ startAngle: 0, endAngle: Math.PI * 2 }));
		svg.append('path').attr('fill', 'var(--audio-elapsed)')
			.attr('d', ring({ startAngle: 0, endAngle: 0.0001 }))
			.transition().duration(motionMs(600)).ease(d3.easeCubicOut)
			.attrTween('d', function () {
				return function (t) { return ring({ startAngle: 0, endAngle: Math.PI * 2 * through * t }); };
			});

		var figure = mount.append('div').attr('class', 'run-progress__figure');
		figure.append('span').attr('class', 'run-progress__count').text(judged + ' of ' + counts.total);
		figure.append('span').attr('class', 'run-progress__of')
			.text(counts.total ? 'clips judged \u00b7 ' + counts.unjudged + ' to go' : 'nothing voiced in this run');
		if (counts.defects) {
			figure.append('span').attr('class', 'run-progress__defects')
				.text(counts.defects + ' defect' + (counts.defects === 1 ? '' : 's') + ' logged');
		}
	}

	/* THE SPEC SHEET. Every row is a field of the payload, and a field the run
	   does not carry renders "not recorded" rather than disappearing - a row
	   that vanishes makes unknown and absent look identical, and the reader
	   cannot tell whether nobody measured it or the page forgot to draw it. */
	function specRow(label, value, foot, band) {
		var empty = value === null || value === undefined || value === '';
		return el('div', { class: 'spec__row' }, [
			el('span', { class: 'spec__label', text: label }),
			el('span', {
				class: 'spec__value',
				text: empty ? 'not recorded' : String(value),
				'data-empty': empty ? 'true' : null,
				'data-band': empty ? null : (band || null)
			}),
			/* The foot survives an empty value, because the most useful thing a
			   blank row can say is WHY it is blank - "needs a clip of 3 or more
			   chunks" is an answer, and a bare "not recorded" is a shrug. */
			foot ? el('span', { class: 'spec__foot', text: foot }) : null
		]);
	}

	function specGroup(heading, rows) {
		return el('div', { class: 'spec__group' },
			[el('h3', { class: 'spec__heading', text: heading })].concat(rows.filter(Boolean)));
	}

	function renderSpec() {
		var run = activeRun();
		var meta = known(run);
		var config = configOf(run);
		var isolated = isolatedOf(run);
		var m = run.metrics;
		var mount = $('run-spec');
		mount.innerHTML = '';

		var flags = [];
		if (meta.incumbent) flags.push(['incumbent', 'accent']);
		if (config && !isolated) flags.push(['not isolated', 'warn']);
		if (run.shard && run.shard.complete === false) {
			flags.push([run.shard.shardsMerged + ' of ' + run.shard.shardsExpected + ' shards', 'warn']);
		}
		if (run.loadError) flags.push(['manifest did not load', 'warn']);
		if (flags.length) {
			mount.appendChild(el('div', { class: 'spec__flags' }, flags.map(function (f) {
				return el('span', { class: 'spec__flag', 'data-tone': f[1], text: f[0] });
			})));
		}

		/* WHAT THIS READING MEASURED. Both real-time conventions appear together
		   - the factor and its reciprocal - because vendors publish each, and a
		   card claiming "RTF 0.32, about 3.1x real time" is stating one number
		   twice. */
		mount.appendChild(specGroup('This reading', [
			specRow('Real-time factor', m ? m.realTimeFactor.toFixed(4) : null,
				'seconds of compute per second of audio; lower is better'),
			specRow('Real-time speed', m ? m.speedMultiplier.toFixed(2) + 'x' : null, 'the same figure, inverted'),
			specRow('Speaking pace', m ? m.speakingRate.toFixed(1) + ' wpm' : null,
				m ? 'varies ' + (m.rateStability.coefficientOfVariation * 100).toFixed(1) + '% clip to clip' : null),
			specRow('Long-form drift', m && m.drift
				? (m.drift.medianDriftPercent > 0 ? '+' : '') + m.drift.medianDriftPercent.toFixed(1) + '%'
				: null, m && m.drift ? 'pace, opening third against closing' : 'needs a clip of 3 or more chunks'),
			specRow('Audio made', m ? (m.audioSeconds / 60).toFixed(1) + ' min' : null,
				m ? 'in ' + Math.round(m.processingSeconds) + ' s of wall clock' : null),
			specRow('Corpus', m ? m.totalWords.toLocaleString() + ' words' : null,
				m ? 'over ' + run.totals.clipCount + ' clips' : null),
			specRow('Said correctly', verbalAccuracy(run) !== null
				? (verbalAccuracy(run) * 100).toFixed(0) + '%' : null,
				run.verbalization ? run.verbalization.correct + ' of ' + run.verbalization.scored +
					' cases: currency, tickers, dates' : 'the verbalization suite was not graded here',
				verbalAccuracy(run) === null ? null
					: verbalAccuracy(run) >= 0.9 ? 'high' : verbalAccuracy(run) >= 0.7 ? 'medium' : 'low'),
			specRow('Timed on', run.host ? (run.host.isCi ? 'the runner' : 'a laptop') : null,
				run.host ? run.host.cpuCount + ' cores' : null,
				run.host ? (run.host.isCi && isolated ? 'high' : 'medium') : null),
			specRow('Isolated', config ? (isolated ? 'yes' : 'no') : null,
				config
					? (isolated ? 'nothing else was voicing, so this can be priced against the job cap'
						: 'something else was voicing, so this cannot be priced against the job cap')
					: 'this run predates the run contract',
				config ? (isolated ? 'high' : 'medium') : null)
		]));

		mount.appendChild(specGroup('The model', [
			specRow('Name', meta.name),
			specRow('Weights', run.modelId),
			specRow('Parameters', meta.params),
			specRow('Architecture', meta.architecture, meta.architectureNote),
			specRow('On disk', meta.sizeGb ? meta.sizeGb.toFixed(2) + ' GB' : null,
				'downloaded to the runner on a cold job'),
			specRow('Licence', meta.licence,
				meta.commercialUse === true ? 'commercial use is permitted'
					: meta.commercialUse === false ? 'NOT permitted in a published product' : null,
				meta.commercialUse === true ? 'high' : meta.commercialUse === false ? 'low' : null),
			specRow('Voice', run.voice, meta.accent
				? meta.accent + (meta.accentKnown === false ? ', judged by ear rather than labelled' : ', as the card labels it')
				: null),
			specRow('Voices available', meta.voices ? meta.voices.join(', ') : null),
			specRow('Languages', meta.languages ? meta.languages.join(', ') : null),
			specRow('Emits at', meta.sampleRateHz ? (meta.sampleRateHz / 1000).toFixed(1) + ' kHz' : null,
				'the ceiling on what the encoder can keep'),
			specRow('Released', meta.releasedOn),
			specRow('Arena rating', meta.arenaElo
				? meta.arenaElo + (meta.arenaRank ? ' (' + ordinal(meta.arenaRank) + ')' : '') : null,
				meta.arenaNote || 'a crowd\u2019s pairwise judgement, not ours')
		]));

		mount.appendChild(specGroup('The configuration', [
			specRow('Runtime', run.runtime),
			specRow('Quantisation', run.quantisation),
			specRow('Chunk size', config ? config.maxWordsAChunk + ' words' : run.maxWordsAChunk ? run.maxWordsAChunk + ' words' : null,
				'where a summary is split for inference, and where a seam can be heard'),
			specRow('Repeats', config ? config.repeats : null, 'the wall clock reported is the median of these'),
			specRow('Threads', config ? (config.threads || 'chosen by the runtime') : null),
			specRow('Item ceiling', config ? (config.maxItems || 'the whole corpus') : null),
			specRow('Shards', config ? config.shards : null, 'whole machines the corpus was split across'),
			specRow('Run id', (run.run && run.run.runId) || run.benchmarkRunId)
		]));

		/* WHERE THIS MODEL CAME FROM. Drawn from the catalogue, in the order it
		   lists them, and drawn as nothing when there is nothing. */
		var links = meta.links ? Object.keys(meta.links) : [];
		mount.appendChild(specGroup('Source', [
			links.length
				? el('div', { class: 'spec__links' }, links.map(function (kind) {
					var link = meta.links[kind];
					return el('a', {
						class: 'spec__link', href: link.url, text: link.label,
						target: '_blank', rel: 'noopener noreferrer'
					});
				}))
				: el('p', { class: 'spec__foot', text: 'No source URL is recorded for this model.' }),
			meta.warning ? el('p', { class: 'spec__warning', text: meta.warning }) : null
		]));
	}

	function renderRunPanel() {
		renderRunPicker();
		renderRunProgress();
		renderSpec();
	}

	function selectRun(runId) {
		activeRunId = runId;
		current = -1;
		audio.pause();
		renderRunPanel();
		renderHostNote();
		loadRun(runId).then(renderAll);
	}

	// --------------------------------------------------------- measurements

	function metricCard(label, value, foot, band) {
		/* The band goes on the CARD, not only on its footnote. Five cards with
		   the same grey cap is five cards the eye cannot rank, and the band is
		   already known here - the label and the value are the second signal, so
		   the colour is never carrying the meaning alone. */
		return el('div', { class: 'metric', 'data-band': band || null }, [
			el('p', { class: 'metric__label', text: label }),
			el('p', { class: 'metric__value', text: value }),
			foot ? el('p', { class: 'metric__foot', text: foot, 'data-band': band || null }) : null
		]);
	}

	function renderVerdictMetrics() {
		var run = activeRun();
		var counts = tallyFor(run.runId, run);
		var mount = $('verdict-metrics');
		mount.innerHTML = '';
		[
			metricCard('Publishable', String(counts.publishable), 'of ' + counts.total, 'high'),
			metricCard('Borderline', String(counts.borderline), 'needs a second listen', 'medium'),
			metricCard('Reject', String(counts.reject), 'would not ship', 'low'),
			metricCard('Not yet judged', String(counts.unjudged), 'never counted as a pass'),
			metricCard('Defects logged', String(counts.defects), 'each one timestamped')
		].forEach(function (c) { mount.appendChild(c); });
	}

	function renderHostNote() {
		var run = activeRun();
		var onRunner = Boolean(run.host.isCi);
		var config = configOf(run);
		var isolated = isolatedOf(run);
		var note = $('host-note');

		if (!onRunner) {
			note.innerHTML = 'Timed on <b>' + run.host.cpuModel + '</b>, ' + run.host.cpuCount +
				' cores &mdash; <b>not the production runner</b>, so the real-time factor measures this machine and ' +
				'no budget comparison is drawn. Audio duration and speaking pace are unaffected: the model is ' +
				'deterministic, so those transfer and the wall clock does not.';
			note.setAttribute('data-band', 'medium');
			return;
		}

		/* ON THE RUNNER IS NOT ENOUGH. A run measured while other jobs were
		   voicing carries their contention in its wall clock, so it is a real
		   cost for that clip on that afternoon and not a property of the model.
		   Saying "the figure the design is priced on" over such a reading is
		   exactly the claim the run contract was written to stop. */
		if (config && !isolated) {
			/* The reason comes from the manifest, written as a clause, so it is
			   capitalised and terminated here rather than spliced raw into the
			   middle of a sentence. */
			var why = notIsolatedBecauseOf(run) || 'isolation was not asserted';
			why = why.charAt(0).toUpperCase() + why.slice(1);
			if (!/[.!?]$/.test(why)) why += '.';
			note.innerHTML = 'Timed on <b>' + run.host.cpuModel + '</b>, ' + run.host.cpuCount +
				' cores &mdash; the production runner, but <b>this reading is not isolated</b>, so no budget ' +
				'comparison is drawn. ' + why +
				' Speaking pace and audio duration still transfer, because the model is deterministic.';
			note.setAttribute('data-band', 'medium');
			return;
		}

		note.innerHTML = 'Timed on <b>' + run.host.cpuModel + '</b>, ' + run.host.cpuCount +
			' cores &mdash; the production runner' +
			(config ? ', with nothing else voicing' : '') +
			'. This real-time factor is the figure the design is priced on.';
		note.setAttribute('data-band', 'high');
	}

	function renderCharts() {
		var run = activeRun();
		var onRunner = Boolean(run.host.isCi);

		var mount = $('run-metrics');
		mount.innerHTML = '';
		[
			metricCard('Runs compared', String(DATA.runs.length), 'nothing overwritten'),
			metricCard('Selected', run.quantisation, runLabel(run)),
			metricCard('Real-time factor', String(run.totals.realTimeFactor),
				onRunner ? 'on the runner' : 'this machine only'),
			metricCard('Speaking pace', run.totals.wordsAMinute + ' wpm', 'host-independent'),
			metricCard('Audio', (run.totals.audioSeconds / 60).toFixed(1) + ' min',
				run.totals.clipCount + ' clips')
		].forEach(function (c) { mount.appendChild(c); });

		/* Run against run. A cross-run bar chart of wall clock is only honest when
		   every bar came off the same machine - otherwise it compares laptops. */
		var hosts = {};
		DATA.runs.forEach(function (r) { hosts[r.host.cpuModel] = true; });
		var oneHost = Object.keys(hosts).length === 1;

		barChart($('chart-rtf'), {
			title: 'Real-time factor by run',
			values: DATA.runs.map(function (r) { return r.totals.realTimeFactor; }),
			labels: DATA.runs.map(function (r) { return runLabel(r, { short: true }); }),
			colours: DATA.runs.map(function (r) { return r.runId === run.runId ? 'var(--color-accent)' : 'var(--chart-1)'; }),
			decimals: 3,
			xLabel: 'run'
		});
		/* Two reasons a cross-run bar chart can lie, and they are different:
		   different machines, and contended readings on the same machine. */
		var mixedIsolation = DATA.runs.some(function (r) { return configOf(r) && !isolatedOf(r); });
		$('chart-rtf-why').innerHTML = (oneHost
			? 'Lower is better. Every run here was timed on the same machine, so the bars are comparable.'
			: '<b>These runs were timed on different machines, so the bars are not directly comparable.</b> ' +
			  'Wall clock is a property of the host; only a ratio between two runs on ONE machine transfers.') +
			(mixedIsolation
				? ' <b>Some bars are not isolated readings</b>, so they carry contention from whatever else was ' +
				  'voicing at the time and may not be priced against the job cap.'
				: '');

		barChart($('chart-wpm'), {
			title: 'Speaking pace by run',
			values: DATA.runs.map(function (r) { return r.totals.wordsAMinute; }),
			labels: DATA.runs.map(function (r) { return runLabel(r, { short: true }); }),
			colours: DATA.runs.map(function (r) { return r.runId === run.runId ? 'var(--color-accent)' : 'var(--chart-3)'; }),
			decimals: 1,
			xLabel: 'run'
		});

		barChart($('chart-length'), {
			title: 'Real-time factor by summary length',
			values: run.clips.map(function (c) { return c.realTimeFactor; }),
			labels: run.clips.map(function (c) { return c.words; }),
			colour: 'var(--chart-2)',
			decimals: 2,
			xLabel: 'words in the summary'
		});

		$('measure-table').innerHTML =
			'<thead><tr><th>Clip</th><th>Words</th><th>Chunks</th><th>Audio</th><th>Wall clock</th><th>RTF</th><th>wpm</th></tr></thead><tbody>' +
			run.clips.map(function (c) {
				return '<tr><td>' + c.id + '</td><td>' + c.words + '</td><td>' + c.chunks + '</td><td>' +
					c.audioSeconds.toFixed(1) + ' s</td><td>' + (c.wallClockMs / 1000).toFixed(1) + ' s</td><td>' +
					c.realTimeFactor.toFixed(3) + '</td><td>' + c.wordsAMinute.toFixed(1) + '</td></tr>';
			}).join('') + '</tbody>';
	}

	// ----------------------------------------------------------- clip rows

	/* The text, split into the chunks the pipeline really made, so a listener can
	   see where a seam can be heard - and so the played chunk can be lit as the
	   audio reaches it. Within a chunk the highlight is interpolated by character
	   position, which the About tab states plainly. */
	/* Roughly how long a token takes to say, relative to its neighbours.
	   Chunk boundaries are EXACT - each chunk was its own inference call - so the
	   only thing estimated is the distribution WITHIN a chunk. Length alone is a
	   poor proxy: "NASDAQ" takes far longer than "through" despite being shorter,
	   because it is spelled out. Vowel groups stand in for syllables, and caps
	   and digits are weighted up. */
	function wordTimingWeight(token) {
		var core = token.replace(/^[^\w]+|[^\w]+$/g, '');
		if (!core) return 0;
		var syllables = core.toLowerCase().match(/[aeiouy]+/g);
		var weight = Math.max(1, core.length * 0.55 + (syllables ? syllables.length : 1) * 1.25);
		if (/^[A-Z]{2,}$/.test(core)) weight += core.length * 0.35;
		if (/\d/.test(core)) weight += core.length * 0.45;
		if (/[,;:]$/.test(token)) weight += 0.35;
		if (/[.!?]$/.test(token)) weight += 0.65;
		return weight;
	}

	function appendTimedWords(node, chunk) {
		var tokens = chunk.text.match(/\s+|[^\s]+/g) || [];
		var start = Number(chunk.startSeconds) || 0;
		var end = Number(chunk.endSeconds) || start;
		var duration = Math.max(0.01, end - start);
		var total = tokens.reduce(function (sum, token) { return sum + wordTimingWeight(token); }, 0) || 1;

		var cursor = 0;
		tokens.forEach(function (token) {
			var weight = wordTimingWeight(token);
			if (!weight) { node.appendChild(document.createTextNode(token)); return; }
			var wordStart = start + duration * (cursor / total);
			cursor += weight;
			var wordEnd = start + duration * (cursor / total);
			node.appendChild(el('span', {
				class: 'word',
				'data-start': wordStart.toFixed(3),
				'data-end': wordEnd.toFixed(3),
				text: token
			}));
		});
	}

	function textWithChunks(clip) {
		var node = el('p', { class: 'clip__text' });
		(clip.chunkTimings || [{ text: clip.text, startSeconds: 0, endSeconds: clip.audioSeconds }])
			.forEach(function (chunk, i) {
				if (i > 0) node.appendChild(el('span', { class: 'seam', title: 'chunk boundary' }));
				var chunkNode = el('span', {
					class: 'chunk',
					'data-start': chunk.startSeconds,
					'data-end': chunk.endSeconds
				});
				appendTimedWords(chunkNode, chunk);
				node.appendChild(chunkNode);
				node.appendChild(document.createTextNode(' '));
			});
		return node;
	}

	/* ----------------------------------------------------- the score rail

	   A RAIL WITH FIVE STOPS, not a free-moving handle and not five boxes.

	   The owner asked for a slider with a fill, and the fill is the right call:
	   five numbered boxes said what was chosen and nothing about what it meant,
	   so a listener scanning a judged clip had to read four numerals and do the
	   comparison in their head. A fill is read at a glance.

	   The five stops are the part that is NOT a slider, and they are load-bearing
	   (Susan, 2026-09-14). A continuous handle cannot be set to an exact value in
	   one action, so twenty-four clips on four axes becomes ninety-six
	   drag-and-corrects. Clicking anywhere on this rail snaps to the nearest
	   stop, so one click still sets an exact value - the input model of the
	   boxes, with the readability of a fill.

	   The unset state is the third thing that matters: no fill, no handle, and
	   the word "unrated". A rail sitting at the left edge with a handle on it
	   reads as a score of one, and an unscored axis is not a low score. */

	var SCORE_WORDS = ['unusable', 'poor', 'fair', 'good', 'excellent'];

	/* The ordinal ramp, low to high. This is the confidence ramp used for the
	   one thing it is FOR - an ordered judgement - and it always carries the
	   numeral and the word beside it, which is the second signal the colour law
	   requires. */
	var SCORE_COLOURS = ['--band-low', '--band-low', '--band-medium', '--band-high', '--band-high'];

	/* One observer for every rail on the page rather than one each. A day is 24
	   clips and four rails apiece; 96 observers to answer one question is a cost
	   that grows with the corpus for no reason. */
	var railResize = window.ResizeObserver
		? new window.ResizeObserver(function (entries) {
			entries.forEach(function (e) { if (e.target.__layout) e.target.__layout(); });
		})
		: null;

	function svgEl(tag) {
		return document.createElementNS('http://www.w3.org/2000/svg', tag);
	}

	/* An attribute that may not go below zero, animated by an ease that
	   deliberately overshoots. The tween reads the current value off the
	   element, so an interrupted transition carries on from where it is rather
	   than snapping back to a start it has already passed. */
	function clampedTween(attribute, to) {
		return function () {
			var from = Number(this.getAttribute(attribute)) || 0;
			return function (t) { return String(Math.max(0, from + (to - from) * t)); };
		};
	}

	function scoreRail(runId, clip, def) {
		var HEIGHT = 34, PAD = 13, MID = 19, RAIL = 8;
		var x = d3.scaleLinear().domain([1, 5]).range([PAD, 200]).clamp(true);

		var word = el('span', { class: 'score__word' });
		var node = svgEl('svg');
		var svg = d3.select(node)
			.attr('class', 'score__rail')
			.attr('height', HEIGHT)
			.attr('tabindex', '0')
			.attr('role', 'slider')
			.attr('aria-valuemin', '1')
			.attr('aria-valuemax', '5')
			.attr('aria-label', def.label + ', 1 to 5');

		var groove = svg.append('rect').attr('y', MID - RAIL / 2).attr('height', RAIL)
			.attr('rx', RAIL / 2).attr('fill', 'var(--color-surface-sunken)')
			.attr('stroke', 'var(--color-rule)');
		var fill = svg.append('rect').attr('y', MID - RAIL / 2).attr('height', RAIL)
			.attr('rx', RAIL / 2).attr('width', 0).attr('fill', 'var(--color-rule-strong)');
		/* The five stops, drawn. A rail whose steps are invisible is a rail a
		   listener has to discover is stepped. */
		var stops = svg.append('g').selectAll('circle').data([1, 2, 3, 4, 5]).join('circle')
			.attr('cy', MID).attr('r', 2).attr('fill', 'var(--color-rule-strong)');
		var handle = svg.append('circle').attr('cy', MID).attr('r', 0)
			.attr('stroke', 'var(--color-surface)').attr('stroke-width', 2);

		function value() { return entry(runId, clip.id).scores[def.key] || null; }

		function paint(animate) {
			var v = value();
			var ms = animate ? motionMs(380) : 0;
			var colour = v ? 'var(' + SCORE_COLOURS[v - 1] + ')' : 'var(--color-rule-strong)';
			var width = v ? x(v) - PAD + RAIL / 2 : 0;
			var radius = v ? 7 : 0;

			/* A back-out ease overshoots its target, which is the whole point on
			   the way up and an error on the way down: clearing a score sends
			   the width and the radius through zero, and a negative `width` or
			   `r` is an SVG error rather than a frame nobody sees. So the tween
			   is clamped rather than the ease being softened - the spring is
			   what the owner asked for. */
			fill.attr('x', PAD - RAIL / 2)
				.transition().duration(ms).ease(d3.easeBackOut.overshoot(1.1))
				.attr('fill', colour)
				.attrTween('width', clampedTween('width', width));
			handle.transition().duration(ms).ease(d3.easeBackOut.overshoot(1.7))
				.attr('cx', x(v || 1)).attr('fill', colour)
				.attrTween('r', clampedTween('r', radius));

			word.textContent = v ? v + ' \u00b7 ' + SCORE_WORDS[v - 1] : 'unrated';
			word.style.color = v ? colour : '';
			svg.attr('aria-valuenow', v || null)
				.attr('aria-valuetext', v ? v + ' of 5, ' + SCORE_WORDS[v - 1] : 'unrated');
		}

		/* The viewBox is the element's own pixel box, so nothing is scaled and a
		   handle stays a circle. `preserveAspectRatio="none"` over a fixed
		   viewBox would have turned every circle on this rail into an ellipse at
		   whatever width the column happened to be. */
		node.__layout = function () {
			var w = node.clientWidth || node.getBoundingClientRect().width;
			if (!w) return;
			svg.attr('viewBox', '0 0 ' + w + ' ' + HEIGHT);
			x.range([PAD, w - PAD]);
			groove.attr('x', PAD - RAIL / 2).attr('width', w - PAD * 2 + RAIL);
			stops.attr('cx', function (n) { return x(n); });
			paint(false);
		};

		function stopAt(event) {
			return Math.max(1, Math.min(5, Math.round(x.invert(d3.pointer(event, node)[0]))));
		}

		function setTo(next, animate) {
			entry(runId, clip.id).scores[def.key] = next;
			paint(animate !== false);
			save();
		}

		svg.on('click', function (event) {
			var at = stopAt(event);
			/* Clicking the stop a score already sits on clears it, which is how
			   every other control on this row behaves. */
			setTo(value() === at ? null : at);
		});

		svg.call(d3.drag()
			.container(function () { return node; })
			.on('start drag', function (event) {
				var at = stopAt(event.sourceEvent);
				if (value() !== at) setTo(at);
			}));

		svg.on('keydown', function (event) {
			var at = value();
			if (/^[1-5]$/.test(event.key)) setTo(at === Number(event.key) ? null : Number(event.key));
			else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') setTo(Math.min(5, (at || 0) + 1));
			else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') setTo(at > 1 ? at - 1 : null);
			else if (event.key === 'Backspace' || event.key === 'Delete') setTo(null);
			else return;
			event.preventDefault();
		});

		if (railResize) railResize.observe(node);
		/* The element has no width until it is in the document, so the first
		   layout waits a frame rather than drawing a rail of zero pixels. */
		window.requestAnimationFrame(node.__layout);

		return el('div', { class: 'score' }, [
			el('span', { class: 'score__label' }, [
				el('span', { html: '<b>' + def.label + '</b>' }),
				word
			]),
			node,
			el('span', { class: 'score__hint', text: def.hint })
		]);
	}

	function scoreBlock(runId, clip) {
		return el('div', { class: 'score-grid' }, SCORES.map(function (def) {
			return scoreRail(runId, clip, def);
		}));
	}

	/* A thumb is the fastest possible first pass: a listener can get through
	   twenty-four clips on one axis in the time four scales take for six. It
	   does not replace the scores - it is what gets filled in when somebody has
	   ten minutes rather than an hour. */
	function thumbsBlock(runId, clip) {
		var row = el('div', { class: 'thumbs' });
		[['up', '\u25b2 Good'], ['down', '\u25bc Poor']].forEach(function (pair) {
			var b = el('button', {
				class: 'thumb', type: 'button', 'data-thumb': pair[0], text: pair[1],
				'aria-pressed': entry(runId, clip.id).thumb === pair[0] ? 'true' : 'false'
			});
			b.addEventListener('click', function () {
				var e = entry(runId, clip.id);
				e.thumb = e.thumb === pair[0] ? null : pair[0];
				save();
				Array.prototype.forEach.call(row.querySelectorAll('.thumb'), function (sib) {
					sib.setAttribute('aria-pressed', e.thumb === sib.getAttribute('data-thumb') ? 'true' : 'false');
				});
				renderRunProgress();
			});
			row.appendChild(b);
		});
		return row;
	}

	function verdictBlock(runId, clip) {
		var row = el('div', { class: 'verdict-row' }, [el('span', { text: 'Verdict' })]);
		[['publishable', '\u25b2 publishable'], ['borderline', 'borderline'], ['reject', '\u25bc reject']]
			.forEach(function (pair) {
				var b = el('button', {
					class: 'verdict', type: 'button', 'data-verdict': pair[0], text: pair[1],
					'aria-pressed': entry(runId, clip.id).verdict === pair[0] ? 'true' : 'false'
				});
				b.addEventListener('click', function () {
					var e = entry(runId, clip.id);
					e.verdict = e.verdict === pair[0] ? null : pair[0];
					save();
					Array.prototype.forEach.call(row.querySelectorAll('.verdict'), function (sib) {
						sib.setAttribute('aria-pressed', e.verdict === sib.getAttribute('data-verdict') ? 'true' : 'false');
					});
					renderVerdictMetrics();
					renderRunProgress();
				});
				row.appendChild(b);
			});
		return row;
	}

	function renderDefects(runId, clip, list) {
		list.innerHTML = '';
		entry(runId, clip.id).defects.forEach(function (d, i) {
			var stamp = el('time', { text: clock(d.atSeconds), title: 'Jump here' });
			stamp.addEventListener('click', function () {
				play(activeRun().clips.indexOf(clip), d.atSeconds);
			});
			var remove = el('button', { type: 'button', text: '\u00d7', 'aria-label': 'Remove defect' });
			remove.addEventListener('click', function () {
				entry(runId, clip.id).defects.splice(i, 1);
				save();
				renderDefects(runId, clip, list);
				renderVerdictMetrics();
				renderRunProgress();
			});
			list.appendChild(el('li', {}, [stamp, el('span', { text: d.kind }), el('span', { text: d.note || '' }), remove]));
		});
	}

	function defectBlock(runId, clip) {
		var kind = el('select', { 'aria-label': 'Defect kind' });
		DEFECT_KINDS.forEach(function (k) { kind.appendChild(el('option', { value: k, text: k })); });
		var note = el('input', { type: 'text', placeholder: 'heard "..." expected "..."', 'aria-label': 'Defect note' });
		var list = el('ul', { class: 'defects' });

		var add = el('button', { type: 'button', text: 'Mark at current position' });
		add.addEventListener('click', function () {
			var idx = activeRun().clips.indexOf(clip);
			var at = current === idx ? audio.currentTime : 0;
			entry(runId, clip.id).defects.push({ kind: kind.value, atSeconds: Number(at.toFixed(2)), note: note.value });
			note.value = '';
			save();
			renderDefects(runId, clip, list);
			renderVerdictMetrics();
			renderRunProgress();
		});

		renderDefects(runId, clip, list);
		return el('div', {}, [el('div', { class: 'defect-row' }, [kind, note, add]), list]);
	}

	function renderClips() {
		var run = activeRun();
		var mount = $('clip-list');
		mount.innerHTML = '';

		run.clips.forEach(function (clip, index) {
			var playBtn = el('button', { class: 'clip__play', type: 'button', 'aria-label': 'Play ' + clip.id });
			playBtn.appendChild(icon('play'));
			playBtn.addEventListener('click', function () {
				if (current === index && !audio.paused) audio.pause();
				else play(index, null);
			});

			var note = el('textarea', { class: 'clip__note', placeholder: 'Anything else worth saying about this clip', 'aria-label': 'Note for ' + clip.id });
			note.value = entry(run.runId, clip.id).note || '';
			note.addEventListener('input', function () {
				entry(run.runId, clip.id).note = note.value;
				save();
			});

			/* THE DETAIL IS BEHIND A DISCLOSURE. A clip row carried twenty-eight
			   controls of one weight, and most clips get a thumb and a verdict -
			   not a logged defect and a paragraph. The count in the summary means
			   a closed disclosure never hides something somebody wrote down. */
			var logged = entry(run.runId, clip.id);
			var detail = el('details', { class: 'judge__detail' }, [
				el('summary', {}, [
					el('span', { text: 'Add detail' }),
					(logged.defects || []).length || logged.note
						? el('span', { class: 'judge__count', text:
							((logged.defects || []).length
								? (logged.defects.length + ' defect' + (logged.defects.length === 1 ? '' : 's'))
								: 'a note') })
						: null
				]),
				defectBlock(run.runId, clip),
				note
			]);

			mount.appendChild(el('li', { class: 'clip', id: 'clip-' + clip.id, 'data-playing': 'false' }, [
				playBtn,
				el('div', { class: 'clip__body' }, [
					clipHead(clip),
					el('div', { class: 'clip__cols' }, [
						el('div', { class: 'clip__reading' }, [
							textWithChunks(clip),
							clip.chunks > 1 ? el('p', { class: 'seam-note', text:
								'The rules mark the ' + (clip.chunks - 1) + ' place' + (clip.chunks === 2 ? '' : 's') +
								' the pipeline cut this summary. Listen for a join there.' }) : null
						]),
						el('div', { class: 'clip__judgement' }, [
							/* The order a listener works in: call it, then score
							   the axes, then only if the call was hard say why. */
							el('div', { class: 'judge__primary' }, [
								thumbsBlock(run.runId, clip),
								verdictBlock(run.runId, clip)
							]),
							scoreBlock(run.runId, clip),
							detail
						])
					])
				])
			]));
		});
	}

	/* THREE NAMED PARTS, one to a line.
	   This was one baseline row of middot-joined fragments, which produced
	   `real-0347 words - 2 chunks - 0:23 - 120 wpm - The Hindu
	   BusinessLinecurrencypercentagehyphenated`. Two collisions, both structural:
	   the id ends in a digit and the first fact starts with one, and the hazard
	   chips carried a 6%-alpha tint that on a dark ground is not visible, so
	   three chips after the source name read as one run-on word. */
	function clipHead(clip) {
		var facts = [
			[clip.words, 'words'],
			[clip.chunks, clip.chunks === 1 ? 'chunk' : 'chunks'],
			[clock(clip.audioSeconds), 'long'],
			[clip.wordsAMinute.toFixed(0), 'wpm']
		];

		return el('div', { class: 'clip__head' }, [
			el('div', { class: 'clip__identity' }, [
				el('span', { class: 'clip__id', text: clip.id }),
				el('span', {
					class: 'clip__source',
					text: clip.sourceName || 'source not recorded',
					'data-unknown': clip.sourceName ? null : 'true'
				})
			]),
			el('div', { class: 'clip__facts' }, facts.map(function (f) {
				return el('span', { class: 'clip__fact' }, [
					el('b', { text: String(f[0]) }),
					el('span', { text: f[1] })
				]);
			})),
			/* A hazard is a landmark, not a verdict: it says this clip holds a
			   currency amount, so listen to how it is said. It never says the
			   model got it wrong - that is what the timestamped defect list is
			   for, and putting a colour here would put a judgement on a
			   signpost. */
			(clip.hazards || []).length
				? el('div', { class: 'clip__hazards' },
					[el('span', { class: 'clip__hazards-label', text: 'Listen for:' })].concat(
						clip.hazards.map(function (h) {
							return el('span', { class: 'hazard', text: HAZARD_LABELS[h] || h });
						})))
				: null
		]);
	}

	// -------------------------------------------------------------- player

	var audio = $('audio');
	var audioB = $('audio-b');
	var slowTimer = null;

	/* `audio.duration` is authoritative when the browser has it, but it is NaN
	   before metadata arrives and Infinity when the response cannot be measured -
	   a server without range support produces exactly that. The manifest knows
	   the real length in both cases, so it is the fallback rather than the other
	   way round. */
	function durationOf(index) {
		if (isFinite(audio.duration) && audio.duration > 0) return audio.duration;
		var clip = activeRun().clips[index];
		return clip ? clip.audioSeconds : 0;
	}

	function markPlaying(index) {
		activeRun().clips.forEach(function (c, i) {
			var row = $('clip-' + c.id);
			if (row) row.setAttribute('data-playing', i === index ? 'true' : 'false');
			var btn = row && row.querySelector('.clip__play');
			if (btn) setIcon(btn, i === index && !audio.paused ? 'pause' : 'play');
		});
		setIcon($('toggle'), audio.paused ? 'play' : 'pause');
		$('toggle').setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
		$('dock').setAttribute('data-playing', audio.paused || current < 0 ? 'false' : 'true');
	}

	function play(index, at) {
		var run = activeRun();
		if (index < 0 || index >= run.clips.length) return;
		var clip = run.clips[index];

		if (current !== index) {
			current = index;
			audioB.pause();
			audio.src = run.clipBase + clip.clip;
			$('dock-title').textContent = clip.id + ' \u00b7 ' + runLabel(run);
			$('dock-title').setAttribute('data-idle', 'false');
			$('time-total').textContent = clock(clip.audioSeconds);
			$('time-now').textContent = '0:00';
			paintProgress(0);
			$('track-buffered').style.width = '0%';
			chooseSeekRender(clip);

			/* The wait is measured, never a spinner - so the only thing that
			   appears is one line of words, and only past the threshold. */
			clearTimeout(slowTimer);
			$('dock-failed').hidden = true;
			slowTimer = setTimeout(function () { $('dock-slow').hidden = false; }, SLOW_MS);
		}

		if (at !== null && at !== undefined) {
			var seek = function () { audio.currentTime = at; audio.removeEventListener('loadedmetadata', seek); };
			if (audio.readyState >= 1) audio.currentTime = at;
			else audio.addEventListener('loadedmetadata', seek);
		}

		audio.play().catch(function () {
			/* Autoplay refusal is a browser policy, not a failure of the clip. */
		});
		$('prev').disabled = index === 0;
		$('next').disabled = index === run.clips.length - 1;
		$('mark').disabled = false;
		$('stop').disabled = false;
		markPlaying(index);
	}

	/* ONE SEEK SURFACE, NEVER TWO.
	   ProgressTrack has two renders and exactly one is on screen: the waveform
	   where the payload carries a peak array, the plain groove where it does
	   not. The dock used to stack a canvas above a groove, which is the same
	   component drawn twice and two things to click for one job - and with peaks
	   null under owner ruling 4 the canvas was permanently hidden, so what a
	   listener actually got was a hidden element above the only live one. */
	function chooseSeekRender(clip) {
		var hasPeaks = Boolean(clip && clip.peaks && clip.peaks.length);
		$('waveform').hidden = !hasPeaks;
		$('track').hidden = hasPeaks;
	}

	function paintProgress(fraction) {
		var pct = Math.max(0, Math.min(1, fraction || 0)) * 100;
		$('track-elapsed').style.width = pct + '%';
		$('track-head').style.insetInlineStart = pct + '%';
		$('seek').setAttribute('aria-valuenow', Math.round(pct));
	}

	/* Follow the text. The chunk containing the playhead is lit exactly, because
	   each chunk was its own inference call; within it the leading edge is
	   interpolated by character position, which the About tab states. */
	/* Per-WORD, and deliberately NOT by scaling the word. Scale is noise when the
	   job is spotting a mispronunciation, and text that jumps about is harder to
	   read; Spotify and Apple Music lyrics use colour and position instead, and
	   read-along tools use a quiet pill. The underline sweeps within the word so
	   the eye has somewhere to go without the line reflowing. */
	function paintFollow() {
		Array.prototype.forEach.call(document.querySelectorAll('.word[data-current]'), function (span) {
			span.removeAttribute('data-current');
			span.style.removeProperty('--word-through');
		});
		if (current < 0) return;

		var clip = activeRun().clips[current];
		var row = $('clip-' + clip.id);
		if (!row) return;
		var t = audio.currentTime;

		Array.prototype.forEach.call(row.querySelectorAll('.word'), function (span) {
			var start = Number(span.getAttribute('data-start'));
			var end = Number(span.getAttribute('data-end'));
			if (t >= end) span.setAttribute('data-spoken', 'true');
			else span.removeAttribute('data-spoken');
			if (t >= start && t < end) {
				span.setAttribute('data-current', 'true');
				span.style.setProperty('--word-through',
					(Math.max(0, Math.min(1, (t - start) / (end - start || 1))) * 100).toFixed(1) + '%');
			}
		});
	}

	/* A dense amplitude waveform with a real playhead, which is what a
	   waveform-seek control has to draw for an eye to find a position at a
	   glance. This is the SECOND render of ProgressTrack and it runs only when
	   the payload carries peaks; `chooseSeekRender` decides which render is on
	   screen, so this one never draws beside the groove.
	   Peaks come from the build; decoding client-side would mean downloading the
	   whole clip before the first pixel and inflating it about sixtyfold. */
	function paintWaveform() {
		var canvas = $('waveform');
		if (!canvas || canvas.hidden) return;
		var clip = current >= 0 ? activeRun().clips[current] : null;
		var peaks = clip && clip.peaks;
		if (!peaks || !peaks.length) return;

		var ratio = window.devicePixelRatio || 1;
		var cssWidth = canvas.clientWidth || canvas.parentNode.clientWidth;
		var cssHeight = canvas.clientHeight || 52;
		if (canvas.width !== Math.floor(cssWidth * ratio) || canvas.height !== Math.floor(cssHeight * ratio)) {
			canvas.width = Math.floor(cssWidth * ratio);
			canvas.height = Math.floor(cssHeight * ratio);
		}

		var ctx = canvas.getContext('2d');
		ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
		ctx.clearRect(0, 0, cssWidth, cssHeight);

		var styles = getComputedStyle(document.documentElement);
		var played = styles.getPropertyValue('--audio-elapsed').trim() || '#8b8bf5';
		var unplayed = styles.getPropertyValue('--audio-track').trim() || '#333d4f';
		var ink = styles.getPropertyValue('--color-text').trim() || '#e6edf5';
		var ground = styles.getPropertyValue('--color-bg').trim() || '#0b0e14';

		var duration = durationOf(current) || clip.audioSeconds;
		var through = Math.max(0, Math.min(1, duration ? audio.currentTime / duration : 0));

		var count = Math.max(96, Math.min(240, Math.round(cssWidth / 6)));
		var gap = 2;
		var barWidth = (cssWidth - gap * (count - 1)) / count;
		if (barWidth < 3) { gap = 1.5; barWidth = (cssWidth - gap * (count - 1)) / count; }

		var mid = cssHeight / 2;
		var maxHeight = cssHeight - 8;
		var minHeight = 3;

		/* The payload carries 64 peaks and the bar count is higher, so a bar
		   between two peaks is interpolated rather than repeated - repeating
		   produces visible stair-stepping. */
		function sampledPeak(i) {
			var start = i * peaks.length / count;
			var end = (i + 1) * peaks.length / count;
			if (end - start >= 1) {
				var max = 0;
				for (var j = Math.floor(start); j < Math.ceil(end) && j < peaks.length; j += 1) {
					max = Math.max(max, peaks[j] || 0);
				}
				return max;
			}
			var lo = Math.floor(start);
			var hi = Math.min(peaks.length - 1, lo + 1);
			var f = start - lo;
			return (peaks[lo] || 0) * (1 - f) + (peaks[hi] || 0) * f;
		}

		function roundedBar(x, y, w, h, r) {
			r = Math.min(r, w / 2, h / 2);
			ctx.beginPath();
			ctx.moveTo(x + r, y);
			ctx.lineTo(x + w - r, y);
			ctx.quadraticCurveTo(x + w, y, x + w, y + r);
			ctx.lineTo(x + w, y + h - r);
			ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
			ctx.lineTo(x + r, y + h);
			ctx.quadraticCurveTo(x, y + h, x, y + h - r);
			ctx.lineTo(x, y + r);
			ctx.quadraticCurveTo(x, y, x + r, y);
			ctx.closePath();
			ctx.fill();
		}

		for (var i = 0; i < count; i += 1) {
			/* A gamma below 1 lifts quiet passages so speech reads as speech
			   rather than a flat line with occasional spikes. */
			var height = Math.max(minHeight, Math.pow(Math.max(0, sampledPeak(i)), 0.72) * maxHeight);
			var x = i * (barWidth + gap);
			ctx.fillStyle = (i + 0.5) / count <= through ? played : unplayed;
			roundedBar(x, mid - height / 2, barWidth, height, barWidth / 2);
		}

		/* A colour boundary alone is hard to locate on a dense waveform, so the
		   playhead is drawn: a line haloed against the ground, and a knob. */
		var playX = through * cssWidth;
		ctx.save();
		ctx.lineCap = 'round';
		ctx.strokeStyle = ground;
		ctx.lineWidth = 4;
		ctx.beginPath();
		ctx.moveTo(playX, 4);
		ctx.lineTo(playX, cssHeight - 4);
		ctx.stroke();
		ctx.strokeStyle = ink;
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.moveTo(playX, 5);
		ctx.lineTo(playX, cssHeight - 5);
		ctx.stroke();
		ctx.fillStyle = played;
		ctx.strokeStyle = ground;
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(playX, mid, 4, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();
		ctx.restore();
	}

	function paintBuffered() {
		var d = durationOf(current);
		if (!audio.buffered.length || !d) return;
		var end = audio.buffered.end(audio.buffered.length - 1);
		$('track-buffered').style.width = Math.min(100, (end / d) * 100) + '%';
	}

	audio.addEventListener('playing', function () {
		clearTimeout(slowTimer);
		$('dock-slow').hidden = true;
		$('dock-failed').hidden = true;
		markPlaying(current);
	});
	audio.addEventListener('pause', function () { markPlaying(current); });

	/* A CLIP THAT WOULD NOT LOAD IS A STATE, NOT A SILENCE. Whatever is on
	   screen stays, and the dock says what happened and offers the one action
	   that can help. Without this the player simply never started and the page
	   read as broken rather than as a fetch that failed - which is the state a
	   pruned archive and a flaky connection both produce. */
	audio.addEventListener('error', function () {
		if (current < 0 || !audio.getAttribute('src')) return;
		clearTimeout(slowTimer);
		$('dock-slow').hidden = true;
		$('dock-failed').hidden = false;
		markPlaying(-1);
	});

	$('retry').addEventListener('click', function () {
		if (current < 0) return;
		var at = current;
		$('dock-failed').hidden = true;
		/* `current` is cleared so `play` re-assigns the source; assigning the
		   same `src` to an element that has already failed does not retry. */
		current = -1;
		play(at, null);
	});

	audio.addEventListener('timeupdate', function () {
		var d = durationOf(current);
		paintProgress(d ? audio.currentTime / d : 0);
		$('time-now').textContent = clock(audio.currentTime);
		$('seek').setAttribute('aria-valuetext', clock(audio.currentTime) + ' of ' + clock(d));
		paintBuffered();
		paintFollow();
		paintWaveform();
	});
	['progress', 'loadeddata', 'canplay', 'canplaythrough', 'suspend'].forEach(function (name) {
		audio.addEventListener(name, paintBuffered);
	});
	audio.addEventListener('ended', function () {
		if ($('auto-advance').checked && current < activeRun().clips.length - 1) play(current + 1, null);
		else markPlaying(-1);
	});

	$('toggle').addEventListener('click', function () {
		if (current < 0) play(0, null);
		else if (audio.paused) audio.play();
		else audio.pause();
	});

	/* Clearing is not pausing. Pause keeps a position a listener may not want
	   kept, and with auto-advance on there was no way to leave the dock silent
	   at all: pausing then pressing play resumed, and letting a clip end started
	   the next one. This empties the player and the row marks. */
	$('stop').addEventListener('click', function () {
		audio.pause();
		audio.removeAttribute('src');
		audio.load();
		current = -1;
		$('dock-title').textContent = 'Nothing playing';
		$('dock-title').setAttribute('data-idle', 'true');
		$('time-now').textContent = '0:00';
		$('time-total').textContent = '0:00';
		paintProgress(0);
		$('track-buffered').style.width = '0%';
		chooseSeekRender(null);
		$('dock-failed').hidden = true;
		$('stop').disabled = true;
		$('mark').disabled = true;
		$('prev').disabled = true;
		$('next').disabled = true;
		Array.prototype.forEach.call(document.querySelectorAll('.word[data-current], .word[data-spoken]'), function (span) {
			span.removeAttribute('data-current');
			span.removeAttribute('data-spoken');
			span.style.removeProperty('--word-through');
		});
		markPlaying(-1);
	});

	$('prev').addEventListener('click', function () { play(current - 1, null); });
	$('next').addEventListener('click', function () { play(current + 1, null); });

	$('mark').addEventListener('click', function () {
		if (current < 0) return;
		var run = activeRun();
		var clip = run.clips[current];
		var row = $('clip-' + clip.id);
		entry(run.runId, clip.id).defects.push({ kind: 'other', atSeconds: Number(audio.currentTime.toFixed(2)), note: '' });
		save();
		/* The defect list lives behind the disclosure, so marking one opens it -
		   a control that files something the reader cannot then see has not
		   finished its job. */
		var detail = row.querySelector('.judge__detail');
		if (detail) detail.open = true;
		renderDefects(run.runId, clip, row.querySelector('.defects'));
		renderVerdictMetrics();
		renderRunProgress();
		row.scrollIntoView({ block: 'center', behavior: 'smooth' });
	});

	/* Seeking happens on the one surface, whichever render is live. */
	$('seek').addEventListener('click', function (e) {
		var d = durationOf(current);
		if (current < 0 || !d) return;
		var box = this.getBoundingClientRect();
		audio.currentTime = Math.max(0, Math.min(d, ((e.clientX - box.left) / box.width) * d));
	});
	$('seek').addEventListener('keydown', function (e) {
		var d = durationOf(current);
		if (current < 0 || !d) return;
		if (e.key === 'ArrowRight') audio.currentTime = Math.min(d - 0.1, audio.currentTime + 5);
		else if (e.key === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
		else if (e.key === 'Home') audio.currentTime = 0;
		else return;
		e.preventDefault();
	});

	/* VOLUME AND SPEED, both of which this instrument had neither of.
	   Both are listening tools rather than decoration: a defect at the bottom of
	   the mix is easier to hear loud, and a suspected mispronunciation is easier
	   to resolve slow. Both persist, because a listener sets them once a session
	   and not once a clip. */
	var PLAYER_KEY = STORE_KEY + ':player';
	var SPEEDS = [0.75, 1, 1.25, 1.5, 2];

	function readPlayerPreferences() {
		try { return JSON.parse(localStorage.getItem(PLAYER_KEY)) || {}; } catch (e) { return {}; }
	}

	function writePlayerPreferences(next) {
		try { localStorage.setItem(PLAYER_KEY, JSON.stringify(next)); } catch (e) { /* ignore */ }
	}

	function applyVolume(level, muted) {
		[audio, audioB].forEach(function (player) {
			player.volume = level;
			player.muted = muted;
		});
		$('volume').value = level;
		setIcon($('mute'), muted || level === 0 ? 'muted' : 'volume');
		$('mute').setAttribute('aria-pressed', muted ? 'true' : 'false');
		$('mute').setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
	}

	/* A speed other than 1x changes what is being judged - prosody at 1.5x is
	   not the prosody that will ship - so the control says so rather than
	   sitting quietly at the same weight as everything else. */
	function applySpeed(rate) {
		[audio, audioB].forEach(function (player) { player.playbackRate = rate; });
		$('speed').textContent = rate + 'x';
		$('speed').setAttribute('data-off-normal', rate === 1 ? 'false' : 'true');
		$('speed').setAttribute('aria-label',
			rate === 1 ? 'Playback speed, normal' : 'Playback speed, ' + rate + ' times normal');
	}

	(function wirePlayerPreferences() {
		var saved = readPlayerPreferences();
		var level = typeof saved.volume === 'number' ? saved.volume : 1;
		var muted = Boolean(saved.muted);
		var rate = SPEEDS.indexOf(saved.rate) >= 0 ? saved.rate : 1;
		applyVolume(level, muted);
		applySpeed(rate);

		$('volume').addEventListener('input', function () {
			level = Number(this.value);
			muted = level === 0;
			applyVolume(level, muted);
			writePlayerPreferences({ volume: level, muted: muted, rate: rate });
		});
		$('mute').addEventListener('click', function () {
			muted = !muted;
			applyVolume(level, muted);
			writePlayerPreferences({ volume: level, muted: muted, rate: rate });
		});
		$('speed').addEventListener('click', function () {
			rate = SPEEDS[(SPEEDS.indexOf(rate) + 1) % SPEEDS.length];
			applySpeed(rate);
			writePlayerPreferences({ volume: level, muted: muted, rate: rate });
		});
	})();

	document.addEventListener('keydown', function (e) {
		if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
		if (e.target.classList && e.target.classList.contains('score__rail')) return;
		if (e.code === 'Space') { e.preventDefault(); $('toggle').click(); }
	});

	// ------------------------------------------------------------------ A/B

	/* A/B reads two runs that are usually both inactive, so it merges each index
	   row with its cached manifest the same way activeRun does. */
	function abRuns() {
		return [$('ab-left').value, $('ab-right').value].map(function (runId) {
			return Object.assign({ clips: [] }, runById(runId), manifestCache[runId] || {});
		});
	}

	function renderAbChoosers() {
		[['ab-left', 0], ['ab-right', Math.min(1, DATA.runs.length - 1)]].forEach(function (pair) {
			var select = $(pair[0]);
			if (select.options.length) return;
			DATA.runs.forEach(function (r) {
				select.appendChild(el('option', {
					value: r.runId,
					text: runLabel(r)
				}));
			});
			select.selectedIndex = pair[1];
			select.addEventListener('change', renderAb);
		});
	}

	function renderAb() {
		var chosen = [$('ab-left').value, $('ab-right').value];
		var mount = $('ab-pair');

		/* Both sides must be on disk before a comparison means anything, and
		   neither is guaranteed to be the run the listener is playing. */
		var missing = chosen.filter(function (runId) { return runId && !manifestCache[runId]; });
		if (missing.length) {
			mount.innerHTML = '';
			mount.appendChild(el('p', { class: 'seam-note', text: 'Loading both runs\u2026' }));
			Promise.all(missing.map(loadRun)).then(renderAb);
			return;
		}

		var pair = abRuns();
		mount.innerHTML = '';

		if (pair[0].runId === pair[1].runId) {
			mount.appendChild(el('p', { class: 'seam-note', text: 'Pick two different runs to compare.' }));
			return;
		}

		/* Both runs voice the same corpus, so a summary is comparable only where
		   both made a clip for it. */
		var shared = pair[0].clips.filter(function (c) {
			return pair[1].clips.some(function (o) { return o.id === c.id; });
		});
		if (shared.length === 0) {
			mount.appendChild(el('p', { class: 'seam-note', text: 'These two runs share no summary, so there is nothing to compare.' }));
			return;
		}
		abIndex = abIndex % shared.length;
		var clip = shared[abIndex];
		var other = pair[1].clips.filter(function (o) { return o.id === clip.id; })[0];

		$('ab-status').textContent = (abIndex + 1) + ' of ' + shared.length + ' \u00b7 ' + clip.id;

		mount.appendChild(el('p', { class: 'clip__text', text: clip.text }));

		var sides = el('div', { class: 'ab-sides' });
		[[pair[0], clip, 'A'], [pair[1], other, 'B']].forEach(function (side) {
			var run = side[0], c = side[1], letter = side[2];
			var btn = el('button', { class: 'ab-play', type: 'button', html: '&#9654; ' + letter });
			btn.addEventListener('click', function () {
				audio.pause();
				audioB.src = run.clipBase + c.clip;
				audioB.currentTime = 0;
				audioB.play().catch(function () {});
			});
			sides.appendChild(el('div', { class: 'ab-side' }, [
				btn,
				el('span', { class: 'clip__facts', text: abBlind ? 'hidden until you choose' :
					runLabel(run) + ' \u00b7 ' + clock(c.audioSeconds) })
			]));
		});
		mount.appendChild(sides);

		var choose = el('div', { class: 'verdict-row' }, [el('span', { text: 'Which is better?' })]);
		[['A', 0], ['tie', -1], ['B', 1]].forEach(function (opt) {
			var b = el('button', { class: 'verdict', type: 'button', text: opt[0] });
			b.addEventListener('click', function () {
				state.pairs.push({
					clipId: clip.id,
					a: pair[0].runId,
					b: pair[1].runId,
					winner: opt[1] === -1 ? 'tie' : (opt[1] === 0 ? pair[0].runId : pair[1].runId),
					blind: abBlind,
					at: new Date().toISOString()
				});
				save();
				abIndex = (abIndex + 1) % shared.length;
				renderAb();
			});
			choose.appendChild(b);
		});
		mount.appendChild(choose);

		var votes = state.pairs.filter(function (p) {
			return (p.a === pair[0].runId && p.b === pair[1].runId) || (p.a === pair[1].runId && p.b === pair[0].runId);
		});
		if (votes.length) {
			var tally = {};
			votes.forEach(function (v) { tally[v.winner] = (tally[v.winner] || 0) + 1; });
			mount.appendChild(el('p', { class: 'seam-note', text:
				votes.length + ' vote' + (votes.length === 1 ? '' : 's') + ' so far \u00b7 ' +
				Object.keys(tally).map(function (k) {
					var r = k === 'tie' ? 'tie' : runLabel(runById(k));
					return r + ': ' + tally[k];
				}).join(' \u00b7 ') }));
		}
	}

	$('ab-next').addEventListener('click', function () { abIndex += 1; renderAb(); });
	$('ab-blind').addEventListener('click', function () {
		abBlind = !abBlind;
		this.textContent = 'Blind: ' + (abBlind ? 'on' : 'off');
		this.setAttribute('aria-pressed', abBlind ? 'true' : 'false');
		renderAb();
	});

	// --------------------------------------------------------------- chrome

	function wireTabs() {
		var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
		tabs.forEach(function (tab) {
			tab.addEventListener('click', function () {
				tabs.forEach(function (t) {
					var selected = t === tab;
					t.setAttribute('aria-selected', selected ? 'true' : 'false');
					$(t.getAttribute('aria-controls')).hidden = !selected;
				});
				if (tab.id === 'tab-ab') { renderAbChoosers(); renderAb(); }
				if (tab.id === 'tab-charts') renderCharts();
			});
		});
	}

	function wireTheme() {
		var btn = $('theme-toggle');
		var saved = null;
		try { saved = localStorage.getItem(STORE_KEY + ':theme'); } catch (e) { /* ignore */ }
		var theme = saved || 'dark';
		document.documentElement.setAttribute('data-theme', theme);
		btn.textContent = theme === 'dark' ? 'Light' : 'Dark';
		btn.addEventListener('click', function () {
			theme = theme === 'dark' ? 'light' : 'dark';
			document.documentElement.setAttribute('data-theme', theme);
			btn.textContent = theme === 'dark' ? 'Light' : 'Dark';
			try { localStorage.setItem(STORE_KEY + ':theme', theme); } catch (e) { /* ignore */ }
		});
	}

	function wireExport() {
		$('export').addEventListener('click', function () {
			/* EVERY RUN'S MANIFEST IS FETCHED FIRST. The page is a shell: only
			   the run a listener has opened has its clips in memory, so mapping
			   over `run.clips` for every run threw on the first unopened one and
			   no file was written at all. Exporting only the loaded runs would be
			   worse - a verdict file silently missing five of six voices reads as
			   a complete record. The export is a deliberate click and the
			   manifests are small static JSON, so it pays for them. */
			$('export-status').textContent = 'Collecting every run\u2026';
			Promise.all(DATA.runs.map(function (r) { return loadRun(r.runId); })).then(function () {
				writeEvaluation();
			}).catch(function (error) {
				$('export-status').textContent = 'Could not read every run: ' + error.message;
			});
		});

		$('reset').addEventListener('click', function () {
			if (!window.confirm('Clear every score, verdict, defect and A/B vote on this page?')) return;
			state = { runs: {}, pairs: [] };
			window.EvaluationStore.clear();
			save();
			renderAll();
			$('export-status').textContent = 'Cleared.';
		});
	}

	function writeEvaluation() {
		var payload = {
			schemaVersion: '2026-09-13',
			ratedAt: new Date().toISOString(),
			rater: $('rater').value || 'unnamed',
			listeningConditions: $('conditions').value,
			runs: DATA.runs.map(function (row) {
				/* The index row merged with whatever the manifest carries, which
				   is the same view the rest of the page renders from. */
				var run = Object.assign({ clips: [] }, row, manifestCache[row.runId] || {});
				return {
					runId: run.runId,
					/* WHICH READING WAS JUDGED. A listening verdict outlives the
					   clips it was formed on, so it has to name the run that
					   produced them - otherwise two verdicts on the same model at
					   different chunk sizes are indistinguishable after the fact,
					   which is the same failure the run contract fixed upstream. */
					benchmarkRunId: (run.run && run.run.runId) || run.benchmarkRunId || null,
					configSlug: (run.run && run.run.configSlug) || run.configSlug || null,
					config: configOf(run),
					isolated: configOf(run) ? isolatedOf(run) : null,
					/* A run whose manifest would not load is reported as such
					   rather than as a run with nothing judged. */
					loadError: run.loadError || null,
					subject: {
						model: run.modelId, quantisation: run.quantisation, voice: run.voice,
						maxWordsAChunk: run.maxWordsAChunk, sampleRate: run.sampleRate,
						host: run.host,
						realTimeFactor: run.totals ? run.totals.realTimeFactor : null,
						wordsAMinute: run.totals ? run.totals.wordsAMinute : null
					},
					clips: (run.clips || []).map(function (c) {
						var e = (state.runs[run.runId] || {})[c.id] || {};
						return {
							id: c.id, verdict: e.verdict || null, scores: e.scores || {},
							defects: e.defects || [], note: e.note || ''
						};
					})
				};
			}),
			pairwise: state.pairs
		};

		var blob = new Blob([JSON.stringify(payload, null, 2) + '\n'], { type: 'application/json' });
		var a = el('a', {
			href: URL.createObjectURL(blob),
			download: 'evaluation-' + new Date().toISOString().slice(0, 10) + '-' +
				(payload.rater.replace(/\W+/g, '-').toLowerCase() || 'unnamed') + '.json'
		});
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);

		var judged = payload.runs.reduce(function (n, r) {
			return n + r.clips.filter(function (c) { return c.verdict; }).length;
		}, 0);
		$('export-status').textContent =
			'Written: ' + payload.runs.length + ' run' + (payload.runs.length === 1 ? '' : 's') +
			', ' + judged + ' judged clip' + (judged === 1 ? '' : 's') +
			'. Keep it beside the clips it judged.';
	}

	function renderAll() {
		renderRunPanel();
		renderHostNote();
		renderClips();
		renderVerdictMetrics();
	}

	// ----------------------------------------------------------------- boot

	wireTabs();
	wireTheme();
	wireExport();

	$('run-pick').addEventListener('change', function () { selectRun(this.value); });

	function boot(index) {
		DATA = index;
		activeRunId = DATA.runs[0] ? DATA.runs[0].runId : null;
		$('built').textContent = DATA.generatedAt.slice(0, 10);
		renderRunPanel();
		renderHostNote();
		return window.EvaluationStore.ready
			.then(function (info) {
				if (info.usingFallback) {
					$('storage-status').textContent = 'Using local storage - IndexedDB is unavailable here.';
				}
				return window.EvaluationStore.get('state');
			})
			.then(function (saved) {
				if (saved && saved.runs) state = saved;
				return activeRunId ? loadRun(activeRunId) : null;
			})
			.then(function () {
				renderAll();
				return window.EvaluationStore.estimate();
			})
			.then(function (estimate) {
				if (estimate && estimate.quota) {
					$('storage-status').textContent =
						(estimate.usage / 1024 / 1024).toFixed(1) + ' MB of ' +
						(estimate.quota / 1024 / 1024).toFixed(0) + ' MB used';
				}
			});
	}

	fetch('index.json')
		.then(function (response) {
			if (!response.ok) throw new Error('HTTP ' + response.status);
			return response.json();
		})
		.then(boot)
		.catch(function (error) {
			document.getElementById('clip-list').innerHTML =
				'<li class="clip"><div class="clip__body"><p class="clip__text">' +
				'Could not load <code>index.json</code>: ' + error.message +
				'. The page is a shell and reads its data at runtime - if you opened it ' +
				'from a file path, serve the directory instead (<code>npm run serve</code>).' +
				'</p></div></li>';
		});

})();
