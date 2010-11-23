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

var isArray = Array.isArray;

// extend eventEmitter to be able to emit an event in a different scope than that of the eventEmitter itself
events.EventEmitter.prototype.on2 = function(ev, f, scope) {
	this.on(ev, function() {f.apply(scope, Array.prototype.slice.call(arguments));});
};

// data object for node buffers, a vector of buffers
// fix so that is an array of triples: buffer, offset length, not just one offset, length. Fixes edge cases in truncate if then add more... which can do now ended removed
// hmm, without init all get same buffer! should we make create for our objects?

var vbuf = {
	init: function() {
		this.buffers = [];
		this.offset = 0;
		this.length = 0;
	},
	data: function(buf) {
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

emitter = new events.EventEmitter(); // need to init to make this work.
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

function match(check, success, fail, again, args) {
	args = Array.prototype.slice.call(args); // only do if needed!
	var ret = check.apply(this, args);
	if (typeof ret == 'undefined') {
		return again;
	}
	if (typeof ret == 'function') {
		return ret;
	}
	return (ret === true) ? success : fail;
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

// sequence match-type functions
/*
function seq(args) {
	if (! isArray(args)) {
		args = Array.prototype.slice.call(arguments);
	}
	function g(success, fail) {
		var head = null;
		var prev = success;
		while (args.length > 0) {
			head = args.pop()(prev, fail);
			prev = head;
		}
		return head;
	}
	return g;
} */

/* crc32 - seems like a fairly standard one so not yet namespaced as png */
var crc32 = {
	seed: 0xedb88320,
	crc: 0xffffffff,
	table: [],
	init: function() {
		var c;

		for (var n = 0; n < 256; n++) {
			c = n;
			for (var k = 0; k < 8; k++) {
				if (c & 1) {
					c = this.seed ^ (c >>> 1);
				} else {
					c = c >>> 1;
				}	
			}
			c = (c < 0) ? 0xffffffff + c + 1: c;
			this.table[n] = c;
		}
	},
	start: function() {
		this.crc = 0xffffffff;
		if (this.table.length === 0) {
			this.init();
		}
	},
	add: function(bytes) {
		var c = this.crc;
		var len = bytes.length;

		for (var n = 0; n < len; n++) {
			c = this.table[(c ^ bytes[n]) & 0xff] ^ (c >>> 8);
		}
		this.crc = c;	
	},
	finalize: function() {
		var c = this.crc;
		c = c ^ 0xffffffff;
		c = (c < 0) ? 0xffffffff + c + 1: c;
		this.crc = c;
		return c;
	}
};

crc32.start(); // initialize table on parent object

function to32(bytes) {
	var c = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes [3];
	c = (c < 0) ? 0xffffffff + c + 1: c;
	return c;
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
	console.log("crc " + (to32(bytes)) + " vs " + this.crc.crc);
	if ((to32(bytes) !== this.crc.crc)) {
		return false;
	}
	// now emit a chunk event
	this.emit('chunk', this.chunk_type, this.chunk_data);
	return true;
}

var pfsm = Object.create(FSM);

pfsm.success = function() {
	console.log(this.filename + " is a png file");
};

pfsm.fail = function() {
	console.log(this.filename + " is not a png file");
};

pfsm.match_signature = function() {
	return match.call(this, accept([137, 80, 78, 71, 13, 10, 26, 10]), this.match_chunk_len, this.fail, this.match_signature, arguments);
};

pfsm.match_chunk_len = function() {
	return match.call(this, get(4, chunk_len), this.match_chunk_type, this.fail, this.match_chunk_len, arguments);
};

pfsm.match_chunk_type = function() {
	return match.call(this, get(4, chunk_type), this.match_chunk_data, this.fail, this.match_chunk_type, arguments);
};
	
pfsm.match_chunk_data = function() {
	return match.call(this, chunk_data, this.match_chunk_crc, this.fail, this.match_chunk_data, arguments);
};
	
pfsm.match_chunk_crc = function() {
	return match.call(this, get(4, chunk_crc), this.match_eof, this.fail, this.match_chunk_crc, arguments);
};

function eof(ev) {
	if (ev === 'end') {
		this.emit('end');
		return true;
	}
	return (this.vb.length === 0) ? undefined : false;
}

pfsm.match_eof = function() {
	return match.call(this, eof, this.success, this.match_chunk_len, this.match_eof, arguments);
};

pfsm.transition = true;

// some sort of compositional method for putting these together would be nice. Look for methods, etc.

// remove init fn - just put in starting state and allow clone, as far as is possible anyway
pfsm.init = function(stream) {
	this.vb = Object.create(vbuf);
	this.vb.init();
	var vb = this.vb;
	this.crc = Object.create(crc32);
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
//cfsm.criticalChunks = ['IHDR', 'PLTE', 'IDAT', 'IEND'];
//cfsm.ancillaryChunks = ['cHRM', 'gAMA', 'iCCP', 'sBIT', 'sRGB', 'bKGD', 'hIST', 'tRNS', 'pHYs', 'sPLT', 'tIME', 'iTXt', 'tEXt', 'zTXt'];
//cfsm.chunks = ['IHDR', 'PLTE', 'IDAT', 'IEND', 'cHRM', 'gAMA', 'iCCP', 'sBIT', 'sRGB', 'bKGD', 'hIST', 'tRNS', 'pHYs', 'sPLT', 'tIME', 'iTXt', 'tEXt', 'zTXt'];
cfsm.chunks = ['IHDR', 'PLTE', 'IDAT', 'IEND'];

cfsm.rep = { // used to filter out ones used before. 1 and ? mean can only appear once, so enforce. prob can simplify table
	IHDR: "1",
	PLTE: "?",
	IDAT: "+",
	IEND: "1",
	
	cHRM: "?",
	gAMA: "?",
	iCCP: "?", // only one of sRGB and iCCP so modify if one found or handle in state
	sRGB: "?", // only one of sRGB and iCCP so modify if one found or handle in state
	sBIT: "?",
	bKGD: "?",
	hIST: "?", // not allowed until we get PLTE but this handled in states
	tRNS: "?", // not allowed until we get PLTE but this handled in states
	pHYs: "?",
	sPLT: "*",
	tIME: "?",
	iTXt: "*",
	tEXt: "*",
	zTXt: "*"
};
cfsm.states = { // functions that are called in each state, return the allowable states (these will be checked for if only allowed once)
	IHDR: function() {
		return ['tIME', 'zTXt', 'tEXt', 'iTXt', 'pHYs', 'sPLT', 'iCCP', 'sRGB', 'sBIT', 'gAMA', 'cHRM', 'tRNS', 'bKGD', 'IDAT', 'PLTE'];
	},
	PLTE: function() {
		return ['tIME', 'zTXt', 'tEXt', 'iTXt', 'tRNS', 'hIST', 'bKGD', 'IDAT'];
	},
	IDAT: function() {
		return ['tIME', 'zTXt', 'tEXt', 'iTXt', 'IDAT', 'IEND'];
	},
	IEND: function() {
		return [];
	},
		
		"cHRM": "?",
		"gAMA": "?",
		"iCCP": "?",
		"sRGB": "?",
		"sBIT": "?",
		"bKGD": "?",
		"hIST": "?",
		"tRNS": "?",
		"pHYs": "?",
		"sPLT": "*",
		"tIME": "?",
		"iTXt": "*",
		"tEXt": "*",
		"zTXt": "*"
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
	
	if (this.chunks.indexOf(name) === -1) {
		return this.error("unknown chunk type " + name + " not yet handled"); // need to add unknown chunk handlers
	}
	
	if (this.available.indexOf(name) === -1) {
		return this.error("chunk " + name + " not allowed here");
	}
	
	var rep = this.rep[name];
	var used = this.used[name];
	if (typeof used !== 'number') {
		used = 0;
	}
	
	if ((rep === '1' || rep === '?') && used !== 0) {
		return this.error("chunk " + name + " repeated illegally");
	}
	
	this.used[name] = used + 1;
	
	// ok we are looking good to go
	
	if (typeof this.states[name] !== 'function') {
		return this.error("chunk " + name + " has no handler");
	}
	
	this.available = this.states[name].call(this);
};

cfsm.used = {};
cfsm.available = ['IHDR'];
cfsm.listen = function(emitter) { // change fsm to work like this? ie dont pass the events let us choose
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


