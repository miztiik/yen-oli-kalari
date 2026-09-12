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

	var DATA = window.EVALUATION_DATA;
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

	var state = load();
	var activeRunId = DATA.runs[0].runId;
	var current = -1;
	var abIndex = 0;
	var abBlind = true;

	function load() {
		try {
			var raw = localStorage.getItem(STORE_KEY);
			if (raw) return JSON.parse(raw);
		} catch (e) {
			/* A browser with storage disabled still gets a working page; it just
			   does not remember. That is strictly better than refusing to run. */
		}
		return { runs: {}, pairs: [] };
	}

	function save() {
		try {
			localStorage.setItem(STORE_KEY, JSON.stringify(state));
		} catch (e) {
			/* ignore - see load() */
		}
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
		return runById(activeRunId);
	}

	function known(run) {
		return DATA.catalogue[run.modelSlug] || {};
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

	// -------------------------------------------------------------- charts

	/* Hand-rolled SVG rather than the inherited ECharts. This page must open from
	   a file path with no bundle, and a bar chart of a handful of values does not
	   justify 197 KB. The panel chrome is the shape the Console will use. */
	function barChart(mount, opts) {
		var values = opts.values, labels = opts.labels;
		var w = 820, h = 260, padL = 46, padR = 12, padT = 14, padB = 48;
		var plotW = w - padL - padR, plotH = h - padT - padB;
		var max = Math.max.apply(null, values.concat([opts.target || 0])) * 1.18 || 1;
		var y = function (v) { return padT + plotH - (v / max) * plotH; };

		var parts = [];
		for (var t = 0; t <= 4; t += 1) {
			var val = (max / 4) * t, yy = y(val);
			parts.push('<line class="grid-line" x1="' + padL + '" y1="' + yy + '" x2="' + (w - padR) + '" y2="' + yy + '"/>');
			parts.push('<text class="axis-text" x="' + (padL - 6) + '" y="' + (yy + 3) + '" text-anchor="end">' + val.toFixed(opts.decimals || 0) + '</text>');
		}

		var band = plotW / values.length;
		var barW = Math.min(band * 0.6, 52);
		values.forEach(function (v, i) {
			var cx = padL + band * i + band / 2, yy = y(v);
			var fill = opts.colours ? opts.colours[i] : opts.colour;
			if (opts.target && opts.higherIsWorse && v > opts.target) fill = 'var(--band-low)';
			parts.push('<rect x="' + (cx - barW / 2) + '" y="' + yy + '" width="' + barW +
				'" height="' + (padT + plotH - yy) + '" rx="3" fill="' + fill + '"/>');
			parts.push('<text class="axis-text" x="' + cx + '" y="' + (padT + plotH + 15) +
				'" text-anchor="middle">' + labels[i] + '</text>');
			parts.push('<text class="axis-text" x="' + cx + '" y="' + (yy - 5) +
				'" text-anchor="middle" fill="var(--chart-marker)">' + v.toFixed(opts.decimals || 0) + '</text>');
		});

		if (opts.target) {
			var ty = y(opts.target);
			parts.push('<line class="target-line" x1="' + padL + '" y1="' + ty + '" x2="' + (w - padR) + '" y2="' + ty + '"/>');
			parts.push('<text class="target-text" x="' + (w - padR) + '" y="' + (ty - 5) + '" text-anchor="end">' + opts.targetLabel + '</text>');
		}
		parts.push('<text class="axis-text" x="' + (padL + plotW / 2) + '" y="' + (h - 8) + '" text-anchor="middle">' + opts.xLabel + '</text>');
		mount.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + opts.title + '">' + parts.join('') + '</svg>';
	}

	// --------------------------------------------------------- model panel

	function tallyFor(runId, run) {
		var counts = { publishable: 0, borderline: 0, reject: 0, unjudged: 0, defects: 0 };
		run.clips.forEach(function (c) {
			var e = state.runs[runId] && state.runs[runId][c.id];
			var v = e && e.verdict;
			if (v === 'publishable') counts.publishable += 1;
			else if (v === 'borderline') counts.borderline += 1;
			else if (v === 'reject') counts.reject += 1;
			else counts.unjudged += 1;
			if (e) counts.defects += (e.defects || []).length;
		});
		return counts;
	}

	function renderModelPanel() {
		var mount = $('model-list');
		mount.innerHTML = '';

		DATA.runs.forEach(function (run) {
			var meta = known(run);
			var counts = tallyFor(run.runId, run);
			var judged = counts.publishable + counts.borderline + counts.reject;

			var card = el('button', {
				class: 'model-card',
				type: 'button',
				'aria-pressed': run.runId === activeRunId ? 'true' : 'false'
			}, [
				el('span', { class: 'model-card__name', text: meta.name || run.modelSlug }),
				el('span', { class: 'model-card__quant', text: run.quantisation }),
				el('span', { class: 'model-card__facts', text:
					(meta.params ? meta.params + ' \u00b7 ' : '') +
					(meta.architecture || '') }),
				el('span', { class: 'model-card__licence', text: meta.licence || 'licence unknown',
					'data-ok': meta.commercialUse ? 'true' : 'false' }),
				el('span', { class: 'model-card__metrics', html:
					'<b>RTF ' + run.totals.realTimeFactor + '</b> \u00b7 ' +
					run.totals.wordsAMinute + ' wpm \u00b7 ' +
					(run.host.isCi ? 'runner' : 'laptop') }),
				el('span', { class: 'model-card__judged', text:
					judged + ' of ' + run.clips.length + ' judged' +
					(counts.defects ? ' \u00b7 ' + counts.defects + ' defect' + (counts.defects === 1 ? '' : 's') : '') }),
				meta.incumbent ? el('span', { class: 'model-card__tag', text: 'incumbent' }) : null,
				meta.arenaElo ? el('span', { class: 'model-card__tag', text: 'Arena ' + meta.arenaElo }) : null
			]);

			card.addEventListener('click', function () {
				activeRunId = run.runId;
				current = -1;
				audio.pause();
				renderAll();
			});
			mount.appendChild(card);
		});

		$('run-count').textContent =
			DATA.runs.length + ' run' + (DATA.runs.length === 1 ? '' : 's') + ' measured';
	}

	// --------------------------------------------------------- measurements

	function metricCard(label, value, foot, band) {
		return el('div', { class: 'metric' }, [
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
			metricCard('Publishable', String(counts.publishable), 'of ' + run.clips.length, 'high'),
			metricCard('Borderline', String(counts.borderline), 'needs a second listen', 'medium'),
			metricCard('Reject', String(counts.reject), 'would not ship', 'low'),
			metricCard('Not yet judged', String(counts.unjudged), 'never counted as a pass'),
			metricCard('Defects logged', String(counts.defects), 'each one timestamped')
		].forEach(function (c) { mount.appendChild(c); });
	}

	function renderHostNote() {
		var run = activeRun();
		var onRunner = Boolean(run.host.isCi);
		$('host-note').innerHTML = onRunner
			? 'Timed on <b>' + run.host.cpuModel + '</b>, ' + run.host.cpuCount +
			  ' cores &mdash; the production runner. This real-time factor is the figure the design is priced on.'
			: 'Timed on <b>' + run.host.cpuModel + '</b>, ' + run.host.cpuCount +
			  ' cores &mdash; <b>not the production runner</b>, so the real-time factor measures this machine and ' +
			  'no budget comparison is drawn. Audio duration and speaking pace are unaffected: the model is ' +
			  'deterministic, so those transfer and the wall clock does not.';
		$('host-note').setAttribute('data-band', onRunner ? 'high' : 'medium');
	}

	function renderCharts() {
		var run = activeRun();
		var onRunner = Boolean(run.host.isCi);

		var mount = $('run-metrics');
		mount.innerHTML = '';
		[
			metricCard('Runs compared', String(DATA.runs.length), 'nothing overwritten'),
			metricCard('Selected', run.quantisation, known(run).name || run.modelSlug),
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
			labels: DATA.runs.map(function (r) { return (known(r).name || r.modelSlug).split(' ')[0] + ' ' + r.quantisation; }),
			colours: DATA.runs.map(function (r) { return r.runId === run.runId ? 'var(--color-accent)' : 'var(--chart-1)'; }),
			decimals: 3,
			xLabel: 'run'
		});
		$('chart-rtf-why').innerHTML = oneHost
			? 'Lower is better. Every run here was timed on the same machine, so the bars are comparable.'
			: '<b>These runs were timed on different machines, so the bars are not directly comparable.</b> ' +
			  'Wall clock is a property of the host; only a ratio between two runs on ONE machine transfers.';

		barChart($('chart-wpm'), {
			title: 'Speaking pace by run',
			values: DATA.runs.map(function (r) { return r.totals.wordsAMinute; }),
			labels: DATA.runs.map(function (r) { return (known(r).name || r.modelSlug).split(' ')[0] + ' ' + r.quantisation; }),
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
	function textWithChunks(clip) {
		var node = el('p', { class: 'clip__text' });
		(clip.chunkTimings || [{ text: clip.text, startSeconds: 0, endSeconds: clip.audioSeconds }])
			.forEach(function (chunk, i) {
				if (i > 0) node.appendChild(el('span', { class: 'seam', title: 'chunk boundary' }));
				node.appendChild(el('span', {
					class: 'chunk',
					'data-start': chunk.startSeconds,
					'data-end': chunk.endSeconds
				}, [document.createTextNode(chunk.text + ' ')]));
			});
		return node;
	}

	function scoreBlock(runId, clip) {
		var grid = el('div', { class: 'score-grid' });
		SCORES.forEach(function (def) {
			var buttons = el('div', { class: 'score__buttons' });
			[1, 2, 3, 4, 5].forEach(function (n) {
				var b = el('button', {
					type: 'button', text: String(n),
					'aria-pressed': entry(runId, clip.id).scores[def.key] === n ? 'true' : 'false',
					'aria-label': def.label + ' ' + n + ' of 5'
				});
				b.addEventListener('click', function () {
					var e = entry(runId, clip.id);
					e.scores[def.key] = e.scores[def.key] === n ? null : n;
					save();
					Array.prototype.forEach.call(buttons.children, function (sib, i) {
						sib.setAttribute('aria-pressed', e.scores[def.key] === i + 1 ? 'true' : 'false');
					});
				});
				buttons.appendChild(b);
			});
			grid.appendChild(el('div', { class: 'score' }, [
				el('label', { class: 'score__label', html: '<b>' + def.label + '</b> &middot; ' + def.hint }),
				buttons
			]));
		});
		return grid;
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
					renderModelPanel();
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
				renderModelPanel();
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
			renderModelPanel();
		});

		renderDefects(runId, clip, list);
		return el('div', {}, [el('div', { class: 'defect-row' }, [kind, note, add]), list]);
	}

	function renderClips() {
		var run = activeRun();
		var mount = $('clip-list');
		mount.innerHTML = '';

		run.clips.forEach(function (clip, index) {
			var playBtn = el('button', { class: 'clip__play', type: 'button', html: '&#9654;', 'aria-label': 'Play ' + clip.id });
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

			mount.appendChild(el('li', { class: 'clip', id: 'clip-' + clip.id, 'data-playing': 'false' }, [
				playBtn,
				el('div', { class: 'clip__body' }, [
					el('div', { class: 'clip__head' }, [
						el('span', { class: 'clip__id', text: clip.id }),
						el('span', { class: 'clip__facts', text:
							clip.words + ' words \u00b7 ' + clip.chunks + ' chunk' + (clip.chunks === 1 ? '' : 's') +
							' \u00b7 ' + clock(clip.audioSeconds) + ' \u00b7 ' + clip.wordsAMinute.toFixed(0) + ' wpm' +
							(clip.sourceName ? ' \u00b7 ' + clip.sourceName : '') })
					].concat((clip.hazards || []).map(function (h) {
						return el('span', { class: 'hazard', text: HAZARD_LABELS[h] || h });
					}))),
					el('div', { class: 'clip__cols' }, [
						el('div', { class: 'clip__reading' }, [
							textWithChunks(clip),
							clip.chunks > 1 ? el('p', { class: 'seam-note', text:
								'The rules mark the ' + (clip.chunks - 1) + ' place' + (clip.chunks === 2 ? '' : 's') +
								' the pipeline cut this summary. Listen for a join there.' }) : null
						]),
						el('div', { class: 'clip__judgement' }, [
							scoreBlock(run.runId, clip), verdictBlock(run.runId, clip),
							defectBlock(run.runId, clip), note
						])
					])
				])
			]));
		});
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
			if (btn) btn.innerHTML = i === index && !audio.paused ? '&#10074;&#10074;' : '&#9654;';
		});
		$('toggle').innerHTML = audio.paused ? '&#9654;' : '&#10074;&#10074;';
	}

	function play(index, at) {
		var run = activeRun();
		if (index < 0 || index >= run.clips.length) return;
		var clip = run.clips[index];

		if (current !== index) {
			current = index;
			audioB.pause();
			audio.src = run.clipBase + clip.clip;
			$('dock-title').textContent = clip.id + ' \u00b7 ' + (known(run).name || run.modelSlug) + ' ' + run.quantisation;
			$('dock-title').setAttribute('data-idle', 'false');
			$('time-total').textContent = clock(clip.audioSeconds);
			$('time-now').textContent = '0:00';
			$('track-elapsed').style.width = '0%';
			$('track-buffered').style.width = '0%';

			/* The wait is measured, never a spinner - so the only thing that
			   appears is one line of words, and only past the threshold. */
			clearTimeout(slowTimer);
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
		markPlaying(index);
	}

	/* Follow the text. The chunk containing the playhead is lit exactly, because
	   each chunk was its own inference call; within it the leading edge is
	   interpolated by character position, which the About tab states. */
	function paintFollow() {
		if (current < 0) return;
		var clip = activeRun().clips[current];
		var row = $('clip-' + clip.id);
		if (!row) return;
		var t = audio.currentTime;
		Array.prototype.forEach.call(row.querySelectorAll('.chunk'), function (span) {
			var start = Number(span.getAttribute('data-start'));
			var end = Number(span.getAttribute('data-end'));
			var live = t >= start && t < end;
			span.setAttribute('data-spoken', t >= end ? 'true' : 'false');
			span.setAttribute('data-live', live ? 'true' : 'false');
			if (live) {
				var through = Math.max(0, Math.min(1, (t - start) / (end - start || 1)));
				span.style.setProperty('--through', (through * 100).toFixed(1) + '%');
			} else {
				span.style.removeProperty('--through');
			}
		});
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
		markPlaying(current);
	});
	audio.addEventListener('pause', function () { markPlaying(current); });
	audio.addEventListener('timeupdate', function () {
		var d = durationOf(current);
		var pct = d ? (audio.currentTime / d) * 100 : 0;
		$('track-elapsed').style.width = Math.min(100, pct) + '%';
		$('track').setAttribute('aria-valuenow', Math.round(Math.min(100, pct)));
		$('time-now').textContent = clock(audio.currentTime);
		paintBuffered();
		paintFollow();
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
	$('prev').addEventListener('click', function () { play(current - 1, null); });
	$('next').addEventListener('click', function () { play(current + 1, null); });
	$('mark').addEventListener('click', function () {
		if (current < 0) return;
		var run = activeRun();
		var clip = run.clips[current];
		var row = $('clip-' + clip.id);
		entry(run.runId, clip.id).defects.push({ kind: 'other', atSeconds: Number(audio.currentTime.toFixed(2)), note: '' });
		save();
		renderDefects(run.runId, clip, row.querySelector('.defects'));
		renderVerdictMetrics();
		renderModelPanel();
		row.scrollIntoView({ block: 'center', behavior: 'smooth' });
	});

	$('track').addEventListener('click', function (e) {
		var d = durationOf(current);
		if (current < 0 || !d) return;
		var box = this.getBoundingClientRect();
		audio.currentTime = ((e.clientX - box.left) / box.width) * d;
	});
	$('track').addEventListener('keydown', function (e) {
		var d = durationOf(current);
		if (current < 0 || !d) return;
		if (e.key === 'ArrowRight') audio.currentTime = Math.min(d - 0.1, audio.currentTime + 5);
		else if (e.key === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
		else return;
		e.preventDefault();
	});

	document.addEventListener('keydown', function (e) {
		if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
		if (e.code === 'Space') { e.preventDefault(); $('toggle').click(); }
	});

	// ------------------------------------------------------------------ A/B

	function abRuns() {
		return [runById($('ab-left').value), runById($('ab-right').value)];
	}

	function renderAbChoosers() {
		[['ab-left', 0], ['ab-right', Math.min(1, DATA.runs.length - 1)]].forEach(function (pair) {
			var select = $(pair[0]);
			if (select.options.length) return;
			DATA.runs.forEach(function (r) {
				select.appendChild(el('option', {
					value: r.runId,
					text: (known(r).name || r.modelSlug) + ' ' + r.quantisation
				}));
			});
			select.selectedIndex = pair[1];
			select.addEventListener('change', renderAb);
		});
	}

	function renderAb() {
		var pair = abRuns();
		var mount = $('ab-pair');
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
					(known(run).name || run.modelSlug) + ' ' + run.quantisation + ' \u00b7 ' + clock(c.audioSeconds) })
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
					var r = k === 'tie' ? 'tie' : (known(runById(k)).name || k) + ' ' + runById(k).quantisation;
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
			var payload = {
				schemaVersion: '2026-09-13',
				ratedAt: new Date().toISOString(),
				rater: $('rater').value || 'unnamed',
				listeningConditions: $('conditions').value,
				runs: DATA.runs.map(function (run) {
					return {
						runId: run.runId,
						subject: {
							model: run.modelId, quantisation: run.quantisation, voice: run.voice,
							maxWordsAChunk: run.maxWordsAChunk, sampleRate: run.sampleRate,
							host: run.host, realTimeFactor: run.totals.realTimeFactor,
							wordsAMinute: run.totals.wordsAMinute
						},
						clips: run.clips.map(function (c) {
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
			$('export-status').textContent = 'Written. Keep it beside the clips it judged.';
		});

		$('reset').addEventListener('click', function () {
			if (!window.confirm('Clear every score, verdict, defect and A/B vote on this page?')) return;
			state = { runs: {}, pairs: [] };
			save();
			renderAll();
			$('export-status').textContent = 'Cleared.';
		});
	}

	function renderAll() {
		renderModelPanel();
		renderHostNote();
		renderClips();
		renderVerdictMetrics();
	}

	// ----------------------------------------------------------------- boot

	$('built').textContent = DATA.generatedAt.slice(0, 10);
	wireTabs();
	wireTheme();
	wireExport();
	renderAll();
})();
