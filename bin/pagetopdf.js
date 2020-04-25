#! /usr/bin/env node
const {program} = require('commander');
const puppeteer = require('puppeteer');
const isUrl = require('is-url');

const _parseInt = (s, _) => parseInt(s, 10);

let url = "";
let out = "";

program
	.arguments('<url> <out>')
	.action((_url, _out) => {
		url = _url;
		out = _out;
	})
	.option('url', 'website to convert')
	.option('out', 'pdf output file')
	.option('--vw, --viewport-width <px>', 'viewport width', _parseInt, 1280)
	.option('--vh, --viewport-height <px>', 'viewport height', _parseInt, 1080)
	.option('--nes, --no-check-endless-scrolling', 'disable checks for endless scrolling')
	.option('-s, --scroll-to', 'scroll page until specified height value')
	.option('--st, --scroll-to-timeout <ms>', 'timeout for scroll to', _parseInt, 4000)
	.option('--ss, --step-scrolling', 'enables slow scrolling through page (enabled if endless scrolling is detected)')
	.option('--ssp, --step-scrolling-pause <ms>', 'time to wait between scroll-steps', _parseInt, 500)
	.option('-w, --wait <ms>', 'time to wait for timeout based events in milliseconds', _parseInt, 1000)
	.option('--rs, --remove-static', 'remove static positioned elements')
	.option('--rl, --remove-layers <layers>', 'layers of positioned elements to remove', _parseInt, 0)

;

program.parse(process.argv);

const viewportWidth = program.viewportWidth;
const viewportHeight = program.viewportHeight;
const checkEndlessScrolling = program.checkEndlessScrolling;
const scrollTo = program.scrollTo;
const scrollToTimeout = program.scrollToTimeout;
let stepScrolling = program.stepScrolling;
const stepScrollingPause = program.stepScrollingPause;
const wait = program.wait;
const removeStatic = program.removeStatic;
const removeLayers = program.removeLayers;

if (!isUrl(url)) {
	console.error("Invalid url '" + url + "'");
	return;
}

(async () => {
	const browser = await puppeteer.launch({headless: true});
	const page = await browser.newPage();
	await page.setViewport({
		width: viewportWidth,
		height: viewportHeight
	});
	await page.goto(url, {waitUntil: 'networkidle0'});

	await page.exposeFunction('log', (message) => {
		console.log(message);
	});

	await page.evaluate(() => {
		window.getAllStyleSheets = (base) => {
			let ss = [];

			if (base instanceof StyleSheetList) {
				for (let i = 0; i < base.length; i++) {
					let ssr = getAllStyleSheets(base[i]);
					ss.push(...ssr);
				}
				return ss;
			}

			try {
				ss.push(base);

				let r = base.cssRules;

				for (let i = 0; i < r.length; i++) {
					if (r[i].type === 3) {
						let ssr = getAllStyleSheets(r[i].styleSheet);
						ss.push(...ssr);
					}
				}

			} catch (e) {
			}

			return ss;
		};

		window.forEachStylesheet = (stylesheets, func) => {
			for (let i = 0; i < stylesheets.length; i++) {
				try {
					let r = stylesheets[i].cssRules;

					forEachCssRule(r, func)
				} catch (e) {
				}
			}
		};

		window.forEachCssRule = (rules, func) => {
			for (let i = 0; i < rules.length; i++) {
				switch (rules[i].type) {
					case 1:
						func(rules[i]);
						break;

					case 4:
						forEachCssRule(rules[i].cssRules, func);
						break;
				}
			}
		};

		window.forEachElement = (func) => {
			let el = document.getElementsByTagName('*');
			for (let i = 0; i < el.length; i++) {
				func(el[i]);
			}
		};

		window.sleep = (time) => new Promise((r) => {
			setTimeout(r, time)
		});
	});

	console.log("Getting page dimensions");
	let dimensions = await page.evaluate(() => {
		return {
			height: Math.max(document.body.offsetHeight, document.body.scrollHeight),
			width: Math.max(document.body.offsetWidth, document.body.scrollWidth),
		};
	});
	console.log(dimensions);

	if (checkEndlessScrolling) {
		console.log("Checking scroll events");
		let scrollEv = await page.evaluate(async () => {
			let height = Math.max(document.body.offsetHeight, document.body.scrollHeight);

			let scrollEv = false;

			let origXhrSend = window.XMLHttpRequest.prototype.send;
			window.XMLHttpRequest.prototype.send = function () {
				scrollEv = true;
				origXhrSend.apply(this, [].slice.call(arguments));
			};

			window.scrollTo(0, height);

			await sleep(500);

			let newHeight = Math.max(document.body.offsetHeight, document.body.scrollHeight);

			window.XMLHttpRequest.prototype.send = origXhrSend;

			return newHeight > height || scrollEv;
		});

		if (scrollEv) {
			console.log("    Endless scrolling detected");
			stepScrolling = true;
			await page.evaluate(() => {
				HTMLElement.prototype.remove = function () {
				};
				HTMLElement.prototype.removeChildren = function () {
				};

				let ignoreList = new Set();

				var observer = new MutationObserver(function (mutations) {
					mutations.forEach(function (mutation) {
						if (mutation.attributeName === "class") {
							if (ignoreList.has(mutation.target)) {
								ignoreList.delete(mutation.target);
								return;
							}

							ignoreList.add(mutation.target);
							mutation.target.className = mutation.oldValue;
						}
					});
				});

				observer.observe(document.body, {
					attributes: true,
					attributeOldValue: true,
					subtree: true
				});
			});
		}
	}

	if (scrollTo) {
		console.log("Scrolling to " + scrollTo);
		await page.evaluate(async (scrollTo) => {
			const Scroll = async () => {
				let height = Math.max(document.body.offsetHeight, document.body.scrollHeight);
				window.scrollTo(0, height);

				window.log("    Scrolled to " + height);

				let success = await new Promise((resolve => {
					let i;
					let t = setTimeout(() => {
						if (i) {
							clearInterval(i);
						}
						window.log("    Timeout");
						resolve(false);
					}, scrollToTimeout);
					i = setInterval(() => {
						let newHeight = Math.max(document.body.offsetHeight, document.body.scrollHeight);
						if (newHeight > height) {
							height = newHeight;
							clearInterval(i);
							clearInterval(t);
							resolve(true);
						}
					}, 50);
				}));

				if (success && height < scrollTo) {
					await Scroll();
				}
			};

			await Scroll();
		}, scrollTo);

		console.log("Getting new dimenstions");
		dimensions = await page.evaluate(() => {
			return {
				height: Math.max(document.body.offsetHeight, document.body.scrollHeight),
				width: Math.max(document.body.offsetWidth, document.body.scrollWidth),
			};
		});
		console.log(dimensions);
	}

	console.log("Setting viewport to page height");
	await page.setViewport({
		width: viewportWidth,
		height: dimensions.height
	});

	console.log("Trigger viewport dependent scroll events");
	await page.evaluate(() => {
		window.scrollBy(0, 100);
	});
	await page.evaluate(() => {
		window.scrollTo(0, 0);
	});

	console.log("Reverting viewport");
	await page.setViewport({
		width: viewportWidth,
		height: viewportHeight
	});

	if (stepScrolling) {
		console.log("Step-Scrolling");
		await page.evaluate(async (stepScrollingPause) => {
			let scrolls = Math.ceil(Math.max(document.body.offsetHeight, document.body.scrollHeight) / window.innerHeight);

			window.scrollTo(0, 0);

			for (let i = 0; i < scrolls; i++) {
				await sleep(stepScrollingPause);
				window.log("    Step " + (i + 1) + " of " + scrolls);
				window.scrollBy(0, window.innerHeight);
			}
		}, stepScrollingPause);
		await page.evaluate(() => {
			window.scrollTo(0, 0);
		});
	}

	if (wait) {
		console.log("Waiting " + wait + "ms");
		await new Promise((r) => {
			setTimeout(r, wait)
		});
	}

	if (removeStatic) {
		console.log("Remove fixed elements");
		await page.evaluate(() => {
			forEachElement((el) => {
				let style = getComputedStyle(el);
				if (style.position === "fixed") {
					el.remove();
				}
			});
		});
	}

	if (removeLayers) {
		console.log("Remove " + removeLayers + " layers of positioned elements");
		await page.evaluate((layers) => {
			let positioned = [];

			forEachElement((el) => {
				let style = getComputedStyle(el);
				if (style.position !== "static" && style.zIndex !== "auto") {
					positioned.push([el, parseInt(style.zIndex, 10)]);
				}
			});

			positioned.sort((e1, e2) => {
				return e1[1] > e2[1] ? 1 : -1;
			});

			for (let i = 0; i < layers && i < positioned.length; i++) {
				let e = positioned.pop();
				if (e.length) {
					e[0].remove();
				}
			}
		}, removeLayers);
	}

	console.log("Remove page breaks");
	await page.evaluate(() => {
		let ss = getAllStyleSheets(document.styleSheets);
		forEachStylesheet(ss, (s) => {
			s.style.breakAfter = "";
			s.style.breakBefore = "";
			s.style.breakInside = "";

			s.style.pageBreakAfter = "";
			s.style.pageBreakBefore = "";
			s.style.pageBreakInside = "";
		});
	});

	console.log("Resetting animations");
	await page.evaluate(() => {
		let ss = getAllStyleSheets(document.styleSheets);
		forEachStylesheet(ss, (s) => {
			if (s.style.animation) {
				let el = document.querySelectorAll(s.selectorText);

				for (let i = 0; i < el.length; i++) {
					el[i].style.animationPlayState = "paused";
					el[i].style.animationIterationCount = "0";
				}
			}
		});
	});

	console.log("Getting media query widths");
	const width = await page.evaluate(() => {
		let mQ = [];

		let ss = getAllStyleSheets(document.styleSheets);

		for (let i = 0; i < ss.length; i++) {
			try {
				let r = ss[i].cssRules;

				for (let j = 0; j < r.length; j++) {
					if (r[j].type === 4) {
						var t = r[j].media;

						for (let k = 0; k < t.length; k++) {
							if (
								t[k].indexOf('max-width') !== -1 &&
								t[k].indexOf('min-width') === -1 &&
								t[k].indexOf('px') !== -1
							) {
								mQ.push(t[k]);
							}
						}
					}
				}
			} catch (e) {
			}
		}

		let maxW = 0;

		for (let i = 0; i < mQ.length; i++) {
			let w = mQ[i].match(/.*?max-width.*?([0-9]+).*?/);
			if (w.length !== 2) {
				continue;
			}

			let wI = parseInt(w[1], 10);
			if (wI > maxW) {
				maxW = wI;
			}
		}

		return maxW;
	});

	console.log("Media query width: " + width);

	if (width !== 0 && width >= viewportWidth) {
		dimensions.width = width + 10;
	}

	console.log("Setting final viewport size");
	await page.setViewport({
		width: dimensions.width,
		height: viewportHeight
	});

	console.log("Generating pdf");
	await page.emulateMediaType('screen');
	await page.pdf({
		path: out,
		pageRanges: '1',
		width: dimensions.width,
		height: dimensions.height,
		printBackground: true,
	});

	await browser.close();
})();
