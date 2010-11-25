// pngback. A PNG library for Javascript


// make vbuf just array of buffer, offset, len to simplify
// get rid of ended - use end events properly, ie get these functions to check for them
// can stream out buffer data from chunks to next layer out, wg so can start to inflate chunk before checksum
// make eat the usual behaviour, ie most stuff greedy, return proper closures to continue with the partial results 

// merge all the functions into one big one stops the stupid lack of encapsulation shit, and we can store all the state in the function until we fire event

// cant do what we wanted and cleanup to not use vbuf now, as functions not clean any more, too entangled in match. will redo
// although actually I still think that for this case, getting all of chunk data is easier, lets not stream partial chunks

// dont make objects reusble - ie no init methods. Make a new one for a new operation. Create prototypes in right state


var events = require('events');
var crc = require('./crc');

var isArray = Array.isArray;

// extend eventEmitter to be able to emit an event in a different scope than that of the eventEmitter itself
events.EventEmitter.prototype.on2 = function(ev, f, scope) {
	this.on(ev, function() {f.apply(scope, Array.prototype.slice.call(arguments));});
};

// data object for node buffers, a vector of buffers
// fix so that is an array of triples: buffer, offset length, not just one offset, length. Fixes edge cases in truncate if then add more... which can do now ended removed
// hmm, without init all get same buffer! should we make create for our objects?

// 2 options for vbufs: 
// 1. for use in non IDAT blocks, we basically want to copy data, really want array
// 2. for IDAT blocks, we want to send a data stream, just with buf chunks (with offset, len though).
// for IDAT then we would not be able to reconstruct block boundaries. I think thats ok for most apps.
// ideally we want to store all state on block boundary as a closure. Lets see if we can...



var vbuf = {
	init: function() {
		this.buffers = [];
		this.offset = 0;
		this.length = 0;
	},
	data: function(buf) { // data designed to work from a stream 'data' event
		this.buffers.push(buf);
		this.length += buf.length;
	},
	eat: function(len) {
		if (len === 0) {
			return;	
		}
		if (len > this.length) {
			len = this.length;
			}
			this.offset += len;
			this.length -= len;
			while (this.buffers.length !== 0 && this.offset >= this.buffers[0].length) {
				this.offset -= this.buffers[0].length;
				this.buffers.shift();
			}
	},
	truncate: function(len) {
		// truncate this vbuf
		if (len > this.length) {len = this.length;}
		var drop = this.length - len;
		while (this.buffers[this.buffers.length - 1].length <= drop) {
			drop -= this.buffers[this.buffers.length - 1].length;
			this.buffers.pop();
		}
		this.length = len;
	},
	ref: function(len) {
		// return a truncated vbuf object, can be used to store a reference to the front of stream
		var trunc = Object.create(this);
		trunc.buffers = this.buffers.slice(); // need to clone the buffers
		trunc.offset = this.offset;
		trunc.length = this.length;
		trunc.truncate(len);
		return trunc;
	},
	bytes: function(len) {
		var offset = this.offset;
		var bytes = [];
		var buf = 0;
		if (len > this.length) {len = this.length;}
		for (var i = 0; i < len; i++) {
			while (this.buffers[buf].length <= offset) {
				offset = 0;
				buf++;
			}
			bytes.push(this.buffers[buf][offset++]);
		}
		return bytes;
	}
};

// FSM. receives events and has an emitter for the state functions to use.
// aha, we want an emitter for each fsm, which the functions get to use
// should an fsm be a function, so can use it as a component of another fsm? or just evented composition? or can we use functions to compose?
// also should listen events be constructors?

// barely need this. eg for second stage, could make own just as easily, as would quite like diff fns for diff events. And without self transition is just ev handler!
// needs to do own unlistens
// could just turn into some helper fns, one to do cascade, one for unlistens, although listen fn that listens for all events on streams is sane

var emitter = new events.EventEmitter(); // need to init to make this work.
var FSM = Object.create(emitter);

// pass the event (but not emitter) to the function
// redo this to just pass emitter? we know then which events we need to listen to
FSM.listen = function(emitter, ev) {
	var fsm = this;
	function f() {
		var args = Array.prototype.slice.call(arguments);
		args.unshift(ev);
		fsm.prev = fsm.state;
		//console.log("event " + args[0]);
		//console.log("state " + fsm.state);
		if (typeof fsm.state == 'function') {
			fsm.state = fsm.state.apply(fsm, args);
		}

		while (fsm.transition === true && typeof fsm.state == 'function' && fsm.state !== fsm.prev) {
			fsm.prev = fsm.state;
			//console.log("internal event state " + fsm.state);
			fsm.state = fsm.state.call(fsm, 'transition');
		}
	}
	emitter.on(ev, f);
};

// Functions to match against stream
// apply success and fail values

function match(check, success, fail, again, ev, arg) {
	var ret = check.call(this, ev, arg);
	if (typeof ret == 'undefined') {
		return again;
	}
	if (typeof ret == 'function') {
		return ret;
	}
	return (ret === true) ? success : fail;
}

// new get that doesnt need match, and creates closure directly

function get2(len, check, success, fail, again, ev, arg) {
	var that = this;
	function f(prev, ev, buf) {
		if (ev === 'end') {
			return false;
		}
		var vb = that.vb; // use data event directly once we remove vb
		if (prev.length + vb.length < len) {
			prev.push.apply(Array, vb.bytes(vb.length));
			vb.eat(vb.length);
			return function(ev, buf) {return f(prev, ev, buf);};
		}
		prev.push.apply(Array, vb.bytes(len - prev.length));
		vb.eat(len - prev.length);
		if (check.call(that, prev)) {
			return success;
		} else {
			return fail;
		}
	}
	return function(ev, buf) {return f([], ev, buf);};
}

// general get n bytes, but no checks until end when call check. accept could use, but in some cases good to fail sooner. passes as bytes not vb

function get(len, check) {
	function f(ev) {
		if (ev === 'end') {
			return false;
		}
		var vb = this.vb;
		if (vb.length < len) {
			return undefined;
		}
		var bytes = vb.bytes(len);
	
		if (check.call(this, bytes)) {
			vb.eat(len);
			return true;
		}
		return false;
	}
	return f;
}

// an accept function - matches a list of bytes, as our original match was
function accept(items) {
	if (! isArray(items)) {
		items = [items];
	}
	function f(ev) {
		if (ev === 'end') {
			return false;
		}
		var vb = this.vb;
		var canmatch = (items.length > vb.length) ? vb.length: items.length;
		//canmatch = 1;
		var bytes = vb.bytes(canmatch);
		for (var i = 0; i < canmatch; i++) {
			if (items[i] !== bytes[i]) {
				return false;
			}
		}
		if (canmatch === items.length) {
			vb.eat(canmatch); // eat it, just eat it.
			return true;
		}
		return undefined; // need more data to determine
	}
	return f;
}

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

/* png specific from here */

// merge chunk len and chunk type? or even all 4! That would be more efficient
function chunk_len(bytes) {
	if (bytes[0] & 0x80) { // high bit must not be set
		return false;
	}
	var len = to32(bytes);
	// probably a good idea to add a smaller length check here...
	this.chunk_len = len;
	return true;
}

function chunk_type(bytes) {
	var b;
	for (var i = 0; i < 4; i++) {
		b = bytes[i];
		if (b < 65 || (b > 90 && b < 97) || b > 122) {
			return false;
		}
	}
	this.chunk_type = bytes;
	this.crc.start();
	this.crc.add(bytes);
	return true;
}


// duplicating code here again, need to refactor? chunk_len tied in too much!
function chunk_data(ev) {
	if (ev === 'end') {
		return false;
	}
	len = this.chunk_len;
	vb = this.vb;
	if (vb.length < len) {
		return undefined;
	}
	this.crc.add(vb.bytes(len));
	this.crc.finalize();
	this.chunk_data = vb.ref(len);
	vb.eat(len);
	return true;
}


function chunk_crc(bytes) {
	if ((to32(bytes) !== this.crc.crc)) {
		return false;
	}
	// now emit a chunk event
	this.emit('chunk', this.chunk_type, this.chunk_data);
	return true;
}


// maybe the pfsm should also pass a reference to the vbuffer of the whole chunk, in case want to send through unchanged.
// not just the data part, as after all if that is not changed we do not need to eg recalculate crc
// for some apps of course just want to drop original data
// and for test roundtripping good
// easier to do with one chunk fn!
// and makes that fn easier to write, just builds vbuf from data, so can still use it, needs to keep in closure
// then data is another vbuff view of same vbuf?

var pfsm = Object.create(FSM);

pfsm.success = function() {
	console.log(this.filename + " is a png file");
};

pfsm.fail = function() {
	console.log(this.filename + " is not a png file");
};

pfsm.match_signature = function(ev, arg) {
	return match.call(this, accept([137, 80, 78, 71, 13, 10, 26, 10]), this.match_chunk_len, this.fail, this.match_signature, ev, arg);
};

pfsm.match_chunk_len = function(ev, arg) {
	return match.call(this, get(4, chunk_len), this.match_chunk_type, this.fail, this.match_chunk_len, ev, arg);
};

pfsm.match_chunk_type = function(ev, arg) {
	return match.call(this, get(4, chunk_type), this.match_chunk_data, this.fail, this.match_chunk_type, ev, arg);
};
	
pfsm.match_chunk_data = function(ev, arg) {
	return match.call(this, chunk_data, this.match_chunk_crc, this.fail, this.match_chunk_data, ev, arg);
};
	
pfsm.match_chunk_crc = function(ev, arg) {
	return match.call(this, get(4, chunk_crc), this.match_eof, this.fail, this.match_chunk_crc, ev, arg);
	//return get2.call(this, 4, chunk_crc, this.match_eof, this.fail, this.match_chunk_crc, ev, arg);
};
	
function eof(ev) {
	if (ev === 'end') {
		this.emit('end');
		return true;
	}
	return (this.vb.length === 0) ? undefined : false;
}

pfsm.match_eof = function(ev, arg) {
	return match.call(this, eof, this.success, this.match_chunk_len, this.match_eof, ev, arg);
};

pfsm.transition = true;

// some sort of compositional method for putting these together would be nice. Look for methods, etc.

// remove init fn - just put in starting state and allow clone, as far as is possible anyway
pfsm.init = function(stream) {
	this.vb = Object.create(vbuf);
	this.vb.init();
	var vb = this.vb;
	this.crc = Object.create(crc.crc32);
	this.state = pfsm.match_signature;
	stream.on('data', function(buf) { // maybe can remove by working directly with buf here not vbuf?
		vb.data.call(vb, buf);
	});
	this.listen(stream, 'data');
	this.listen(stream, 'end');
	stream.on('end', function() {
		stream.removeAllListeners('data');
		stream.removeAllListeners('end');
	});
};

// next layer is chunk ordering constraints, and chunk behaviour

var cfsm = Object.create(emitter); // no need to inherit from FSM!

// PNG standard information
cfsm.chunks = ['IHDR', 'PLTE', 'IDAT', 'IEND', 'cHRM', 'gAMA', 'iCCP', 'sBIT', 'sRGB', 'bKGD', 'hIST', 'tRNS', 'pHYs', 'sPLT', 'tIME', 'iTXt', 'tEXt', 'zTXt'];

cfsm.unavailable = function() { // helper function to remove from available array
	var p;
	for (var i = 0; i < arguments.length; i++) {
		p = this.available.indexOf(arguments[i]);
		if (p !== -1) {
			this.available.splice(p, 1);
		}
	}
};

cfsm.addAvailable = function() { // helper function to add if not there
	var p;
	for (var i = 0; i < arguments.length; i++) {
		p = this.available.indexOf(arguments[i]);
		if (p === -1) {
			this.available.push(arguments[i]);
		}
	}
};

cfsm.parseField = function(data, fields) {
	var bytes = data.bytes(data.length);
	var type, name;
	var ret = {};
	var a = [];
	var i, k, s, z;
	var fs = fields.slice();
	
	console.log("parse " + fields);
	
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
			case 'uint8l':
				ret[name] = bytes.slice();
				bytes = [];
				break;
			case 'keyword': // zero terminated string 1-79 bytes in ISO 8859-1
				var p = bytes.indexOf(0);
				if (p === -1) {
					return "no zero byte after keyword";
				}
				k = bytes.slice(0, p);
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
				bytes = bytes.slice(p + 1);
				ret[name] = s;
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
					s = "unable to uncompress yet!!!!!!!!"
					if (typeof s == 'undefined') {
						return "invalid ISO 8859-1 in string";
					}
					ret[name] = s;
					bytes = [];
					break;
			default:
				return "cannot understand field to parse";
		}
	}
	if (bytes.length !== 0) {
		return "too much data";
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
		
		console.log("header: colour type " + d.type);
		
		this.available = ['tIME', 'zTXt', 'tEXt', 'iTXt', 'pHYs', 'sPLT', 'iCCP', 'sRGB', 'sBIT', 'gAMA', 'cHRM'];
		
		switch(d.type) {
			case 0:
				this.addAvailable('IDAT', 'tRNS', 'bKGD'); // PLTE not allowed
				break;
			case 4:
				this.addAvailable('IDAT', 'bKGD'); // PLTE not allowed, no tRNS allowed
				break;
			case 3:
				this.addAvailable('PLTE'); // PLTE required first
				break;
			case 2:
				this.addAvailable('IDAT', 'PLTE', 'tRNS', 'bKGD'); // PLTE optional
				break;
			case 6:
				this.addAvailable('IDAT', 'PLTE', 'bKGD'); // PLTE optional, no tRNS allowed
				break;
		}
	}
};

cfsm.PLTE = {
	parse: ["palette", "rgb"],
	state: function(d) {
		this.emit('PLTE', d);
		
		this.paletteLength = d.palette.length; // hIST, tRNS need this for validation
		
		this.unavailable('iCCP', 'sRGB', 'sBIT', 'gAMA', 'cHRM');
		this.addAvailable('bKGD', 'hIST', 'IDAT');
		switch (this.header.type) {
			case 4:
			case 6: // tRNS never allowed if alpha channel exists
				break;
			default:
				this.addAvailable('tRNS');
		}

	}
};

cfsm.IDAT = {
	parse: function() {
		return {}; // temporary!!!!!
	},
	state: function(d) {
		this.emit('IDAT', d);
		
		this.addAvailable('IEND');
		this.unavailable('pHYs', 'sPLT', 'iCCP', 'sRGB', 'sBIT', 'gAMA', 'cHRM', 'tRNS', 'bKGD', 'hIST');
	}
};

cfsm.IEND = {
	parse: [],
	state: function(d) {
		this.emit('IEND', d);
		this.emit('end');
		
		this.available = [];
	}
};

cfsm.gAMA = {
	parse: ['gamma', 'float100k'],
	state: function (d) {
		this.emit('gAMA', d);		
		this.unavailable('gAMA');
	}
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
	},
	state: function(d) {
		this.emit('sBIT', d);
		
		this.unavailable('sBIT');
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
	},
	state: function(d) {
		this.emit('bKGD', d);
		
		this.unavailable('bKGD', 'PLTE');
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
				p = ["alpha", "uint8l"];
				break;
		}
		return this.parseField(data, p);
	},
	validate: function(d) {
		if (typeof d.alpha !== 'undefined' && d.alpha.length > this.paletteLength) {
			return "Number of transparent items greater than size pf palette";
		}
	},
	state: function(d) {
		this.emit('tRNS', d);
		
		this.unavailable('tRNS', 'PLTE');
	}
};

cfsm.cHRM = {
	parse: ['whiteX', 'float100k', 'whiteY', 'float100k', 'redX', 'float100k', 'redY', 'float100k', 'greenX', 'float100k', 'greenY', 'float100k', 'blueX', 'float100k', 'blueY', 'float100k'],
	state: function(d) {
		this.emit('cHRM', d);
		
		this.unavailable('cHRM');
	}
};
cfsm.pHYs = {
	parse: ['pixelsX', 'uint32', 'pixelsY', 'uint32', 'unit', 'uint8'],
	state: function(d) {
		this.emit('pHYs', d);
		
		this.unavailable('pHYs');
	}
};
cfsm.hIST = {
	parse: ['frequencies', 'uint16l'],
	validate: function(d) {
		if (d.frequencies.length !== this.paletteLength) {
			return "Number of items in histogram not same is in palette";
		}
	},
	state: function(d) {
		this.emit('hIST', d);
		
		this.unavailable('hIST');
	}
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
	},
	state: function(d) {
		this.emit('tIME', d);
		
		this.unavailable('tIME');
	}
};
cfsm.tEXt = {
	parse: ['keyword', 'keyword', 'value', 'iso8859-1'],
	state: function(d) {
		this.emit('tEXt', d);
		
		console.log("text: " + d.keyword + ": " + d.value);
	}
};
cfsm.zTXt = {
	parse: ['keyword', 'keyword', 'value', 'z-iso8859-1'],
	state: function(d) {
		this.emit('zTXt', d);
		
		console.log("ztext: " + d.keyword + ": " + d.value);
	}
};

cfsm.finish = function() {
	//cleanup listeners?
};
cfsm.error = function(msg) {
	console.log(msg);
	this.finish(); // not sure need this here?
	this.emit('error');
	return;
};
cfsm.end = function () {
	if (this.available.length !== 0) {
		return this.error("unexpected end of stream");
	}
	this.emit('end');
};

cfsm.bytesToString = function(bytes) {
	return String.fromCharCode(bytes[0]) + String.fromCharCode(bytes[1]) + String.fromCharCode(bytes[2]) + String.fromCharCode(bytes[3]);
};

cfsm.chunk = function(type, data) {
	var name = this.bytesToString(type);
	
	console.log("see chunk: " + name);
	
	if (this.chunks.indexOf(name) === -1) {
		return this.error("unknown chunk type " + name + " not yet handled"); // need to add unknown chunk handlers
	}
	
	if (this.available.indexOf(name) === -1) {
		return this.error("chunk " + name + " not allowed here: " + this.available);
	}
		
	// ok we are looking good to go
	
	var ci = this[name];
	
	var d = (typeof ci.parse == 'function') ? ci.parse.call(this, data) : this.parseField(data, ci.parse);
	
	if (typeof d == 'string') {
		return this.error(d);
	}
	
	console.log("parse returned " + Object.keys(d));
		
	if (typeof ci.validate == 'function') {
		var v = ci.validate.call(this, d);
	
		if (typeof v == 'string') {
			return this.error(v);
		}
	}
	
	if (typeof this[name].state !== 'function') {
		return this.error("chunk " + name + " has no handler");
	}
	
	var ret = this[name].state.call(this, d);
	
	if (typeof ret === 'string') {
		return this.error(ret);
	}
};


// this is basically the init fn!
cfsm.listen = function(emitter) { // change fsm to work like this? ie dont pass the events let us choose
	//general init
	this.available = ['IHDR'];
	
	var cfsm = this;
	emitter.on('end', function () {cfsm.end.call(cfsm);});
	emitter.on('chunk', function (type, data) {cfsm.chunk.call(cfsm, type, data);});
};


(function(exports) {
	exports.FSM = FSM;
	exports.vbuf = vbuf;
	exports.accept = accept;
	exports.match = match;
	exports.pfsm = pfsm;
	exports.cfsm = cfsm;
})(

  typeof exports === 'object' ? exports : this
);


