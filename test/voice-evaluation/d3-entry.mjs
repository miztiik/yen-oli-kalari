/* The d3 surface this page is allowed to use.
 *
 * Adding an export here is the moment to ask whether the page needs another
 * module, because this file is the only place that can widen the bundle.
 * `vendor-d3.mjs` turns it into `page/vendor/d3-micro.js`. */

export { select, selectAll, pointer } from "d3-selection";
export { transition } from "d3-transition";
export { easeCubicOut, easeBackOut, easeQuadOut } from "d3-ease";
export { scaleLinear, scaleBand, scalePoint, scaleSequential } from "d3-scale";
export { extent, max, min, range, ticks } from "d3-array";
export { arc, line, area, curveMonotoneX } from "d3-shape";
export { axisBottom, axisLeft } from "d3-axis";
export { drag } from "d3-drag";
export { format } from "d3-format";
