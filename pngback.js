// pngback. A PNG library for Javascript
// (c) 2010 Justin Cormack

var events = require('events');
var crc32 = require('./crc').crc32;

var emitter = new events.EventEmitter(); // need to init to make this work.

// turn into methods, as are png specific? no, fairly general
function to32(bytes) {
	var c = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes [3];
	c = (c < 0) ? 0x100000000 + c: c;
	return c;
}

function to16(bytes) {
	return 256 * bytes[0] + bytes[1];
}

function latinToString(k) {
	for (i = 0; i < k.length; i++) {
		if ((k[i] !== 10 && k[i] < 32) || (k[i] > 126 && k[i] < 160)) {   // valid ISO 8859-1 chars 32-126 and 160-255 + line feed
			return;
		}
	}
	return String.fromCharCode.apply(String, k); // ISO 8859-1 is the same as Unicode code points within this range
}

function asciiToString(k) {
	for (i = 0; i < k.length; i++) {
		if (k[i] < 32 || k[i] > 126) {
			return;
		}
	}
	return String.fromCharCode.apply(String, k);
}

function utf8ToString(bytes) {
	var i = 0;
	var string = "";
	var byte1, byte2, byte3, byte4, num;
	var hi, low;
			
	if (bytes.slice(0, 3) == [0xEF, 0xBB, 0xBF]) { // BOM
		i = 3;
	}

	for( ; i < bytes.length; i++) {
		byte1 = bytes[i];
		if (byte1 < 0x80) {
			num = byte1;
		} else if (byte1 >= 0xC2 && byte1 < 0xE0) {
			byte2 = bytes[++i];
			num = ((byte1 & 0x1F) << 6) + (byte2 & 0x3F);
		} else if (byte1 >= 0xE0 && byte1 < 0xF0) {
			byte2 = bytes[++i];
			byte3 = bytes[++i];
			num = ((byte1 & 0xFF) << 12) + ((byte2 & 0x3F) << 6) + (byte3 & 0x3F);
		} else if (byte1 >= 0xF0 && byte1 < 0xF5) {
			byte2 = bytes[++i];
			byte3 = bytes[++i];
			byte4 = bytes[++i];
			num = ((byte1 & 0x07) << 18) + ((byte2 & 0x3F) << 12) + ((byte3 & 0x3F) << 6) + (byte4 & 0x3F);
		}

		if (num >= 0x10000) { // split it up using surrogates
			num -= 0x10000;

			hi  = (num & 0xFFC00) >> 10; // first 10 bits
			low = num & 0x003FF; // last  10 bits

			hi  += 0xD800; // high surrogate range
			low += 0xDC00; // low surrogate range
			string += String.fromCharCode(hi, low);
		} else {
			string += String.fromCharCode(num);
		}	
	}
	return string;
}

/* png specific from here */

png = Object.create(emitter);

png.forbidAfter = { // these are the chunks that are forbidden after other ones
	// corresponds to a weak validation, not as strict as standards suggests, check the otehr constraints furtehr down
	IHDR: ['IHDR'],
	PLTE: ['iCCP', 'sRGB', 'sBIT', 'gAMA', 'cHRM'],
	IDAT: ['pHYs', 'sPLT', 'iCCP', 'sRGB', 'sBIT', 'gAMA', 'cHRM', 'tRNS', 'bKGD', 'hIST'],
	gAMA: ['gAMA'],
	sBIT: ['sBIT'],
	bKGD: ['bKGD', 'PLTE'],
	tRNS: ['tRNS', 'PLTE'],
	cHRM: ['cHRM'],
	pHYs: ['pHYs'],
	hIST: ['hIST'],
	tIME: ['tIME'],
	iCCP: ['iCCP', 'sRGB'],
	sRGB: ['iCCP', 'sRGB'],
	IEND: ['*']
};

png.signature = [137, 80, 78, 71, 13, 10, 26, 10];

png.read = function(stream) {
	var png = this;
	var crc = Object.create(crc32);
	var chunk = {};
	var forbidden = [];
	var first = 'IHDR';
	var state;
	var emitted = [];
	
	function unlisten() {
		stream.removeListener('data', data);
		stream.removeListener('end', end);	
	}
	
	function data(buf) {
		
		while (typeof state == 'function' && buf.length) {
			
			var ret = state('data', buf);
			
			if (typeof ret == 'string') {
				png.emit('bad', ret);
				state = null;
			}
			
			buf = ret;
		}
		
		if (typeof state !== 'function') {
			unlisten();
		}
	}
	
	function end() {
		var ret = state('end');
			
		if (typeof ret == 'string') {
			png.emit('bad', ret);
			state = null;
		}
		
		unlisten();
		png.emit('end');
	}
	
	// note that for get, unlike data we are happy to copy data into array, as we do not send on
	function get(len, match, success, ev, buf, acc) {
		
		function again(ev, buf) {
			return get(len, match, success, ev, buf, acc);
		}
		
		if (ev != 'data') {
			return "unexpected end of stream";
		}

		if (typeof acc == 'undefined') {
			acc = [];
		}

		var max = len - acc.length;
		max = (max > buf.length) ? buf.length : max;

		acc = acc.concat(Array.prototype.slice.call(buf, 0, max));
		
		buf = buf.slice(max);
						
		if (acc.length < len) {
			state = again;
			return buf;
		}
		
		var ret = match(acc);
		
		if (typeof ret == 'string') {
			return ret;
		}
		
		state = success;
		return buf;
	}
	
	function accept(bytes, success, ev, buf) {
		var compare;
		var c, v;
				
		function again(ev, buf) {
			return accept(compare, success, ev, buf);
		}
		
		if (bytes.length === 0) {
			state = success;
			return buf;
		}
		
		if (ev != 'data') {
			return "unexpected end of stream";
		}
		
		compare = bytes.slice();
		
		while (compare.length > 0 && buf.length > 0) {
			c = compare.shift();
			v = buf[0];
			buf = buf.slice(1);
			if (c != v) {
				return "failed match";
			}
		}
				
		if (compare.length > 0) {
			state = again;
			return buf;
		}
		
		state = success;
		return buf;
	}
	
	function chunkend(ev, buf) {
		if (ev == 'data') {
			state = chunklen;
			return buf;
		}
		if (ev == 'end') {
			return true;
		}
	}
	
	function chunkcrc(ev, buf) {return get(4, function(bytes) {
			crc.finalize();
			var c = to32(bytes);
			if (c !== crc.crc) {
				return "failed crc";
			}
			
			// if we see a new chunk type, emit a type event
			if (emitted.indexOf(chunk.name) === -1) {
				png.emit('type', chunk.name);
				emitted.push(chunk.name);
			}
			
			// now emit a chunk event
			png.emit(chunk.name, chunk.data);
			return true;
		}, chunkend, ev, buf);}
		
	function chunkdata(ev, buf, acc, len) {
		
		function again(ev, buf) {
			return chunkdata(ev, buf, acc, len);
		}
		
		if (chunk.length === 0) {
			chunk.data = [];
			state = chunkcrc;
			return buf;
		}
		
		if (ev === 'end') {
			return "unexpected end of stream";
		}
		
		if (typeof acc == 'undefined') {
			acc = [];
			len = 0;
		}
		
		var max = chunk.length - len;
		max = (max > buf.length) ? buf.length : max;
		
		var sl = buf.slice(0, max);
		crc.add(sl);
		
		acc.push(sl);
		
		len += max;
		buf = buf.slice(max);
		
		if (len < chunk.length) {
			state = again;
			return buf;
		}
		
		chunk.data = acc;
		
		state = chunkcrc;
		return buf;
	}

	function chunktype(ev, buf) {return get(4, function(bytes) {
			var b;
			for (var i = 0; i < 4; i++) {
				b = bytes[i];
				if (b < 65 || (b > 90 && b < 97) || b > 122) {
					return false;
				}
			}
			if (bytes[2] & 0x10 === 0) {
				return "reserved chunk in stream";
			}
			
			var name = String.fromCharCode.apply(String, bytes);
			chunk.name = name;
			
			if (typeof first == 'string' && first !== name) {
				return "first chunk invalid";
			}
			first = false;
			
			if (forbidden.indexOf('*') !== -1) {
				return "chunk after IEND";
			}
			
			if (forbidden.indexOf(name) !== -1) {
				return "chunk " + name + " not allowed here";
			}
			
			if (name in png.forbidAfter) {
				forbidden.push.apply(Array, png.forbidAfter[name]);
			}
			
			crc.start();
			crc.add(bytes);
			return true;
		}, chunkdata, ev, buf);}

	function chunklen(ev, buf) {return get(4, function(bytes) {
			if (bytes[0] & 0x80) { // high bit must not be set
				return "bad chunk length";
			}
			chunk.length = to32(bytes);
			// probably a good idea to add a smaller length check here... to stop DoS, optional
			return true;
		}, chunktype, ev, buf);}
	
	function sig(ev, buf) {return accept(png.signature, chunklen, ev, buf);}
	
	state = sig;
	
	stream.on('data', data);
	stream.on('end', end);
	
	this.pause = stream.pause;
	this.resume = stream.resume;
	
	return this;
};

// next layer is parsing of the chunks
// merge into png object

var cfsm = Object.create(emitter);

cfsm.header = {};

// this could be done as state driven too, or at least function based not cases, so extensible.
// pass the functions not the strings then!
cfsm.parseField = function(data, fields) {
	var bytes = [];
	var type, name;
	var ret = {};
	var a = [];
	var i, k, s, z;
	var fs = fields.slice();
	
	for (i = 0; i < data.length; i++) {
		bytes = bytes.concat(Array.prototype.slice.call(data[i]));
	}
	
	function zterm() {
		var p = bytes.indexOf(0);
		if (p === -1) {
			return;
		}
		var k = bytes.slice(0, p);
		bytes = bytes.slice(p + 1);
		
		return k;
	}
	
	while(fs.length > 0) {
		name = fs.shift();
		type = fs.shift();
		switch (type) {
			case 'uint8':
				if (bytes.length < 1) {
					return "not enough data";
				}
				ret[name] = bytes[0];
				bytes.shift();
				break;
			case 'uint16':
				if (bytes.length < 2) {
					return "not enough data";
				}
				ret[name] = to16(bytes);
				bytes = bytes.slice(2);
				break;
			case 'uint32':
				if (bytes.length < 4) {
					return "not enough data";
				}
				ret[name] = to32(bytes);
				bytes = bytes.slice(4);
				break;
			case 'float100k':
				if (bytes.length < 4) {
					return "not enough data";
				}
				ret[name] = to32(bytes) / 100000;
				bytes = bytes.slice(4);
				break;
			case 'rgb': // rgb triples, any number
				if (bytes.length % 3 !== 0) {
					return "rgb is not a multiple of 3 bytes";
				}
				while (bytes.length !== 0) {
					a.push({'red': bytes[0], 'green': bytes[1], 'blue': bytes[2]});
					bytes = bytes.slice(3);
				}
				ret[name] = a;
				break;
			case 'uint16l': // uint16 list, any number
				if (bytes.length % 2 !== 0) {
					return "list of 16 bit numbers is not a multiple of 2 bytes";
				}
				while (bytes.length !== 0) {
					a.push(to16(bytes));
					bytes = bytes.slice(2);
				}
				ret[name] = a;
				break;
			case 'bytes':
				ret[name] = bytes.slice();
				bytes = [];
				break;
			case 'keyword': // zero terminated string 1-79 bytes in ISO 8859-1
				k = zterm();
				if (typeof k == 'undefined') {
					return "string not null terminated";
				}
				if (k.length === 0 || k.length > 79) {
					return "keyword empty or too long";
				}
				if (k[0] === 32 || k[k.length - 1] === 32) {
					return "leading or trailing space in keyword";
				}
				if (k.indexOf(160) !== -1) {
					return "non break space not allowed in keyword";
				}
				if (k.indexOf(10) !== -1) {
					return "line feed not allowed in keyword";
				}
				s = latinToString(k);
				if (typeof s == 'undefined') {
					return "invalid ISO 8859-1 in keyword";
				}
				// should also check for multiple spaces if pedantic
				ret[name] = s;
				break;
			case 'ascii-0': // zero terminated ascii string
				k = zterm();
				if (typeof k == 'undefined') {
					return "string not null terminated";
				}
				s = asciiToString(k);
				if (typeof s == 'undefined') {
					return "invalid ASCII in string";
				}
				ret[name] = s;
				break;
			case 'utf8-0': // zero terminated UTF8 string
				k = zterm();
				if (typeof k == 'undefined') {
					return "string not null terminated";
				}
				s = utf8ToString(k);
				if (typeof s == 'undefined') {
					return "invalid UTF8 in string";
				}
				ret[name] = s;
				break;
			case 'z-optional': // iTXt optional compression field
				if (bytes.length < 2) {
					return "not enough data";
				}
				if (bytes[0] > 1 || bytes[1] !== 0) {
					return "invalid compression setting";
				}
				ret[name] = (bytes[0] === 1);
				bytes = bytes.slice(2);
				break;
			case 'oz-utf8': // optionally compressed UTF8 terminated by end of data
				if (ret.compression === true) {
					//z = inflate(bytes); // !!!!!!!!!!!!
					z = [];
				} else {
					z = bytes.slice();
				}
				s = utf8ToString(z);
				if (typeof s == 'undefined') {
					return "invalid UTF8 in string";
				}
				ret[name] = s;
				bytes = [];
				break;
			case 'iso8859-1': // string terminated by end of data
				s = latinToString(bytes);
				if (typeof s == 'undefined') {
					return "invalid ISO 8859-1 in string";
				}
				ret[name] = s;
				bytes = [];
				break;
			case 'z-iso8859-1': // compressed string terminated by end of data
				if (bytes[0] !== 0) {
					return "unknown compression method";
				}
				bytes.shift();
				//z = inflate(bytes);
				//s = latinToString(z);
				s = "unable to uncompress yet!!!!!!!!";
				if (typeof s == 'undefined') {
					return "invalid ISO 8859-1 in string";
				}
				ret[name] = s;
				bytes = [];
				break;
			case 'zdata': // compressed arbitrary data
				if (bytes[0] !== 0) {
					return "unknown compression method";
				}
				bytes.shift();
				// unable to uncompress yet!!!!!!!!
				ret[name] = bytes.slice(); // return compressed instead...
				bytes = [];
				break;
			default:
				return "cannot understand field to parse";
		}
	}
	if (bytes.length !== 0) {
		return "too much data: " + bytes.length + " " + fields;
	}
	
	return ret;
};

cfsm.IHDR = {
	parse: ['width', 'uint32', 'height', 'uint32', 'depth', 'uint8', 'type', 'uint8', 'compression', 'uint8', 'filter', 'uint8', 'interlace', 'uint8'],
	validate: function(d) {
		if (d.width === 0 || d.height === 0) {
			return "width and height of PNG must not be zero";
		}

		if ([1, 2, 4, 8, 16].indexOf(d.depth) === -1) {
			return "invalid bit depth";
		}

		switch(d.type) {
			case 0: // greyscale
				break;
			case 2: // truecolour
			case 4: // greyscale with alpha
			case 6: // truecolour with alpha
				if (d.depth < 8) {
					return "invalid bit depth";
				}
				break;
			case 3: // indexed colour
				if (d.depth > 8) {
					return "invalid bit depth";
				}
				break;
			default:
				return "invalid colour type";
		}

		if (d.compression !== 0) {
			return "invalid compression type";
		}
		
		if (d.filter !== 0) {
			return "invalid filter type";
		}
		
		if (d.filter !== 0 && d.filter !== 1) {
			return "invalid interlace type";
		}
		return;
	},
	state: function(d) {
		this.header = d; // other chunks need to see this header
		
		this.emit('IHDR', d); // move to generic code?
	}
};

cfsm.PLTE = {
	parse: ["palette", "rgb"]
};

cfsm.IDAT = {
	parse: function(data) {
		return {'data': data}; // actually may be a special case
	},
	state: function(d) {
		this.emit('IDAT', d); // this is possiby the only one that needs to do something else?
		// !!!!! process data here
	}
};

cfsm.IEND = {
	parse: []
};

cfsm.gAMA = {
	parse: ['gamma', 'float100k']
};

cfsm.sBIT = {
	parse: function(data) {
		var p;
		switch (this.header.type) {
			case 0:
				p = ["grey", "uint8"];
				break;
			case 2:
			case 3:
				p = ["red", "uint8", "green", "uint8", "blue", "uint8"];
				break;
			case 4:
				p = ["grey", "uint8", "alpha", "uint8"];
				break;
			case 6:
				p = ["red", "uint8", "green", "uint8", "blue", "uint8", "alpha", "uint8"];
				break;
		}
		return this.parseField(data, p);
	},
	validate: function(d) {
		var depth = (this.header.type === 3) ? 8 : this.header.depth;
		var keys = Object.keys(d);
		for (var i = 0; i < keys.length; i++) {
			if (d[keys[i]] === 0 || d[keys[i]] > depth) {
				return "invalid significant bits";
			}
		}
		return;
	}
};

cfsm.bKGD = {
	parse: function(data) {
	var p;
		switch (this.header.type) {
			case 0:
			case 4:
				p = ["grey", "uint16"];
				break;
			case 2:
			case 6:
				p = ["red", "uint16", "green", "uint16", "blue", "uint16"];
				break;
			case 3:
				p = ["palette", "uint8"];
				break;
		}
		return this.parseField(data, p);
	},
	validate: function(d) {
		var max = 1 << ((this.header.type === 3) ? 8 : this.header.depth);
		var keys = Object.keys(d);
		for (var i = 0; i < keys.length; i++) {
			if (d[keys[i]] >= max) {
				return "invalid background colour " + d[keys[i]] + " max " + max;
			}
		}
		return;
	}
};

cfsm.tRNS = {
	parse: function(data) {
		var p;
		switch (this.header.type) {
			case 0:
				p = ["grey", "uint16"];
				break;
			case 2:
				p = ["red", "uint16", "green", "uint16", "blue", "uint16"];
				break;
			case 3:
				p = ["alpha", "bytes"];
				break;
		}
		return this.parseField(data, p);
	}
};

cfsm.cHRM = {
	parse: ['whiteX', 'float100k', 'whiteY', 'float100k', 'redX', 'float100k', 'redY', 'float100k', 'greenX', 'float100k', 'greenY', 'float100k', 'blueX', 'float100k', 'blueY', 'float100k']
};
cfsm.pHYs = {
	parse: ['pixelsX', 'uint32', 'pixelsY', 'uint32', 'unit', 'uint8']
};
cfsm.hIST = {
	parse: ['frequencies', 'uint16l']
};
cfsm.tIME = {
	parse: ['year', 'uint16', 'month', 'uint8', 'day', 'uint8', 'hour', 'uint8', 'minute', 'uint8', 'second', 'uint8'],
	validate: function(d) {
		if (d.month === 0 || d.month > 12 || d.day === 0 || d.day > 31 || d.hour > 23 || d.minute > 59 || d.second > 60) {
			return "invalid date";
		}
		// check actual number of days in month
		if (d.day > 32 - new Date(d.year, d.month, 32).getDate()) {
			return "invalid days in month";
		}
	}
};
cfsm.tEXt = {
	parse: ['keyword', 'keyword', 'text', 'iso8859-1']
};
cfsm.zTXt = {
	parse: ['keyword', 'keyword', 'text', 'z-iso8859-1']
};

cfsm.iTXt = {
	parse: ['keyword', 'keyword', 'compression', 'z-optional', 'language', 'ascii00', 'translated', 'utf8-0', 'text', 'oz-utf8']
};

cfsm.iCCP = {
	parse: ['name', 'keyword', 'profile', 'zdata']
};

cfsm.sRGB = {
	parse: ['intent', 'uint8'],
	validate: function(d) {
		if (d.intent > 3) {
			return "unknown sRGB intent";
		}
	}
};

// pass the functions instead?
cfsm.listen = function(emitter, chunks) {
	var cfsm = this;
	var i;
	var fs;
	var typelisten = false;
	
	function unlisten() {
		emitter.removeListener('bad', bad);
		emitter.removeListener('end', end);
		if (typelisten) {
			emitter.removeListener('type', type);
		}
		chunks.map(function(cn, ci) {emitter.removeListener(cn, fs[ci]);});
	}
	
	function end() {
		unlisten();
		cfsm.emit('end');
	}
	
	function bad(msg) {
		unlisten();
		cfsm.emit('bad', msg);
	}
	
	function type(name) {
		function f(data) {
			process(name, data);
		}
		
		emitter.on(name, f);
		chunks.push(name);
		fs.push(f);
	}
	
	function process(cn, data) {
		
		if (! (cn in cfsm)) {
			cfsm.emit('unhandled', cn);
			return;
		}
		
		var ci = cfsm[cn];

		var d = (typeof ci.parse == 'function') ? ci.parse.call(cfsm, data) : cfsm.parseField(data, ci.parse);
		
		if (typeof d == 'string') {
			return bad(d);
		}

		if (typeof ci.validate == 'function') {
			var v = ci.validate.call(cfsm, d);

			if (typeof v == 'string') {
				return bad(v);
			}
		}
		if (typeof ci.state == 'function') {
			var ret = ci.state.call(cfsm, d);
			if (typeof ret === 'string') {
				return bad(ret);
			}
		} else { // default behaviour
			cfsm.emit(cn, d);
		}
	}
	
	emitter.on('end', end);
	emitter.on('bad', bad);
	
	if (typeof chunks == 'undefined') {
		chunks = [];
		typelisten = true;
		emitter.on('type', type);
	}
	
	fs = chunks.map(function(cn) {
		function f(data) {
			process(cn, data);
		}
		
		emitter.on(cn, f);
		return f;
	});
	
	return this;
};

cfsm.stream = function(stream) {
	var p = Object.create(png);
	this.listen(p);
	p.read(stream);
	
	return this;
};

// example metadata extraction

metadata = Object.create(emitter);

metadata.listen = function(emitter, f) {
	data = {};
	
	function unlisten() {
		emitter.removeListener('tEXt', txt);
		emitter.removeListener('iTXt', txt);
		emitter.removeListener('end', end);
		emitter.removeListener('bad', bad);
	}
	
	function end() {
		unlisten();
		f(data); // call the callback. Maybe we should use conventional err args?
	}
	
	function bad(msg) {
		unlisten(); // do not call callback on bad png
	}
	
	function txt(d) {
		var k = d.keyword;
		var v = d.text;
				
		if (k in data) {
			if (Array.isArray(data[k])) {
				data[k].push(v);
			} else {
				data[k] = [data[k], v];
			}
		} else {
			data[k] = v;
		}
	}
	
	emitter.on('tEXt', txt);
	emitter.on('iTXt', txt); // add zTXt when working. Compressed iTXt not working now
	emitter.on('bad', bad);
	emitter.on('end', end);
};

metadata.stream = function(stream, f) { // f is the callback
	var c = Object.create(cfsm);
	this.listen(c, f);
	c.stream(stream);
	
	return this;
};


// are these the best names?
(function(exports) {
	exports.parse = cfsm;
	exports.chunk = png;
	exports.metadata = metadata;
})(

  typeof exports === 'object' ? exports : this
);


