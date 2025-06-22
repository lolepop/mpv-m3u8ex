"use strict";

var M3U_HEADER = "#EXTM3U_EX";

function startsWith(s, c) {
	if (s.length < c.length)
		return false;
	for (var i = 0; i < c.length; i++) {
		if (s[i] !== c[i])
			return false;
	}
	return true;
}

function stableSort(arr, cmp) {
	var n = arr.length;
	var flag = true;
	while (flag) {
		flag = false;
		for (var i = 1; i < n; i++) {
			var a = arr[i - 1];
			var b = arr[i];
			if (cmp(a, b)) {
				flag = true;
				arr[i - 1] = b;
				arr[i] = a;
			}
		}
		n--;
	}
	return arr;
}

function isValidFile(contents) {
	return startsWith(contents, M3U_HEADER);
}

function pathIsAbs(path) {
	if (path[0] === "/")
		return true;
	// https://github.com/sindresorhus/path-is-absolute/blob/main/index.js
	var result = /^([a-zA-Z]:|[\\/]{2}[^\\/]+[\\/]+[^\\/]+)?([\\/])?([\s\S]*?)$/.exec(path);
	var device = result[1] || '';
	var isUnc = !!(device && device.charAt(1) !== ':');
	return !!(result[2] || isUnc);
}

function joinFilePath(dir, f) {
	return pathIsAbs(f) ? f : mp.utils.join_path(dir, f);
}

function parseFile(contents) {
	// quick and dirty
	function parseLine(line, lineNum) {
		var chars = line.split("");
		
		var state = 0;
		var quoteState = false;
		var nextTokIsLiteral = false;
		var variant;
		var acc = "";
		var k;
		var info = {};
		for (var i = 1; i <= chars.length; i++) {
			var isEol = i === chars.length;
			var c = chars[i];
			if (quoteState && isEol) {
				throw new Error("unclosed quotes at line " + lineNum);
			}
			
			if (state === 0 && c === ":") {
				state = 1;
				variant = acc;
				acc = "";
				continue;
			} else if (state === 1 && c === "=") {
				// key
				state = 2;
				k = acc;
				acc = "";
				continue;
			} else if (state === 2 && !nextTokIsLiteral) {
				// value
				if (quoteState && c === "\\") {
					// non-standard: uses backslash as escape char
					nextTokIsLiteral = true;
					continue;
				} else if (c === '"') {
					quoteState = !quoteState;
					continue;
				} else if ((!quoteState && c === ",") || isEol) {
					// process next kv pair
					state = 1;
					info[k] = acc;
					acc = k = "";
					continue;
				}
			}
			
			if (!isEol) {
				nextTokIsLiteral = false;
				acc += c;
			}
		}
		
		// no colon encountered, this is a comment
		return state === 0 ? null : [variant, info];
	}
	
	function toLoadOrder(tokens) {
		var commands = [];
		function order(k, v) {
			if (k === "__arg") {
				return 0;
			} else if (!v["FORCED"] || v["FORCED"] === "NO") {
				return 1;
			} else if (v["URI"] === undefined || v["TYPE"] !== "AUDIO") {
				return 3;
			} else {
				return 2;
			}
		}
		return stableSort(tokens, function (a, b) {
			return order.apply(0, a) > order.apply(0, b);
		});
	}

	var lines = contents.split("\n");
	var grabFirstParam = false;
	var props = [];
	for (var lineNum = 0; lineNum < lines.length; lineNum++) {
		var line = lines[lineNum].trim();
		if (line.length > 0 && line !== M3U_HEADER) {
			if (!startsWith(line, '#')) {
				props.push(["__arg", line])
				grabFirstParam = false;
				continue;
			}
			var res = parseLine(line, lineNum);
			if (res) {
				if (res[0] === "EXT-X-MEDIA" && !res[1].hasOwnProperty("URI"))
					grabFirstParam = true;
				props.push(res);
			}
		}
	}
	
	if (grabFirstParam)
		throw new Error("file was expected but none were provided");
	// mp.msg.info(JSON.stringify(props));
	return toLoadOrder(props);
}

function loadFile(dir, insts) {
	var hasLoadedFirstTrack = false;
	// mp.set_property("stream-open-filename", "null://");

	var toMarkForced = [];
	for (var i = 0; i < insts.length; i++) {
		var k = insts[i][0];
		var v = insts[i][1];
		switch (k) {
		case "__arg":
			mp.set_property("stream-open-filename", v);
			hasLoadedFirstTrack = true;
			break;
		case "EXT-X-MEDIA":
			if (v["URI"] !== undefined) {
				if (!hasLoadedFirstTrack && v["TYPE"] !== "SUBTITLES") {
					mp.set_property("stream-open-filename", joinFilePath(dir, v["URI"]));
					if (v["FORCED"]) {
						v["TRACK-NUM"] = "all";
						toMarkForced.push(v);
					}
					hasLoadedFirstTrack = true;
				} else {
					var type = v["TYPE"] === "SUBTITLES" ? "sub" : "audio";
					mp.commandv(type + "-add", joinFilePath(dir, v["URI"]), "cached" + (v["FORCED"] === "YES" ? "+forced" : ""), v["NAME"] || "")
				}
			} else {
				if (v["FORCED"])
					toMarkForced.push(v);
			}
			break;
		}
	}
	return toMarkForced;
}

function mix(ids) {
	if (ids.length > 1) {
		var filter = ids.map(function (id) { return "[aid" + id + "]"; }).join("");
		filter += "amix=inputs=" + ids.length + "[ao]";
		// mp.msg.info(filter);
		mp.set_property("lavfi-complex", filter);
	} else if (ids.length === 1) {
		mp.set_property("lavfi-complex", "");
		mp.set_property("aid", 0);
		mp.set_property("aid", ids[0]);
	}
}

function getTrackProperty(i, tag) {
	return mp.get_property("track-list/" + i + "/" + tag)
}

var toMarkForced = [];
mp.add_hook("on_preloaded", 50, function () {
	function findMarkedTrack(typ, index, trackName) {
		for (var i = 0; i < toMarkForced.length; i++) {
			var e = toMarkForced[i];
			if (e["TYPE"] === typ &&
					(e["TRACK-NUM"] === "all" ||
					+e["TRACK-NUM"] === index ||
					e["TRACK"] === trackName))
				return e;
		}
	}
	
	var tracks = mp.get_property("track-list/count");
	var toMix = [];
	var aCount = 0;
	var sCount = 0;
	for (var i = 0; i < tracks; i++) {
		var id = getTrackProperty(i, "id");
		var typ = getTrackProperty(i, "type");
		var title = getTrackProperty(i, "title");
		var isForced = getTrackProperty(i, "forced") === "yes";
		var isExternal = getTrackProperty(i, "external") === "yes";
		
		if (typ === "audio" && isForced) {
			toMix.push(id);
		}
		
		if (!isExternal) {
			var found;
			if (typ === "audio") {
				found = findMarkedTrack("AUDIO", aCount, title);
				aCount++;
			} else if (typ === "sub") {
				found = findMarkedTrack("SUBTITLES", sCount, title);
				sCount++;
			}
			// mp.set_property("track-list/" + i +"/title", "test");
			// maybe handle setting other properties?
			if (found && found["FORCED"] === "YES") {
				// mp.set_property("track-list/" + id +"/forced", "yes");
				toMix.push(id);
			}
		}
	}

	mix(toMix);
});

mp.add_hook('on_load', 50, function () {
	var filePath = mp.get_property("stream-open-filename");
	var path = mp.utils.split_path(filePath)
	
	if (/.m3u8?$/.test(filePath)) {
		var contents = mp.utils.read_file(filePath).trim();
		if (isValidFile(contents)) {
			var f = parseFile(contents);
			// mp.msg.info(JSON.stringify(f));
			toMarkForced = loadFile(path[0], f);			
		}
	}
});
