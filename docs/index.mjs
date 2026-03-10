//#region src/Debug.ts
var StopWatch = class {
	lastTime;
	constructor(report) {
		this.report = report;
		this.lastTime = performance.now();
		this.report = report;
	}
	lap(label) {
		const now = performance.now();
		const elapsed = now - this.lastTime;
		if (this.report) console.log(`${elapsed.toFixed(1)} ms: ${label}`);
		this.lastTime = now;
		return elapsed;
	}
};

//#endregion
//#region src/CodeGen.ts
let CodeFormat = /* @__PURE__ */ function(CodeFormat$1) {
	CodeFormat$1[CodeFormat$1["C_ARRAY"] = 0] = "C_ARRAY";
	CodeFormat$1[CodeFormat$1["RAW_BINARY"] = 1] = "RAW_BINARY";
	return CodeFormat$1;
}({});
let CodeUnit = /* @__PURE__ */ function(CodeUnit$1) {
	CodeUnit$1[CodeUnit$1["ELEMENTS"] = 0] = "ELEMENTS";
	CodeUnit$1[CodeUnit$1["ARRAY_DEF"] = 1] = "ARRAY_DEF";
	CodeUnit$1[CodeUnit$1["FILE"] = 2] = "FILE";
	return CodeUnit$1;
}({});
let Indent = /* @__PURE__ */ function(Indent$1) {
	Indent$1[Indent$1["TAB"] = 0] = "TAB";
	Indent$1[Indent$1["SPACE_X2"] = 1] = "SPACE_X2";
	Indent$1[Indent$1["SPACE_X4"] = 2] = "SPACE_X4";
	return Indent$1;
}({});
var Code = class {
	name = "";
	code = "";
	numLines = 0;
};
var CodeGenArgs = class {
	name = "";
	src = null;
	blobs = [];
	format = CodeFormat.C_ARRAY;
	codeUnit = CodeUnit.FILE;
	indent = Indent.SPACE_X2;
	arrayCols = 16;
	codes = [];
};
var StringBuilder = class {
	buff = [];
	ptr = 0;
	constructor(length = 0) {
		this.length = length;
		this.buff = Array(length);
		this.clear();
	}
	push(s) {
		if (this.ptr >= this.length) {
			this.length = Math.floor(this.length * 1.5) + 10;
			const newBuff = Array(this.length);
			for (let i = 0; i < this.ptr; i++) newBuff[i] = this.buff[i];
			this.buff = newBuff;
			console.warn("StringBuilder: buffer resized to " + this.length);
		}
		this.buff[this.ptr++] = s;
	}
	join(sep) {
		return this.buff.join(sep);
	}
	clear() {
		this.ptr = 0;
		for (let i = 0; i < this.length; i++) this.buff[i] = "";
	}
	numLines() {
		let n = 0;
		for (let i = 0; i < this.ptr; i++) if (this.buff[i].endsWith("\n")) n++;
		return n;
	}
};
function generate(args) {
	switch (args.format) {
		case CodeFormat.C_ARRAY:
			generateCArray(args);
			break;
		case CodeFormat.RAW_BINARY:
			generateRawBinary(args);
			break;
		default: throw new Error("Unknown code format");
	}
}
function generateCArray(args) {
	const sw = new StopWatch(false);
	let indent = "  ";
	switch (args.indent) {
		case Indent.SPACE_X2:
			indent = "  ";
			break;
		case Indent.SPACE_X4:
			indent = "    ";
			break;
		case Indent.TAB:
			indent = "	";
			break;
		default: throw new Error("Unknown indent type");
	}
	let hexTable = [];
	for (let i = 0; i < 256; i++) hexTable.push(`0x${i.toString(16).padStart(2, "0")},`);
	let buffLen = 100;
	for (let blob of args.blobs) {
		const len = blob.array.length;
		buffLen += 10 + len * 2 + Math.ceil(len / args.arrayCols) * 2;
	}
	const buff = new StringBuilder(buffLen);
	if (args.codeUnit >= CodeUnit.FILE) {
		buff.push(`#pragma once\n`);
		buff.push(`\n`);
		buff.push(`#include <stdint.h>\n`);
		buff.push(`\n`);
	}
	for (let iBlob = 0; iBlob < args.blobs.length; iBlob++) {
		const blob = args.blobs[iBlob];
		const array = blob.array;
		let arrayName;
		if (args.blobs.length <= 1) arrayName = args.name;
		else arrayName = args.name + "_" + blob.name;
		if (args.codeUnit >= CodeUnit.ARRAY_DEF) {
			const lines = blob.comment.trimEnd().split("\n");
			for (let line of lines) buff.push(`// ${line}\n`);
			buff.push(`const uint8_t ${arrayName}[] = {\n`);
		}
		for (let i = 0; i < array.length; i++) {
			if (i % args.arrayCols == 0) buff.push(indent);
			buff.push(hexTable[array[i]]);
			if ((i + 1) % args.arrayCols == 0 || i + 1 == array.length) buff.push("\n");
			else buff.push(" ");
		}
		if (args.codeUnit >= CodeUnit.ARRAY_DEF) buff.push("};\n");
		const lastBlob = iBlob + 1 >= args.blobs.length;
		if (args.codeUnit < CodeUnit.FILE || lastBlob) {
			const code = new Code();
			if (args.codeUnit >= CodeUnit.FILE) code.name = args.name + ".h";
			else code.name = args.name + "_" + blob.name + ".h";
			code.code = buff.join("");
			code.numLines = buff.numLines();
			args.codes.push(code);
			if (!lastBlob) buff.clear();
		}
	}
	sw.lap("CodeGen.generate()");
}
function generateRawBinary(args) {
	let buff = new Uint8Array(0);
	let hexTable = [];
	for (let i = 0; i < 256; i++) hexTable.push(i.toString(16).padStart(2, "0"));
	for (let iBlob = 0; iBlob < args.blobs.length; iBlob++) {
		const blob = args.blobs[iBlob];
		const array = blob.array;
		const newBuff = new Uint8Array(buff.length + array.length);
		newBuff.set(buff, 0);
		newBuff.set(array, buff.length);
		buff = newBuff;
		const lastBlob = iBlob + 1 >= args.blobs.length;
		if (args.codeUnit < CodeUnit.FILE || lastBlob) {
			const code = new Code();
			if (args.codeUnit >= CodeUnit.FILE) code.name = args.name + ".bin";
			else code.name = args.name + "_" + blob.name + ".bin";
			const len = buff.length;
			const sbLen = 100 + len * 2 + Math.ceil(len / args.arrayCols) * 2;
			const sb = new StringBuilder(sbLen);
			for (let i = 0; i < buff.length; i++) {
				sb.push(hexTable[buff[i]]);
				if (i + 1 < buff.length) if ((i + 1) % args.arrayCols == 0) sb.push("\n");
				else sb.push(" ");
			}
			code.code = sb.join("");
			code.numLines = sb.numLines();
			args.codes.push(code);
			if (!lastBlob) buff = new Uint8Array(0);
		}
	}
}

//#endregion
//#region src/Utils.ts
function clip(min, max, val) {
	if (val < min) return min;
	if (val > max) return max;
	return val;
}
function intCeil(val, unit) {
	return Math.ceil(val / unit) * unit;
}

//#endregion
//#region src/Colors.ts
var HslRange = class {
	hMin = 0;
	hRange = 1;
	sMin = 0;
	sMax = 1;
	lMin = 0;
	lMax = 1;
};
function strToU32(hex) {
	if (hex.startsWith("#")) hex = hex.slice(1);
	if (hex.length === 3) {
		const r = parseInt(hex[0] + hex[0], 16);
		const g = parseInt(hex[1] + hex[1], 16);
		const b = parseInt(hex[2] + hex[2], 16);
		return r | g << 8 | b << 16;
	} else if (hex.length == 6) {
		const r = parseInt(hex.slice(0, 2), 16);
		const g = parseInt(hex.slice(2, 4), 16);
		const b = parseInt(hex.slice(4, 6), 16);
		return r | g << 8 | b << 16;
	} else throw new Error("Invalid hex color");
}
function u32ToHexStr(rgb) {
	const { r, g, b } = unpackU32ToU8(rgb);
	const chVals = [
		r,
		g,
		b
	];
	let longFormat = false;
	for (let i = 0; i < 3; i++) {
		const hi = chVals[i] >> 4;
		const lo = chVals[i] & 15;
		if (hi != lo) {
			longFormat = true;
			break;
		}
	}
	if (longFormat) return "#" + r.toString(16).padStart(2, "0") + g.toString(16).padStart(2, "0") + b.toString(16).padStart(2, "0");
	else return "#" + (r >> 4).toString(16) + (g >> 4).toString(16) + (b >> 4).toString(16);
}
function unpackU32ToU8(color) {
	const r = color & 255;
	const g = color >> 8 & 255;
	const b = color >> 16 & 255;
	return {
		r,
		g,
		b
	};
}
function rgbU32ToF32(color) {
	const r = (color & 255) / 255;
	const g = (color >> 8 & 255) / 255;
	const b = (color >> 16 & 255) / 255;
	return {
		r,
		g,
		b
	};
}
function grayscale(r, g, b) {
	return .299 * r + .587 * g + .114 * b;
}
function grayscaleU32(color) {
	const { r, g, b } = unpackU32ToU8(color);
	return grayscale(r, g, b);
}
function grayscaleArrayF32(data, offset) {
	return grayscale(data[offset], data[offset + 1], data[offset + 2]);
}
function grayscaleArrayU8(data, offset) {
	return grayscale(data[offset], data[offset + 1], data[offset + 2]);
}
function rgbToHslArrayF32(src, srcOffset, dest, destOffset, numPixels) {
	for (let i = 0; i < numPixels; i++) {
		const r = src[srcOffset];
		const g = src[srcOffset + 1];
		const b = src[srcOffset + 2];
		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		let h = 0, s = 0, l = (max + min) / 2;
		if (max != min) {
			const d = max - min;
			s = d;
			switch (max) {
				case r:
					h = (g - b) / d + (g < b ? 6 : 0);
					break;
				case g:
					h = (b - r) / d + 2;
					break;
				case b:
					h = (r - g) / d + 4;
					break;
			}
		}
		h /= 6;
		dest[destOffset] = h;
		dest[destOffset + 1] = s;
		dest[destOffset + 2] = l;
		srcOffset += 3;
		destOffset += 3;
	}
}
function hslToRgbArrayF32(src, srcOffset, dest, destOffset, numPixels) {
	for (let i = 0; i < numPixels; i++) {
		let h = src[srcOffset];
		let s = src[srcOffset + 1];
		let l = src[srcOffset + 2];
		let r, g, b;
		if (s == 0) r = g = b = l;
		else {
			const p = s / 2;
			const max = l + p;
			const min = l - p;
			h -= Math.floor(h);
			h *= 6;
			if (h < 1) {
				r = max;
				g = min + (max - min) * h;
				b = min;
			} else if (h < 2) {
				r = min + (max - min) * (2 - h);
				g = max;
				b = min;
			} else if (h < 3) {
				r = min;
				g = max;
				b = min + (max - min) * (h - 2);
			} else if (h < 4) {
				r = min;
				g = min + (max - min) * (4 - h);
				b = max;
			} else if (h < 5) {
				r = min + (max - min) * (h - 4);
				g = min;
				b = max;
			} else {
				r = max;
				g = min;
				b = min + (max - min) * (6 - h);
			}
		}
		dest[destOffset] = clip(0, 1, r);
		dest[destOffset + 1] = clip(0, 1, g);
		dest[destOffset + 2] = clip(0, 1, b);
		srcOffset += 3;
		destOffset += 3;
	}
}
function hueWrap(hue) {
	return hue - Math.floor(hue);
}
function hueAdd(hue, add) {
	return hueWrap(hue + add);
}
function hueDiff(hue1, hue2) {
	const d = hueWrap(hue1 - hue2);
	if (d < .5) return d;
	else return d - 1;
}
function hueClip(min, range, hue) {
	const radius = range / 2;
	const center = hueAdd(min, radius);
	const d = hueDiff(hue, center);
	if (d < -radius) return hueAdd(center, -radius);
	else if (d > radius) return hueAdd(center, radius);
	else return hue;
}

//#endregion
//#region src/Ui.ts
const selectedColor = "#06F";
function toElementArray(children) {
	if (children == null) return [];
	if (!Array.isArray(children)) children = [children];
	for (let i = 0; i < children.length; i++) if (typeof children[i] === "string") children[i] = document.createTextNode(children[i]);
	else if (children[i] instanceof Node) {} else throw new Error("Invalid child element");
	return children;
}
function makeSection(children = []) {
	const div = document.createElement("div");
	div.classList.add("propertySection");
	toElementArray(children).forEach((child) => div.appendChild(child));
	return div;
}
function makeFloatList(children = [], sep = true) {
	const ul = document.createElement("ul");
	toElementArray(children).forEach((child) => {
		if (!child.classList) child = makeSpan(child);
		const li = document.createElement("li");
		li.appendChild(child);
		if (sep && child.classList && !child.classList.contains("sectionHeader")) li.style.marginRight = "20px";
		ul.appendChild(li);
	});
	return ul;
}
function makeGroup(children = []) {
	const div = document.createElement("div");
	div.classList.add("group");
	toElementArray(children).forEach((child) => div.appendChild(child));
	return div;
}
function makeGroupTitle(children = []) {
	const div = document.createElement("div");
	div.classList.add("groupTitle");
	toElementArray(children).forEach((child) => div.appendChild(child));
	return div;
}
function makeGroupBody(children = []) {
	const div = document.createElement("div");
	div.classList.add("groupBody");
	toElementArray(children).forEach((child) => div.appendChild(child));
	return div;
}
function makeDiv(children = []) {
	const p = document.createElement("div");
	toElementArray(children).forEach((child) => p.appendChild(child));
	return p;
}
function makeParagraph(children = []) {
	const p = document.createElement("p");
	toElementArray(children).forEach((child) => p.appendChild(child));
	return p;
}
function makeSpan(children = []) {
	const span = document.createElement("span");
	toElementArray(children).forEach((child) => span.appendChild(child));
	return span;
}
function makeNowrap(children = []) {
	const span = document.createElement("span");
	span.classList.add("nowrap");
	toElementArray(children).forEach((child) => span.appendChild(child));
	return span;
}
function makeHeader(text) {
	const span = document.createElement("span");
	span.classList.add("sectionHeader");
	span.textContent = text;
	return span;
}
function makeTextBox(value = "", placeholder = "", maxLength = 100) {
	const input = document.createElement("input");
	input.type = "text";
	input.value = value;
	input.placeholder = placeholder;
	input.style.width = `${clip(50, 100, maxLength * 10 + 10)}px`;
	input.style.textAlign = "right";
	input.maxLength = maxLength;
	input.inputMode = "decimal";
	input.addEventListener("focus", () => input.select());
	return input;
}
function makeSelectBox(items, defaultValue) {
	const select = document.createElement("select");
	for (const item of items) {
		const option = document.createElement("option");
		option.value = item.value.toString();
		option.textContent = item.label;
		if (item.tip) option.title = item.tip;
		select.appendChild(option);
	}
	select.value = defaultValue.toString();
	return select;
}
function makeCheckBox(labelText) {
	const label = document.createElement("label");
	const checkbox = document.createElement("input");
	checkbox.type = "checkbox";
	label.appendChild(checkbox);
	label.appendChild(document.createTextNode(labelText));
	return checkbox;
}
function makeButton(text = "") {
	const button = document.createElement("button");
	button.textContent = text;
	return button;
}
function basic(elem) {
	elem.classList.add("basic");
	return elem;
}
function pro(elem) {
	elem.classList.add("professional");
	return elem;
}
function show(elem) {
	elem.classList.remove("hidden");
	return elem;
}
function hide(elem) {
	elem.classList.add("hidden");
	return elem;
}
function setVisible(elem, visible) {
	return visible ? show(elem) : hide(elem);
}
function tip(children, text) {
	let target;
	if (children instanceof HTMLElement) target = children;
	else target = makeSpan(children);
	if (text) target.title = text;
	return target;
}
function parentLiOf(child) {
	let parent = child;
	while (parent && parent.tagName !== "LI") parent = parent.parentElement;
	return parent;
}
function upDown(elem, min, max, step) {
	const upDownButton = makeButton("");
	upDownButton.classList.add("upDown");
	upDownButton.tabIndex = -1;
	const textBox = elem;
	upDownButton.addEventListener("pointermove", (e) => {
		e.preventDefault();
		if (upDownButton.dataset.dragStartY && upDownButton.dataset.dragStartVal) {
			const y = e.offsetY;
			const startY = parseFloat(upDownButton.dataset.dragStartY);
			const startVal = parseFloat(upDownButton.dataset.dragStartVal);
			const n = (max - min) / step;
			let deltaY = Math.round((y - startY) * n / 512);
			let val = clip(min, max, startVal - deltaY * step);
			textBox.value = (Math.round(val * 100) / 100).toString();
			textBox.dispatchEvent(new Event("change"));
		}
	});
	upDownButton.addEventListener("pointerdown", (e) => {
		e.preventDefault();
		const y = e.offsetY;
		let val;
		if (textBox.value.trim()) val = parseFloat(textBox.value.trim());
		else val = parseFloat(textBox.placeholder.replaceAll(/[\(\)]/g, "").trim());
		val = Math.round(val / step) * step;
		upDownButton.dataset.dragStartY = y.toString();
		upDownButton.dataset.dragStartVal = val.toString();
		upDownButton.style.cursor = "grabbing";
		upDownButton.setPointerCapture(e.pointerId);
	});
	upDownButton.addEventListener("pointerup", (e) => {
		e.preventDefault();
		delete upDownButton.dataset.dragStartY;
		delete upDownButton.dataset.dragStartVal;
		upDownButton.style.cursor = "ns-resize";
		upDownButton.releasePointerCapture(e.pointerId);
	});
	upDownButton.addEventListener("touchstart", (e) => e.preventDefault());
	upDownButton.addEventListener("touchmove", (e) => e.preventDefault());
	upDownButton.addEventListener("touchend", (e) => e.preventDefault());
	return makeSpan([textBox, upDownButton]);
}

//#endregion
//#region src/ColorSpaceUis.ts
var Object3D = class {
	constructor(vertBuff) {
		this.vertBuff = vertBuff;
	}
	zOffset = 0;
	get zPos() {
		return this.onGetZPos() + this.zOffset;
	}
};
var Line3D = class extends Object3D {
	constructor(vertBuff, v0, v1, color) {
		super(vertBuff);
		this.v0 = v0;
		this.v1 = v1;
		this.color = color;
	}
	onGetZPos() {
		const z0 = this.vertBuff[this.v0 + 2];
		const z1 = this.vertBuff[this.v1 + 2];
		return (z0 + z1) / 2;
	}
	render(ctx) {
		const x0 = this.vertBuff[this.v0 + 0];
		const y0 = this.vertBuff[this.v0 + 1];
		const x1 = this.vertBuff[this.v1 + 0];
		const y1 = this.vertBuff[this.v1 + 1];
		ctx.lineWidth = 3;
		ctx.strokeStyle = "rgba(0,0,0,0.5)";
		ctx.beginPath();
		ctx.moveTo(x0, y0);
		ctx.lineTo(x1, y1);
		ctx.stroke();
		ctx.lineWidth = 1;
		ctx.strokeStyle = this.color;
		ctx.beginPath();
		ctx.moveTo(x0, y0);
		ctx.lineTo(x1, y1);
		ctx.stroke();
	}
};
var Dot3D = class extends Object3D {
	constructor(vertBuff, v, square, color, size = 8) {
		super(vertBuff);
		this.v = v;
		this.square = square;
		this.color = color;
		this.size = size;
	}
	onGetZPos() {
		return this.vertBuff[this.v + 2];
	}
	render(ctx) {
		const x = this.vertBuff[this.v + 0];
		const y = this.vertBuff[this.v + 1];
		const r2 = this.size;
		const r = r2 / 2;
		if (this.square) {
			ctx.fillStyle = "rgba(0,0,0,0.5)";
			ctx.fillRect(x - r - 1, y - r - 1, r2 + 2, r2 + 2);
			ctx.fillStyle = this.color;
			ctx.fillRect(x - r, y - r, r2, r2);
		} else {
			ctx.fillStyle = "rgba(0,0,0,0.5)";
			ctx.beginPath();
			ctx.arc(x, y, r + 1, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = this.color;
			ctx.beginPath();
			ctx.arc(x, y, r, 0, Math.PI * 2);
			ctx.fill();
		}
	}
};
var ColorSpaceUi = class {
	canvas = document.createElement("canvas");
	container = makeParagraph([this.canvas]);
	paletteVerts = new Float32Array();
	paletteEdgeVertIndices = new Uint32Array();
	paletteTriangleVertIndices = new Uint32Array();
	octreePoints = [];
	sampleColors = [];
	renderTimeoutId = null;
	rotateX = Math.PI / 6;
	rotateY = Math.PI / 6;
	projectionMtx = [
		1,
		0,
		0,
		0,
		0,
		1,
		0,
		0,
		0,
		0,
		1,
		0,
		0,
		0,
		0,
		1
	];
	vertBuff = [];
	vertBuffSize = 0;
	objBuffs = [];
	objBuffsSize = 0;
	constructor() {
		this.canvas.width = 250;
		this.canvas.height = 250;
		this.queryRender();
		this.canvas.addEventListener("pointerdown", (e) => {
			e.preventDefault();
			this.canvas.setPointerCapture(e.pointerId);
		});
		this.canvas.addEventListener("pointerup", (e) => {
			e.preventDefault();
			this.canvas.releasePointerCapture(e.pointerId);
		});
		this.canvas.addEventListener("pointermove", (e) => {
			if (e.buttons != 1) return;
			e.preventDefault();
			this.rotateY += e.movementX * .01;
			this.rotateX += e.movementY * .01;
			this.rotateX = clip(-Math.PI / 2, Math.PI / 2, this.rotateX);
			this.queryRender();
		});
		this.canvas.addEventListener("touchstart", (e) => e.preventDefault());
		this.canvas.addEventListener("touchmove", (e) => e.preventDefault());
		this.canvas.addEventListener("touchend", (e) => e.preventDefault());
	}
	setPalette(palette) {
		const { verts, ivEdges, ivTriangles } = palette.convexHull.getMesh();
		this.paletteVerts = verts;
		this.paletteEdgeVertIndices = ivEdges;
		this.paletteTriangleVertIndices = ivTriangles;
		this.queryRender();
	}
	setSampleColors(colors) {
		this.sampleColors = colors;
		this.queryRender();
	}
	queryRender() {
		if (this.renderTimeoutId !== null) return;
		this.renderTimeoutId = window.setTimeout(() => {
			window.requestAnimationFrame(() => this.render());
		}, 10);
	}
	render() {
		this.renderTimeoutId = null;
		this.vertBuffSize = 0;
		this.objBuffsSize = 0;
		this.objBuffs.fill(null);
		const canvasW = this.canvas.width;
		const canvasH = this.canvas.height;
		const ctx = this.canvas.getContext("2d");
		if (!ctx) return;
		ctx.fillStyle = "#222";
		ctx.fillRect(0, 0, canvasW, canvasH);
		{
			const v000 = this.pushVert(0, 0, 0);
			const v001 = this.pushVert(1, 0, 0);
			const v010 = this.pushVert(0, 1, 0);
			const v011 = this.pushVert(1, 1, 0);
			const v100 = this.pushVert(0, 0, 1);
			const v101 = this.pushVert(1, 0, 1);
			const v110 = this.pushVert(0, 1, 1);
			const v111 = this.pushVert(1, 1, 1);
			const gray = "#444";
			this.pushLine(v001, v011, gray);
			this.pushLine(v001, v101, gray);
			this.pushLine(v010, v011, gray);
			this.pushLine(v010, v110, gray);
			this.pushLine(v011, v111, gray);
			this.pushLine(v100, v101, gray);
			this.pushLine(v100, v110, gray);
			this.pushLine(v101, v111, gray);
			this.pushLine(v110, v111, gray);
			this.pushLine(v000, v001, "#F00");
			this.pushLine(v000, v010, "#0F0");
			this.pushLine(v000, v100, "#00F");
		}
		for (let i = 0; i < this.paletteVerts.length / 3; i++) {
			const x = this.paletteVerts[i * 3 + 0];
			const y = this.paletteVerts[i * 3 + 1];
			const z = this.paletteVerts[i * 3 + 2];
			const v = this.pushVert(x, y, z);
			const r = clip(0, 255, Math.round(x * 255));
			const g = clip(0, 255, Math.round(y * 255));
			const b = clip(0, 255, Math.round(z * 255));
			this.pushDot(v, true, u32ToHexStr(b << 16 | g << 8 | r)).zOffset = .01;
		}
		for (let i = 0; i < this.paletteEdgeVertIndices.length; i += 2) {
			const x0 = this.paletteVerts[this.paletteEdgeVertIndices[i + 0] + 0];
			const y0 = this.paletteVerts[this.paletteEdgeVertIndices[i + 0] + 1];
			const z0 = this.paletteVerts[this.paletteEdgeVertIndices[i + 0] + 2];
			const x1 = this.paletteVerts[this.paletteEdgeVertIndices[i + 1] + 0];
			const y1 = this.paletteVerts[this.paletteEdgeVertIndices[i + 1] + 1];
			const z1 = this.paletteVerts[this.paletteEdgeVertIndices[i + 1] + 2];
			const v0 = this.pushVert(x0, y0, z0);
			const v1 = this.pushVert(x1, y1, z1);
			this.pushLine(v0, v1, "rgba(255,255,255,0.5)");
		}
		for (let i = 0; i < this.sampleColors.length; i++) {
			const c = this.sampleColors[i];
			const v = this.pushVert(c.x, c.y, c.z);
			const r = clip(0, 255, Math.round(c.x * 255));
			const g = clip(0, 255, Math.round(c.y * 255));
			const b = clip(0, 255, Math.round(c.z * 255));
			const colorStr = u32ToHexStr(b << 16 | g << 8 | r);
			this.pushDot(v, false, colorStr, 4);
		}
		for (let i = 0; i < this.octreePoints.length; i++) {
			const p = this.octreePoints[i];
			const v = this.pushVert(p.point.x, p.point.y, p.point.z);
			this.pushDot(v, false, p.inside ? "rgba(0,255,0,0.5)" : "rgba(255,0,0,0.5)", 2);
		}
		this.prepareProjectionMatrix();
		for (let i = 0; i < this.vertBuffSize; i += 3) this.project3D(this.vertBuff, i);
		if (this.objBuffsSize < this.objBuffs.length) this.objBuffs = this.objBuffs.slice(0, this.objBuffsSize);
		this.objBuffs.sort((a, b) => a.zPos - b.zPos);
		for (let i = 0; i < this.objBuffsSize; i++) this.objBuffs[i].render(ctx);
	}
	pushVert(x, y, z) {
		const ret = this.vertBuffSize;
		if (this.vertBuffSize + 3 <= this.vertBuff.length) {
			this.vertBuff[this.vertBuffSize++] = x;
			this.vertBuff[this.vertBuffSize++] = y;
			this.vertBuff[this.vertBuffSize++] = z;
		} else {
			this.vertBuff.push(x);
			this.vertBuff.push(y);
			this.vertBuff.push(z);
			this.vertBuffSize += 3;
		}
		return ret;
	}
	pushObj(obj) {
		const ret = this.objBuffsSize;
		if (this.objBuffsSize + 1 <= this.objBuffs.length) this.objBuffs[this.objBuffsSize++] = obj;
		else {
			this.objBuffs.push(obj);
			this.objBuffsSize += 1;
		}
		return ret;
	}
	drawNormal(ctx, iv0, iv1, iv2) {
		const x0 = this.paletteVerts[iv0 + 0];
		const y0 = this.paletteVerts[iv0 + 1];
		const z0 = this.paletteVerts[iv0 + 2];
		const x1 = this.paletteVerts[iv1 + 0];
		const y1 = this.paletteVerts[iv1 + 1];
		const z1 = this.paletteVerts[iv1 + 2];
		const x2 = this.paletteVerts[iv2 + 0];
		const y2 = this.paletteVerts[iv2 + 1];
		const z2 = this.paletteVerts[iv2 + 2];
		const ux = x1 - x0;
		const uy = y1 - y0;
		const uz = z1 - z0;
		const vx = x2 - x0;
		const vy = y2 - y0;
		const vz = z2 - z0;
		let nx = uy * vz - uz * vy;
		let ny = uz * vx - ux * vz;
		let nz = ux * vy - uy * vx;
		const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
		if (len > 1e-6) {
			nx /= len;
			ny /= len;
			nz /= len;
		}
		const normalEdge = new Float32Array(6);
		normalEdge[0] = (x0 + x1 + x2) / 3;
		normalEdge[1] = (y0 + y1 + y2) / 3;
		normalEdge[2] = (z0 + z1 + z2) / 3;
		normalEdge[3] = normalEdge[0] + nx * .2;
		normalEdge[4] = normalEdge[1] + ny * .2;
		normalEdge[5] = normalEdge[2] + nz * .2;
		ctx.lineWidth = 1;
		ctx.strokeStyle = "rgba(255,255,255,0.5)";
	}
	pushLine(iv0, iv1, color) {
		const obj = new Line3D(this.vertBuff, iv0, iv1, color);
		this.pushObj(obj);
		return obj;
	}
	pushDot(iv, square, color, size = 8) {
		const obj = new Dot3D(this.vertBuff, iv, square, color, size);
		this.pushObj(obj);
		return obj;
	}
	translateMatrix(tx, ty, tz) {
		const mtx = [
			1,
			0,
			0,
			tx,
			0,
			1,
			0,
			ty,
			0,
			0,
			1,
			tz,
			0,
			0,
			0,
			1
		];
		this.projectionMtx = this.multMatrix(mtx, this.projectionMtx);
	}
	scaleMatrix(sx, sy, sz) {
		const mtx = [
			sx,
			0,
			0,
			0,
			0,
			sy,
			0,
			0,
			0,
			0,
			sz,
			0,
			0,
			0,
			0,
			1
		];
		this.projectionMtx = this.multMatrix(mtx, this.projectionMtx);
	}
	rotateMatrix(xAxis, yAxis, zAxis, radian) {
		const c = Math.cos(radian);
		const s = Math.sin(radian);
		const t = 1 - c;
		const mtx = [
			t * xAxis * xAxis + c,
			t * xAxis * yAxis - s * zAxis,
			t * xAxis * zAxis + s * yAxis,
			0,
			t * xAxis * yAxis + s * zAxis,
			t * yAxis * yAxis + c,
			t * yAxis * zAxis - s * xAxis,
			0,
			t * xAxis * zAxis - s * yAxis,
			t * yAxis * zAxis + s * xAxis,
			t * zAxis * zAxis + c,
			0,
			0,
			0,
			0,
			1
		];
		this.projectionMtx = this.multMatrix(mtx, this.projectionMtx);
	}
	multMatrix(a, b) {
		const result = new Array(16).fill(0);
		for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) for (let k = 0; k < 4; k++) result[row * 4 + col] += a[row * 4 + k] * b[k * 4 + col];
		return result;
	}
	prepareProjectionMatrix() {
		this.projectionMtx = [
			1,
			0,
			0,
			0,
			0,
			1,
			0,
			0,
			0,
			0,
			1,
			0,
			0,
			0,
			0,
			1
		];
		this.translateMatrix(-.5, -.5, -.5);
		this.rotateMatrix(0, 1, 0, this.rotateY);
		this.rotateMatrix(1, 0, 0, this.rotateX);
		this.translateMatrix(0, 0, -3);
		this.scaleMatrix(this.canvas.width / 2, -this.canvas.height / 2, 1);
		this.translateMatrix(this.canvas.width / 2, this.canvas.height / 2, 0);
	}
	project3D(vertBuff, index) {
		const x = vertBuff[index + 0];
		const y = vertBuff[index + 1];
		const z = vertBuff[index + 2];
		const [m11, m12, m13, m14, m21, m22, m23, m24, m31, m32, m33, m34, m41, m42, m43, m44] = this.projectionMtx;
		const w = m41 * x + m42 * y + m43 * z + m44;
		vertBuff[index + 0] = (m11 * x + m12 * y + m13 * z + m14) / w;
		vertBuff[index + 1] = (m21 * x + m22 * y + m23 * z + m24) / w;
		vertBuff[index + 2] = (m31 * x + m32 * y + m33 * z + m34) / w;
	}
};

//#endregion
//#region src/Blobs.ts
var ArrayBlob = class {
	array;
	comment = "";
	constructor(name, size) {
		this.name = name;
		this.size = size;
		this.size = size;
		this.array = new Uint8Array(size);
	}
};

//#endregion
//#region src/Encoder.ts
let PackUnit = /* @__PURE__ */ function(PackUnit$1) {
	PackUnit$1[PackUnit$1["UNPACKED"] = 0] = "UNPACKED";
	PackUnit$1[PackUnit$1["PIXEL"] = 1] = "PIXEL";
	PackUnit$1[PackUnit$1["ALIGNMENT"] = 2] = "ALIGNMENT";
	return PackUnit$1;
}({});
let PlaneType = /* @__PURE__ */ function(PlaneType$1) {
	PlaneType$1[PlaneType$1["DIRECT"] = 0] = "DIRECT";
	PlaneType$1[PlaneType$1["INDEX_MATCH"] = 1] = "INDEX_MATCH";
	return PlaneType$1;
}({});
let AlignBoundary = /* @__PURE__ */ function(AlignBoundary$1) {
	AlignBoundary$1[AlignBoundary$1["NIBBLE"] = 4] = "NIBBLE";
	AlignBoundary$1[AlignBoundary$1["BYTE_1"] = 8] = "BYTE_1";
	AlignBoundary$1[AlignBoundary$1["BYTE_2"] = 16] = "BYTE_2";
	AlignBoundary$1[AlignBoundary$1["BYTE_3"] = 24] = "BYTE_3";
	AlignBoundary$1[AlignBoundary$1["BYTE_4"] = 32] = "BYTE_4";
	return AlignBoundary$1;
}({});
var FieldLayout = class {
	srcChannel = 0;
	pos = 0;
	width = 0;
};
var PlaneOutput = class {
	fields = [];
	pixelStride = 0;
	pixelsPerFrag = 0;
	bytesPerFrag = 0;
	alignRequired = false;
	blob = null;
};
var PlaneArgs = class {
	id = "";
	type = PlaneType.DIRECT;
	indexMatchValue = 0;
	postInvert = false;
	farPixelFirst = false;
	bigEndian = false;
	packUnit = PackUnit.PIXEL;
	vertPack = false;
	alignBoundary = AlignBoundary.BYTE_1;
	alignLeft = false;
	vertAddr = false;
	output = new PlaneOutput();
};
var EncodeArgs = class {
	src = null;
	alphaFirst = false;
	colorDescending = false;
	planes = [];
};
function encode(args) {
	const sw = new StopWatch(false);
	const fmt = args.src.format;
	for (let plane of args.planes) {
		const out = plane.output;
		let alphaField = null;
		if (fmt.hasAlpha) {
			alphaField = new FieldLayout();
			alphaField.srcChannel = fmt.numColorChannels;
			alphaField.width = fmt.alphaBits;
		}
		switch (plane.type) {
			case PlaneType.DIRECT:
				if (alphaField && args.alphaFirst) out.fields.push(alphaField);
				if (fmt.isIndexed) {
					const field = new FieldLayout();
					field.srcChannel = 0;
					field.width = fmt.indexBits;
					out.fields.push(field);
				} else for (let ch = 0; ch < fmt.numColorChannels; ch++) {
					const field = new FieldLayout();
					if (args.colorDescending) field.srcChannel = fmt.numColorChannels - 1 - ch;
					else field.srcChannel = ch;
					field.width = fmt.colorBits[field.srcChannel];
					out.fields.push(field);
				}
				if (alphaField && !args.alphaFirst) out.fields.push(alphaField);
				break;
			case PlaneType.INDEX_MATCH:
				{
					const field = new FieldLayout();
					field.width = 1;
					out.fields.push(field);
				}
				break;
			default: throw new Error("Unsupported filter mode");
		}
		if (out.fields.length == 0) throw new Error("内部エラー: フィールドが定義されていません。");
		const numCh = out.fields.length;
		if (plane.packUnit == PackUnit.UNPACKED) {
			let maxChBits = 0;
			for (const field of out.fields) if (maxChBits < field.width) maxChBits = field.width;
			const chStride = intCeil(maxChBits, plane.alignBoundary);
			for (let ch = 0; ch < numCh; ch++) {
				const field = out.fields[ch];
				field.pos = ch * chStride;
				out.alignRequired ||= chStride != field.width;
				if (plane.alignLeft) field.pos += chStride - field.width;
			}
			out.pixelStride = chStride * numCh;
			out.bytesPerFrag = Math.ceil(out.pixelStride / 8);
			out.pixelsPerFrag = 1;
		} else {
			let pixBits = 0;
			for (const field of out.fields) {
				field.pos = pixBits;
				pixBits += field.width;
			}
			switch (plane.packUnit) {
				case PackUnit.PIXEL:
					out.pixelStride = intCeil(pixBits, plane.alignBoundary);
					out.pixelsPerFrag = Math.max(1, Math.floor(8 / out.pixelStride));
					out.bytesPerFrag = Math.ceil(out.pixelStride / 8);
					out.alignRequired = out.pixelStride != pixBits;
					if (plane.alignLeft) for (const field of out.fields) field.pos += out.pixelStride - pixBits;
					break;
				case PackUnit.ALIGNMENT:
					if (pixBits > plane.alignBoundary) throw new Error("アライメント境界より大きなピクセルをパッキングできません。");
					out.pixelStride = pixBits;
					out.pixelsPerFrag = Math.floor(plane.alignBoundary / pixBits);
					const fragBits = pixBits * out.pixelsPerFrag;
					const fragStride = Math.ceil(fragBits / plane.alignBoundary) * plane.alignBoundary;
					out.bytesPerFrag = Math.ceil(fragStride / 8);
					out.alignRequired = fragStride != fragBits;
					if (plane.alignLeft) for (const field of out.fields) field.pos += fragStride - fragBits;
					break;
				default: throw new Error("Unsupported PackUnit");
			}
		}
	}
	const src = args.src;
	for (let plane of args.planes) {
		const out = plane.output;
		const numCh = out.fields.length;
		if (!(out.pixelsPerFrag >= 1)) throw new Error("内部エラー: フラグメントあたりのピクセル数が不正です。");
		if (!(out.bytesPerFrag >= 1)) throw new Error("内部エラー: フラグメントあたりのバイト数が不正です。");
		const fragWidth = plane.vertPack ? 1 : out.pixelsPerFrag;
		const fragHeight = plane.vertPack ? out.pixelsPerFrag : 1;
		const fragSize = fragWidth * fragHeight;
		const cols = Math.ceil(src.width / fragWidth);
		const rows = Math.ceil(src.height / fragHeight);
		const numFrags = cols * rows;
		out.blob = new ArrayBlob(plane.id, numFrags * out.bytesPerFrag);
		const array = out.blob.array;
		let iByte = 0;
		for (let iFrag = 0; iFrag < numFrags; iFrag++) {
			let xCoarse, yCoarse;
			if (plane.vertAddr) {
				xCoarse = fragWidth * Math.floor(iFrag / rows);
				yCoarse = fragHeight * (iFrag % rows);
			} else {
				xCoarse = fragWidth * (iFrag % cols);
				yCoarse = fragHeight * Math.floor(iFrag / cols);
			}
			let fragData = 0;
			for (let iSrc = 0; iSrc < fragSize; iSrc++) {
				const iDest = plane.farPixelFirst ? fragSize - 1 - iSrc : iSrc;
				const xFine = iSrc % fragWidth;
				const yFine = Math.floor(iSrc / fragWidth);
				const x = xCoarse + xFine;
				const y = yCoarse + yFine;
				if (y < src.height && x < src.width) {
					const pixOffset = out.pixelStride * iDest;
					switch (plane.type) {
						case PlaneType.DIRECT:
							for (const field of out.fields) {
								const chData = src.data[field.srcChannel][y * src.width + x];
								const shift = pixOffset + field.pos;
								fragData |= chData << shift;
							}
							break;
						case PlaneType.INDEX_MATCH:
							{
								const chData = src.data[0][y * src.width + x];
								let match = chData == plane.indexMatchValue;
								if (plane.postInvert) match = !match;
								if (match) fragData |= 1 << pixOffset + out.fields[0].pos;
							}
							break;
						default: throw new Error("Unsupported filter mode");
					}
				}
			}
			const fragBits = out.bytesPerFrag * 8;
			for (let j = 0; j < out.bytesPerFrag; j++) if (plane.bigEndian) {
				array[iByte++] = fragData >> fragBits - 8 & 255;
				fragData <<= 8;
			} else {
				array[iByte++] = fragData & 255;
				fragData >>= 8;
			}
		}
		{
			let buff = [];
			buff.push(`${src.width}x${src.height}px, ${fmt.toString()}\n`);
			if (plane.type == PlaneType.INDEX_MATCH) {
				buff.push(`Plane "${plane.id}", color index=${plane.indexMatchValue}`);
				if (plane.postInvert) buff.push(`, Inverted`);
				buff.push(`\n`);
			}
			if (numCh > 1) {
				let chOrderStr = "";
				for (let i = 0; i < numCh; i++) {
					const field = out.fields[i];
					if (i > 0) chOrderStr += ":";
					chOrderStr += fmt.channelName(field.srcChannel);
				}
				buff.push(chOrderStr + ", ");
			}
			if (out.pixelsPerFrag > 1) {
				buff.push((plane.farPixelFirst ? "MSB" : "LSB") + " First, ");
				buff.push((plane.vertPack ? "Vertical" : "Horizontal") + " Packing, ");
			}
			if (out.bytesPerFrag > 1) buff.push((plane.bigEndian ? "Big" : "Little") + " Endian, ");
			buff.push(`${plane.vertAddr ? "Vertical" : "Horizontal"} Adressing\n`);
			buff.push(`${array.length} Bytes\n`);
			out.blob.comment = buff.join("");
		}
	}
	sw.lap("Encoder.encode()");
}

//#endregion
//#region src/Math3D.ts
var Vec3 = class Vec3 {
	constructor(x = 0, y = 0, z = 0) {
		this.x = x;
		this.y = y;
		this.z = z;
	}
	equals(b) {
		return this.x == b.x && this.y == b.y && this.z == b.z;
	}
	set(x, y, z) {
		this.x = x;
		this.y = y;
		this.z = z;
	}
	copyFrom(b) {
		this.x = b.x;
		this.y = b.y;
		this.z = b.z;
	}
	clone() {
		return new Vec3(this.x, this.y, this.z);
	}
	add(b) {
		this.x += b.x;
		this.y += b.y;
		this.z += b.z;
	}
	sub(b) {
		this.x -= b.x;
		this.y -= b.y;
		this.z -= b.z;
	}
	mul(b) {
		this.x *= b;
		this.y *= b;
		this.z *= b;
	}
	dot(b) {
		return this.x * b.x + this.y * b.y + this.z * b.z;
	}
	cross(b) {
		const x = this.y * b.z - this.z * b.y;
		const y = this.z * b.x - this.x * b.z;
		const z = this.x * b.y - this.y * b.x;
		this.x = x;
		this.y = y;
		this.z = z;
	}
	len() {
		return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
	}
	norm() {
		const l = this.len();
		if (l > 0) this.mul(1 / l);
		else throw new Error("zero length vector");
		return this;
	}
	distSq(b) {
		const dx = this.x - b.x;
		const dy = this.y - b.y;
		const dz = this.z - b.z;
		return dx * dx + dy * dy + dz * dz;
	}
	dist(b) {
		const dx = this.x - b.x;
		const dy = this.y - b.y;
		const dz = this.z - b.z;
		return Math.sqrt(dx * dx + dy * dy + dz * dz);
	}
	angleAndAxisTo(b) {
		const nA = this.clone();
		const nB = b.clone();
		nA.norm();
		nB.norm();
		const d = clip(-1, 1, nA.dot(nB));
		const angle = Math.acos(d);
		const axis = nA.clone();
		axis.cross(nB);
		if (axis.len() == 0) {
			nB.set(1, 0, 0);
			axis.copyFrom(nA);
			axis.cross(nB);
			if (axis.len() == 0) {
				nB.set(0, 1, 0);
				axis.copyFrom(nA);
				axis.cross(nB);
			}
		}
		axis.norm();
		return {
			axis,
			angle
		};
	}
	toString() {
		return `(${this.x.toFixed(3)}, ${this.y.toFixed(3)}, ${this.z.toFixed(3)})`;
	}
};
var Mat43 = class {
	m = new Array(12);
	constructor(m00 = 1, m01 = 0, m02 = 0, m03 = 0, m10 = 0, m11 = 1, m12 = 0, m13 = 0, m20 = 0, m21 = 0, m22 = 1, m23 = 0) {
		let i = 0;
		this.m[i++] = m00;
		this.m[i++] = m01;
		this.m[i++] = m02;
		this.m[i++] = m03;
		this.m[i++] = m10;
		this.m[i++] = m11;
		this.m[i++] = m12;
		this.m[i++] = m13;
		this.m[i++] = m20;
		this.m[i++] = m21;
		this.m[i++] = m22;
		this.m[i++] = m23;
	}
	copyFrom(b) {
		for (let i = 0; i < 12; i++) this.m[i] = b.m[i];
	}
	invert() {
		const a00 = this.m[0], a01 = this.m[1], a02 = this.m[2], a03 = this.m[3];
		const a10 = this.m[4], a11 = this.m[5], a12 = this.m[6], a13 = this.m[7];
		const a20 = this.m[8], a21 = this.m[9], a22 = this.m[10], a23 = this.m[11];
		const b00 = a00 * a11 - a01 * a10;
		const b01 = a00 * a12 - a02 * a10;
		const b02 = a00 * a13 - a03 * a10;
		const b03 = a01 * a12 - a02 * a11;
		const b04 = a01 * a13 - a03 * a11;
		const b05 = a02 * a13 - a03 * a12;
		let det = b00 * a22 - b01 * a21 + b03 * a20;
		if (!det) throw new Error("行列が特異です");
		det = 1 / det;
		let i = 0;
		this.m[i++] = (a11 * a22 - a12 * a21) * det;
		this.m[i++] = (a02 * a21 - a01 * a22) * det;
		this.m[i++] = b03 * det;
		this.m[i++] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
		this.m[i++] = (a12 * a20 - a10 * a22) * det;
		this.m[i++] = (a00 * a22 - a02 * a20) * det;
		this.m[i++] = b01 * det;
		this.m[i++] = (a20 * a22 - a22 * b02 - a23 * b01) * det;
		this.m[i++] = (a10 * a21 - a11 * a20) * det;
		this.m[i++] = (a01 * a20 - a00 * a21) * det;
		this.m[i++] = b00 * det;
		this.m[i++] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
	}
	det() {
		const a00 = this.m[0], a01 = this.m[1], a02 = this.m[2];
		const a10 = this.m[4], a11 = this.m[5], a12 = this.m[6];
		const a20 = this.m[8], a21 = this.m[9], a22 = this.m[10];
		const b00 = a00 * a11 - a01 * a10;
		const b01 = a00 * a12 - a02 * a10;
		const b03 = a01 * a12 - a02 * a11;
		return b00 * a22 - b01 * a21 + b03 * a20;
	}
	mulM(b) {
		const a00 = this.m[0], a01 = this.m[1], a02 = this.m[2], a03 = this.m[3];
		const a10 = this.m[4], a11 = this.m[5], a12 = this.m[6], a13 = this.m[7];
		const a20 = this.m[8], a21 = this.m[9], a22 = this.m[10], a23 = this.m[11];
		const b00 = b.m[0], b01 = b.m[1], b02 = b.m[2], b03 = b.m[3];
		const b10 = b.m[4], b11 = b.m[5], b12 = b.m[6], b13 = b.m[7];
		const b20 = b.m[8], b21 = b.m[9], b22 = b.m[10], b23 = b.m[11];
		let i = 0;
		this.m[i++] = a00 * b00 + a01 * b10 + a02 * b20;
		this.m[i++] = a00 * b01 + a01 * b11 + a02 * b21;
		this.m[i++] = a00 * b02 + a01 * b12 + a02 * b22;
		this.m[i++] = a00 * b03 + a01 * b13 + a02 * b23 + a03;
		this.m[i++] = a10 * b00 + a11 * b10 + a12 * b20;
		this.m[i++] = a10 * b01 + a11 * b11 + a12 * b21;
		this.m[i++] = a10 * b02 + a11 * b12 + a12 * b22;
		this.m[i++] = a10 * b03 + a11 * b13 + a12 * b23 + a13;
		this.m[i++] = a20 * b00 + a21 * b10 + a22 * b20;
		this.m[i++] = a20 * b01 + a21 * b11 + a22 * b21;
		this.m[i++] = a20 * b02 + a21 * b12 + a22 * b22;
		this.m[i++] = a20 * b03 + a21 * b13 + a22 * b23 + a23;
	}
	mulV(v) {
		const vx = v.x;
		const vy = v.y;
		const vz = v.z;
		v.x = this.m[0] * vx + this.m[1] * vy + this.m[2] * vz + this.m[3];
		v.y = this.m[4] * vx + this.m[5] * vy + this.m[6] * vz + this.m[7];
		v.z = this.m[8] * vx + this.m[9] * vy + this.m[10] * vz + this.m[11];
	}
	translate(tx, ty, tz) {
		this.m[3] += this.m[0] * tx + this.m[1] * ty + this.m[2] * tz;
		this.m[7] += this.m[4] * tx + this.m[5] * ty + this.m[6] * tz;
		this.m[11] += this.m[8] * tx + this.m[9] * ty + this.m[10] * tz;
	}
	scale(sx, sy, sz) {
		this.m[0] *= sx;
		this.m[1] *= sy;
		this.m[2] *= sz;
		this.m[4] *= sx;
		this.m[5] *= sy;
		this.m[6] *= sz;
		this.m[8] *= sx;
		this.m[9] *= sy;
		this.m[10] *= sz;
	}
	rotate(axis, angle) {
		this.mulM(makeRotationMatrix(axis, angle));
	}
};
var Box = class Box {
	constructor(v0 = new Vec3(), v1 = new Vec3()) {
		this.v0 = v0;
		this.v1 = v1;
	}
	clone() {
		return new Box(this.v0.clone(), this.v1.clone());
	}
	contains(v) {
		return this.v0.x <= v.x && v.x <= this.v1.x && this.v0.y <= v.y && v.y <= this.v1.y && this.v0.z <= v.z && v.z <= this.v1.z;
	}
	getCorner(i, ret) {
		ret.x = (i & 1) != 0 ? this.v1.x : this.v0.x;
		ret.y = (i & 2) != 0 ? this.v1.y : this.v0.y;
		ret.z = (i & 4) != 0 ? this.v1.z : this.v0.z;
	}
	getCenter(ret) {
		ret.x = (this.v0.x + this.v1.x) / 2;
		ret.y = (this.v0.y + this.v1.y) / 2;
		ret.z = (this.v0.z + this.v1.z) / 2;
	}
	getSubBox(i, ret, middle = null) {
		const x0 = this.v0.x;
		const y0 = this.v0.y;
		const z0 = this.v0.z;
		const x1 = this.v1.x;
		const y1 = this.v1.y;
		const z1 = this.v1.z;
		let xM, yM, zM;
		if (middle) {
			xM = middle.x;
			yM = middle.y;
			zM = middle.z;
		} else {
			xM = (x0 + x1) / 2;
			yM = (y0 + y1) / 2;
			zM = (z0 + z1) / 2;
		}
		switch (i) {
			case 0:
				ret.v0.set(x0, y0, z0);
				ret.v1.set(xM, yM, zM);
				break;
			case 1:
				ret.v0.set(xM, y0, z0);
				ret.v1.set(x1, yM, zM);
				break;
			case 2:
				ret.v0.set(x0, yM, z0);
				ret.v1.set(xM, y1, zM);
				break;
			case 3:
				ret.v0.set(xM, yM, z0);
				ret.v1.set(x1, y1, zM);
				break;
			case 4:
				ret.v0.set(x0, y0, zM);
				ret.v1.set(xM, yM, z1);
				break;
			case 5:
				ret.v0.set(xM, y0, zM);
				ret.v1.set(x1, yM, z1);
				break;
			case 6:
				ret.v0.set(x0, yM, zM);
				ret.v1.set(xM, y1, z1);
				break;
			case 7:
				ret.v0.set(xM, yM, zM);
				ret.v1.set(x1, y1, z1);
				break;
			default: throw new Error("Box.getSubBox: i must be 0-7");
		}
	}
	toString() {
		return `[${this.v0.toString()} - ${this.v1.toString()}]`;
	}
};
let HitResult = /* @__PURE__ */ function(HitResult$1) {
	HitResult$1[HitResult$1["NO_TRIANGLE"] = 0] = "NO_TRIANGLE";
	HitResult$1[HitResult$1["BEHIND_OF_RAY"] = 1] = "BEHIND_OF_RAY";
	HitResult$1[HitResult$1["PARALLEL"] = 2] = "PARALLEL";
	HitResult$1[HitResult$1["OUTSIDE_OF_TRIANGLE"] = 3] = "OUTSIDE_OF_TRIANGLE";
	HitResult$1[HitResult$1["HIT"] = 4] = "HIT";
	return HitResult$1;
}({});
var Hit = class {
	constructor(result, point, front) {
		this.result = result;
		this.point = point;
		this.front = front;
	}
};
function subV(a, b) {
	const ret = a.clone();
	ret.sub(b);
	return ret;
}
function crossV(a, b) {
	const ret = a.clone();
	ret.cross(b);
	return ret;
}
function makeRotationMatrix(axis, angle) {
	const c = Math.cos(angle);
	const s = Math.sin(angle);
	const t = 1 - c;
	const x = axis.x;
	const y = axis.y;
	const z = axis.z;
	return new Mat43(t * x * x + c, t * x * y - s * z, t * x * z + s * y, 0, t * x * y + s * z, t * y * y + c, t * y * z - s * x, 0, t * x * z - s * y, t * y * z + s * x, t * z * z + c, 0);
}
function projectPointToLine(linePoint0, linePoint1, p) {
	const lineDir = subV(linePoint1, linePoint0).norm();
	const v = subV(p, linePoint0);
	const d = v.dot(lineDir);
	lineDir.mul(d);
	lineDir.add(linePoint0);
	return lineDir;
}
new Vec3();
new Vec3();
new Vec3();
new Vec3();
new Vec3();
new Vec3();
new Vec3();
new Vec3();
function intersectWithTriangle(pt0, pt1, pt2, rayOrig, rayDir) {
	const v0 = subV(pt1, pt0);
	const v1 = subV(pt2, pt0);
	const n = crossV(v0, v1);
	const nLen = n.len();
	if (nLen == 0) return new Hit(HitResult.NO_TRIANGLE);
	n.mul(1 / nLen);
	const d = n.dot(rayDir);
	if (Math.abs(d) < 1e-6) return new Hit(HitResult.PARALLEL);
	const v = subV(rayOrig, pt0);
	const t = -n.dot(v) / d;
	if (t < 0) return new Hit(HitResult.BEHIND_OF_RAY);
	const q = rayDir.clone();
	q.mul(t);
	q.add(rayOrig);
	const c0 = subV(q, pt0);
	const c1 = subV(q, pt1);
	const c2 = subV(q, pt2);
	const n0 = crossV(v0, c0);
	const n1 = crossV(subV(pt2, pt1), c1);
	const n2 = crossV(subV(pt0, pt2), c2);
	if (n0.dot(n) >= 0 && n1.dot(n) >= 0 && n2.dot(n) >= 0) return new Hit(HitResult.HIT, q, d < 0);
	else return new Hit(HitResult.OUTSIDE_OF_TRIANGLE);
}

//#endregion
//#region src/Images.ts
let ColorSpace = /* @__PURE__ */ function(ColorSpace$1) {
	ColorSpace$1[ColorSpace$1["GRAYSCALE"] = 0] = "GRAYSCALE";
	ColorSpace$1[ColorSpace$1["RGB"] = 1] = "RGB";
	return ColorSpace$1;
}({});
let PixelFormat = /* @__PURE__ */ function(PixelFormat$1) {
	PixelFormat$1[PixelFormat$1["RGBA8888"] = 0] = "RGBA8888";
	PixelFormat$1[PixelFormat$1["RGB888"] = 1] = "RGB888";
	PixelFormat$1[PixelFormat$1["RGB666"] = 2] = "RGB666";
	PixelFormat$1[PixelFormat$1["RGB565"] = 3] = "RGB565";
	PixelFormat$1[PixelFormat$1["RGBA4444"] = 4] = "RGBA4444";
	PixelFormat$1[PixelFormat$1["RGB444"] = 5] = "RGB444";
	PixelFormat$1[PixelFormat$1["RGB332"] = 6] = "RGB332";
	PixelFormat$1[PixelFormat$1["RGB111"] = 7] = "RGB111";
	PixelFormat$1[PixelFormat$1["GRAY4"] = 8] = "GRAY4";
	PixelFormat$1[PixelFormat$1["GRAY2"] = 9] = "GRAY2";
	PixelFormat$1[PixelFormat$1["BW"] = 10] = "BW";
	PixelFormat$1[PixelFormat$1["I2_RGB888"] = 11] = "I2_RGB888";
	PixelFormat$1[PixelFormat$1["I4_RGB888"] = 12] = "I4_RGB888";
	PixelFormat$1[PixelFormat$1["I6_RGB888"] = 13] = "I6_RGB888";
	return PixelFormat$1;
}({});
let ChannelOrder = /* @__PURE__ */ function(ChannelOrder$1) {
	ChannelOrder$1[ChannelOrder$1["RGBA"] = 0] = "RGBA";
	ChannelOrder$1[ChannelOrder$1["BGRA"] = 1] = "BGRA";
	ChannelOrder$1[ChannelOrder$1["ARGB"] = 2] = "ARGB";
	ChannelOrder$1[ChannelOrder$1["ABGR"] = 3] = "ABGR";
	return ChannelOrder$1;
}({});
var PixelFormatInfo = class {
	colorSpace;
	colorBits;
	alphaBits = 0;
	indexBits = 0;
	constructor(id) {
		this.id = id;
		switch (id) {
			case PixelFormat.RGBA8888:
				this.colorSpace = ColorSpace.RGB;
				this.colorBits = [
					8,
					8,
					8
				];
				this.alphaBits = 8;
				break;
			case PixelFormat.RGBA4444:
				this.colorSpace = ColorSpace.RGB;
				this.colorBits = [
					4,
					4,
					4
				];
				this.alphaBits = 4;
				break;
			case PixelFormat.RGB888:
				this.colorSpace = ColorSpace.RGB;
				this.colorBits = [
					8,
					8,
					8
				];
				break;
			case PixelFormat.RGB666:
				this.colorSpace = ColorSpace.RGB;
				this.colorBits = [
					6,
					6,
					6
				];
				break;
			case PixelFormat.RGB565:
				this.colorSpace = ColorSpace.RGB;
				this.colorBits = [
					5,
					6,
					5
				];
				break;
			case PixelFormat.RGB444:
				this.colorSpace = ColorSpace.RGB;
				this.colorBits = [
					4,
					4,
					4
				];
				break;
			case PixelFormat.RGB332:
				this.colorSpace = ColorSpace.RGB;
				this.colorBits = [
					3,
					3,
					2
				];
				break;
			case PixelFormat.RGB111:
				this.colorSpace = ColorSpace.RGB;
				this.colorBits = [
					1,
					1,
					1
				];
				break;
			case PixelFormat.GRAY4:
				this.colorSpace = ColorSpace.GRAYSCALE;
				this.colorBits = [4];
				break;
			case PixelFormat.GRAY2:
				this.colorSpace = ColorSpace.GRAYSCALE;
				this.colorBits = [2];
				break;
			case PixelFormat.BW:
				this.colorSpace = ColorSpace.GRAYSCALE;
				this.colorBits = [1];
				break;
			case PixelFormat.I2_RGB888:
				this.colorSpace = ColorSpace.RGB;
				this.colorBits = [
					8,
					8,
					8
				];
				this.indexBits = 2;
				break;
			case PixelFormat.I4_RGB888:
				this.colorSpace = ColorSpace.RGB;
				this.colorBits = [
					8,
					8,
					8
				];
				this.indexBits = 4;
				break;
			case PixelFormat.I6_RGB888:
				this.colorSpace = ColorSpace.RGB;
				this.colorBits = [
					8,
					8,
					8
				];
				this.indexBits = 6;
				break;
			default: throw new Error("Unknown image format");
		}
	}
	toString() {
		if (this.isIndexed) return "Indexed" + this.indexBits;
		else switch (this.colorSpace) {
			case ColorSpace.GRAYSCALE: if (this.colorBits[0] == 1) return "B/W";
			else return "Gray" + this.colorBits[0];
			case ColorSpace.RGB: if (this.hasAlpha) return "RGBA" + this.colorBits.join("") + this.alphaBits.toString();
			else return "RGB" + this.colorBits.join("");
			default: throw new Error("Unknown color space");
		}
	}
	get hasAlpha() {
		return this.alphaBits > 0;
	}
	get isIndexed() {
		return this.indexBits > 0;
	}
	get numTotalChannels() {
		return this.colorBits.length + (this.hasAlpha ? 1 : 0);
	}
	get numColorChannels() {
		return this.colorBits.length;
	}
	channelName(i) {
		switch (this.colorSpace) {
			case ColorSpace.GRAYSCALE: return "V";
			case ColorSpace.RGB: return "RGBA".slice(i, i + 1);
			default: throw new Error("Unknown color space");
		}
	}
};
var PixelInfo = class PixelInfo {
	color = new Vec3();
	pos = {
		x: 0,
		y: 0
	};
	tag = 0;
	clone() {
		const p = new PixelInfo();
		p.color.copyFrom(this.color);
		p.pos.x = this.pos.x;
		p.pos.y = this.pos.y;
		p.tag = this.tag;
		return p;
	}
};
var CharacteristicPixelDetector = class {
	keyColors = [
		new Vec3(0, 0, 0),
		new Vec3(.5, .5, .5),
		new Vec3(1, 1, 1),
		new Vec3(0, 0, 1),
		new Vec3(0, 1, 0),
		new Vec3(0, 1, 1),
		new Vec3(1, 0, 0),
		new Vec3(1, 0, 1),
		new Vec3(1, 1, 0)
	];
	bestPixels = new Array(this.keyColors.length);
	constructor() {
		this.bestPixels.fill(new PixelInfo());
	}
	clear() {
		for (let i = 0; i < this.bestPixels.length; i++) this.bestPixels[i].tag = 9999;
	}
	addPixel(col, pos) {
		for (let i = 0; i < this.keyColors.length; i++) {
			const d = col.dist(this.keyColors[i]);
			if (d < this.bestPixels[i].tag) {
				this.bestPixels[i].tag = d;
				this.bestPixels[i].color.copyFrom(col);
				this.bestPixels[i].pos.x = pos.x;
				this.bestPixels[i].pos.y = pos.y;
			}
		}
	}
	collect(map) {
		for (let i = 0; i < this.bestPixels.length; i++) {
			const pix = this.bestPixels[i];
			if (pix.tag > 10) continue;
			const r = clip(0, 255, Math.round(pix.color.x * 255));
			const g = clip(0, 255, Math.round(pix.color.y * 255));
			const b = clip(0, 255, Math.round(pix.color.z * 255));
			const key = b << 16 | g << 8 | r;
			if (!map.has(key)) map.set(key, pix.clone());
		}
	}
};
var NormalizedImage = class NormalizedImage {
	color;
	alpha;
	numColorChannels;
	constructor(width, height, colorSpace) {
		this.width = width;
		this.height = height;
		this.colorSpace = colorSpace;
		switch (colorSpace) {
			case ColorSpace.GRAYSCALE:
				this.numColorChannels = 1;
				break;
			case ColorSpace.RGB:
				this.numColorChannels = 3;
				break;
			default: throw new Error("Invalid color space");
		}
		this.color = new Float32Array(width * height * this.numColorChannels);
		this.alpha = new Float32Array(width * height);
	}
	clone() {
		const img = new NormalizedImage(this.width, this.height, this.colorSpace);
		img.color.set(this.color);
		img.alpha.set(this.alpha);
		return img;
	}
	collectCharacteristicColors(numEdgeCells) {
		const ccd = new CharacteristicPixelDetector();
		const map = /* @__PURE__ */ new Map();
		const cols = Math.min(this.width, numEdgeCells);
		const rows = Math.min(this.height, numEdgeCells);
		const numCh = this.numColorChannels;
		const rgb = new Vec3();
		for (let iRow = 0; iRow < rows; iRow++) {
			const yStart = Math.floor(this.height * iRow / rows);
			const yEnd = Math.floor(this.height * (iRow + 1) / rows);
			for (let iCol = 0; iCol < cols; iCol++) {
				const xStart = Math.floor(this.width * iCol / cols);
				const xEnd = Math.floor(this.width * (iCol + 1) / cols);
				ccd.clear();
				for (let y = yStart; y < yEnd; y++) for (let x = xStart; x < xEnd; x++) {
					const idx = (y * this.width + x) * numCh;
					switch (numCh) {
						case 1:
							rgb.set(this.color[idx], this.color[idx], this.color[idx]);
							break;
						case 3:
							rgb.set(this.color[idx], this.color[idx + 1], this.color[idx + 2]);
							break;
						default: throw new Error("Invalid number of channels");
					}
					ccd.addPixel(rgb, {
						x,
						y
					});
				}
				ccd.collect(map);
			}
		}
		return Array.from(map.values());
	}
	getAverageColor() {
		const avg = new Array(this.numColorChannels).fill(0);
		let numPixels = 0;
		for (let i = 0; i < this.width * this.height; i++) {
			if (this.alpha[i] == 0) continue;
			for (let ch = 0; ch < this.numColorChannels; ch++) avg[ch] += this.color[i * this.numColorChannels + ch];
			numPixels++;
		}
		const ret = new Vec3();
		ret.x = avg[0] / numPixels;
		ret.y = avg[1] / numPixels;
		ret.z = avg[2] / numPixels;
		return ret;
	}
};
var ReducedImage = class {
	data;
	tmp;
	constructor(width, height, format, palette) {
		this.width = width;
		this.height = height;
		this.format = format;
		this.palette = palette;
		const numPixels = width * height;
		const numAllCh = format.numTotalChannels;
		this.data = [];
		for (let i = 0; i < numAllCh; i++) this.data.push(new Uint8Array(numPixels));
		this.tmp = new Uint8Array(format.numTotalChannels);
	}
	getPreviewImage(dest) {
		const numAllCh = this.format.numTotalChannels;
		const numColCh = this.format.numColorChannels;
		const alpOutMax = this.format.hasAlpha ? (1 << this.format.alphaBits) - 1 : 1;
		for (let i = 0; i < this.width * this.height; i++) {
			for (let ch = 0; ch < numAllCh; ch++) this.tmp[ch] = this.data[ch][i];
			this.palette.extract(this.tmp, 0, dest, i * 4);
			if (this.format.hasAlpha) dest[i * 4 + 3] = Math.round(this.tmp[numColCh] * 255 / alpOutMax);
			else dest[i * 4 + 3] = 255;
		}
	}
};

//#endregion
//#region src/Configs.ts
function makeDirectPlane(id = "color") {
	return {
		planeType: PlaneType.DIRECT,
		id,
		matchIndex: -1,
		matchInvert: false
	};
}
function makeIndexMatch(index, id, invert = false) {
	return {
		planeType: PlaneType.INDEX_MATCH,
		id,
		matchIndex: index,
		matchInvert: invert
	};
}
const defaultConfig = {
	label: "default",
	description: "default",
	format: PixelFormat.RGBA8888,
	channelOrder: ChannelOrder.ARGB,
	farPixelFirst: false,
	bigEndian: false,
	packUnit: PackUnit.PIXEL,
	vertPack: false,
	alignBoundary: AlignBoundary.BYTE_1,
	alignLeft: false,
	vertAddr: false,
	palette: new Uint32Array(),
	planeCfgs: [makeDirectPlane()]
};
const argb8888_le = (function() {
	let p = { ...defaultConfig };
	p.label = "ARGB8888-LE";
	p.description = "透明度付きフルカラー。";
	p.format = PixelFormat.RGBA8888;
	p.channelOrder = ChannelOrder.ARGB;
	return p;
})();
const rgb888_be = (function() {
	let p = { ...defaultConfig };
	p.label = "RGB888-BE";
	p.description = "フルカラー。24bit 液晶用。";
	p.format = PixelFormat.RGB888;
	p.channelOrder = ChannelOrder.ARGB;
	p.bigEndian = true;
	return p;
})();
const rgb666_be_ra = (function() {
	let p = { ...defaultConfig };
	p.label = "RGB666-BE-RA";
	p.description = "各バイトにチャネルを下位詰めで配置した RGB666。LovyanGFX 用。";
	p.format = PixelFormat.RGB666;
	p.channelOrder = ChannelOrder.ARGB;
	p.packUnit = PackUnit.UNPACKED;
	p.bigEndian = true;
	return p;
})();
const rgb666_be_la = (function() {
	let p = { ...defaultConfig };
	p.label = "RGB666-BE-LA";
	p.description = "各バイトにチャネルを上位詰めで配置した RGB666。低レベル API の 18bit モード用。";
	p.format = PixelFormat.RGB666;
	p.channelOrder = ChannelOrder.ARGB;
	p.packUnit = PackUnit.UNPACKED;
	p.alignLeft = true;
	p.bigEndian = true;
	return p;
})();
const rgb565_be = (function() {
	let p = { ...defaultConfig };
	p.label = "RGB565-BE";
	p.description = "ハイカラー。\n各種 GFX ライブラリでの使用を含め、\n組み込み用途で一般的な形式。";
	p.format = PixelFormat.RGB565;
	p.channelOrder = ChannelOrder.ARGB;
	p.bigEndian = true;
	return p;
})();
const rgb444_be = (function() {
	let p = { ...defaultConfig };
	p.label = "RGB444-BE";
	p.description = "ST7789 の 12bit モード用の形式。";
	p.format = PixelFormat.RGB444;
	p.packUnit = PackUnit.ALIGNMENT;
	p.farPixelFirst = true;
	p.bigEndian = true;
	p.alignBoundary = AlignBoundary.BYTE_3;
	return p;
})();
const argb4444_le = (function() {
	let p = { ...defaultConfig };
	p.label = "ARGB4444-LE";
	p.description = "アルファチャンネル付きの RGB444 形式。";
	p.format = PixelFormat.RGBA4444;
	p.packUnit = PackUnit.ALIGNMENT;
	p.bigEndian = false;
	p.channelOrder = ChannelOrder.ARGB;
	p.alignBoundary = AlignBoundary.BYTE_2;
	return p;
})();
const rgb332 = (function() {
	let p = { ...defaultConfig };
	p.label = "RGB332";
	p.description = "各種 GFX ライブラリ用。";
	p.format = PixelFormat.RGB332;
	return p;
})();
const rgb111_ra = (function() {
	let p = { ...defaultConfig };
	p.label = "RGB111";
	p.description = "ILI9488 の 8 色モード用。";
	p.format = PixelFormat.RGB111;
	p.packUnit = PackUnit.ALIGNMENT;
	p.farPixelFirst = true;
	return p;
})();
const bw_hscan = (function() {
	let p = { ...defaultConfig };
	p.label = "白黒 横スキャン";
	p.description = "各種 GFX ライブラリ用。";
	p.format = PixelFormat.BW;
	p.packUnit = PackUnit.ALIGNMENT;
	p.farPixelFirst = true;
	return p;
})();
const bw_vpack = (function() {
	let p = { ...defaultConfig };
	p.label = "白黒 縦パッキング";
	p.description = "SPI/I2C ドライバを使用して\nSSD1306/1309 等の白黒ディスプレイに直接転送するための形式。";
	p.format = PixelFormat.BW;
	p.packUnit = PackUnit.ALIGNMENT;
	p.vertPack = true;
	return p;
})();
const epd_kwr = (function() {
	let p = { ...defaultConfig };
	p.label = "黒白赤 (2plane)";
	p.description = "3色電子ペーパー向けの形式。";
	p.format = PixelFormat.I2_RGB888;
	p.packUnit = PackUnit.ALIGNMENT;
	p.farPixelFirst = true;
	p.palette = new Uint32Array([
		strToU32("#000"),
		strToU32("#FFF"),
		strToU32("#C00")
	]);
	p.planeCfgs = [makeIndexMatch(1, "white"), makeIndexMatch(2, "red")];
	return p;
})();
const epd_kwry = (function() {
	let p = { ...defaultConfig };
	p.label = "黒白赤黄 (2bpp)";
	p.description = "4色電子ペーパー向けの形式。";
	p.format = PixelFormat.I2_RGB888;
	p.packUnit = PackUnit.ALIGNMENT;
	p.farPixelFirst = true;
	p.palette = new Uint32Array([
		strToU32("#000"),
		strToU32("#FFF"),
		strToU32("#FF0"),
		strToU32("#C00")
	]);
	p.planeCfgs = [makeDirectPlane("index")];
	return p;
})();
const epd_kwyrbg = (function() {
	let p = { ...defaultConfig };
	p.label = "ePaper 6色 (仮)";
	p.description = "6色電子ペーパー向けの形式。";
	p.format = PixelFormat.I4_RGB888;
	p.packUnit = PackUnit.ALIGNMENT;
	p.farPixelFirst = true;
	p.palette = new Uint32Array([
		strToU32("#000"),
		strToU32("#FFF"),
		strToU32("#fdc811"),
		strToU32("#d33711"),
		strToU32("#33426f"),
		strToU32("#407113")
	]);
	p.planeCfgs = [makeDirectPlane("index")];
	return p;
})();
const epd_kwgbryo = (function() {
	let p = { ...defaultConfig };
	p.label = "ePaper 7色 (仮)";
	p.description = "7色電子ペーパー E Ink Gallery Palette(TM) 4000 ePaper 向けの形式。";
	p.format = PixelFormat.I4_RGB888;
	p.packUnit = PackUnit.ALIGNMENT;
	p.farPixelFirst = true;
	p.palette = new Uint32Array([
		strToU32("#000"),
		strToU32("#FFF"),
		strToU32("#407113"),
		strToU32("#33426f"),
		strToU32("#d33711"),
		strToU32("#fdc811"),
		strToU32("#f46211")
	]);
	p.planeCfgs = [makeDirectPlane("index")];
	return p;
})();
const nes = (function() {
	let p = { ...defaultConfig };
	p.label = "NESパレット";
	p.description = "ファミコンのパレット(テスト用)。";
	p.format = PixelFormat.I6_RGB888;
	p.packUnit = PackUnit.ALIGNMENT;
	p.farPixelFirst = true;
	p.palette = new Uint32Array([
		strToU32("#ab0013"),
		strToU32("#e7005b"),
		strToU32("#ff77b7"),
		strToU32("#ffc7db"),
		strToU32("#a70000"),
		strToU32("#db2b00"),
		strToU32("#ff7763"),
		strToU32("#ffbfb3"),
		strToU32("#7f0b00"),
		strToU32("#cb4f0f"),
		strToU32("#ff9b3b"),
		strToU32("#ffdbab"),
		strToU32("#432f00"),
		strToU32("#8b7300"),
		strToU32("#f3bf3f"),
		strToU32("#ffe7a3"),
		strToU32("#004700"),
		strToU32("#009700"),
		strToU32("#83d313"),
		strToU32("#e3ffa3"),
		strToU32("#005100"),
		strToU32("#00ab00"),
		strToU32("#4fdf4B"),
		strToU32("#abf3bf"),
		strToU32("#003f17"),
		strToU32("#00933b"),
		strToU32("#58f898"),
		strToU32("#b3ffcf"),
		strToU32("#1b3f5f"),
		strToU32("#00838b"),
		strToU32("#00ebdb"),
		strToU32("#9FFFF3"),
		strToU32("#271b8f"),
		strToU32("#0073ef"),
		strToU32("#3fbfff"),
		strToU32("#abe7ff"),
		strToU32("#0000ab"),
		strToU32("#233bef"),
		strToU32("#5f73ff"),
		strToU32("#c7d7ff"),
		strToU32("#47009f"),
		strToU32("#8300f3"),
		strToU32("#a78Bfd"),
		strToU32("#d7cbff"),
		strToU32("#8f0077"),
		strToU32("#bf00bf"),
		strToU32("#f77Bff"),
		strToU32("#ffc7ff"),
		strToU32("#000000"),
		strToU32("#757575"),
		strToU32("#bcbcbc"),
		strToU32("#ffffff")
	]);
	p.planeCfgs = [makeDirectPlane("index")];
	return p;
})();
const presets = {
	argb8888_le,
	rgb888_be,
	rgb666_be_ra,
	rgb666_be_la,
	rgb565_be,
	argb4444_le,
	rgb444_be,
	rgb332,
	rgb111_ra,
	bw_hscan,
	bw_vpack,
	epd_kwr,
	epd_kwry,
	epd_kwyrbg,
	epd_kwgbryo,
	nes
};

//#endregion
//#region src/ConvexHulls.ts
let nextId = 0;
function getNextId() {
	return nextId++;
}
const OCTREE_DEPTH = 5;
var Vertex = class {
	id = getNextId();
	constructor(pos) {
		this.pos = pos;
	}
	distFromVert(p) {
		return this.pos.dist(p);
	}
	distFromEdge(v0, v1) {
		const edgeLen = v1.distFromVert(v0.pos);
		if (edgeLen < 1e-12) return this.distFromVert(v0.pos);
		const v10 = subV(v1.pos, v0.pos);
		const vT0 = subV(this.pos, v0.pos);
		const t = vT0.dot(v10) / edgeLen;
		if (t < 0) return this.distFromVert(v0.pos);
		if (t > 1) return this.distFromVert(v1.pos);
		else {
			v10.mul(t);
			v10.add(v0.pos);
			return this.pos.dist(v10);
		}
	}
};
var Edge = class {
	id = getNextId();
	constructor(v0, v1, cwTriangle, ccwTriangle) {
		this.v0 = v0;
		this.v1 = v1;
		this.cwTriangle = cwTriangle;
		this.ccwTriangle = ccwTriangle;
	}
};
var Triangle = class {
	id = getNextId();
	constructor(v0, v1, v2) {
		this.v0 = v0;
		this.v1 = v1;
		this.v2 = v2;
	}
	distToVert(target) {
		const u = subV(this.v1.pos, this.v0.pos);
		const v = subV(this.v2.pos, this.v0.pos);
		const n = crossV(u, v);
		const dN = n.len();
		if (dN < 1e-12) throw new Error("degenerate face");
		n.mul(1 / dN);
		const dT = subV(target.pos, this.v0.pos);
		return dT.dot(n);
	}
};
var OctreeNode = class {
	children = null;
	uniform = false;
	middle = new Vec3();
	inside = false;
};
var ConvexHull3D = class {
	vertices = [];
	triangles = {};
	edges = {};
	boundingBox = new Box();
	areaWeight = new Vec3();
	octreeRoot = null;
	triangleIds = [];
	constructor(v) {
		this.v = v;
		for (let i = 0; i < v.length / 3; i++) {
			let conflict = false;
			const vNew = new Vec3(v[i * 3 + 0], v[i * 3 + 1], v[i * 3 + 2]);
			for (const vExist of this.vertices) if (vNew.equals(vExist.pos)) {
				conflict = true;
				break;
			}
			if (!conflict) this.vertices.push(new Vertex(vNew));
		}
		const w = new Vec3();
		for (const v$1 of this.vertices) w.add(v$1.pos);
		w.mul(1 / this.vertices.length);
		let farthests;
		{
			const distW = {};
			for (let i = 0; i < this.vertices.length; i++) distW[i] = this.vertices[i].distFromVert(w);
			const farthestsIndex = Object.keys(distW).map((k) => parseInt(k, 10));
			farthestsIndex.sort((a, b) => distW[b] - distW[a]);
			farthests = farthestsIndex.map((i) => this.vertices[i]);
		}
		{
			const v0 = farthests.shift();
			const v1 = this.farthestVertFromVert(v0);
			farthests.splice(farthests.indexOf(v1), 1);
			const v2 = this.farthestVertFromEdge(v0, v1);
			farthests.splice(farthests.indexOf(v2), 1);
			const t0 = new Triangle(v0, v1, v2);
			const t1 = new Triangle(v0, v2, v1);
			const e0 = new Edge(v0, v1, t0, t1);
			const e1 = new Edge(v1, v2, t0, t1);
			const e2 = new Edge(v2, v0, t0, t1);
			this.triangles[t0.id] = t0;
			this.triangles[t1.id] = t1;
			this.edges[e0.id] = e0;
			this.edges[e1.id] = e1;
			this.edges[e2.id] = e2;
			const v3 = this.farthestVertFromTriangle(t0);
			if (v3) {
				farthests.splice(farthests.indexOf(v3), 1);
				this.addVert(v3);
			}
		}
		while (farthests.length > 0) {
			const vNew = farthests.shift();
			this.addVert(vNew);
		}
		this.triangleIds = Object.keys(this.triangles).map((k) => parseInt(k, 10));
		this.calcBoundingBox();
		this.calcAreaWeight();
		this.buildOctree();
	}
	addVert(vNew) {
		const fronts = {};
		let allBack = true;
		for (const it in this.triangles) {
			const t = this.triangles[it];
			const side = t.distToVert(vNew);
			if (side > 1e-12) {
				allBack = false;
				fronts[it] = t;
			}
		}
		if (allBack) return;
		const borderEdgeIds = [];
		const borderVerts = [];
		const delEdgeIds = [];
		const newTriangles = [];
		const edgeFaceCcw = {};
		const edgeFaceCw = {};
		for (const ie in this.edges) {
			const e = this.edges[ie];
			const cwIsFront = e.cwTriangle.id in fronts;
			const ccwIsFront = e.ccwTriangle.id in fronts;
			if (cwIsFront != ccwIsFront) {
				borderEdgeIds.push(e.id);
				let newTriangle;
				if (cwIsFront) {
					newTriangle = new Triangle(e.v0, e.v1, vNew);
					e.cwTriangle = newTriangle;
					edgeFaceCw[e.v0.id] = newTriangle;
					edgeFaceCcw[e.v1.id] = newTriangle;
					borderVerts.push(e.v0);
				} else {
					newTriangle = new Triangle(e.v1, e.v0, vNew);
					e.ccwTriangle = newTriangle;
					edgeFaceCw[e.v1.id] = newTriangle;
					edgeFaceCcw[e.v0.id] = newTriangle;
					borderVerts.push(e.v1);
				}
				newTriangles.push(newTriangle);
			} else if (cwIsFront && ccwIsFront) delEdgeIds.push(e.id);
		}
		for (const it in fronts) delete this.triangles[it];
		for (const ie of delEdgeIds) delete this.edges[ie];
		for (const f of newTriangles) this.triangles[f.id] = f;
		for (const v0 of borderVerts) {
			const faceCw = edgeFaceCw[v0.id];
			const faceCcw = edgeFaceCcw[v0.id];
			const e = new Edge(vNew, v0, faceCw, faceCcw);
			this.edges[e.id] = e;
		}
	}
	getMesh() {
		const verts = new Float32Array(this.vertices.length * 3);
		const ivEdges = new Uint32Array(Object.keys(this.edges).length * 2);
		const ivTriangles = new Uint32Array(Object.keys(this.triangles).length * 3);
		const vertIndices = /* @__PURE__ */ new Map();
		for (let i = 0; i < this.vertices.length; i++) {
			verts[i * 3 + 0] = this.vertices[i].pos.x;
			verts[i * 3 + 1] = this.vertices[i].pos.y;
			verts[i * 3 + 2] = this.vertices[i].pos.z;
			vertIndices.set(this.vertices[i].id, i * 3);
		}
		let edgeIndex = 0;
		for (const ie in this.edges) {
			const e = this.edges[ie];
			ivEdges[edgeIndex++] = vertIndices.get(e.v0.id);
			ivEdges[edgeIndex++] = vertIndices.get(e.v1.id);
		}
		let triIndex = 0;
		for (const it in this.triangles) {
			const t = this.triangles[it];
			ivTriangles[triIndex++] = vertIndices.get(t.v0.id);
			ivTriangles[triIndex++] = vertIndices.get(t.v1.id);
			ivTriangles[triIndex++] = vertIndices.get(t.v2.id);
		}
		return {
			verts,
			ivEdges,
			ivTriangles
		};
	}
	calcBoundingBox() {
		const min = new Vec3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
		const max = new Vec3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
		for (const v of this.vertices) {
			if (v.pos.x < min.x) min.x = v.pos.x;
			if (v.pos.y < min.y) min.y = v.pos.y;
			if (v.pos.z < min.z) min.z = v.pos.z;
			if (v.pos.x > max.x) max.x = v.pos.x;
			if (v.pos.y > max.y) max.y = v.pos.y;
			if (v.pos.z > max.z) max.z = v.pos.z;
		}
		this.boundingBox = new Box(min, max);
	}
	calcAreaWeight() {
		let areaSum = 0;
		const w = new Vec3();
		for (const it in this.triangles) {
			const t = this.triangles[it];
			const a = subV(t.v1.pos, t.v0.pos);
			const b = subV(t.v2.pos, t.v0.pos);
			const n = crossV(a, b);
			const area = n.len() / 2;
			areaSum += area;
			w.x += area * (t.v0.pos.x + t.v1.pos.x + t.v2.pos.x) / 3;
			w.y += area * (t.v0.pos.y + t.v1.pos.y + t.v2.pos.y) / 3;
			w.z += area * (t.v0.pos.z + t.v1.pos.z + t.v2.pos.z) / 3;
		}
		w.mul(1 / areaSum);
		this.areaWeight = w;
	}
	buildOctree() {
		const sw = new StopWatch(false);
		this.insideCount = 0;
		const corners = [];
		for (let i = 0; i < 8; i++) {
			const p = new Vec3();
			this.boundingBox.getCorner(i, p);
			corners.push(this.hitTest(p));
		}
		this.octreeRoot = this.buildOctreeRecursive(this.boundingBox, corners, 0);
		let numNodes = 0;
		let numInsideNodes = 0;
		let numOutsideNodes = 0;
		const countNodes = (node) => {
			numNodes++;
			if (node.uniform) {
				console.assert(!node.children);
				if (node.inside) numInsideNodes++;
				else numOutsideNodes++;
			}
			if (node.children) for (const c of node.children) countNodes(c);
		};
		if (this.octreeRoot) countNodes(this.octreeRoot);
		sw.lap("ConvexHull3D.buildOctree()");
	}
	buildOctreeRecursive(box, cornerInsideFlags, depth) {
		const node = new OctreeNode();
		let allSame = true;
		for (let i = 1; i < 8; i++) if (cornerInsideFlags[0] !== cornerInsideFlags[i]) {
			allSame = false;
			break;
		}
		if (allSame && depth > 0) {
			node.uniform = true;
			node.inside = cornerInsideFlags[0];
			return node;
		}
		if (depth < OCTREE_DEPTH - 1) {
			node.children = [];
			const x0 = box.v0.x;
			const y0 = box.v0.y;
			const z0 = box.v0.z;
			const x1 = box.v1.x;
			const y1 = box.v1.y;
			const z1 = box.v1.z;
			this.areaWeight;
			node.middle = new Vec3();
			box.getCenter(node.middle);
			for (let iSubBox = 0; iSubBox < 8; iSubBox++) {
				const subBox = new Box();
				box.getSubBox(iSubBox, subBox, node.middle);
				const subFlags = [];
				for (let iCorner = 0; iCorner < 8; iCorner++) {
					const p = new Vec3();
					subBox.getCorner(iCorner, p);
					const pix = p.x == x0 ? 0 : p.x == x1 ? 1 : -1;
					const piy = p.y == y0 ? 0 : p.y == y1 ? 2 : -1;
					const piz = p.z == z0 ? 0 : p.z == z1 ? 4 : -1;
					if (pix >= 0 && piy >= 0 && piz >= 0) subFlags.push(cornerInsideFlags[pix + piy + piz]);
					else subFlags.push(this.hitTest(p));
				}
				node.children.push(this.buildOctreeRecursive(subBox, subFlags, depth + 1));
			}
		}
		return node;
	}
	searchProfile(p) {
		if (!this.octreeRoot) return null;
		if (!this.boundingBox.contains(p)) return null;
		let box = this.boundingBox.clone();
		let node = this.octreeRoot;
		while (!node.uniform) {
			if (!node.children) return null;
			let ci = 0;
			if (p.x >= node.middle.x) ci |= 1;
			if (p.y >= node.middle.y) ci |= 2;
			if (p.z >= node.middle.z) ci |= 4;
			box.getSubBox(ci, box, node.middle);
			node = node.children[ci];
		}
		return node.inside;
	}
	farthestVertFromVert(v0) {
		let vBest = null;
		let dBest = 0;
		for (const v of this.vertices) {
			if (v === v0) continue;
			const d = v0.distFromVert(v.pos);
			if (d > dBest) {
				dBest = d;
				vBest = v;
			}
		}
		return vBest;
	}
	farthestVertFromEdge(v0, v1) {
		let vBest = null;
		let dBest = 0;
		for (const v of this.vertices) {
			if (v === v0 || v === v1) continue;
			const d = v.distFromEdge(v0, v1);
			if (d > dBest) {
				dBest = d;
				vBest = v;
			}
		}
		return vBest;
	}
	farthestVertFromTriangle(t) {
		let vBest = null;
		let dBest = 0;
		for (const v of this.vertices) {
			if (v === t.v0 || v === t.v1 || v === t.v2) continue;
			const d = Math.abs(t.distToVert(v));
			if (d > dBest) {
				dBest = d;
				vBest = v;
			}
		}
		return vBest;
	}
	hitTest(p, tolerance = 0) {
		const w = this.areaWeight;
		const ret = this.intersectWithRay(p, subV(w, p));
		if (ret.inside) return true;
		else if (ret.hit && ret.hit.result == HitResult.HIT && ret.hit.point) return ret.hit.point.dist(p) <= tolerance;
		return false;
	}
	dumpOctree() {
		const points = [];
		if (this.octreeRoot) this.dumpOctreeRecursive(this.octreeRoot, this.boundingBox, points);
		return points;
	}
	dumpOctreeRecursive(node, box, points) {
		if (node.uniform) {
			const p = new Vec3();
			box.getCenter(p);
			points.push({
				point: p,
				inside: node.inside
			});
		} else if (node.children) {
			const subBox = new Box();
			for (let i = 0; i < 8; i++) {
				box.getSubBox(i, subBox, node.middle);
				this.dumpOctreeRecursive(node.children[i], subBox, points);
			}
		}
	}
	hitCount = 0;
	insideCount = 0;
	intersectWithRay(rayOrigin, rayDir) {
		{
			const inside$1 = this.searchProfile(rayOrigin);
			if (inside$1 !== null) this.hitCount++;
			if (inside$1 === true) return {
				inside: true,
				hit: null
			};
		}
		let bestHit = new Hit(HitResult.NO_TRIANGLE);
		let bestTriangle = null;
		for (const it of this.triangleIds) {
			const t = this.triangles[it];
			const p0 = t.v0.pos;
			const p1 = t.v1.pos;
			const p2 = t.v2.pos;
			const ret = intersectWithTriangle(p0, p1, p2, rayOrigin, rayDir);
			if (ret.result > bestHit.result) {
				bestHit = ret;
				bestTriangle = t;
			}
			if (ret.result == HitResult.HIT && ret.front) {
				bestHit = ret;
				bestTriangle = t;
				break;
			}
		}
		if (bestTriangle) {
			const index = this.triangleIds.indexOf(bestTriangle.id);
			if (index >= 0) {
				this.triangleIds.splice(index, 1);
				this.triangleIds.unshift(bestTriangle.id);
			}
		}
		const inside = bestHit.result == HitResult.HIT && bestHit.front === false;
		if (inside) this.insideCount++;
		return {
			inside,
			hit: bestHit
		};
	}
};

//#endregion
//#region src/Palettes.ts
let RoundMethod = /* @__PURE__ */ function(RoundMethod$1) {
	RoundMethod$1[RoundMethod$1["NEAREST"] = 0] = "NEAREST";
	RoundMethod$1[RoundMethod$1["EQUAL_DIVISION"] = 1] = "EQUAL_DIVISION";
	return RoundMethod$1;
}({});
let DitherMethod = /* @__PURE__ */ function(DitherMethod$1) {
	DitherMethod$1[DitherMethod$1["NONE"] = 0] = "NONE";
	DitherMethod$1[DitherMethod$1["DIFFUSION"] = 1] = "DIFFUSION";
	DitherMethod$1[DitherMethod$1["PATTERN"] = 2] = "PATTERN";
	return DitherMethod$1;
}({});
const MAX_PALETTE_SIZE = 256;
var Palette = class {
	nearest(dst, src) {
		const orig = new Float32Array([
			src.x,
			src.y,
			src.z
		]);
		const reduced = new Uint8Array(3);
		this.reduce(orig, 0, reduced, 0, new Float32Array(3));
		const extracted = new Uint8Array(3);
		this.extract(reduced, 0, extracted, 0);
		dst.x = extracted[0] / 255;
		dst.y = extracted[1] / 255;
		dst.z = extracted[2] / 255;
	}
	getRgbAxis() {
		const K = new Vec3(0, 0, 0);
		const W = new Vec3(1, 1, 1);
		const R = new Vec3(1, 0, 0);
		const G = new Vec3(0, 1, 0);
		const B = new Vec3(0, 0, 1);
		this.nearest(K, K);
		this.nearest(R, R);
		this.nearest(G, G);
		this.nearest(B, B);
		this.nearest(W, W);
		R.sub(K);
		G.sub(K);
		B.sub(K);
		W.sub(K);
		R.norm();
		G.norm();
		B.norm();
		const dr = W.len();
		return {
			K,
			R,
			G,
			B,
			dr
		};
	}
};
var FixedPalette = class extends Palette {
	inMin;
	inMax;
	outMax;
	convexHullCache;
	constructor(channelBits, roundMethod) {
		super();
		this.channelBits = channelBits;
		this.roundMethod = roundMethod;
		this.inMin = new Float32Array(channelBits.length);
		this.inMax = new Float32Array(channelBits.length);
		this.outMax = new Uint8Array(channelBits.length);
		const equDiv = roundMethod == RoundMethod.EQUAL_DIVISION;
		for (let ch = 0; ch < channelBits.length; ch++) {
			const numLevel = 1 << channelBits[ch];
			this.inMin[ch] = equDiv ? 1 / (numLevel * 2) : 0;
			this.inMax[ch] = equDiv ? (numLevel * 2 - 1) / (numLevel * 2) : 1;
			this.outMax[ch] = numLevel - 1;
		}
		const verts = new Float32Array([
			0,
			0,
			0,
			0,
			0,
			1,
			0,
			1,
			0,
			0,
			1,
			1,
			1,
			0,
			0,
			1,
			0,
			1,
			1,
			1,
			0,
			1,
			1,
			1
		]);
		this.convexHullCache = new ConvexHull3D(verts);
	}
	get numColors() {
		let n = 1;
		for (let ch = 0; ch < this.channelBits.length; ch++) n *= 1 << this.channelBits[ch];
		return n;
	}
	reduce(src, srcOffset, dest, destOffset, error) {
		for (let ch = 0; ch < this.channelBits.length; ch++) {
			const inNorm = src[srcOffset + ch];
			const inMod = clip(0, 1, (inNorm - this.inMin[ch]) / (this.inMax[ch] - this.inMin[ch]));
			const out = Math.round(this.outMax[ch] * inMod);
			dest[destOffset + ch] = out;
			const outNorm = out / this.outMax[ch];
			error[ch] = inNorm - outNorm;
		}
	}
	extract(src, srcOffset, dest, destOffset) {
		switch (this.channelBits.length) {
			case 1:
				const gray = Math.round(src[srcOffset] * 255 / this.outMax[0]);
				for (let ch = 0; ch < 3; ch++) dest[destOffset + ch] = gray;
				break;
			case 3:
				for (let ch = 0; ch < 3; ch++) dest[destOffset + ch] = Math.round(src[srcOffset + ch] * 255 / this.outMax[ch]);
				break;
			default: throw new Error("Invalid channel number");
		}
	}
	getHslRange() {
		return {
			hMin: 0,
			hRange: 1,
			sMin: 0,
			sMax: 1,
			lMin: 0,
			lMax: 1
		};
	}
	getAverageStep() {
		const avgStep = new Float32Array(this.channelBits.length);
		for (let ch = 0; ch < this.channelBits.length; ch++) {
			const numLevel = 1 << this.channelBits[ch];
			avgStep[ch] = 1 / (numLevel - 1);
		}
		return avgStep;
	}
	get convexHull() {
		return this.convexHullCache;
	}
	normalizeColor(dest) {}
};
var IndexedPalette = class extends Palette {
	colors;
	enabled;
	convexHullCache = null;
	constructor(channelBits, indexBits) {
		super();
		this.channelBits = channelBits;
		this.indexBits = indexBits;
		const numColors = 1 << indexBits;
		this.colors = new Float32Array(numColors * channelBits.length);
		this.enabled = new Array(numColors).fill(false);
	}
	get numColors() {
		return 1 << this.indexBits;
	}
	reduce(src, srcOffset, dest, destOffset, error) {
		const numCh = this.channelBits.length;
		let bestIdx = 0;
		let bestDist = Number.MAX_VALUE;
		for (let i = 0; i < 1 << this.indexBits; i++) {
			if (!this.enabled[i]) continue;
			let dist = 0;
			for (let ch = 0; ch < numCh; ch++) {
				const diff = src[srcOffset + ch] - this.colors[i * numCh + ch];
				dist += diff * diff;
			}
			if (dist < bestDist) {
				bestDist = dist;
				bestIdx = i;
			}
		}
		dest[destOffset] = bestIdx;
		for (let ch = 0; ch < numCh; ch++) {
			const outNorm = this.colors[bestIdx * numCh + ch];
			error[ch] = src[srcOffset + ch] - outNorm;
		}
	}
	extract(src, srcOffset, dest, destOffset) {
		switch (this.channelBits.length) {
			case 1:
				const gray = Math.round(this.colors[src[srcOffset]] * 255);
				for (let ch = 0; ch < 3; ch++) dest[destOffset + ch] = gray;
				break;
			case 3:
				for (let ch = 0; ch < 3; ch++) dest[destOffset + ch] = Math.round(this.colors[src[srcOffset] * 3 + ch] * 255);
				break;
			default: throw new Error("Invalid channel number");
		}
	}
	getHslRange() {
		const numColors = this.numColors;
		let rgbCenter = new Float32Array([
			0,
			0,
			0
		]);
		for (let i = 0; i < numColors; i++) {
			if (!this.enabled[i]) continue;
			rgbCenter[0] += this.colors[i * 3 + 0];
			rgbCenter[1] += this.colors[i * 3 + 1];
			rgbCenter[2] += this.colors[i * 3 + 2];
		}
		rgbCenter[0] /= numColors;
		rgbCenter[1] /= numColors;
		rgbCenter[2] /= numColors;
		let hslCenter = new Float32Array(3);
		rgbToHslArrayF32(rgbCenter, 0, hslCenter, 0, 1);
		const centerH = hslCenter[0];
		const hsl = new Float32Array(this.colors.length);
		rgbToHslArrayF32(this.colors, 0, hsl, 0, numColors);
		let hDistMin = 0, hDistMax = 0, sMin = 1, sMax = 0, lMin = 1, lMax = 0;
		for (let i = 0; i < numColors; i++) {
			if (!this.enabled[i]) continue;
			const h = hsl[i * 3 + 0];
			const s = hsl[i * 3 + 1];
			const l = hsl[i * 3 + 2];
			if (s > 0) {
				const hDist = hueDiff(h, centerH);
				if (hDist < hDistMin) hDistMin = hDist;
				if (hDist > hDistMax) hDistMax = hDist;
			}
			if (s < sMin) sMin = s;
			if (s > sMax) sMax = s;
			if (l < lMin) lMin = l;
			if (l > lMax) lMax = l;
		}
		const hMin = hueAdd(centerH, hDistMin);
		const hRange = hDistMax - hDistMin;
		return {
			hMin,
			hRange,
			sMin,
			sMax,
			lMin,
			lMax
		};
	}
	getAverageStep() {
		const numCh = this.channelBits.length;
		const avgStep = new Float32Array(numCh);
		const numLevels = Math.max(2, Math.pow(this.numColors, 1 / numCh));
		for (let ch = 0; ch < numCh; ch++) {
			let min = 1;
			let max = 0;
			for (let i = 0; i < this.numColors; i++) {
				if (!this.enabled[i]) continue;
				min = Math.min(min, this.colors[i * 3 + ch]);
				max = Math.max(max, this.colors[i * 3 + ch]);
			}
			avgStep[ch] = Math.max(.1, max - min) / (numLevels - 1);
		}
		return avgStep;
	}
	get convexHull() {
		if (!this.convexHullCache) {
			let numAvailableColors = 0;
			for (let i = 0; i < this.numColors; i++) if (this.enabled[i]) numAvailableColors++;
			const v = new Float32Array(numAvailableColors * 3);
			let idx = 0;
			for (let i = 0; i < this.numColors; i++) {
				if (!this.enabled[i]) continue;
				v[idx * 3 + 0] = this.colors[i * 3 + 0];
				v[idx * 3 + 1] = this.colors[i * 3 + 1];
				v[idx * 3 + 2] = this.colors[i * 3 + 2];
				idx++;
			}
			this.convexHullCache = new ConvexHull3D(v);
		}
		return this.convexHullCache;
	}
	normalizeColor(dest) {
		const sw = new StopWatch(false);
		const hull = this.convexHull;
		const numCh = this.channelBits.length;
		if (numCh != 3) return;
		const black = new Vec3(0, 0, 0);
		const white = new Vec3(1, 1, 1);
		const rayOrigin = new Vec3();
		const rayDir = new Vec3();
		let numInside = 0;
		const outBuff = new Uint8Array(3);
		const errBuff = new Float32Array(3);
		hull.hitCount = 0;
		for (let i = 0; i < dest.length; i += 3) {
			rayOrigin.set(dest[i], dest[i + 1], dest[i + 2]);
			rayDir.copyFrom(projectPointToLine(black, white, rayOrigin));
			rayDir.sub(rayOrigin);
			if (rayDir.len() <= 1e-6) {
				numInside++;
				continue;
			}
			rayDir.norm();
			const ret = hull.intersectWithRay(rayOrigin, rayDir);
			if (ret.inside) {
				numInside++;
				continue;
			}
			const hit = ret.hit;
			if (hit.result != HitResult.HIT || hit.point == null) {
				this.reduce(dest, i, outBuff, 0, errBuff);
				dest[i + 0] = this.colors[outBuff[0] * 3 + 0];
				dest[i + 1] = this.colors[outBuff[0] * 3 + 1];
				dest[i + 2] = this.colors[outBuff[0] * 3 + 2];
			} else if (hit.front) {
				dest[i + 0] = hit.point.x;
				dest[i + 1] = hit.point.y;
				dest[i + 2] = hit.point.z;
			}
		}
		sw.lap("IndexedPalette.normalizeColor()");
	}
};

//#endregion
//#region src/PaletteUis.ts
const PADDING = 1;
const CELL_SIZE = 22;
const CELL_MARGIN = 3;
const CELL_STRIDE = CELL_SIZE + CELL_MARGIN;
const MIN_COLS = 4;
const MAX_COLS = 32;
var PaletteUi = class {
	container = document.createElement("div");
	colorBox = makeTextBox("", "", 8);
	enabledBox = makeCheckBox("有効");
	canvas = document.createElement("canvas");
	entries = new Array(MAX_PALETTE_SIZE);
	size = 0;
	renderTimeoutId = null;
	cols = MAX_COLS;
	rows = 1;
	visible = false;
	selIndex = -999;
	paletteCache = null;
	constructor() {
		this.canvas.style.width = "100%";
		this.queryRender();
		this.container.appendChild(makeFloatList([tip(["色: ", this.colorBox], "16進数で指定します。"), tip([this.enabledBox.parentElement], "このエントリの使用可否を指定します。")]));
		this.container.appendChild(makeParagraph([this.canvas]));
		this.colorBox.addEventListener("change", () => {
			this.onColorBoxChange();
		});
		this.colorBox.addEventListener("input", () => {
			this.onColorBoxChange();
		});
		this.enabledBox.addEventListener("change", () => {
			if (this.selectedIndex < 0) return;
			this.entries[this.selectedIndex].enabled = this.enabledBox.checked;
			this.paletteCache = null;
			this.queryRender();
		});
		this.canvas.addEventListener("pointermove", (e) => {
			e.preventDefault();
			const pointedIndex = this.clientPosToIndex(e.offsetX, e.offsetY);
			this.canvas.style.cursor = pointedIndex >= 0 ? "pointer" : "default";
		});
		this.canvas.addEventListener("pointerdown", (e) => {
			e.preventDefault();
			this.selectedIndex = this.clientPosToIndex(e.offsetX, e.offsetY);
			this.queryRender();
		});
		this.selectedIndex = -1;
	}
	getPalette(fmt) {
		if (!this.paletteCache) {
			const newPalette = new IndexedPalette(fmt.colorBits, fmt.indexBits);
			const numColors = 1 << newPalette.indexBits;
			for (let i = 0; i < numColors; i++) {
				const entry = this.getEntry(i);
				const { r, g, b } = rgbU32ToF32(entry.color);
				newPalette.colors[i * 3 + 0] = r;
				newPalette.colors[i * 3 + 1] = g;
				newPalette.colors[i * 3 + 2] = b;
				newPalette.enabled[i] = entry.enabled;
			}
			this.paletteCache = newPalette;
		}
		return this.paletteCache;
	}
	onColorBoxChange() {
		if (this.selectedIndex < 0) return;
		this.entries[this.selectedIndex].color = strToU32(this.colorBox.value);
		this.paletteCache = null;
		this.queryRender();
	}
	setSize(size) {
		if (this.size === size) return;
		if (size < 0 || size > this.entries.length) throw new Error("Size out of range");
		this.size = size;
		this.paletteCache = null;
		this.queryRender();
	}
	clear() {
		for (let i = 0; i < this.entries.length; i++) this.entries[i] = {
			color: 0,
			enabled: false
		};
		this.paletteCache = null;
		this.queryRender();
	}
	setEntry(index, entry) {
		const old = this.entries[index];
		if (old.color === entry.color && old.enabled === entry.enabled) return;
		if (index < 0 || index >= this.size) throw new Error("Index out of range");
		this.entries[index] = entry;
		this.paletteCache = null;
		this.queryRender();
	}
	getEntry(index) {
		if (index < 0 || index >= this.size) throw new Error("Index out of range");
		return this.entries[index];
	}
	get selectedIndex() {
		return this.selIndex;
	}
	set selectedIndex(index) {
		if (this.selIndex === index) return;
		if (index >= this.size) throw new Error("Index out of range");
		this.selIndex = index;
		if (index >= 0) {
			this.colorBox.value = u32ToHexStr(this.entries[index].color);
			this.enabledBox.checked = this.entries[index].enabled;
			this.colorBox.disabled = false;
			this.enabledBox.disabled = false;
		} else {
			this.colorBox.value = "";
			this.enabledBox.checked = false;
			this.colorBox.disabled = true;
			this.enabledBox.disabled = true;
		}
		this.queryRender();
	}
	clientPosToIndex(x, y) {
		const col = Math.floor((x - PADDING) / CELL_STRIDE);
		const row = Math.floor((y - PADDING) / CELL_STRIDE);
		if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return -1;
		const subX = (x - PADDING) % CELL_STRIDE;
		const subY = (y - PADDING) % CELL_STRIDE;
		if (subX >= CELL_SIZE || subY >= CELL_SIZE) return -1;
		const index = row * this.cols + col;
		if (index >= this.size) return -1;
		return index;
	}
	onRelayout() {
		this.queryRender();
	}
	setVisible(visible) {
		if (this.visible === visible) return;
		this.visible = visible;
		setVisible(this.canvas, visible);
		if (visible) this.onRelayout();
	}
	queryRender() {
		if (this.renderTimeoutId !== null) return;
		this.renderTimeoutId = window.setTimeout(() => {
			window.requestAnimationFrame(() => this.render());
		}, 10);
	}
	render() {
		this.renderTimeoutId = null;
		const canvasW = this.canvas.clientWidth;
		if (canvasW == 0) {
			this.queryRender();
			return;
		}
		this.cols = MAX_COLS;
		while (this.cols * CELL_STRIDE - CELL_MARGIN + PADDING * 2 > canvasW && this.cols > MIN_COLS) this.cols = Math.floor(this.cols / 2);
		if (this.size < this.cols) {
			this.cols = this.size;
			this.rows = 1;
		} else this.rows = Math.ceil(this.size / this.cols);
		const canvasH = this.rows * CELL_STRIDE - CELL_MARGIN + PADDING * 2;
		this.canvas.width = canvasW;
		this.canvas.height = canvasH;
		const ctx = this.canvas.getContext("2d");
		if (!ctx) return;
		ctx.clearRect(0, 0, canvasW, canvasH);
		for (let i = 0; i < this.size; i++) {
			const ix = i % this.cols;
			const iy = Math.floor(i / this.cols);
			const x = PADDING + ix * CELL_STRIDE;
			const y = PADDING + iy * CELL_STRIDE;
			const entry = this.entries[i];
			ctx.fillStyle = u32ToHexStr(entry.color);
			ctx.fillRect(x + 2, y + 2, CELL_SIZE - 4, CELL_SIZE - 4);
			if (!entry.enabled) {
				const gray = grayscaleU32(entry.color);
				ctx.strokeStyle = gray < 128 ? "#fff" : "#000";
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.moveTo(x, y);
				ctx.lineTo(x + CELL_SIZE, y + CELL_SIZE);
				ctx.moveTo(x + CELL_SIZE, y);
				ctx.lineTo(x, y + CELL_SIZE);
				ctx.stroke();
			}
			if (i == this.selIndex) {
				ctx.strokeStyle = selectedColor;
				ctx.lineWidth = 2;
				ctx.strokeRect(x, y, CELL_SIZE, CELL_SIZE);
			} else {
				ctx.strokeStyle = "#888";
				ctx.lineWidth = 1;
				ctx.strokeRect(x + .5, y + .5, CELL_SIZE - 1, CELL_SIZE - 1);
			}
		}
	}
};

//#endregion
//#region src/Preproc.ts
let AlphaMode = /* @__PURE__ */ function(AlphaMode$1) {
	AlphaMode$1[AlphaMode$1["KEEP"] = 0] = "KEEP";
	AlphaMode$1[AlphaMode$1["FILL"] = 1] = "FILL";
	AlphaMode$1[AlphaMode$1["BINARIZE"] = 2] = "BINARIZE";
	AlphaMode$1[AlphaMode$1["SET_KEY_COLOR"] = 3] = "SET_KEY_COLOR";
	return AlphaMode$1;
}({});
let CsrMode = /* @__PURE__ */ function(CsrMode$1) {
	CsrMode$1[CsrMode$1["CLIP"] = 0] = "CLIP";
	CsrMode$1[CsrMode$1["GRAYOUT"] = 1] = "GRAYOUT";
	CsrMode$1[CsrMode$1["FOLD_HUE_CIRCLE"] = 2] = "FOLD_HUE_CIRCLE";
	CsrMode$1[CsrMode$1["ROTATE_RGB_SPACE"] = 3] = "ROTATE_RGB_SPACE";
	CsrMode$1[CsrMode$1["BEND_RGB_SPACE"] = 4] = "BEND_RGB_SPACE";
	CsrMode$1[CsrMode$1["LANDS_TWO_COLOR_METHOD"] = 5] = "LANDS_TWO_COLOR_METHOD";
	return CsrMode$1;
}({});
var PreProcArgs = class {
	src = null;
	alphaProc = AlphaMode.KEEP;
	alphaThresh = 128;
	backColor = 0;
	hue = 0;
	saturation = 1;
	lightness = 1;
	csrMode = CsrMode.CLIP;
	csrHslRange = new HslRange();
	csrHueTolerance = 60 / 360;
	csrTransformMatrix = new Mat43();
	csrBendVector = new Vec3(0, 0, 0);
	csrBendStrength = 1;
	csrLandsMethodCoeff = .5;
	gamma = {
		value: 1,
		automatic: true
	};
	brightness = {
		value: 0,
		automatic: true
	};
	contrast = {
		value: 0,
		automatic: true
	};
	unsharp = 0;
	invert = false;
	out = new NormalizedImage(0, 0, ColorSpace.RGB);
};
function process(args) {
	const sw = new StopWatch(false);
	const img = args.src.clone();
	if (args.alphaProc == AlphaMode.BINARIZE) binarizeAlpha(img, args.alphaThresh / 255);
	else if (args.alphaProc == AlphaMode.FILL) fillBackground(img, args.backColor);
	correctHSL(img, args.hue, args.saturation, args.lightness);
	args.gamma = correctGamma(img, args.gamma);
	args.brightness = offsetBrightness(img, args.brightness);
	args.contrast = correctContrast(img, args.contrast);
	unsharpen(img, args.unsharp);
	if (args.invert) for (let i = 0; i < img.color.length; i++) img.color[i] = 1 - img.color[i];
	switch (args.csrMode) {
		case CsrMode.CLIP: break;
		case CsrMode.GRAYOUT:
		case CsrMode.FOLD_HUE_CIRCLE:
			roundHslColorSpace(img, args.csrHslRange, args.csrMode == CsrMode.FOLD_HUE_CIRCLE, args.csrHueTolerance);
			break;
		case CsrMode.ROTATE_RGB_SPACE:
			transformColorSpace(img, args.csrTransformMatrix);
			break;
		case CsrMode.BEND_RGB_SPACE:
			bendColorSpace(img, args.csrBendVector, args.csrBendStrength);
			break;
		case CsrMode.LANDS_TWO_COLOR_METHOD:
			reduceByLandsTwoColorMethod(img, args.csrLandsMethodCoeff);
			break;
		default: throw new Error("Invalid color space reduction mode");
	}
	args.out = img;
	sw.lap("PreProc.process()");
}
function correctHSL(img, hShift, sCoeff, lCoeff) {
	const numPixels = img.width * img.height;
	switch (img.colorSpace) {
		case ColorSpace.GRAYSCALE:
			if (lCoeff == 1) return;
			for (let i = 0; i < numPixels; i++) img.color[i] = clip(0, 1, img.color[i] * lCoeff);
			break;
		case ColorSpace.RGB:
			{
				if (hShift == 0 && sCoeff == 1 && lCoeff == 1) return;
				const hsl = new Float32Array(numPixels * 3);
				rgbToHslArrayF32(img.color, 0, hsl, 0, numPixels);
				for (let i = 0; i < numPixels; i++) {
					hsl[i * 3 + 0] = hueAdd(hsl[i * 3 + 0], hShift);
					hsl[i * 3 + 1] = clip(0, 1, hsl[i * 3 + 1] * sCoeff);
					hsl[i * 3 + 2] = clip(0, 1, hsl[i * 3 + 2] * lCoeff);
				}
				hslToRgbArrayF32(hsl, 0, img.color, 0, numPixels);
			}
			break;
		default: throw new Error("Invalid color space");
	}
}
function roundHslColorSpace(img, hslRange, fold, hueTolerance) {
	const hMin = hueWrap(hslRange.hMin);
	const hRange = clip(0, 1, hslRange.hRange);
	const sRange = clip(0, 1, hslRange.sMax);
	const lMin = clip(0, 1, hslRange.lMin);
	const lRange = clip(0, 1, hslRange.lMax - lMin);
	const hReduction = hRange < .9999;
	const sReduction = sRange < .9999;
	const lReduction = lMin != 0 || lRange != 1;
	const hslReduction = hReduction || sReduction || lReduction;
	if (fold && hRange > .5) throw new Error("色空間の折り畳みは色相の広がりが 180° 以下のパレットでのみ使用できます。");
	const numPixels = img.width * img.height;
	switch (img.colorSpace) {
		case ColorSpace.GRAYSCALE:
			if (!lReduction) return;
			for (let i = 0; i < numPixels; i++) img.color[i] = clip(0, 1, lMin + (img.color[i] - lMin) * lRange);
			break;
		case ColorSpace.RGB:
			{
				if (!hslReduction) return;
				const hHalfRange = hRange / 2;
				const hCenter = hueAdd(hMin, hHalfRange);
				const hsl = new Float32Array(numPixels * 3);
				rgbToHslArrayF32(img.color, 0, hsl, 0, numPixels);
				if (fold) for (let i = 0; i < numPixels; i++) {
					let h = hsl[i * 3 + 0];
					if (hHalfRange == 0) h = hMin;
					else {
						let hDist = hueDiff(h, hCenter);
						if (hDist < -hHalfRange || hHalfRange < hDist) {
							const sign = hDist < 0 ? -1 : 1;
							hDist = Math.abs(hDist);
							hDist = (.5 - hDist) / (.5 - hHalfRange);
							hDist *= sign * hHalfRange;
							h = hueAdd(hCenter, hDist);
						}
					}
					hsl[i * 3 + 0] = h;
				}
				else for (let i = 0; i < numPixels; i++) {
					const h = hsl[i * 3 + 0];
					const hClipped = hueClip(hMin, hRange, h);
					const hDiff = Math.abs(hueDiff(hClipped, h));
					hsl[i * 3 + 0] = hClipped;
					if (hDiff >= hueTolerance) hsl[i * 3 + 1] = 0;
					else hsl[i * 3 + 1] *= 1 - hDiff / hueTolerance;
				}
				for (let i = 0; i < numPixels; i++) {
					hsl[i * 3 + 1] = clip(0, 1, hsl[i * 3 + 1] * sRange);
					hsl[i * 3 + 2] = clip(0, 1, lMin + (hsl[i * 3 + 2] - lMin) * lRange);
				}
				hslToRgbArrayF32(hsl, 0, img.color, 0, numPixels);
			}
			break;
		default: throw new Error("Invalid color space");
	}
}
function transformColorSpace(img, matrix) {
	const numPixels = img.width * img.height;
	const v = new Vec3();
	switch (img.colorSpace) {
		case ColorSpace.RGB:
			for (let i = 0; i < numPixels * 3; i += 3) {
				v.set(img.color[i + 0], img.color[i + 1], img.color[i + 2]);
				matrix.mulV(v);
				img.color[i + 0] = clip(0, 1, v.x);
				img.color[i + 1] = clip(0, 1, v.y);
				img.color[i + 2] = clip(0, 1, v.z);
			}
			break;
		default: throw new Error("Invalid color space for transform");
	}
}
function bendColorSpace(img, vector, strength) {
	const numPixels = img.width * img.height;
	switch (img.colorSpace) {
		case ColorSpace.RGB:
			for (let i = 0; i < numPixels * 3; i += 3) {
				let r = img.color[i + 0];
				let g = img.color[i + 1];
				let b = img.color[i + 2];
				let coeff;
				{
					const l = (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
					const d = Math.abs(l - .5) * 2;
					coeff = strength * (1 - d * d);
				}
				img.color[i + 0] = clip(0, 1, r + vector.x * coeff);
				img.color[i + 1] = clip(0, 1, g + vector.y * coeff);
				img.color[i + 2] = clip(0, 1, b + vector.z * coeff);
			}
			break;
		default: throw new Error("Invalid color space for transform");
	}
}
function reduceByLandsTwoColorMethod(img, coeff) {
	const numPixels = img.width * img.height;
	switch (img.colorSpace) {
		case ColorSpace.RGB:
			for (let i = 0; i < numPixels * 3; i += 3) {
				let r = img.color[i + 0];
				let g = img.color[i + 1];
				img.color[i + 2];
				img.color[i + 0] = clip(0, 1, r * coeff + g * (1 - coeff));
				img.color[i + 1] = clip(0, 1, g * (1 - coeff));
				img.color[i + 2] = clip(0, 1, g * (1 - coeff));
			}
			break;
		default: throw new Error("Invalid color space for Land's two-color method");
	}
}
function makeHistogramF32(img, histogramSize) {
	const histogram = new Uint32Array(histogramSize);
	const numPixels = img.width * img.height;
	const numCh = img.numColorChannels;
	for (let i = 0; i < numPixels; i++) if (img.alpha[i] > 0) {
		const gray = grayscaleArrayF32(img.color, i * numCh);
		histogram[Math.round(gray * (histogramSize - 1))]++;
	}
	return histogram;
}
function determineGammaValue(img) {
	const HISTOGRAM_SIZE = 16;
	const histogram = makeHistogramF32(img, HISTOGRAM_SIZE);
	let min = .5;
	let max = 2;
	let gamma = 1;
	while (max - min > .01) {
		gamma = (min + max) / 2;
		let lo = 0, hi = 0;
		for (let i = 0; i < HISTOGRAM_SIZE; i++) {
			const val = Math.pow(i / (HISTOGRAM_SIZE - 1), 1 / gamma);
			if (val < .5) lo += histogram[i];
			else hi += histogram[i];
		}
		if (lo > hi) min = gamma;
		else max = gamma;
	}
	return gamma;
}
function binarizeAlpha(img, thresh) {
	const numPixels = img.width * img.height;
	for (let i = 0; i < numPixels; i++) img.alpha[i] = img.alpha[i] < thresh ? 0 : 1;
}
function fillBackground(img, color) {
	const numCh = img.numColorChannels;
	let bk = new Float32Array(numCh);
	const { r: backR, g: backG, b: backB } = rgbU32ToF32(color);
	switch (img.colorSpace) {
		case ColorSpace.GRAYSCALE:
			bk[0] = grayscale(backR, backG, backB);
			break;
		case ColorSpace.RGB:
			bk[0] = backR;
			bk[1] = backG;
			bk[2] = backB;
			break;
		default: throw new Error("Invalid color space");
	}
	const numPixels = img.width * img.height;
	for (let i = 0; i < numPixels; i++) {
		const a1 = img.alpha[i];
		const a0 = 1 - a1;
		for (let c = 0; c < numCh; c++) img.color[i * numCh + c] = bk[c] * a0 + img.color[i * numCh + c] * a1;
		img.alpha[i] = 1;
	}
}
function correctGamma(img, gamma) {
	if (gamma.automatic) gamma.value = determineGammaValue(img);
	gamma.value = clip(.01, 5, gamma.value);
	if (gamma.value != 1) for (let i = 0; i < img.color.length; i++) {
		const val = Math.pow(img.color[i], 1 / gamma.value);
		img.color[i] = val;
	}
	return gamma;
}
function offsetBrightness(img, param) {
	if (param.automatic) {
		const { min, max } = getColorMinMax(img);
		param.value = .5 - (min + max) / 2;
	}
	param.value = clip(-1, 1, param.value);
	if (param.value != 0) for (let i = 0; i < img.color.length; i++) img.color[i] = clip(0, 1, img.color[i] + param.value);
	return param;
}
function correctContrast(img, param) {
	if (param.automatic) {
		const { min, max } = getColorMinMax(img);
		const middle = (min + max) / 2;
		if (middle < .5 && min < middle) param.value = .5 / (middle - min);
		else if (middle > .5 && max > middle) param.value = .5 / (max - middle);
	}
	param.value = clip(.01, 10, param.value);
	if (param.value != 1) for (let i = 0; i < img.color.length; i++) img.color[i] = clip(0, 1, (img.color[i] - .5) * param.value + .5);
	return param;
}
function unsharpen(img, strength) {
	strength = clip(0, 3, strength);
	if (strength <= 0) return;
	const w = img.width;
	const h = img.height;
	const numCh = img.numColorChannels;
	const copy = img.color.slice();
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < numCh; c++) {
		const i = (y * w + x) * numCh + c;
		let sum = 0;
		let count = 0;
		for (let dy = -1; dy <= 1; dy++) {
			const yy = y + dy;
			if (yy < 0 || h <= yy) continue;
			for (let dx = -1; dx <= 1; dx++) {
				const xx = x + dx;
				if (xx < 0 || w <= xx) continue;
				sum += copy[(yy * w + xx) * numCh + c];
				count++;
			}
		}
		img.color[i] = clip(0, 1, copy[i] + (copy[i] - sum / count) * strength);
	}
}
function getColorMinMax(img) {
	const numPixels = img.width * img.height;
	const numCh = img.numColorChannels;
	let min = 9999;
	let max = -9999;
	for (let i = 0; i < numPixels; i++) if (img.alpha[i] > 0) {
		const gray = grayscaleArrayF32(img.color, i * numCh);
		min = Math.min(min, gray);
		max = Math.max(max, gray);
	}
	if (min <= max) return {
		min,
		max
	};
	else return {
		min: .5,
		max: .5
	};
}

//#endregion
//#region src/Reducer.ts
const DEFAULT_DITHER_STRENGTH = .8;
let DiffusionKernel = /* @__PURE__ */ function(DiffusionKernel$1) {
	DiffusionKernel$1[DiffusionKernel$1["FLOYD_STEINBERG"] = 0] = "FLOYD_STEINBERG";
	DiffusionKernel$1[DiffusionKernel$1["JARVIS_JUDICE_NINKE"] = 1] = "JARVIS_JUDICE_NINKE";
	DiffusionKernel$1[DiffusionKernel$1["STUCKI"] = 2] = "STUCKI";
	DiffusionKernel$1[DiffusionKernel$1["SIERRA"] = 3] = "SIERRA";
	return DiffusionKernel$1;
}({});
var ReduceArgs = class {
	src = null;
	colorDitherMethod = DitherMethod.NONE;
	colorDitherStrength = DEFAULT_DITHER_STRENGTH;
	colorDitherAntiSaturation = false;
	alphaDitherMethod = DitherMethod.NONE;
	alphaDitherStrength = DEFAULT_DITHER_STRENGTH;
	diffusionKernel = DiffusionKernel.STUCKI;
	palette = null;
	format = null;
	output = null;
};
const ditherPattern = new Float32Array([
	.5 / 16 - .5,
	8.5 / 16 - .5,
	2.5 / 16 - .5,
	10.5 / 16 - .5,
	12.5 / 16 - .5,
	4.5 / 16 - .5,
	14.5 / 16 - .5,
	6.5 / 16 - .5,
	3.5 / 16 - .5,
	11.5 / 16 - .5,
	1.5 / 16 - .5,
	9.5 / 16 - .5,
	15.5 / 16 - .5,
	7.5 / 16 - .5,
	13.5 / 16 - .5,
	5.5 / 16 - .5
]);
const diffuseKernels = {
	[DiffusionKernel.FLOYD_STEINBERG]: [
		0 / 16,
		0 / 16,
		0 / 16,
		7 / 16,
		0 / 16,
		0 / 16,
		3 / 16,
		5 / 16,
		1 / 16,
		0 / 16,
		0 / 16,
		0 / 16,
		0 / 16,
		0 / 16,
		0 / 16
	],
	[DiffusionKernel.JARVIS_JUDICE_NINKE]: [
		0 / 48,
		0 / 48,
		0 / 48,
		7 / 48,
		5 / 48,
		3 / 48,
		5 / 48,
		7 / 48,
		5 / 48,
		3 / 48,
		1 / 48,
		3 / 48,
		5 / 48,
		3 / 48,
		1 / 48
	],
	[DiffusionKernel.STUCKI]: [
		0 / 42,
		0 / 42,
		0 / 42,
		8 / 42,
		4 / 42,
		2 / 42,
		4 / 42,
		8 / 42,
		4 / 42,
		2 / 42,
		1 / 42,
		2 / 42,
		4 / 42,
		2 / 42,
		1 / 42
	],
	[DiffusionKernel.SIERRA]: [
		0 / 32,
		0 / 32,
		0 / 32,
		5 / 32,
		3 / 32,
		2 / 32,
		4 / 32,
		5 / 32,
		4 / 32,
		2 / 32,
		0 / 32,
		2 / 32,
		3 / 32,
		2 / 32,
		0 / 32
	]
};
function reduce(args) {
	const sw = new StopWatch(false);
	const norm = args.src;
	const outW = norm.width;
	const outH = norm.height;
	const fmt = args.format;
	const numColCh = fmt.numColorChannels;
	const palette = args.palette;
	args.output = new ReducedImage(outW, outH, fmt, palette);
	const outData = args.output.data;
	const alpErrDiffuse = args.alphaDitherMethod == DitherMethod.DIFFUSION;
	const colErrDiffuse = args.colorDitherMethod == DitherMethod.DIFFUSION;
	if (args.colorDitherMethod == DitherMethod.DIFFUSION) {
		if (args.colorDitherAntiSaturation) palette.normalizeColor(norm.color);
	} else if (args.colorDitherMethod == DitherMethod.PATTERN) {
		const step = palette.getAverageStep();
		for (let y = 0; y < outH; y++) {
			const iPixelStep = y * outW * numColCh;
			const iPatStep = y % 4 * 4;
			for (let x = 0; x < outW; x++) {
				const iPixel = iPixelStep + x * numColCh;
				const iPat = iPatStep + x % 4;
				for (let ch = 0; ch < numColCh; ch++) {
					const s = step[ch];
					let v = norm.color[iPixel + ch];
					v += s * ditherPattern[iPat] * args.colorDitherStrength;
					norm.color[iPixel + ch] = clip(0, 1, v);
				}
			}
		}
	}
	const alpOutMax = (1 << fmt.alphaBits) - 1;
	const colOut = new Uint8Array(numColCh);
	const colErr = new Float32Array(numColCh);
	const alpErr = new Float32Array(1);
	for (let y = 0; y < outH; y++) for (let ix = 0; ix < outW; ix++) {
		const fwd = y % 2 == 0;
		const x = fwd ? ix : outW - 1 - ix;
		const iPix = y * outW + x;
		let transparent = false;
		let alpOut = alpOutMax;
		if (fmt.hasAlpha) {
			const alpNormIn = norm.alpha[iPix];
			alpOut = Math.round(alpNormIn * alpOutMax);
			const alpNormOut = alpOut / alpOutMax;
			alpErr[0] = alpNormIn - alpNormOut;
			transparent = alpOut == 0;
		}
		palette.reduce(norm.color, iPix * numColCh, colOut, 0, colErr);
		for (let ch = 0; ch < numColCh; ch++) outData[ch][iPix] = colOut[ch];
		if (fmt.hasAlpha) outData[numColCh][iPix] = alpOut;
		if (alpErrDiffuse && fmt.hasAlpha) {
			if (args.alphaDitherStrength < 1) alpErr[0] *= args.alphaDitherStrength;
			diffuseError(norm, args.diffusionKernel, true, alpErr, x, y, fwd);
		}
		if (colErrDiffuse && !transparent) {
			if (args.colorDitherStrength < 1) for (let ch = 0; ch < numColCh; ch++) colErr[ch] *= args.colorDitherStrength;
			diffuseError(norm, args.diffusionKernel, false, colErr, x, y, fwd);
		}
	}
	sw.lap("Reducer.reduce()");
}
function addError(target, index, error) {
	target[index] = clip(0, 1, target[index] + error);
}
function diffuseError(img, kernel, alpha, error, x, y, forward) {
	const target = alpha ? img.alpha : img.color;
	const numCh = alpha ? 1 : img.numColorChannels;
	const w = img.width;
	const h = img.height;
	const stride = img.width * numCh;
	for (let ch = 0; ch < numCh; ch++) {
		const e = error[ch];
		if (e == 0) continue;
		for (let ky = 0; ky < 3; ky++) {
			const ty = y + ky;
			if (ty < 0 || ty >= h) continue;
			for (let kx = -2; kx <= 2; kx++) {
				const tx = forward ? x + kx : x - kx;
				if (tx < 0 || tx >= w) continue;
				const ik = ky * 5 + (kx + 2);
				const coeff = diffuseKernels[kernel][ik];
				if (coeff == 0) continue;
				addError(target, ty * stride + tx * numCh + ch, e * coeff);
			}
		}
	}
}

//#endregion
//#region src/Resizer.ts
let ScalingMethod = /* @__PURE__ */ function(ScalingMethod$1) {
	ScalingMethod$1[ScalingMethod$1["ZOOM"] = 0] = "ZOOM";
	ScalingMethod$1[ScalingMethod$1["FIT"] = 1] = "FIT";
	ScalingMethod$1[ScalingMethod$1["STRETCH"] = 2] = "STRETCH";
	return ScalingMethod$1;
}({});
let InterpMethod = /* @__PURE__ */ function(InterpMethod$1) {
	InterpMethod$1[InterpMethod$1["NEAREST_NEIGHBOR"] = 0] = "NEAREST_NEIGHBOR";
	InterpMethod$1[InterpMethod$1["AVERAGE"] = 1] = "AVERAGE";
	return InterpMethod$1;
}({});
var ResizeArgs = class {
	srcData = new Uint8Array(0);
	srcSize = {
		width: 0,
		height: 0
	};
	trimRect = {
		x: 0,
		y: 0,
		width: 0,
		height: 0
	};
	outSize = {
		width: 0,
		height: 0
	};
	colorSpace = ColorSpace.RGB;
	scalingMethod = ScalingMethod.ZOOM;
	interpMethod = InterpMethod.NEAREST_NEIGHBOR;
	applyKeyColor = false;
	keyColor = 0;
	keyTolerance = 0;
	out = null;
};
function resize(args) {
	const sw = new StopWatch(false);
	let src = args.srcData;
	{
		const { data, rect } = trim(src, args.srcSize, args.trimRect, args.outSize, args.scalingMethod);
		src = data;
		args.trimRect = rect;
	}
	if (args.applyKeyColor) applyKeyColor(src, args.srcSize, args.keyColor, args.keyTolerance);
	const trimSize = {
		width: args.trimRect.width,
		height: args.trimRect.height
	};
	let resized = src;
	if (trimSize.width != args.outSize.width || trimSize.height != args.outSize.height) switch (args.interpMethod) {
		case InterpMethod.NEAREST_NEIGHBOR:
			resized = resizeWithNearestNeighbor(src, trimSize, args.outSize);
			break;
		case InterpMethod.AVERAGE:
			resized = resizeWithAverage(src, trimSize, args.outSize);
			break;
		default: throw new Error("Invalid interpolation method");
	}
	args.out = normalize(resized, args.outSize, args.colorSpace);
	sw.lap("Resizer.resize()");
}
function trim(src, srcSize, trimRect, outSize, scalingMethod) {
	const srcW = srcSize.width;
	const srcH = srcSize.height;
	const outW = outSize.width;
	const outH = outSize.height;
	let trimX = trimRect.x;
	let trimY = trimRect.y;
	let trimW = trimRect.width;
	let trimH = trimRect.height;
	let destX = 0;
	let destY = 0;
	let destW = trimW;
	let destH = trimH;
	if (srcW < 1 || srcH < 1 || trimW < 1 || trimH < 1 || outW < 1 || outH < 1) throw new Error("画像サイズは正の値でなければなりません");
	{
		const outAspect = outW / outH;
		const trimAspect = trimW / trimH;
		if (scalingMethod == ScalingMethod.ZOOM) {
			if (outAspect > trimAspect) {
				trimH = Math.max(1, Math.round(trimW * outH / outW));
				trimY += Math.round((trimRect.height - trimH) / 2);
			} else if (outAspect < trimAspect) {
				trimW = Math.max(1, Math.round(trimH * outW / outH));
				trimX += Math.round((trimRect.width - trimW) / 2);
			}
		} else if (scalingMethod == ScalingMethod.FIT) {
			if (outAspect > trimAspect) {
				trimW = Math.max(1, Math.round(trimH * outW / outH));
				destW = trimRect.width;
				destX = Math.round((trimW - trimRect.width) / 2);
			} else if (outAspect < trimAspect) {
				trimH = Math.max(1, Math.round(trimW * outH / outW));
				destH = trimRect.height;
				destY = Math.round((trimH - trimRect.height) / 2);
			}
		}
	}
	const out = new Uint8Array(trimW * trimH * 4);
	const srcStride = srcW * 4;
	const destStride = trimW * 4;
	for (let y = 0; y < destH; y++) {
		const srcY = trimY + y;
		if (srcY < 0 || srcH <= srcY) continue;
		let iSrc = srcY * srcStride + trimX * 4;
		let iDest = (destY + y) * destStride + destX * 4;
		for (let x = 0; x < destW; x++) {
			const srcX = trimX + x;
			if (0 <= srcX && srcX < srcW) for (let c = 0; c < 4; c++) out[iDest++] = src[iSrc++];
			else {
				iDest += 4;
				iSrc += 4;
			}
		}
	}
	trimRect.x = trimX;
	trimRect.y = trimY;
	trimRect.width = trimW;
	trimRect.height = trimH;
	return {
		data: out,
		rect: trimRect
	};
}
function applyKeyColor(data, size, key, tol) {
	const { r: keyR, g: keyG, b: keyB } = unpackU32ToU8(key);
	for (let y = 0; y < size.height; y++) {
		let i = y * size.width * 4;
		for (let x = 0; x < size.width; x++, i += 4) {
			const r = data[i];
			const g = data[i + 1];
			const b = data[i + 2];
			data[i + 3];
			const d = Math.abs(r - keyR) + Math.abs(g - keyG) + Math.abs(b - keyB);
			if (d <= tol) {
				data[i] = 0;
				data[i + 1] = 0;
				data[i + 2] = 0;
				data[i + 3] = 0;
			}
		}
	}
}
function resizeWithNearestNeighbor(src, srcSize, outSize) {
	const srcW = srcSize.width;
	const srcH = srcSize.height;
	const outW = outSize.width;
	const outH = outSize.height;
	const srcStride = srcW * 4;
	const outStride = outW * 4;
	const out = new Uint8Array(outStride * outH);
	for (let outY = 0; outY < outH; outY++) {
		const srcY = outH <= 1 ? 0 : Math.floor(outY * (srcH - 1) / (outH - 1));
		let iDest = outY * outStride;
		for (let outX = 0; outX < outW; outX++) {
			const srcX = outW <= 1 ? 0 : Math.floor(outX * (srcW - 1) / (outW - 1));
			const iSrc = srcY * srcStride + srcX * 4;
			for (let c = 0; c < 4; c++) out[iDest++] = src[iSrc + c];
		}
	}
	return out;
}
function resizeWithAverage(src, srcSize, outSize) {
	let srcW = srcSize.width;
	let srcH = srcSize.height;
	const outW = outSize.width;
	const outH = outSize.height;
	const srcStride = srcW * 4;
	let preW = outW;
	while (preW * 2 < srcW) preW *= 2;
	const preStride = preW * 4;
	const pre = new Uint8Array(preStride * srcH);
	for (let srcY = 0; srcY < srcH; srcY++) {
		let iDest = srcY * preStride;
		if (preW == srcW) {
			let iSrc = srcY * srcStride;
			for (let i = 0; i < preW * 4; i++) pre[iDest++] = src[iSrc++];
		} else {
			const iSrcOffset = srcY * srcStride;
			for (let destX = 0; destX < preW; destX++, iDest += 4) {
				const srcFracX = destX * (srcW - 1) / (preW - 1);
				let srcIntX = Math.floor(srcFracX);
				let coeff = srcFracX - srcIntX;
				if (srcIntX >= srcW - 1) {
					srcIntX -= 1;
					coeff = 1;
				}
				let iSrc = iSrcOffset + srcIntX * 4;
				blend(src, iSrc, iSrc + 4, pre, iDest, coeff);
			}
		}
	}
	while (preW > outW) {
		preW = Math.round(preW / 2);
		for (let y = 0; y < srcH; y++) {
			let iDest = y * preStride;
			let iSrc = y * preStride;
			for (let x = 0; x < preW; x++, iDest += 4, iSrc += 8) blend(pre, iSrc, iSrc + 4, pre, iDest, .5);
		}
	}
	if (srcH == outH && preStride == outW * 4) return pre;
	let postH = outH;
	while (postH * 2 < srcH) postH *= 2;
	const postStride = outW * 4;
	const post = new Uint8Array(postStride * postH);
	for (let destY = 0; destY < postH; destY++) {
		let iDest = destY * postStride;
		if (postH == srcH) {
			let iSrc = destY * preStride;
			for (let i = 0; i < postStride; i++) post[iDest++] = pre[iSrc++];
		} else {
			const srcFracY = destY * (srcH - 1) / (postH - 1);
			let srcIntY = Math.floor(srcFracY);
			let coeff = srcFracY - srcIntY;
			if (srcIntY >= srcH - 1) {
				srcIntY -= 1;
				coeff = 1;
			}
			let iSrc = srcIntY * preStride;
			for (let destX = 0; destX < outW; destX++, iDest += 4, iSrc += 4) blend(pre, iSrc, iSrc + preStride, post, iDest, coeff);
		}
	}
	while (postH > outH) {
		postH = Math.round(postH / 2);
		for (let y = 0; y < postH; y++) {
			let iDest = y * postStride;
			let iSrc = y * postStride * 2;
			for (let x = 0; x < outW; x++, iDest += 4, iSrc += 4) blend(post, iSrc, iSrc + postStride, post, iDest, .5);
		}
	}
	if (postH == outH) return post;
	else {
		const ret = new Uint8Array(outW * outH * 4);
		for (let i = 0; i < ret.length; i++) ret[i] = post[i];
		return ret;
	}
}
function blend(src, si0, si1, dest, di, coeff1) {
	let coeff0 = 1 - coeff1;
	const a0 = src[si0 + 3];
	const a1 = src[si1 + 3];
	const a = a0 * coeff0 + a1 * coeff1;
	coeff0 *= a0 / 255;
	coeff1 *= a1 / 255;
	if (coeff0 + coeff1 > 0) {
		const norm = 1 / (coeff0 + coeff1);
		coeff0 *= norm;
		coeff1 *= norm;
	}
	for (let c = 0; c < 3; c++) {
		const m = src[si0++] * coeff0 + src[si1++] * coeff1;
		dest[di++] = clip(0, 255, Math.round(m));
	}
	dest[di] = clip(0, 255, Math.round(a));
}
function normalize(data, size, colorSpace) {
	const numPixels = size.width * size.height;
	const img = new NormalizedImage(size.width, size.height, colorSpace);
	for (let i = 0; i < numPixels; i++) {
		switch (colorSpace) {
			case ColorSpace.GRAYSCALE:
				img.color[i] = grayscaleArrayU8(data, i * 4) / 255;
				break;
			case ColorSpace.RGB:
				img.color[i * 3 + 0] = data[i * 4 + 0] / 255;
				img.color[i * 3 + 1] = data[i * 4 + 1] / 255;
				img.color[i * 3 + 2] = data[i * 4 + 2] / 255;
				break;
			default: throw new Error("Invalid color space");
		}
		img.alpha[i] = data[i * 4 + 3] / 255;
	}
	return img;
}

//#endregion
//#region src/main.ts
var TrimState = /* @__PURE__ */ function(TrimState$1) {
	TrimState$1[TrimState$1["IDLE"] = 0] = "IDLE";
	TrimState$1[TrimState$1["DRAG_TOP"] = 1] = "DRAG_TOP";
	TrimState$1[TrimState$1["DRAG_RIGHT"] = 2] = "DRAG_RIGHT";
	TrimState$1[TrimState$1["DRAG_BOTTOM"] = 3] = "DRAG_BOTTOM";
	TrimState$1[TrimState$1["DRAG_LEFT"] = 4] = "DRAG_LEFT";
	return TrimState$1;
}(TrimState || {});
var PlaneUi = class {
	container = document.createElement("div");
	planeTypeBox = makeSelectBox([{
		value: PlaneType.DIRECT,
		label: "直接出力",
		tip: "ピクセルデータをそのまま出力します。"
	}, {
		value: PlaneType.INDEX_MATCH,
		label: "色番号を指定",
		tip: "指定した色番号に一致するピクセルを抽出します。"
	}], PlaneType.DIRECT);
	matchIndexBox = makeTextBox("0", "", 4);
	matchInvertBox = makeCheckBox("反転");
	ul = makeFloatList([
		tip(["種類: ", this.planeTypeBox], "プレーンの種類を指定します。"),
		tip(["色番号: ", this.matchIndexBox], "抽出する色番号を指定します。"),
		tip(["反転: ", this.matchInvertBox], "抽出結果を反転します。")
	]);
	constructor(config) {
		this.config = config;
		this.container.appendChild(this.ul);
		this.planeTypeBox.value = config.planeType.toString();
		this.matchIndexBox.value = config.matchIndex.toString();
		this.matchInvertBox.checked = config.matchInvert;
		this.container.querySelectorAll("input, select").forEach((el) => {
			el.addEventListener("change", () => {
				requestGenerateCode();
			});
			el.addEventListener("input", () => {
				requestGenerateCode();
			});
		});
	}
	dispose() {
		this.container.remove();
	}
};
function makeSampleImageButton(url) {
	const fileName = url.split("/").pop() || DEFAULT_INPUT_FILE_NAME;
	const button = document.createElement("button");
	button.classList.add("sampleImageButton");
	button.style.backgroundImage = `url(${url})`;
	button.addEventListener("click", () => {
		loadFromString(fileName, url);
	});
	button.textContent = "";
	return button;
}
function makePresetButton(id, preset) {
	const button = document.createElement("button");
	button.dataset.presetName = id;
	button.classList.add("presetButton");
	const img = document.createElement("img");
	img.src = `img/preset/${id}.svg`;
	button.appendChild(img);
	button.appendChild(document.createElement("br"));
	button.appendChild(document.createTextNode(preset.label));
	button.title = preset.description;
	button.addEventListener("click", () => loadPreset(preset));
	return button;
}
const dropTarget = document.createElement("div");
dropTarget.classList.add("dropTarget");
dropTarget.innerHTML = "ドロップして読み込む";
document.body.appendChild(dropTarget);
hide(dropTarget);
const fileBrowseButton = makeButton("ファイルを選択");
const hiddenFileBox = document.createElement("input");
hiddenFileBox.type = "file";
hiddenFileBox.accept = "image/*";
hiddenFileBox.style.display = "none";
fileBrowseButton.addEventListener("click", () => {
	hiddenFileBox.click();
});
const pasteTarget = document.createElement("input");
pasteTarget.type = "text";
pasteTarget.style.textAlign = "center";
pasteTarget.style.width = "8em";
pasteTarget.placeholder = "ここに貼り付け";
const fileSection = makeSection(makeFloatList([
	makeHeader("入力画像"),
	"画像をドロップ、",
	makeSpan([pasteTarget, "、"]),
	makeSpan(["または ", fileBrowseButton]),
	makeSpan([
		"（サンプル: ",
		makeSampleImageButton("./img/sample/gradient.png"),
		makeSampleImageButton("./img/sample/forest-path.jpg"),
		makeSampleImageButton("./img/sample/rgb-chan.png"),
		makeSampleImageButton("./img/sample/rgb-chan-tp.png"),
		"）"
	])
], false));
const pPresetButtons = makeParagraph();
for (const id in presets) pPresetButtons.appendChild(makePresetButton(id, presets[id]));
const presetSection = makeSection([makeFloatList([makeHeader("プリセット"), makeNowrap("選んでください: ")]), pPresetButtons]);
const proModeCheckBox = makeCheckBox("上級者向け設定を表示する");
proModeCheckBox.addEventListener("change", onProModeChanged);
function onProModeChanged() {
	const pro$1 = proModeCheckBox.checked;
	history.replaceState(null, "", pro$1 ? "#detail" : "#");
	document.querySelectorAll(".professional").forEach((el) => {
		setVisible(el, pro$1);
		onRelayout();
	});
	document.querySelectorAll(".basic").forEach((el) => {
		setVisible(el, !pro$1);
		onRelayout();
	});
	updateTrimCanvas();
}
const proModeSection = makeSection(makeFloatList([makeHeader("編集モード"), proModeCheckBox.parentElement]));
let origCanvas = document.createElement("canvas");
const resetTrimButton = makeButton("範囲をリセット");
const rotateRightButton = makeButton("90° 回転");
const trimCanvas = document.createElement("canvas");
trimCanvas.style.width = "100%";
trimCanvas.style.height = "400px";
trimCanvas.style.boxSizing = "border-box";
trimCanvas.style.border = "solid 1px #444";
trimCanvas.style.backgroundImage = "url(./img/checker.png)";
const pTrimCanvas = makeParagraph(trimCanvas);
pTrimCanvas.style.textAlign = "center";
const trimSection = makeSection([makeFloatList([
	makeHeader("トリミング"),
	tip(resetTrimButton, "トリミングしていない状態に戻します。"),
	tip(rotateRightButton, "画像を右に 90° 回転します。")
]), pTrimCanvas]);
const alphaModeBox = makeSelectBox([
	{
		value: AlphaMode.KEEP,
		label: "変更しない"
	},
	{
		value: AlphaMode.FILL,
		label: "背景色を指定"
	},
	{
		value: AlphaMode.BINARIZE,
		label: "二値化"
	},
	{
		value: AlphaMode.SET_KEY_COLOR,
		label: "抜き色指定"
	}
], AlphaMode.KEEP);
const backColorBox = makeTextBox("#00F");
const keyColorBox = makeTextBox("#00F");
const keyToleranceBox = makeTextBox("0", "(auto)", 5);
const alphaThreshBox = makeTextBox("128", "(auto)", 5);
const alphaSection = pro(makeSection(makeFloatList([
	makeHeader("透過色"),
	tip(["🏁透過色の扱い: ", alphaModeBox], "入力画像に対する透過色の取り扱いを指定します。"),
	tip(["🎨背景色: ", backColorBox], "画像の透明部分をこの色で塗り潰して不透明化します。"),
	tip(["🔑キーカラー: ", keyColorBox], "透明にしたい色を指定します。"),
	tip(["許容誤差: ", upDown(keyToleranceBox, 0, 255, 1)], "キーカラーからの許容誤差を指定します。"),
	tip(["閾値: ", upDown(alphaThreshBox, 0, 255, 1)], "透明にするかどうかの閾値を指定します。")
])));
const hueBox = makeTextBox("0", "(0)", 4);
const saturationBox = makeTextBox("100", "(100)", 4);
const lightnessBox = makeTextBox("100", "(100)", 4);
const gammaBox = makeTextBox("1", "(auto)", 4);
const brightnessBox = makeTextBox("0", "(auto)", 5);
const contrastBox = makeTextBox("100", "(auto)", 5);
const unsharpBox = makeTextBox("0", "(0)", 4);
const invertBox = makeCheckBox("階調反転");
const colorCorrectSection = makeSection(makeFloatList([
	makeHeader("色調補正"),
	pro(tip([
		"🎨色相: ",
		upDown(hueBox, -360, 360, 5),
		"°"
	], "デフォルトは 0° です。")),
	tip([
		"🌈彩度: ",
		upDown(saturationBox, 0, 200, 5),
		"%"
	], "デフォルトは 100% です。"),
	pro(tip([
		"🌞明度: ",
		upDown(lightnessBox, 0, 200, 5),
		"%"
	], "デフォルトは 100% です。")),
	tip(["γ: ", upDown(gammaBox, .1, 2, .05)], "デフォルトは 1.0 です。\n空欄にすると、輝度 50% を中心にバランスが取れるように自動調整します。"),
	pro(tip(["💡輝度: ", upDown(brightnessBox, -255, 255, 8)], "デフォルトは 0 です。\n空欄にすると、輝度 50% を中心にバランスが取れるように自動調整します。")),
	tip([
		"🌓コントラスト: ",
		upDown(contrastBox, 0, 200, 5),
		"%"
	], "デフォルトは 100% です。\n空欄にすると、階調が失われない範囲でダイナミックレンジが最大となるように自動調整します。"),
	tip([
		"シャープ: ",
		upDown(unsharpBox, 0, 300, 10),
		"%"
	], "デフォルトは 0% です。"),
	pro(tip([invertBox.parentElement], "各チャネルの値を大小反転します。"))
]));
const widthBox = makeTextBox("", "(auto)", 4);
const heightBox = makeTextBox("", "(auto)", 4);
const relaxSizeLimitBox = makeCheckBox("⚠️サイズ制限緩和");
const scalingMethodBox = makeSelectBox([
	{
		value: ScalingMethod.ZOOM,
		label: "ズーム",
		tip: "アスペクト比を維持したまま、出力画像に余白が出ないように画像をズームします。"
	},
	{
		value: ScalingMethod.FIT,
		label: "フィット",
		tip: "アスペクト比を維持したまま、画像全体が出力画像に収まるようにズームします。"
	},
	{
		value: ScalingMethod.STRETCH,
		label: "ストレッチ",
		tip: "アスペクト比を無視して、出力画像に合わせて画像を引き伸ばします。"
	}
], ScalingMethod.ZOOM);
const interpMethodBox = makeSelectBox([{
	value: InterpMethod.NEAREST_NEIGHBOR,
	label: "なし",
	tip: "ニアレストネイバー法で補間します。"
}, {
	value: InterpMethod.AVERAGE,
	label: "高精度",
	tip: "各出力画素に関係する入力画素を全て平均します。"
}], InterpMethod.AVERAGE);
const resizeSection = makeSection(makeFloatList([
	makeHeader("出力サイズ"),
	tip([
		"↕️サイズ: ",
		upDown(widthBox, 1, 1024, 1),
		" x ",
		upDown(heightBox, 1, 1024, 1),
		" px"
	], "片方を空欄にすると他方はアスペクト比に基づいて自動的に決定されます。"),
	tip([relaxSizeLimitBox.parentElement], "出力サイズの制限を緩和します。処理が重くなる可能性があります。"),
	tip(["拡縮方法: ", scalingMethodBox], "トリミングサイズと出力サイズが異なる場合の拡縮方法を指定します。"),
	pro(tip(["補間方法: ", interpMethodBox], "拡縮時の補間方法を指定します。"))
]));
hide(parentLiOf(relaxSizeLimitBox));
const csrModeBox = makeSelectBox([
	{
		value: CsrMode.CLIP,
		label: "切り捨て",
		tip: "変換先の色空間で表現できない色は、最も近い色に丸められます。"
	},
	{
		value: CsrMode.BEND_RGB_SPACE,
		label: "RGB 空間を変形",
		tip: "元の RGB 空間の腹部を曲げて変換先のパレットの重心に寄せます。"
	},
	{
		value: CsrMode.ROTATE_RGB_SPACE,
		label: "RGB 空間を回転",
		tip: "元の RGB 空間全体を回転します。"
	},
	{
		value: CsrMode.GRAYOUT,
		label: "範囲外を灰色にする",
		tip: "新しいパレットで表現できない色は灰色にします。"
	},
	{
		value: CsrMode.FOLD_HUE_CIRCLE,
		label: "色相環を折り畳む",
		tip: "色相環のうち新しいパレットで表現できる範囲外を範囲内へ折り畳みます。"
	},
	{
		value: CsrMode.LANDS_TWO_COLOR_METHOD,
		label: "Land の 2 色法",
		tip: "赤黒電子ペーパー向け。\n緑のチャンネルはグレーに変換し、青のチャンネルは捨てます。\nガンマ低め、コントラストを高め、誤差拡散法の強度 100% にすると良い感じになりやすいです。"
	}
], CsrMode.BEND_RGB_SPACE);
const csrHueToleranceBox = makeTextBox("60", "(60)", 4);
const csrRotateStrengthBox = makeTextBox("100", "(100)", 4);
const csrBendStrengthBox = makeTextBox("100", "(100)", 4);
const csrLandsMethodCoeffBox = makeTextBox("50", "(50)", 4);
const paletteUi = new PaletteUi();
paletteUi.container.style.float = "left";
paletteUi.container.style.width = "calc(100% - 270px)";
const colorSpaceUi = new ColorSpaceUi();
const paletteFloatClear = document.createElement("br");
paletteFloatClear.style.clear = "both";
const paletteSection = makeSection([
	makeFloatList([
		makeHeader("パレット"),
		tip(["色域の縮退: ", csrModeBox], "パレット内の色で表現できない色の扱いを指定します。"),
		tip([
			"許容誤差: ",
			upDown(csrHueToleranceBox, 0, 180, 5),
			"°"
		], "新しい色空間の外側をどこまで空間内に丸めるかを色相の角度で指定します。"),
		tip([
			"強度: ",
			upDown(csrRotateStrengthBox, 0, 300, 10),
			"%"
		], "回転の強度を指定します。"),
		tip([
			"強度: ",
			upDown(csrBendStrengthBox, 0, 300, 10),
			"%"
		], "色空間の曲げの強度を指定します。"),
		tip([
			"赤/灰比: ",
			upDown(csrLandsMethodCoeffBox, 0, 100, 5),
			"%"
		], "Land の 2 色法における赤と灰色の混合比を指定します。。")
	]),
	pro(paletteUi.container),
	pro(colorSpaceUi.container)
]);
const pixelFormatBox = makeSelectBox([
	{
		value: PixelFormat.RGBA8888,
		label: "RGBA8888"
	},
	{
		value: PixelFormat.RGBA4444,
		label: "RGBA4444"
	},
	{
		value: PixelFormat.RGB888,
		label: "RGB888"
	},
	{
		value: PixelFormat.RGB666,
		label: "RGB666"
	},
	{
		value: PixelFormat.RGB565,
		label: "RGB565"
	},
	{
		value: PixelFormat.RGB444,
		label: "RGB444"
	},
	{
		value: PixelFormat.RGB332,
		label: "RGB332"
	},
	{
		value: PixelFormat.RGB111,
		label: "RGB111"
	},
	{
		value: PixelFormat.GRAY4,
		label: "Gray4"
	},
	{
		value: PixelFormat.GRAY2,
		label: "Gray2"
	},
	{
		value: PixelFormat.BW,
		label: "B/W"
	},
	{
		value: PixelFormat.I2_RGB888,
		label: "Index2"
	},
	{
		value: PixelFormat.I4_RGB888,
		label: "Index4"
	},
	{
		value: PixelFormat.I6_RGB888,
		label: "Index6"
	}
], PixelFormat.RGB565);
const colorDitherMethodBox = makeSelectBox([
	{
		value: DitherMethod.NONE,
		label: "なし"
	},
	{
		value: DitherMethod.DIFFUSION,
		label: "誤差拡散"
	},
	{
		value: DitherMethod.PATTERN,
		label: "パターン"
	}
], DitherMethod.NONE);
const colorDitherStrengthBox = makeTextBox("80", `(${DEFAULT_DITHER_STRENGTH * 100})`, 4);
const colorDitherAntiSaturationBox = makeCheckBox("飽和防止処理");
const alphaDitherMethodBox = makeSelectBox([
	{
		value: DitherMethod.NONE,
		label: "なし"
	},
	{
		value: DitherMethod.DIFFUSION,
		label: "誤差拡散"
	},
	{
		value: DitherMethod.PATTERN,
		label: "パターン"
	}
], DitherMethod.NONE);
const alphaDitherStrengthBox = makeTextBox("80", `(${DEFAULT_DITHER_STRENGTH * 100})`, 4);
const diffusionKernelBox = makeSelectBox([
	{
		value: DiffusionKernel.FLOYD_STEINBERG,
		label: "Floyd-Steinberg"
	},
	{
		value: DiffusionKernel.JARVIS_JUDICE_NINKE,
		label: "Jarvis-Judice-Ninke"
	},
	{
		value: DiffusionKernel.STUCKI,
		label: "Stucki"
	},
	{
		value: DiffusionKernel.SIERRA,
		label: "Sierra"
	}
], DiffusionKernel.STUCKI);
const roundMethodBox = makeSelectBox([{
	value: RoundMethod.NEAREST,
	label: "近似値",
	tip: "元の色の輝度値に最も近い色を選択します。"
}, {
	value: RoundMethod.EQUAL_DIVISION,
	label: "均等割り",
	tip: "色の範囲を均等に分割します。"
}], RoundMethod.NEAREST);
const previewCanvas = document.createElement("canvas");
const reductionErrorBox = document.createElement("span");
previewCanvas.style.backgroundImage = "url(./img/checker.png)";
reductionErrorBox.style.color = "red";
hide(previewCanvas);
hide(reductionErrorBox);
const previewCopyButton = makeButton("📄コピー");
previewCopyButton.addEventListener("click", () => {
	previewCanvas.toBlob((blob) => {
		if (!blob) return;
		navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]).then(() => {
			console.log("コピー成功");
		}).catch((err) => {
			console.error("コピー失敗: ", err);
		});
	});
});
const previewSaveButton = makeButton("💾保存");
previewSaveButton.addEventListener("click", () => {
	previewCanvas.toBlob((blob) => {
		if (!blob) return;
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = "reducedImage.png";
		a.click();
		URL.revokeObjectURL(a.href);
	});
});
const previewBlock = makeParagraph([previewCanvas, reductionErrorBox]);
previewBlock.style.height = "400px";
previewBlock.style.background = "#444";
previewBlock.style.border = "solid 1px #444";
previewBlock.style.textAlign = "center";
const previewToolBar = makeDiv([
	previewCopyButton,
	" ",
	previewSaveButton
]);
previewToolBar.style.position = "absolute";
previewToolBar.style.top = "0px";
previewToolBar.style.right = "10px";
const previewContainer = makeDiv([previewBlock, previewToolBar]);
previewContainer.style.position = "relative";
const colorReductionSection = makeSection([makeFloatList([
	makeHeader("減色"),
	pro(tip(["フォーマット: ", pixelFormatBox], "ピクセルフォーマットを指定します。")),
	pro(tip(["丸め方法: ", roundMethodBox], "パレットから色を選択する際の戦略を指定します。\nディザリングを行う場合はあまり関係ありません。")),
	tip(["ディザ: ", colorDitherMethodBox], "あえてノイズを加えることでできるだけ元画像の色を再現します。"),
	tip([
		"強度: ",
		upDown(colorDitherStrengthBox, 0, 100, 5),
		"%"
	], "ディザリングの強度を指定します。"),
	tip([colorDitherAntiSaturationBox.parentElement], "パレットの色域が狭い場合に誤差拡散の品質を向上します。\n大きな画像や色数の多いパレットでは非常に重くなることがあります。"),
	pro(tip(["透明度のディザ: ", alphaDitherMethodBox], "あえてノイズを加えることでできるだけ元画像の透明度を再現します。")),
	pro(tip([
		"強度: ",
		upDown(alphaDitherStrengthBox, 0, 100, 5),
		"%"
	], "透明度に対するディザリングの強度を指定します。")),
	pro(tip(["方式: ", diffusionKernelBox], "誤差拡散の方式を指定します。"))
]), previewContainer]);
const channelOrderBox = makeSelectBox([
	{
		value: ChannelOrder.RGBA,
		label: "RGBA"
	},
	{
		value: ChannelOrder.BGRA,
		label: "BGRA"
	},
	{
		value: ChannelOrder.ARGB,
		label: "ARGB"
	},
	{
		value: ChannelOrder.ABGR,
		label: "ABGR"
	}
], ChannelOrder.RGBA);
const farPixelFirstBox = makeSelectBox([{
	value: 1,
	label: "上位から"
}, {
	value: 0,
	label: "下位から"
}], 1);
const bigEndianBox = makeCheckBox("ビッグエンディアン");
const packUnitBox = makeSelectBox([
	{
		value: PackUnit.UNPACKED,
		label: "アンパックド"
	},
	{
		value: PackUnit.PIXEL,
		label: "1 ピクセル"
	},
	{
		value: PackUnit.ALIGNMENT,
		label: "アライメント境界"
	}
], PackUnit.PIXEL);
const vertPackBox = makeCheckBox("縦パッキング");
const alignBoundaryBox = makeSelectBox([
	{
		value: AlignBoundary.NIBBLE,
		label: "ニブル"
	},
	{
		value: AlignBoundary.BYTE_1,
		label: "1 バイト"
	},
	{
		value: AlignBoundary.BYTE_2,
		label: "2 バイト"
	},
	{
		value: AlignBoundary.BYTE_3,
		label: "3 バイト"
	},
	{
		value: AlignBoundary.BYTE_4,
		label: "4 バイト"
	}
], AlignBoundary.BYTE_1);
const leftAlignBox = makeCheckBox("左詰め");
const vertAddrBox = makeCheckBox("垂直スキャン");
const planeSelectBox = makeSelectBox([{
	value: 0,
	label: "プレーン0"
}], 0);
const planeGroupBody = makeGroupBody();
const planeGroupBox = makeGroup([makeGroupTitle([planeSelectBox]), planeGroupBody]);
planeSelectBox.addEventListener("change", onSelectedPlaneChanged);
const structCanvas = document.createElement("canvas");
structCanvas.style.maxWidth = "100%";
const structErrorBox = makeParagraph();
structErrorBox.style.textAlign = "center";
structErrorBox.style.color = "red";
hide(structErrorBox);
const pStructCanvas = makeParagraph([structCanvas, structErrorBox]);
pStructCanvas.style.textAlign = "center";
const encodeSection = makeSection([
	makeFloatList([
		makeHeader("エンコード"),
		basic(makeSpan("この構造で生成されます:")),
		pro(tip(["パッキング単位: ", packUnitBox], "パッキングの単位を指定します。")),
		pro(tip([vertPackBox.parentElement], "複数ピクセルをパッキングする場合に、縦方向にパッキングします。\nSSD1306/1309 などの一部の白黒ディスプレイに\n直接転送可能なデータを生成する場合はチェックします。")),
		pro(tip([vertAddrBox.parentElement], "アドレスを縦方向にインクリメントする場合にチェックします。")),
		pro(tip(["チャネル順: ", channelOrderBox], "RGB のチャネルを並べる順序を指定します。")),
		pro(tip(["ピクセル順: ", farPixelFirstBox], "バイト内のピクセルの順序を指定します。")),
		pro(tip(["アライメント境界: ", alignBoundaryBox], "アライメントの境界を指定します。")),
		pro(tip([leftAlignBox.parentElement], "フィールドをアライメント境界内で左詰めします。")),
		pro(tip([bigEndianBox.parentElement], "ピクセル内のバイトの順序を指定します。"))
	]),
	pro(planeGroupBox),
	pStructCanvas
]);
const codeFormatBox = makeSelectBox([{
	value: CodeFormat.C_ARRAY,
	label: "C/C++ 配列"
}, {
	value: CodeFormat.RAW_BINARY,
	label: "生バイナリ"
}], CodeFormat.C_ARRAY);
const codeUnitBox = makeSelectBox([
	{
		value: CodeUnit.FILE,
		label: "ファイル全体"
	},
	{
		value: CodeUnit.ARRAY_DEF,
		label: "配列定義"
	},
	{
		value: CodeUnit.ELEMENTS,
		label: "要素のみ"
	}
], CodeUnit.FILE);
const codeColsBox = makeSelectBox([
	{
		value: 8,
		label: "8"
	},
	{
		value: 16,
		label: "16"
	},
	{
		value: 32,
		label: "32"
	}
], 16);
const indentBox = makeSelectBox([
	{
		value: Indent.SPACE_X2,
		label: "スペース x2"
	},
	{
		value: Indent.SPACE_X4,
		label: "スペース x4"
	},
	{
		value: Indent.TAB,
		label: "タブ"
	}
], Indent.SPACE_X2);
const codePlaneContainer = document.createElement("div");
const showCodeLink = document.createElement("a");
showCodeLink.href = "#";
showCodeLink.textContent = "表示する";
const codeErrorBox = makeParagraph();
codeErrorBox.style.textAlign = "center";
codeErrorBox.style.color = "red";
hide(codeErrorBox);
const codeGenSection = makeSection([
	makeFloatList([
		makeHeader("コード生成"),
		tip(["形式: ", codeFormatBox], "生成するコードの形式を指定します。"),
		tip(["生成範囲: ", codeUnitBox], "生成するコードの範囲を指定します。"),
		tip(["列数: ", codeColsBox], "1 行に詰め込む要素数を指定します。"),
		tip(["インデント: ", indentBox], "インデントの形式とサイズを指定します。")
	]),
	codePlaneContainer,
	codeErrorBox
]);
let container;
let updateTrimCanvasTimeoutId = -1;
let quantizeTimeoutId = -1;
let generateCodeTimeoutId = -1;
let worldX0 = 0, worldY0 = 0, zoom = 1;
let trimL = 0, trimT = 0, trimR = 1, trimB = 1;
let trimUiState = TrimState.IDLE;
let normImageCache = null;
let reducedImage = null;
let trimCanvasWidth = 800;
let trimCanvasHeight = 400;
let previewCanvasWidth = 800;
let previewCanvasHeight = 400;
let planeUis = {};
let keepShowLongCode = false;
const DEFAULT_INPUT_FILE_NAME = "imageArray";
let inputFileName = DEFAULT_INPUT_FILE_NAME;
async function onLoad() {
	container = document.querySelector("#arrayfyContainer");
	container.appendChild(proModeSection);
	container.appendChild(fileSection);
	container.appendChild(presetSection);
	container.appendChild(trimSection);
	container.appendChild(resizeSection);
	container.appendChild(alphaSection);
	container.appendChild(colorCorrectSection);
	container.appendChild(paletteSection);
	container.appendChild(colorReductionSection);
	container.appendChild(encodeSection);
	container.appendChild(codeGenSection);
	alphaModeBox.addEventListener("change", onAlphaProcChanged);
	onAlphaProcChanged();
	const resizeSections = [
		trimSection,
		resizeSection,
		alphaSection
	];
	for (const section of resizeSections) section.querySelectorAll("input, select").forEach((el) => {
		el.addEventListener("change", () => {
			requestTrimResize();
		});
		el.addEventListener("input", () => {
			requestTrimResize();
		});
	});
	pixelFormatBox.addEventListener("change", () => {
		const fmt = new PixelFormatInfo(parseInt(pixelFormatBox.value));
		if (fmt.isIndexed) paletteUi.setSize(1 << fmt.indexBits);
		paletteUi.setVisible(fmt.isIndexed);
		requestTrimResize();
	});
	const colorReductionSections = [
		colorCorrectSection,
		paletteSection,
		colorReductionSection
	];
	for (const section of colorReductionSections) section.querySelectorAll("input, select").forEach((el) => {
		el.addEventListener("change", () => {
			requestColorReduction();
		});
		el.addEventListener("input", () => {
			requestColorReduction();
		});
	});
	const codeGenSections = [encodeSection, codeGenSection];
	for (const section of codeGenSections) section.querySelectorAll("input, select").forEach((el) => {
		el.addEventListener("change", () => {
			requestGenerateCode();
		});
		el.addEventListener("input", () => {
			requestGenerateCode();
		});
	});
	hiddenFileBox.addEventListener("change", async (e) => {
		const input = e.target;
		if (input.files && input.files[0]) await loadFromFile(input.files[0].name, input.files[0]);
	});
	document.body.addEventListener("dragover", (e) => {
		if (!e.dataTransfer) return;
		const items = e.dataTransfer.items;
		for (const item of items) if (item.kind === "file") {
			e.preventDefault();
			e.stopPropagation();
			show(dropTarget);
			break;
		}
	});
	dropTarget.addEventListener("dragleave", (e) => {
		e.preventDefault();
		e.stopPropagation();
		hide(dropTarget);
	});
	dropTarget.addEventListener("drop", async (e) => {
		if (!e.dataTransfer) return;
		hide(dropTarget);
		const items = e.dataTransfer.items;
		for (const item of items) if (item.kind === "file") {
			e.preventDefault();
			e.stopPropagation();
			const file = item.getAsFile();
			await loadFromFile(file.name, file);
			break;
		}
	});
	pasteTarget.addEventListener("paste", async (e) => {
		if (!e.clipboardData) return;
		const items = e.clipboardData.items;
		for (const item of items) if (item.kind === "file") {
			e.preventDefault();
			e.stopPropagation();
			const file = item.getAsFile();
			await loadFromFile(file.name, file);
			break;
		}
	});
	pasteTarget.addEventListener("input", (e) => {
		e.preventDefault();
		e.stopPropagation();
		pasteTarget.value = "";
	});
	pasteTarget.addEventListener("change", (e) => {
		e.preventDefault();
		e.stopPropagation();
		pasteTarget.value = "";
	});
	trimCanvas.addEventListener("pointermove", (e) => {
		e.preventDefault();
		if (trimUiState == TrimState.IDLE) switch (trimViewToNextState(e.offsetX, e.offsetY)) {
			case TrimState.DRAG_LEFT:
				trimCanvas.style.cursor = "w-resize";
				break;
			case TrimState.DRAG_TOP:
				trimCanvas.style.cursor = "n-resize";
				break;
			case TrimState.DRAG_RIGHT:
				trimCanvas.style.cursor = "e-resize";
				break;
			case TrimState.DRAG_BOTTOM:
				trimCanvas.style.cursor = "s-resize";
				break;
			default:
				trimCanvas.style.cursor = "default";
				break;
		}
		else {
			let { x, y } = trimViewToWorld(e.offsetX, e.offsetY);
			x = Math.round(x);
			y = Math.round(y);
			switch (trimUiState) {
				case TrimState.DRAG_LEFT:
					setTrimRect(Math.min(x, trimR - 1), trimT, trimR, trimB);
					break;
				case TrimState.DRAG_TOP:
					setTrimRect(trimL, Math.min(y, trimB - 1), trimR, trimB);
					break;
				case TrimState.DRAG_RIGHT:
					setTrimRect(trimL, trimT, Math.max(x, trimL + 1), trimB);
					break;
				case TrimState.DRAG_BOTTOM:
					setTrimRect(trimL, trimT, trimR, Math.max(y, trimT + 1));
					break;
			}
			requestUpdateTrimCanvas();
			requestColorReduction();
		}
	});
	trimCanvas.addEventListener("pointerdown", (e) => {
		e.preventDefault();
		if (trimViewToNextState(e.offsetX, e.offsetY) != TrimState.IDLE) {
			trimUiState = trimViewToNextState(e.offsetX, e.offsetY);
			trimCanvas.style.cursor = "grabbing";
			trimCanvas.setPointerCapture(e.pointerId);
		}
	});
	trimCanvas.addEventListener("pointerup", (e) => {
		e.preventDefault();
		trimUiState = TrimState.IDLE;
		trimCanvas.style.cursor = "default";
		trimCanvas.releasePointerCapture(e.pointerId);
		setTrimRect(trimL, trimT, trimR, trimB, true);
	});
	trimCanvas.addEventListener("touchstart", (e) => {
		e.preventDefault();
	});
	trimCanvas.addEventListener("touchmove", (e) => {
		e.preventDefault();
	});
	trimCanvas.addEventListener("touchend", (e) => {
		e.preventDefault();
	});
	resetTrimButton.addEventListener("click", () => {
		resetTrim();
	});
	rotateRightButton.addEventListener("click", () => {
		rotate();
	});
	proModeCheckBox.checked = window.location.hash === "#detail";
	onProModeChanged();
	loadPreset(presets.rgb565_be);
	await loadFromString("gradient", "./img/sample/gradient.png");
	window.requestAnimationFrame(() => onRelayout());
}
function onAlphaProcChanged() {
	hide(parentLiOf(backColorBox));
	hide(parentLiOf(keyColorBox));
	hide(parentLiOf(keyToleranceBox));
	hide(parentLiOf(alphaThreshBox));
	const alphaProc = parseInt(alphaModeBox.value);
	switch (alphaProc) {
		case AlphaMode.FILL:
			show(parentLiOf(backColorBox));
			break;
		case AlphaMode.SET_KEY_COLOR:
			show(parentLiOf(keyColorBox));
			show(parentLiOf(keyToleranceBox));
			break;
		case AlphaMode.BINARIZE:
			show(parentLiOf(alphaThreshBox));
			break;
	}
}
async function loadFromFile(name, file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = async (e) => {
			if (e.target && typeof e.target.result === "string") await loadFromString(name, e.target.result);
			else throw new Error("Invalid image data");
			resolve();
		};
		reader.onerror = (e) => {
			reject(/* @__PURE__ */ new Error("Failed to read file"));
		};
		reader.readAsDataURL(file);
	});
}
async function loadFromString(fileName, blobStr) {
	inputFileName = DEFAULT_INPUT_FILE_NAME;
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => {
			inputFileName = fileName;
			origCanvas.width = img.width;
			origCanvas.height = img.height;
			const ctx = origCanvas.getContext("2d", { willReadFrequently: true });
			if (!ctx) {
				reject(/* @__PURE__ */ new Error("Failed to get canvas context"));
				return;
			}
			ctx.clearRect(0, 0, img.width, img.height);
			ctx.drawImage(img, 0, 0);
			keepShowLongCode = false;
			resetTrim(true);
			requestTrimResize();
			resolve();
		};
		img.onerror = () => {
			reject(/* @__PURE__ */ new Error("Failed to load image"));
		};
		img.src = blobStr;
	});
}
function resetTrim(forceUpdate = false) {
	setTrimRect(0, 0, origCanvas.width, origCanvas.height, forceUpdate);
}
function rotate() {
	const newTrimL = origCanvas.height - trimB;
	const newTrimT = trimL;
	const newTrimR = origCanvas.height - trimT;
	const newTrimB = trimR;
	setTrimRect(newTrimL, newTrimT, newTrimR, newTrimB, true);
	const tmpCanvas = document.createElement("canvas");
	tmpCanvas.width = origCanvas.height;
	tmpCanvas.height = origCanvas.width;
	const tmpCtx = tmpCanvas.getContext("2d", { willReadFrequently: true });
	if (!tmpCtx) throw new Error("Failed to get canvas context");
	tmpCtx.imageSmoothingEnabled = false;
	tmpCtx.clearRect(0, 0, tmpCanvas.width, tmpCanvas.height);
	tmpCtx.translate(tmpCanvas.width / 2, tmpCanvas.height / 2);
	tmpCtx.rotate(Math.PI / 2);
	tmpCtx.drawImage(origCanvas, -origCanvas.width / 2, -origCanvas.height / 2);
	origCanvas = tmpCanvas;
	requestUpdateTrimCanvas();
	requestColorReduction();
}
function getTrimViewArea() {
	const margin = 20;
	const canvasW = trimCanvas.width;
	const canvasH = trimCanvas.height;
	const viewX0 = canvasW / 2;
	const viewY0 = canvasH / 2;
	const viewW = canvasW - margin * 2;
	const viewH = canvasH - margin * 2;
	return {
		x: viewX0,
		y: viewY0,
		width: viewW,
		height: viewH
	};
}
function trimWorldToView(x, y) {
	const view = getTrimViewArea();
	return {
		x: view.x + (x - worldX0) * zoom,
		y: view.y + (y - worldY0) * zoom
	};
}
function trimViewToWorld(x, y) {
	const view = getTrimViewArea();
	return {
		x: (x - view.x) / zoom + worldX0,
		y: (y - view.y) / zoom + worldY0
	};
}
function trimViewToNextState(x, y) {
	const { x: trimViewL, y: trimViewT } = trimWorldToView(trimL, trimT);
	const { x: trimViewR, y: trimViewB } = trimWorldToView(trimR, trimB);
	if (Math.abs(x - trimViewL) < 10) return TrimState.DRAG_LEFT;
	if (Math.abs(x - trimViewR) < 10) return TrimState.DRAG_RIGHT;
	if (Math.abs(y - trimViewT) < 10) return TrimState.DRAG_TOP;
	if (Math.abs(y - trimViewB) < 10) return TrimState.DRAG_BOTTOM;
	return TrimState.IDLE;
}
function setTrimRect(l, t, r, b, forceUpdate = false) {
	const changed = l != trimL || t != trimT || r != trimR || b != trimB;
	if (!changed && !forceUpdate) return;
	trimL = l;
	trimT = t;
	trimR = r;
	trimB = b;
	requestTrimResize();
}
function requestUpdateTrimCanvas() {
	if (updateTrimCanvasTimeoutId >= 0) return;
	updateTrimCanvasTimeoutId = setTimeout(() => {
		updateTrimCanvas();
	}, 10);
}
function updateTrimCanvas() {
	if (updateTrimCanvasTimeoutId >= 0) {
		clearTimeout(updateTrimCanvasTimeoutId);
		updateTrimCanvasTimeoutId = -1;
	}
	trimCanvas.width = trimCanvasWidth - 2;
	trimCanvas.height = trimCanvasHeight - 2;
	const canvasW = trimCanvas.width;
	const canvasH = trimCanvas.height;
	const view = getTrimViewArea();
	if (trimUiState == TrimState.IDLE) {
		const worldL = trimL;
		const worldR = trimR;
		const worldT = trimT;
		const worldB = trimB;
		const worldW = worldR - worldL;
		const worldH = worldB - worldT;
		worldX0 = (worldL + worldR) / 2;
		worldY0 = (worldT + worldB) / 2;
		const worldAspect = worldW / Math.max(1, worldH);
		const viewAspect = view.width / Math.max(1, view.height);
		if (worldAspect > viewAspect) zoom = view.width / Math.max(1, worldW);
		else zoom = view.height / Math.max(1, worldH);
	}
	const { x: trimViewL, y: trimViewT } = trimWorldToView(trimL, trimT);
	const { x: trimViewR, y: trimViewB } = trimWorldToView(trimR, trimB);
	const ctx = trimCanvas.getContext("2d", { willReadFrequently: true });
	if (!ctx) throw new Error("Failed to get canvas context");
	ctx.clearRect(0, 0, canvasW, canvasH);
	{
		const dx = view.x - worldX0 * zoom;
		const dy = view.y - worldY0 * zoom;
		const dw = origCanvas.width * zoom;
		const dh = origCanvas.height * zoom;
		ctx.imageSmoothingEnabled = zoom < 3;
		ctx.drawImage(origCanvas, dx, dy, dw, dh);
		ctx.imageSmoothingEnabled = true;
	}
	{
		const lineWidth = 2;
		ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
		ctx.fillRect(trimViewL - lineWidth - 2, 0, lineWidth + 4, canvasH);
		ctx.fillRect(0, trimViewT - lineWidth - 2, canvasW, lineWidth + 4);
		ctx.fillRect(trimViewR - 2, 0, lineWidth + 4, canvasH);
		ctx.fillRect(0, trimViewB - 2, canvasW, lineWidth + 4);
		ctx.fillStyle = "#FFF";
		ctx.fillRect(trimViewL - lineWidth, 0, lineWidth, canvasH);
		ctx.fillRect(0, trimViewT - lineWidth, canvasW, lineWidth);
		ctx.fillRect(trimViewR, 0, lineWidth, canvasH);
		ctx.fillRect(0, trimViewB, canvasW, lineWidth);
	}
}
function loadPreset(preset) {
	const fmt = new PixelFormatInfo(preset.format);
	pixelFormatBox.value = preset.format.toString();
	channelOrderBox.value = preset.channelOrder.toString();
	farPixelFirstBox.value = preset.farPixelFirst ? "1" : "0";
	bigEndianBox.checked = preset.bigEndian;
	packUnitBox.value = preset.packUnit.toString();
	vertPackBox.checked = preset.vertPack;
	alignBoundaryBox.value = preset.alignBoundary.toString();
	leftAlignBox.checked = preset.alignLeft;
	vertAddrBox.checked = preset.vertAddr;
	if (fmt.isIndexed) {
		paletteUi.setSize(1 << fmt.indexBits);
		paletteUi.clear();
		if (preset.palette) {
			for (let i = 0; i < 256; i++) if (i < preset.palette.length) paletteUi.setEntry(i, {
				color: preset.palette[i],
				enabled: true
			});
		}
		paletteUi.setVisible(true);
	} else {
		paletteUi.setSize(0);
		paletteUi.setVisible(false);
	}
	for (const [key, value] of Object.entries(planeUis)) value.dispose();
	planeUis = {};
	planeSelectBox.innerHTML = "";
	for (const planeCfg of preset.planeCfgs) {
		const planeUi = new PlaneUi(planeCfg);
		planeUis[planeCfg.id] = planeUi;
		hide(planeUi.container);
		planeGroupBody.appendChild(planeUi.container);
		const option = document.createElement("option");
		option.value = planeCfg.id;
		option.textContent = planeCfg.id + " プレーン";
		planeSelectBox.appendChild(option);
	}
	planeSelectBox.firstChild.selected = true;
	onSelectedPlaneChanged();
	requestTrimResize();
}
function onSelectedPlaneChanged() {
	for (const [key, value] of Object.entries(planeUis)) setVisible(value.container, key === planeSelectBox.value);
}
function requestTrimResize() {
	normImageCache = null;
	requestUpdateTrimCanvas();
	requestColorReduction();
}
function requestColorReduction() {
	if (quantizeTimeoutId >= 0) return;
	quantizeTimeoutId = setTimeout(() => {
		reduceColor();
	}, 100);
}
function reduceColor() {
	reducedImage = null;
	if (quantizeTimeoutId >= 0) {
		clearTimeout(quantizeTimeoutId);
		quantizeTimeoutId = -1;
	}
	const swDetail = new StopWatch(false);
	const quickPreview = trimUiState != TrimState.IDLE;
	try {
		let outW = -1, outH = -1;
		let norm;
		const fmt = new PixelFormatInfo(parseInt(pixelFormatBox.value));
		let roundMethod = RoundMethod.NEAREST;
		{
			let maxChannelDepth = 0;
			for (const depth of fmt.colorBits) if (depth > maxChannelDepth) maxChannelDepth = depth;
			if (maxChannelDepth > 1 && !fmt.isIndexed) {
				show(parentLiOf(roundMethodBox));
				roundMethod = parseInt(roundMethodBox.value);
			} else hide(parentLiOf(roundMethodBox));
		}
		let palette;
		if (fmt.isIndexed) palette = paletteUi.getPalette(fmt);
		else palette = new FixedPalette(fmt.colorBits, roundMethod);
		try {
			colorSpaceUi.setPalette(palette);
		} catch (e) {}
		const srcW = origCanvas.width;
		const srcH = origCanvas.height;
		const trimW = Math.round(trimR - trimL);
		const trimH = Math.round(trimB - trimT);
		outW = trimW;
		outH = trimH;
		{
			let aspectChanged = false;
			if (widthBox.value && heightBox.value) {
				outW = parseInt(widthBox.value);
				outH = parseInt(heightBox.value);
				aspectChanged = true;
			} else if (widthBox.value) {
				outW = parseInt(widthBox.value);
				outH = Math.max(1, Math.round(trimH * (outW / trimW)));
			} else if (heightBox.value) {
				outH = parseInt(heightBox.value);
				outW = Math.max(1, Math.round(trimW * (outH / trimH)));
			} else {
				const MAX_SIZE = 512;
				if (outW > MAX_SIZE || outH > MAX_SIZE) {
					const scale = Math.min(MAX_SIZE / outW, MAX_SIZE / outH);
					outW = Math.floor(outW * scale);
					outH = Math.floor(outH * scale);
				}
			}
			const resizing = outW != trimW || outH != trimH;
			setVisible(parentLiOf(scalingMethodBox), resizing && aspectChanged);
			setVisible(parentLiOf(interpMethodBox), resizing);
			widthBox.placeholder = "(" + outW + ")";
			heightBox.placeholder = "(" + outH + ")";
			if (outW < 1 || outH < 1) throw new Error("サイズは正の値で指定してください");
			if (relaxSizeLimitBox.checked) {
				if (outW * outH > 2048 * 2048) throw new Error("出力サイズが大きすぎます。");
			} else if (outW * outH > 1024 * 1024) {
				show(parentLiOf(relaxSizeLimitBox));
				throw new Error("出力サイズが大きすぎます。処理が重くなることを承知で制限を緩和するには「サイズ制限緩和」にチェックしてください。");
			}
		}
		if (normImageCache == null || normImageCache.width != outW || normImageCache.height != outH) {
			let args = new ResizeArgs();
			args.colorSpace = fmt.colorSpace;
			args.srcSize.width = srcW;
			args.srcSize.height = srcH;
			{
				const origCtx = origCanvas.getContext("2d", { willReadFrequently: true });
				if (!origCtx) throw new Error("Failed to get canvas context");
				const origImageData = origCtx.getImageData(0, 0, srcW, srcH);
				const origData = new Uint8Array(srcW * srcH * 4);
				for (let i = 0; i < origImageData.data.length; i++) origData[i] = origImageData.data[i];
				args.srcData = origData;
			}
			args.scalingMethod = parseInt(scalingMethodBox.value);
			if (quickPreview) args.interpMethod = InterpMethod.NEAREST_NEIGHBOR;
			else args.interpMethod = parseInt(interpMethodBox.value);
			args.trimRect.x = trimL;
			args.trimRect.y = trimT;
			args.trimRect.width = trimW;
			args.trimRect.height = trimH;
			args.outSize.width = outW;
			args.outSize.height = outH;
			args.applyKeyColor = parseInt(alphaModeBox.value) == AlphaMode.SET_KEY_COLOR;
			if (keyColorBox.value) args.keyColor = strToU32(keyColorBox.value);
			if (keyToleranceBox.value) args.keyTolerance = parseInt(keyToleranceBox.value);
			resize(args);
			normImageCache = args.out;
		}
		const samplePixels = normImageCache.collectCharacteristicColors(32);
		{
			let args = new PreProcArgs();
			args.src = normImageCache;
			args.alphaProc = parseInt(alphaModeBox.value);
			args.alphaThresh = parseInt(alphaThreshBox.value);
			if (backColorBox.value) args.backColor = strToU32(backColorBox.value);
			if (hueBox.value && fmt.numColorChannels > 1) args.hue = parseFloat(hueBox.value) / 360;
			if (saturationBox.value && fmt.numColorChannels > 1) args.saturation = parseFloat(saturationBox.value) / 100;
			if (lightnessBox.value) args.lightness = parseFloat(lightnessBox.value) / 100;
			if (gammaBox.value) {
				args.gamma.automatic = false;
				args.gamma.value = parseFloat(gammaBox.value);
			}
			if (brightnessBox.value) {
				args.brightness.automatic = false;
				args.brightness.value = parseFloat(brightnessBox.value) / 255;
			}
			if (contrastBox.value) {
				args.contrast.automatic = false;
				args.contrast.value = parseFloat(contrastBox.value) / 100;
			}
			if (unsharpBox.value) args.unsharp = parseFloat(unsharpBox.value) / 100;
			args.invert = invertBox.checked;
			setVisible(paletteSection, fmt.isIndexed);
			if (fmt.isIndexed) {
				args.csrMode = parseInt(csrModeBox.value);
				args.csrHslRange = palette.getHslRange();
				setVisible(parentLiOf(csrHueToleranceBox), args.csrMode == CsrMode.GRAYOUT);
				const csrRotateMode = args.csrMode == CsrMode.ROTATE_RGB_SPACE;
				const csrBendMode = args.csrMode == CsrMode.BEND_RGB_SPACE;
				const csrLandsMethodMode = args.csrMode == CsrMode.LANDS_TWO_COLOR_METHOD;
				setVisible(parentLiOf(csrRotateStrengthBox), csrRotateMode);
				setVisible(parentLiOf(csrBendStrengthBox), csrBendMode);
				setVisible(parentLiOf(csrLandsMethodCoeffBox), csrLandsMethodMode);
				if (args.csrMode == CsrMode.GRAYOUT) args.csrHueTolerance = parseFloat(csrHueToleranceBox.value) / 360;
				else if (args.csrMode == CsrMode.ROTATE_RGB_SPACE) {
					let srcWeight = new Vec3(.5, .5, .5);
					const dstWeight = new Vec3(palette.convexHull.areaWeight.x, palette.convexHull.areaWeight.y, palette.convexHull.areaWeight.z);
					let { axis, angle } = srcWeight.angleAndAxisTo(dstWeight);
					if (csrRotateStrengthBox.value) angle *= parseFloat(csrRotateStrengthBox.value) / 100;
					const m = new Mat43();
					m.rotate(axis, angle);
					args.csrTransformMatrix = m;
				} else if (args.csrMode == CsrMode.BEND_RGB_SPACE) {
					let { x, y, z } = palette.convexHull.areaWeight;
					const mid = (x + y + z) / 3;
					x -= mid;
					y -= mid;
					z -= mid;
					args.csrBendVector = new Vec3(x, y, z);
					if (csrBendStrengthBox.value) args.csrBendStrength = clip(0, 3, parseFloat(csrBendStrengthBox.value) / 100);
				} else if (args.csrMode == CsrMode.LANDS_TWO_COLOR_METHOD) {
					if (csrLandsMethodCoeffBox.value) args.csrLandsMethodCoeff = clip(0, 1, parseFloat(csrLandsMethodCoeffBox.value) / 100);
				}
			} else {
				args.csrMode = CsrMode.CLIP;
				hide(parentLiOf(csrHueToleranceBox));
			}
			setVisible(parentLiOf(hueBox), fmt.numColorChannels > 1);
			setVisible(parentLiOf(saturationBox), fmt.numColorChannels > 1);
			process(args);
			norm = args.out;
			gammaBox.placeholder = `(${args.gamma.value.toFixed(2)})`;
			brightnessBox.placeholder = `(${Math.round(args.brightness.value * 255)})`;
			contrastBox.placeholder = `(${Math.round(args.contrast.value * 100)})`;
		}
		const sampleColors = [];
		for (const sp of samplePixels) {
			const idx = (sp.pos.y * norm.width + sp.pos.x) * norm.numColorChannels;
			sampleColors.push(new Vec3(norm.color[idx + 0], norm.color[idx + 1], norm.color[idx + 2]));
		}
		colorSpaceUi.setSampleColors(sampleColors);
		{
			const numPixels = outW * outH;
			let minColBits = 999;
			for (const bits of fmt.colorBits) if (bits < minColBits) minColBits = bits;
			const colReduce = minColBits < 8 || fmt.isIndexed;
			const alpReduce = fmt.hasAlpha && fmt.alphaBits < 8;
			const colDither = colReduce ? parseInt(colorDitherMethodBox.value) : DitherMethod.NONE;
			const alpDither = alpReduce ? parseInt(alphaDitherMethodBox.value) : DitherMethod.NONE;
			setVisible(parentLiOf(colorDitherMethodBox), colReduce);
			setVisible(parentLiOf(alphaDitherMethodBox), alpReduce);
			setVisible(parentLiOf(colorDitherStrengthBox), colDither != DitherMethod.NONE);
			setVisible(parentLiOf(colorDitherAntiSaturationBox), colDither == DitherMethod.DIFFUSION && fmt.isIndexed);
			setVisible(parentLiOf(alphaDitherStrengthBox), alpDither != DitherMethod.NONE);
			setVisible(parentLiOf(diffusionKernelBox), colDither == DitherMethod.DIFFUSION);
			const args = new ReduceArgs();
			args.src = norm;
			args.format = fmt;
			args.palette = palette;
			args.colorDitherMethod = colDither;
			if (colorDitherStrengthBox.value) args.colorDitherStrength = parseFloat(colorDitherStrengthBox.value) / 100;
			if (!quickPreview) args.colorDitherAntiSaturation = colorDitherAntiSaturationBox.checked;
			args.alphaDitherMethod = alpDither;
			if (alphaDitherStrengthBox.value) args.alphaDitherStrength = parseFloat(alphaDitherStrengthBox.value) / 100;
			args.diffusionKernel = parseInt(diffusionKernelBox.value);
			reduce(args);
			reducedImage = args.output;
			swDetail.lap("Quantization");
			{
				const previewData = new Uint8Array(numPixels * 4);
				reducedImage.getPreviewImage(previewData);
				previewCanvas.width = outW;
				previewCanvas.height = outH;
				const ctx = previewCanvas.getContext("2d", { willReadFrequently: true });
				if (!ctx) throw new Error("Failed to get canvas context");
				const previewImageData = ctx.getImageData(0, 0, outW, outH);
				previewImageData.data.set(previewData);
				ctx.putImageData(previewImageData, 0, 0);
			}
			show(previewCanvas);
			hide(reductionErrorBox);
			swDetail.lap("Update Preview");
			generateCode();
			swDetail.lap("Entire Code Generation");
		}
		{
			const borderWidth = 1;
			const viewW = previewCanvasWidth - borderWidth * 2;
			const viewH = previewCanvasHeight - borderWidth * 2;
			let zoom$1 = Math.min(viewW / outW, viewH / outH);
			if (zoom$1 >= 1) zoom$1 = Math.max(1, Math.floor(zoom$1));
			const canvasW = Math.round(outW * zoom$1);
			const canvasH = Math.round(outH * zoom$1);
			previewCanvas.style.width = `${canvasW}px`;
			previewCanvas.style.height = `${canvasH}px`;
			previewCanvas.style.marginTop = `${Math.floor((viewH - canvasH) / 2)}px`;
			previewCanvas.style.imageRendering = zoom$1 < 1 ? "auto" : "pixelated";
		}
		swDetail.lap("Fix Preview Size");
	} catch (error) {
		hide(previewCanvas);
		hide(codePlaneContainer);
		show(reductionErrorBox);
		if (error instanceof Error) reductionErrorBox.textContent = `${error.stack}`;
		else reductionErrorBox.textContent = String(error);
	}
}
function requestGenerateCode() {
	if (generateCodeTimeoutId !== -1) clearTimeout(generateCodeTimeoutId);
	generateCodeTimeoutId = setTimeout(() => {
		generateCode();
		generateCodeTimeoutId = -1;
	}, 100);
}
function generateCode() {
	const swDetail = new StopWatch(false);
	if (!reducedImage) {
		codeErrorBox.textContent = "まだコードは生成されていません。";
		show(codePlaneContainer);
		show(codeErrorBox);
		return;
	}
	let blobs = [];
	try {
		const args = new EncodeArgs();
		args.src = reducedImage;
		const chOrder = parseInt(channelOrderBox.value);
		switch (chOrder) {
			case ChannelOrder.RGBA:
				args.alphaFirst = true;
				args.colorDescending = true;
				break;
			case ChannelOrder.BGRA:
				args.alphaFirst = true;
				args.colorDescending = false;
				break;
			case ChannelOrder.ARGB:
				args.alphaFirst = false;
				args.colorDescending = true;
				break;
			case ChannelOrder.ABGR:
				args.alphaFirst = false;
				args.colorDescending = false;
				break;
			default: throw new Error("Unsupported channel order");
		}
		for (const [id, planeUi] of Object.entries(planeUis)) {
			const plane = new PlaneArgs();
			plane.id = id;
			plane.type = parseInt(planeUi.planeTypeBox.value);
			const indexMatchMode = plane.type == PlaneType.INDEX_MATCH;
			if (indexMatchMode) {
				plane.indexMatchValue = parseInt(planeUi.matchIndexBox.value);
				plane.postInvert = planeUi.matchInvertBox.checked;
			}
			setVisible(parentLiOf(planeUi.matchIndexBox), indexMatchMode);
			setVisible(parentLiOf(planeUi.matchInvertBox), indexMatchMode);
			plane.farPixelFirst = parseInt(farPixelFirstBox.value) == 1;
			plane.bigEndian = bigEndianBox.checked;
			plane.packUnit = parseInt(packUnitBox.value);
			plane.vertPack = vertPackBox.checked;
			plane.alignBoundary = parseInt(alignBoundaryBox.value);
			plane.alignLeft = leftAlignBox.checked;
			plane.vertAddr = vertAddrBox.checked;
			args.planes.push(plane);
		}
		if (args.planes.length == 0) throw new Error("プレーンが定義されていません");
		encode(args);
		for (const plane of args.planes) blobs.push(plane.output.blob);
		const firstPlane = args.planes[0];
		setVisible(parentLiOf(leftAlignBox), firstPlane.output.alignRequired);
		setVisible(parentLiOf(channelOrderBox), firstPlane.output.fields.length > 1);
		setVisible(parentLiOf(farPixelFirstBox), firstPlane.output.pixelsPerFrag > 1);
		setVisible(parentLiOf(vertPackBox), firstPlane.output.pixelsPerFrag > 1);
		setVisible(parentLiOf(bigEndianBox), firstPlane.output.bytesPerFrag > 1);
		{
			const fmt = args.src.format;
			const out = firstPlane.output;
			const numCols = out.bytesPerFrag * 8;
			const numRows = 3;
			const colW = clip(20, 40, Math.round(800 / numCols));
			const rowH = 30;
			const tableW = numCols * colW;
			const tableH = numRows * rowH;
			const pad = 0;
			structCanvas.width = tableW + 1 + pad * 2;
			structCanvas.height = tableH + 1 + pad * 2;
			const ctx = structCanvas.getContext("2d");
			if (!ctx) throw new Error("Failed to get canvas context");
			ctx.fillStyle = "#FFF";
			ctx.fillRect(0, 0, structCanvas.width, structCanvas.height);
			ctx.font = "16px sans-serif";
			ctx.translate(.5, .5);
			ctx.fillStyle = "#888";
			ctx.fillRect(pad, pad + tableH - rowH, tableW, rowH);
			ctx.strokeStyle = "#000";
			ctx.fillStyle = "#000";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			for (let i = 0; i <= numCols; i++) {
				const x = pad + i * colW;
				ctx.beginPath();
				if (i % 8 == 0) ctx.moveTo(x, pad);
				else ctx.moveTo(x, pad + rowH);
				ctx.lineTo(x, pad + tableH);
				ctx.stroke();
				if (i < numCols) {
					const iBit = (numCols - 1 - i) % 8;
					ctx.fillText(iBit.toString(), x + colW / 2, pad + rowH + rowH / 2);
					if (iBit == 3) {
						const ib = Math.floor((numCols - 1 - i) / 8);
						const iByte = firstPlane.bigEndian ? out.bytesPerFrag - 1 - ib : ib;
						ctx.fillText("Byte" + iByte.toString(), x, pad + rowH / 2);
					}
				}
			}
			for (let i = 0; i <= numRows; i++) {
				ctx.beginPath();
				ctx.moveTo(pad, pad + i * rowH);
				ctx.moveTo(pad, pad + i * rowH);
				ctx.lineTo(pad + tableW, pad + i * rowH);
				ctx.stroke();
			}
			let cellColors;
			if (firstPlane.type == PlaneType.DIRECT && !fmt.isIndexed && fmt.colorSpace == ColorSpace.RGB) cellColors = [
				"rgba(255,128,128,0.8)",
				"rgba(128,255,128,0.8)",
				"rgba(128,160,255,0.8)",
				"rgba(192,128,255,0.8)"
			];
			else cellColors = ["rgba(255,255,255,0.8)"];
			for (let ip = 0; ip < out.pixelsPerFrag; ip++) {
				const iPix = firstPlane.farPixelFirst ? out.pixelsPerFrag - 1 - ip : ip;
				for (const field of out.fields) {
					const r = pad + tableW - (ip * out.pixelStride + field.pos) * colW;
					const w = field.width * colW;
					const x = r - w;
					const y = pad + tableH - rowH;
					ctx.fillStyle = cellColors[field.srcChannel];
					ctx.fillRect(x, y, w, rowH);
					ctx.strokeStyle = "#000";
					ctx.strokeRect(x, y, w, rowH);
					ctx.fillStyle = "#000";
					ctx.textAlign = "center";
					ctx.textBaseline = "middle";
					let label;
					if (firstPlane.type == PlaneType.INDEX_MATCH) label = "C";
					else if (fmt.isIndexed) label = "Index";
					else label = fmt.channelName(field.srcChannel);
					if (out.pixelsPerFrag > 1) label += iPix.toString();
					ctx.measureText(label);
					ctx.fillText(label, x + w / 2, y + rowH / 2);
				}
			}
		}
		show(structCanvas);
		hide(structErrorBox);
	} catch (error) {
		hide(structCanvas);
		show(structErrorBox);
		if (error instanceof Error) structErrorBox.textContent = `${error.stack}`;
		else structErrorBox.textContent = String(error);
		codeErrorBox.textContent = "エンコードのエラーを解消してください。";
		hide(codePlaneContainer);
		show(codeErrorBox);
		return;
	}
	try {
		const args = new CodeGenArgs();
		args.name = inputFileName.split(".")[0].replaceAll(/[-\s]/g, "_");
		args.src = reducedImage;
		args.blobs = blobs;
		args.format = parseInt(codeFormatBox.value);
		args.codeUnit = parseInt(codeUnitBox.value);
		args.indent = parseInt(indentBox.value);
		args.arrayCols = Math.max(1, parseInt(codeColsBox.value));
		generate(args);
		const isBinary = args.format == CodeFormat.RAW_BINARY;
		codePlaneContainer.innerHTML = "";
		for (const code of args.codes) {
			const copyButton = makeButton("📄コピー");
			copyButton.style.float = "right";
			copyButton.style.marginRight = "5px";
			const saveButton = makeButton("💾保存");
			saveButton.style.float = "right";
			saveButton.style.marginRight = "5px";
			copyButton.disabled = isBinary;
			const title = document.createElement("div");
			title.classList.add("codePlaneTitle");
			title.appendChild(document.createTextNode(code.name));
			title.appendChild(saveButton);
			title.appendChild(copyButton);
			const pre = document.createElement("pre");
			pre.textContent = code.code;
			const wrap = document.createElement("div");
			wrap.classList.add("codePlane");
			wrap.appendChild(title);
			wrap.appendChild(pre);
			if (code.numLines > 1e3 && !keepShowLongCode) {
				const showCodeLink$1 = document.createElement("a");
				showCodeLink$1.href = "#";
				showCodeLink$1.textContent = `表示する (${code.numLines} 行)`;
				const hiddenBox = document.createElement("div");
				hiddenBox.classList.add("codeHiddenBox");
				hiddenBox.style.textAlign = "center";
				hiddenBox.innerHTML = `コードが非常に長いため非表示になっています。<br>`;
				hiddenBox.appendChild(showCodeLink$1);
				hide(pre);
				wrap.appendChild(hiddenBox);
				showCodeLink$1.addEventListener("click", (e) => {
					e.preventDefault();
					keepShowLongCode = true;
					show(pre);
					hide(hiddenBox);
				});
			}
			codePlaneContainer.appendChild(wrap);
			copyButton.addEventListener("click", () => {
				if (!pre.textContent) return;
				navigator.clipboard.writeText(pre.textContent).then(() => {
					console.log("コピー成功");
				}).catch((err) => {
					console.error("コピー失敗", err);
				});
			});
			saveButton.addEventListener("click", () => {
				const text = pre.textContent;
				if (!text) return;
				let blob;
				if (isBinary) {
					const hexStrArray = text.split(/\s+/);
					const bytes = new Uint8Array(hexStrArray.length);
					for (let i = 0; i < hexStrArray.length; i++) bytes[i] = parseInt(hexStrArray[i], 16);
					blob = new Blob([bytes], { type: "application/octet-stream" });
				} else blob = new Blob([text], { type: "text/plain" });
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = code.name;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
			});
		}
		show(codePlaneContainer);
		hide(codeErrorBox);
	} catch (error) {
		if (error instanceof Error) codeErrorBox.textContent = `${error.stack}`;
		else codeErrorBox.textContent = String(error);
		hide(codePlaneContainer);
		show(codeErrorBox);
	}
	swDetail.lap("UI Update");
}
function onRelayout() {
	{
		const rect = trimCanvas.getBoundingClientRect();
		trimCanvasWidth = rect.width;
		trimCanvasHeight = rect.height;
	}
	{
		const canvasParent = previewCanvas.parentElement;
		const rect = canvasParent.getBoundingClientRect();
		previewCanvasWidth = rect.width;
		previewCanvasHeight = rect.height;
	}
	paletteUi.onRelayout();
	requestUpdateTrimCanvas();
}
function main() {
	document.addEventListener("DOMContentLoaded", async (e) => {
		await onLoad();
	});
	window.addEventListener("resize", (e) => onRelayout());
}

//#endregion
//#region src/index.ts
main();

//#endregion
export {  };