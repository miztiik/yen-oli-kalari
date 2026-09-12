/* Voice evaluation surface - behaviour.
 *
 * No framework and no build step. The page must open from file:// on any
 * machine, which is why the manifest arrives as a script that assigns a global
 * rather than a fetch that CORS would refuse.
 *
 * The state this page owns is one object keyed by clip id. It persists to
 * localStorage on every change, because a listener who gets through eleven
 * clips and loses them to a refresh will not do it twice.
 */

(function () {
	'use strict';

	var MANIFEST = window.EVALUATION_MANIFEST;
	var STORE_KEY = 'yen-oli-kalari:voice-evaluation';
	var SCHEMA_VERSION = '2026-09-12';

	/* The factor the busiest observed day needs to fit inside one six-hour job.
	   From docs/reference/benchmarks/2026-09-12-kokoro-on-a-ci-runner.md. */
	var RTF_TARGET = 0.707;

	/* Past this the dock says it is fetching. A spinner spins at the same rate
	   on a 200 ms wait and a dead socket, so it measures nothing. */
	var SLOW_MS = 400;

	var SCORES = [
		{ key: 'intelligibility', label: 'Intelligibility', hint: 'every word made out, no replay' },
		{ key: 'pronunciation', label: 'Pronunciation', hint: 'names, numbers, acronyms' },
		{ key: 'prosody', label: 'Prosody', hint: 'rhythm, emphasis, pauses' },
		{ key: 'seams', label: 'Seams', hint: '5 = no join heard' }
	];

	var DEFECT_KINDS = [
		'mispronunciation',
		'audible-seam',
		'truncation',
		'artifact',
		'wrong-pace',
		'wrong-emphasis',
		'other'
	];

	/* The pronunciation hazards a summary carries, named for a reader. These are
	   tagged at corpus-build time by build-real-corpus.mjs, because a hand-picked
	   sample can quietly avoid exactly the cases a news voice gets wrong. */
	var HAZARD_LABELS = {
		currency: 'currency',
		percent: 'percentage',
		bigNumber: 'number',
		acronym: 'acronym',
		date: 'date',
		hyphenate: 'hyphenated',
		quoted: 'quote'
	};

	// ---------------------------------------------------------------- state

	var state = load();
	var current = -1;

	function load() {
		try {
			var raw = localStorage.getItem(STORE_KEY);
			if (raw) return JSON.parse(raw);
		} catch (e) {
			/* A browser with storage disabled still gets a working page; it just
			   does not remember. That is strictly better than refusing to run. */
		}
		return {};
	}

	function save() {
		try {
			localStorage.setItem(STORE_KEY, JSON.stringify(state));
		} catch (e) {
			/* ignore - see load() */
		}
	}

	function entry(id) {
		if (!state[id]) state[id] = { scores: {}, defects: [], verdict: null, note: '' };
		return state[id];
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
		(kids || []).forEach(function (kid) {
			if (kid) node.appendChild(kid);
		});
		return node;
	}

	function clock(seconds) {
		if (!isFinite(seconds) || seconds < 0) seconds = 0;
		var m = Math.floor(seconds / 60);
		var s = Math.floor(seconds % 60);
		return m + ':' + (s < 10 ? '0' : '') + s;
	}

	function $(id) {
		return document.getElementById(id);
	}

	// -------------------------------------------------------------- charts

	/* Hand-rolled SVG rather than the inherited ECharts. This page must open
	   from a file path with no server and no bundle, and a bar chart of twelve
	   values does not justify 197 KB. The Console keeps ECharts; the shapes
	   here are the same shapes, so the panel chrome transfers either way. */
	function barChart(mount, opts) {
		var values = opts.values;
		var labels = opts.labels;
		var w = 800;
		var h = 260;
		var padL = 44;
		var padR = 12;
		var padT = 12;
		var padB = 46;
		var plotW = w - padL - padR;
		var plotH = h - padT - padB;

		var max = Math.max.apply(null, values.concat([opts.target || 0])) * 1.15;
		var y = function (v) {
			return padT + plotH - (v / max) * plotH;
		};

		var parts = [];
		var ticks = 4;
		for (var t = 0; t <= ticks; t += 1) {
			var val = (max / ticks) * t;
			var yy = y(val);
			parts.push(
				'<line class="grid-line" x1="' + padL + '" y1="' + yy + '" x2="' + (w - padR) + '" y2="' + yy + '"/>'
			);
			parts.push(
				'<text class="axis-text" x="' + (padL - 6) + '" y="' + (yy + 3) + '" text-anchor="end">' +
					val.toFixed(opts.decimals || 0) +
					'</text>'
			);
		}

		var band = plotW / values.length;
		var barW = Math.min(band * 0.62, 46);
		values.forEach(function (v, i) {
			var cx = padL + band * i + band / 2;
			var yy = y(v);
			var over = opts.target && opts.higherIsWorse && v > opts.target;
			parts.push(
				'<rect x="' + (cx - barW / 2) + '" y="' + yy +
					'" width="' + barW + '" height="' + (padT + plotH - yy) +
					'" rx="3" fill="' + (over ? 'var(--band-low)' : opts.colour) + '"/>'
			);
			parts.push(
				'<text class="axis-text" x="' + cx + '" y="' + (padT + plotH + 14) +
					'" text-anchor="middle">' + labels[i] + '</text>'
			);
			parts.push(
				'<text class="axis-text" x="' + cx + '" y="' + (yy - 5) +
					'" text-anchor="middle" fill="var(--chart-marker)">' +
					v.toFixed(opts.decimals || 0) + '</text>'
			);
		});

		if (opts.target) {
			var ty = y(opts.target);
			parts.push(
				'<line class="target-line" x1="' + padL + '" y1="' + ty + '" x2="' + (w - padR) + '" y2="' + ty + '"/>'
			);
			parts.push(
				'<text class="target-text" x="' + (w - padR) + '" y="' + (ty - 5) +
					'" text-anchor="end">' + opts.targetLabel + '</text>'
			);
		}

		parts.push(
			'<text class="axis-text" x="' + (padL + plotW / 2) + '" y="' + (h - 8) +
				'" text-anchor="middle">' + opts.xLabel + '</text>'
		);

		mount.innerHTML =
			'<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + opts.title + '">' +
			parts.join('') +
			'</svg>';
	}

	// --------------------------------------------------------- measurements

	function metricCard(label, value, foot, band) {
		return el('div', { class: 'metric' }, [
			el('p', { class: 'metric__label', text: label }),
			el('p', { class: 'metric__value', text: value }),
			foot ? el('p', { class: 'metric__foot', text: foot, 'data-band': band || null }) : null
		]);
	}

	function renderMeasurements() {
		var clips = MANIFEST.clips;
		var host = MANIFEST.host || { isCi: false, cpuModel: 'unrecorded', cpuCount: 0 };
		var totalAudio = MANIFEST.totals.audioSeconds;
		var totalWall = clips.reduce(function (s, c) {
			return s + c.wallClockMs;
		}, 0) / 1000;
		var rtf = totalWall / totalAudio;
		var wpm = (MANIFEST.totals.words / totalAudio) * 60;

		/* Wall clock is a property of the machine that ran it; pace and bytes are
		   not, because the model is deterministic. So the budget comparison is
		   drawn only when the runner itself did the timing. Measured 2026-09-12
		   the same corpus gave 2.576 on a laptop and 1.0112 on the runner - close
		   enough to look plausible, far enough to price the design wrong. */
		var onRunner = Boolean(host.isCi);

		var medianItems = 370;
		var busiestItems = 731;
		var meanWords = 90.2;
		var medianHours = ((medianItems * meanWords) / wpm / 60) * rtf;
		var busiestHours = ((busiestItems * meanWords) / wpm / 60) * rtf;

		$('host-note').innerHTML = onRunner
			? 'Timed on <b>' + host.cpuModel + '</b>, ' + host.cpuCount +
				' cores &mdash; the production runner. The real-time factor below is the figure the design is priced on.'
			: 'Timed on <b>' + host.cpuModel + '</b>, ' + host.cpuCount +
				' cores &mdash; <b>not the production runner</b>. Real-time factor here measures this machine, ' +
				'so it is shown without the budget it cannot be compared against. Audio duration and speaking ' +
				'pace are unaffected: the model is deterministic, so those two transfer and the wall clock does not.';
		$('host-note').setAttribute('data-band', onRunner ? 'high' : 'medium');

		var mount = $('run-metrics');
		mount.innerHTML = '';
		var cards = [
			metricCard(
				'Real-time factor',
				rtf.toFixed(4),
				onRunner
					? rtf <= RTF_TARGET
						? 'inside the 0.707 budget'
						: 'over the 0.707 budget'
					: 'this machine only, no budget applies',
				onRunner ? (rtf <= RTF_TARGET ? 'high' : 'low') : null
			),
			metricCard('Speaking pace', wpm.toFixed(1) + ' wpm', 'measured, and host-independent'),
			metricCard('Corpus', clips.length + ' clips', MANIFEST.totals.words + ' words')
		];
		if (onRunner) {
			cards.push(
				metricCard(
					'Median day',
					medianHours.toFixed(2) + ' h',
					medianHours <= 6 ? 'fits the 6 h job' : 'busts the 6 h job',
					medianHours <= 6 ? 'high' : 'low'
				),
				metricCard(
					'Busiest day',
					busiestHours.toFixed(2) + ' h',
					busiestHours <= 6 ? 'fits the 6 h job' : 'busts the 6 h job',
					busiestHours <= 6 ? 'high' : 'low'
				)
			);
		} else {
			cards.push(
				metricCard(
					'Median day of audio',
					(((medianItems * meanWords) / wpm)).toFixed(0) + ' min',
					'host-independent, from the measured pace'
				),
				metricCard(
					'Busiest day of audio',
					(((busiestItems * meanWords) / wpm)).toFixed(0) + ' min',
					'host-independent, from the measured pace'
				)
			);
		}
		cards.forEach(function (c) {
			mount.appendChild(c);
		});

		barChart($('chart-rtf'), {
			title: 'Real-time factor by summary length',
			values: clips.map(function (c) {
				return c.realTimeFactor;
			}),
			labels: clips.map(function (c) {
				return c.words;
			}),
			colour: 'var(--chart-1)',
			target: onRunner ? RTF_TARGET : 0,
			targetLabel: 'budget 0.707',
			higherIsWorse: onRunner,
			decimals: 2,
			xLabel: 'words in the summary'
		});

		$('chart-rtf-why').innerHTML = onRunner
			? 'The cost of a day is this number times the audio it holds. The marked line is <strong>0.707</strong> ' +
				'&mdash; the factor the busiest observed day needs to fit inside one six-hour job. A bar above the ' +
				'line is a day that does not finish.'
			: 'The cost of a day is this number times the audio it holds, <em>on the machine that ran it</em>. ' +
				'These timings are from this machine rather than the runner, so the 0.707 budget line is not drawn: ' +
				'comparing the two would price the design on the wrong hardware.';

		barChart($('chart-wpm'), {
			title: 'Speaking pace by summary length',
			values: clips.map(function (c) {
				return c.wordsAMinute;
			}),
			labels: clips.map(function (c) {
				return c.words;
			}),
			colour: 'var(--chart-3)',
			target: wpm,
			targetLabel: 'aggregate ' + wpm.toFixed(1) + ' wpm',
			higherIsWorse: false,
			decimals: 0,
			xLabel: 'words in the summary'
		});

		var rows = clips
			.map(function (c) {
				return (
					'<tr><td>' + c.id + '</td><td>' + c.words + '</td><td>' + c.chunks + '</td><td>' +
					c.audioSeconds.toFixed(1) + ' s</td><td>' + (c.wallClockMs / 1000).toFixed(1) +
					' s</td><td>' + c.realTimeFactor.toFixed(3) + '</td><td>' + c.wordsAMinute.toFixed(1) +
					'</td></tr>'
				);
			})
			.join('');
		$('measure-table').innerHTML =
			'<thead><tr><th>Clip</th><th>Words</th><th>Chunks</th><th>Audio</th>' +
			'<th>Wall clock</th><th>RTF</th><th>Words a minute</th></tr></thead><tbody>' +
			rows +
			'</tbody>';
	}

	// -------------------------------------------------------- verdict tally

	function renderVerdictMetrics() {
		var counts = { publishable: 0, borderline: 0, reject: 0, unjudged: 0 };
		MANIFEST.clips.forEach(function (c) {
			var v = state[c.id] && state[c.id].verdict;
			if (v === 'publishable') counts.publishable += 1;
			else if (v === 'borderline') counts.borderline += 1;
			else if (v === 'reject') counts.reject += 1;
			else counts.unjudged += 1;
		});

		var defects = 0;
		Object.keys(state).forEach(function (k) {
			defects += (state[k].defects || []).length;
		});

		var mount = $('verdict-metrics');
		mount.innerHTML = '';
		[
			metricCard('Publishable', String(counts.publishable), 'of ' + MANIFEST.clips.length, 'high'),
			metricCard('Borderline', String(counts.borderline), 'needs a second listen', 'medium'),
			metricCard('Reject', String(counts.reject), 'would not ship', 'low'),
			metricCard('Not yet judged', String(counts.unjudged), 'never counted as a pass'),
			metricCard('Defects logged', String(defects), 'each one timestamped')
		].forEach(function (c) {
			mount.appendChild(c);
		});
	}

	// ----------------------------------------------------------- clip rows

	/* The text is drawn with a rule at each chunk boundary, because a seam is
	   the artefact the pipeline creates and a listener needs to know where to
	   expect one before being asked whether they heard it. */
	function textWithSeams(clip) {
		var node = el('p', { class: 'clip__text' });
		var text = clip.text;
		var marks = clip.chunkBoundaries || [];
		var cursor = 0;

		marks.forEach(function (tail) {
			var at = text.indexOf(tail, cursor);
			if (at === -1) return;
			var end = at + tail.length;
			node.appendChild(document.createTextNode(text.slice(cursor, end)));
			node.appendChild(el('span', { class: 'seam', title: 'chunk boundary' }));
			cursor = end;
		});
		node.appendChild(document.createTextNode(text.slice(cursor)));
		return node;
	}

	function scoreBlock(clip) {
		var grid = el('div', { class: 'score-grid' });
		SCORES.forEach(function (def) {
			var buttons = el('div', { class: 'score__buttons' });
			[1, 2, 3, 4, 5].forEach(function (n) {
				var b = el('button', {
					type: 'button',
					text: String(n),
					'aria-pressed': entry(clip.id).scores[def.key] === n ? 'true' : 'false',
					'aria-label': def.label + ' ' + n + ' of 5'
				});
				b.addEventListener('click', function () {
					var e = entry(clip.id);
					e.scores[def.key] = e.scores[def.key] === n ? null : n;
					save();
					Array.prototype.forEach.call(buttons.children, function (sib, i) {
						sib.setAttribute('aria-pressed', e.scores[def.key] === i + 1 ? 'true' : 'false');
					});
				});
				buttons.appendChild(b);
			});
			grid.appendChild(
				el('div', { class: 'score' }, [
					el('label', {
						class: 'score__label',
						html: '<b>' + def.label + '</b> &middot; ' + def.hint
					}),
					buttons
				])
			);
		});
		return grid;
	}

	function verdictBlock(clip) {
		var row = el('div', { class: 'verdict-row' }, [el('span', { text: 'Verdict' })]);
		['publishable', 'borderline', 'reject'].forEach(function (v) {
			var b = el('button', {
				class: 'verdict',
				type: 'button',
				'data-verdict': v,
				text: v,
				'aria-pressed': entry(clip.id).verdict === v ? 'true' : 'false'
			});
			b.addEventListener('click', function () {
				var e = entry(clip.id);
				e.verdict = e.verdict === v ? null : v;
				save();
				Array.prototype.forEach.call(row.querySelectorAll('.verdict'), function (sib) {
					sib.setAttribute(
						'aria-pressed',
						e.verdict === sib.getAttribute('data-verdict') ? 'true' : 'false'
					);
				});
				renderVerdictMetrics();
			});
			row.appendChild(b);
		});
		return row;
	}

	function renderDefects(clip, list) {
		list.innerHTML = '';
		entry(clip.id).defects.forEach(function (d, i) {
			var stamp = el('time', { text: clock(d.atSeconds), title: 'Jump here' });
			stamp.addEventListener('click', function () {
				play(MANIFEST.clips.indexOf(clip), d.atSeconds);
			});
			var remove = el('button', { type: 'button', text: '\u00d7', 'aria-label': 'Remove defect' });
			remove.addEventListener('click', function () {
				entry(clip.id).defects.splice(i, 1);
				save();
				renderDefects(clip, list);
				renderVerdictMetrics();
			});
			list.appendChild(
				el('li', {}, [
					stamp,
					el('span', { text: d.kind }),
					el('span', { text: d.note || '' }),
					remove
				])
			);
		});
	}

	function defectBlock(clip) {
		var kind = el('select', { 'aria-label': 'Defect kind' });
		DEFECT_KINDS.forEach(function (k) {
			kind.appendChild(el('option', { value: k, text: k }));
		});
		var note = el('input', { type: 'text', placeholder: 'heard "..." expected "..."', 'aria-label': 'Defect note' });
		var list = el('ul', { class: 'defects' });

		var add = el('button', { type: 'button', text: 'Mark at current position' });
		add.addEventListener('click', function () {
			var idx = MANIFEST.clips.indexOf(clip);
			var at = current === idx ? audio.currentTime : 0;
			entry(clip.id).defects.push({ kind: kind.value, atSeconds: Number(at.toFixed(2)), note: note.value });
			note.value = '';
			save();
			renderDefects(clip, list);
			renderVerdictMetrics();
		});

		renderDefects(clip, list);
		return el('div', {}, [el('div', { class: 'defect-row' }, [kind, note, add]), list]);
	}

	function renderClips() {
		var mount = $('clip-list');
		mount.innerHTML = '';

		MANIFEST.clips.forEach(function (clip, index) {
			var playBtn = el('button', {
				class: 'clip__play',
				type: 'button',
				html: '&#9654;',
				'aria-label': 'Play ' + clip.id
			});
			playBtn.addEventListener('click', function () {
				if (current === index && !audio.paused) audio.pause();
				else play(index, null);
			});

			var note = el('textarea', {
				class: 'clip__note',
				placeholder: 'Anything else worth saying about this clip',
				'aria-label': 'Note for ' + clip.id
			});
			note.value = entry(clip.id).note || '';
			note.addEventListener('input', function () {
				entry(clip.id).note = note.value;
				save();
			});

			var body = el('div', { class: 'clip__body' }, [
				el('div', { class: 'clip__head' }, [
					el('span', { class: 'clip__id', text: clip.id }),
					el('span', {
						class: 'clip__facts',
						text:
							clip.words + ' words \u00b7 ' + clip.chunks + ' chunk' +
							(clip.chunks === 1 ? '' : 's') + ' \u00b7 ' + clock(clip.audioSeconds) +
							' \u00b7 ' + clip.wordsAMinute.toFixed(0) + ' wpm' +
							(clip.sourceName ? ' \u00b7 ' + clip.sourceName : '')
					}),
					/* The hazards this summary carries. A listener with limited time
					   should spend it on the clips that can actually discriminate
					   between two models, and a currency amount or an acronym is
					   where a news voice fails - not in the ordinary prose. */
					...(clip.hazards || []).map((h) =>
						el('span', { class: 'hazard', text: HAZARD_LABELS[h] || h })
					)
				]),
				el('div', { class: 'clip__cols' }, [
					el('div', { class: 'clip__reading' }, [
						textWithSeams(clip),
						clip.chunks > 1
							? el('p', {
									class: 'seam-note',
									text:
										'The rules mark the ' + (clip.chunks - 1) + ' place' +
										(clip.chunks === 2 ? '' : 's') +
										' the pipeline cut this summary. Listen for a join there.'
								})
							: null
					]),
					el('div', { class: 'clip__judgement' }, [
						scoreBlock(clip),
						verdictBlock(clip),
						defectBlock(clip),
						note
					])
				])
			]);

			mount.appendChild(
				el('li', { class: 'clip', id: 'clip-' + clip.id, 'data-playing': 'false' }, [playBtn, body])
			);
		});
	}

	// -------------------------------------------------------------- player

	var audio = $('audio');
	var slowTimer = null;

	/* The clip's length in seconds.
	   `audio.duration` is authoritative when the browser has it, but it is
	   `NaN` before metadata arrives and `Infinity` when the response cannot be
	   measured - a server without range support produces exactly that. The
	   manifest knows the real length in both cases, so it is the fallback
	   rather than the other way round. */
	function durationOf(index) {
		if (isFinite(audio.duration) && audio.duration > 0) return audio.duration;
		var clip = MANIFEST.clips[index];
		return clip ? clip.audioSeconds : 0;
	}

	function markPlaying(index) {
		MANIFEST.clips.forEach(function (c, i) {
			var row = $('clip-' + c.id);
			if (row) row.setAttribute('data-playing', i === index ? 'true' : 'false');
			var btn = row && row.querySelector('.clip__play');
			if (btn) btn.innerHTML = i === index && !audio.paused ? '&#10074;&#10074;' : '&#9654;';
		});
		$('toggle').innerHTML = audio.paused ? '&#9654;' : '&#10074;&#10074;';
	}

	function play(index, at) {
		if (index < 0 || index >= MANIFEST.clips.length) return;
		var clip = MANIFEST.clips[index];

		if (current !== index) {
			current = index;
			audio.src = '../clips/' + clip.clip;
			$('dock-title').textContent = clip.id + ' \u00b7 ' + clip.words + ' words';
			$('dock-title').setAttribute('data-idle', 'false');
			$('time-total').textContent = clock(clip.audioSeconds);
			$('time-now').textContent = '0:00';

			// A new clip starts with an empty track, not the last one's fill.
			$('track-elapsed').style.width = '0%';
			$('track-buffered').style.width = '0%';

			/* The wait is measured, never a spinner - so the only thing that
			   appears is one line of words, and only past the threshold. */
			clearTimeout(slowTimer);
			slowTimer = setTimeout(function () {
				$('dock-slow').hidden = false;
			}, SLOW_MS);
		}

		if (at !== null && at !== undefined) {
			var seek = function () {
				audio.currentTime = at;
				audio.removeEventListener('loadedmetadata', seek);
			};
			if (audio.readyState >= 1) audio.currentTime = at;
			else audio.addEventListener('loadedmetadata', seek);
		}

		audio.play().catch(function () {
			/* Autoplay refusal is a browser policy, not a failure of the clip.
			   The controls stay live so a second press works. */
		});
		$('prev').disabled = index === 0;
		$('next').disabled = index === MANIFEST.clips.length - 1;
		$('mark').disabled = false;
		markPlaying(index);
	}

	audio.addEventListener('playing', function () {
		clearTimeout(slowTimer);
		$('dock-slow').hidden = true;
		markPlaying(current);
	});
	audio.addEventListener('pause', function () {
		markPlaying(current);
	});
	function paintBuffered() {
		var d = durationOf(current);
		if (!audio.buffered.length || !d) return;
		var end = audio.buffered.end(audio.buffered.length - 1);
		$('track-buffered').style.width = Math.min(100, (end / d) * 100) + '%';
	}

	audio.addEventListener('timeupdate', function () {
		var d = durationOf(current);
		var pct = d ? (audio.currentTime / d) * 100 : 0;
		$('track-elapsed').style.width = Math.min(100, pct) + '%';
		$('track').setAttribute('aria-valuenow', Math.round(Math.min(100, pct)));
		$('time-now').textContent = clock(audio.currentTime);
		paintBuffered();
	});

	/* A small file over a fast link can finish arriving before `progress` fires
	   even once, so the buffered fill is painted from every event that can mean
	   "more bytes are here" rather than from that one. */
	['progress', 'loadeddata', 'canplay', 'canplaythrough', 'suspend'].forEach(function (name) {
		audio.addEventListener(name, paintBuffered);
	});
	audio.addEventListener('ended', function () {
		if ($('auto-advance').checked && current < MANIFEST.clips.length - 1) play(current + 1, null);
		else markPlaying(-1);
	});

	$('toggle').addEventListener('click', function () {
		if (current < 0) play(0, null);
		else if (audio.paused) audio.play();
		else audio.pause();
	});
	$('prev').addEventListener('click', function () {
		play(current - 1, null);
	});
	$('next').addEventListener('click', function () {
		play(current + 1, null);
	});
	$('mark').addEventListener('click', function () {
		if (current < 0) return;
		var clip = MANIFEST.clips[current];
		var row = $('clip-' + clip.id);
		entry(clip.id).defects.push({ kind: 'other', atSeconds: Number(audio.currentTime.toFixed(2)), note: '' });
		save();
		renderDefects(clip, row.querySelector('.defects'));
		renderVerdictMetrics();
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
		if (e.code === 'Space') {
			e.preventDefault();
			$('toggle').click();
		}
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
			});
		});
	}

	function wireTheme() {
		var btn = $('theme-toggle');
		var saved = null;
		try {
			saved = localStorage.getItem(STORE_KEY + ':theme');
		} catch (e) {
			/* ignore */
		}
		var theme = saved || 'dark';
		document.documentElement.setAttribute('data-theme', theme);
		btn.textContent = theme === 'dark' ? 'Light' : 'Dark';
		btn.addEventListener('click', function () {
			theme = theme === 'dark' ? 'light' : 'dark';
			document.documentElement.setAttribute('data-theme', theme);
			btn.textContent = theme === 'dark' ? 'Light' : 'Dark';
			try {
				localStorage.setItem(STORE_KEY + ':theme', theme);
			} catch (e) {
				/* ignore */
			}
		});
	}

	function wireExport() {
		$('export').addEventListener('click', function () {
			var payload = {
				schemaVersion: SCHEMA_VERSION,
				ratedAt: new Date().toISOString(),
				rater: $('rater').value || 'unnamed',
				listeningConditions: $('conditions').value,
				subject: {
					model: MANIFEST.model,
					voice: MANIFEST.voice,
					maxWordsAChunk: MANIFEST.maxWordsAChunk,
					sampleRate: MANIFEST.sampleRate
				},
				clips: MANIFEST.clips.map(function (c) {
					var e = state[c.id] || {};
					return {
						id: c.id,
						verdict: e.verdict || null,
						scores: e.scores || {},
						defects: e.defects || [],
						note: e.note || ''
					};
				})
			};

			var blob = new Blob([JSON.stringify(payload, null, 2) + '\n'], { type: 'application/json' });
			var a = el('a', {
				href: URL.createObjectURL(blob),
				download:
					'evaluation-' + new Date().toISOString().slice(0, 10) + '-' +
					(payload.rater.replace(/\W+/g, '-').toLowerCase() || 'unnamed') + '.json'
			});
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			$('export-status').textContent = 'Written. Keep it beside the clips it judged.';
		});

		$('reset').addEventListener('click', function () {
			if (!window.confirm('Clear every score, verdict and defect on this page?')) return;
			state = {};
			save();
			renderClips();
			renderVerdictMetrics();
			$('export-status').textContent = 'Cleared.';
		});
	}

	// ----------------------------------------------------------------- boot

	$('subject-model').textContent = MANIFEST.model;
	$('subject-voice').textContent = MANIFEST.voice;
	$('subject-chunk').textContent = MANIFEST.maxWordsAChunk;
	$('subject-built').textContent = MANIFEST.generatedAt.slice(0, 10);

	wireTabs();
	wireTheme();
	wireExport();
	renderClips();
	renderVerdictMetrics();
	renderMeasurements();
})();
