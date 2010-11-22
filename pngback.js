// pngback. A PNG library for Javascript


// make vbuf just array of buffer, offset, len to simplify
// get rid of ended - use end events properly, ie get these functions to check for them
// can stream out buffer data from chunks to next layer out, wg so can start to inflate chunk before checksum
// make eat the usual behaviour, ie most stuff greedy, return proper closures to continue with the partial results 

// merge all the functions into one big one stops the stupid lack of encapsulation shit, and we can store all the state in the function until we fire event


var events = require('events');

var isArray = Array.isArray;

/* Crockford style prototypal inheritence http://javascript.crockford.com/prototypal.html */
/* use as newObject = Object.create(oldObject); */
/* alreday in node!
if (typeof Object.create !== 'function') {
    Object.create = function (o) {
        function F() {}
        F.prototype = o;
        return new F();
    };
} */

// extend eventEmitter to be able to emit an event in a different scope than that of the eventEmitter itself
events.EventEmitter.prototype.on2 = function(ev, f, scope) {
	this.on(ev, function() {f.apply(scope, Array.prototype.slice.call(arguments));});
};

// data object for node buffers, a vector of buffers

function VBuf() {
	this.offset = 0;
	this.length = 0;
	this.buffers = [];
	this.total = 0;
	this.ended = false;
}

VBuf.prototype.data = function(buf) {
	this.buffers.push(buf);
	this.length += buf.length;
	this.total += buf.length;
};
	
VBuf.prototype.end = function() {
	this.ended = true;
};
	
VBuf.prototype.eat = function(len) {
	if (len === 0) {return;}
	if (len > this.length) {len = this.length;}
	this.offset += len;
	this.length -= len;
	while (this.buffers.length !== 0 && this.offset >= this.buffers[0].length) {
		this.offset -= this.buffers[0].length;
		this.buffers.shift();
	}
};

VBuf.prototype.truncate = function(len) {
	// truncate this vbuf
	if (len > this.length) {len = this.length;}
	var drop = this.length - len;
	while (this.buffers[this.buffers.length - 1].length <= drop) {
		drop -= this.buffers[this.buffers.length - 1].length;
		this.buffers.pop();
	}
	this.length = len;
	this.ended = true;	
};

VBuf.prototype.ref = function(len) {
	// return a truncated vbuf object, can be used to store a reference to the front of stream
	var trunc = new VBuf();
	trunc.buffers = this.buffers.slice();
	trunc.offset = this.offset;
	trunc.length = this.length;
	trunc.ended = this.ended;
	trunc.total = this.total;
	trunc.truncate(len);
	return trunc;
};

// not sure which fns we need
VBuf.prototype.head = function() {
	var offset = this.offset;
	var buf = 0;
	if (this.length === 0) {
		return;
	}
	while (this.buffers[buf].length <= offset) {
		offset = 0;
		buf++;
	}
	return this.buffers[buf][offset];
};

VBuf.prototype.bytes = function(len) {
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
};

VBuf.prototype.all = function() {
	return this.bytes.call(this, this.length);
};

// little object to store events so we can unlisten easily
// change to object notation
function Evstore () {
	this.listeners = [];
}

Evstore.prototype.add = function(emitter, ev, f) {
	this.listeners.push({'emitter': emitter, 'ev':ev, 'f':f});
	emitter.on(ev, f);
};

Evstore.prototype.finish = function() {
	var e;
	while (this.listeners.length) {
		e = this.listeners.pop();
		e.emitter.removeListener(e.ev, e.f);
	}	
};

// StreamBuffer handles the events and streams, creates VBuf to store data

// less clear where we should handle error events etc. also if we should get a stream creation fn and manage the stream ourselves
// also end event could be handled here

// remove this? use directly?
function StreamBuffer(stream) {
	
	events.EventEmitter.call(this);
		
	this.vb = new VBuf();
	this.es = new Evstore();
	
	this.stream = stream;
	
	this.levents.map(this.evfn, this);
	
	//console.log(this);
	//console.log("after create");
}

StreamBuffer.super_ = events.EventEmitter;

StreamBuffer.prototype = Object.create(events.EventEmitter.prototype, {
    constructor: {
        value: StreamBuffer,
        enumerable: false
    }
});

StreamBuffer.prototype.levents = ['data', 'end'];

StreamBuffer.prototype.vbfn = function(ev) {
	var sb = this;
	return function() {
		sb.vb[ev].apply(sb.vb, Array.prototype.slice.call(arguments));
		sb.emit(ev);
	};
};

StreamBuffer.prototype.evfn = function(ev) {
	this.es.add(this.stream, ev, this.vbfn(ev));
};

// not sure our use of finish here is quite consistent
StreamBuffer.prototype.finish = function() {
	//console.log(this);
	this.es.finish();
	delete this.vb;
	this.stream.destroy();
};

// FSM. receives events and has an emitter for the state functions to use.
// aha, we want an emitter for each fsm, which the functions get to use
// should an fsm be a function, so can use it as a component of another fsm? or just evented composition? or can we use functions to compose?
// also should listen events be constructors?
function FSM() {
	events.EventEmitter.call(this);
	this.state = null;
	this.prev = null;
	this.es = new Evstore();
	this.transition = false; // fire internal event on transition
	this.start();
}

FSM.super_ = events.EventEmitter;

FSM.prototype = Object.create(events.EventEmitter.prototype, {
    constructor: {
        value: FSM,
        enumerable: false
    }
});

FSM.prototype.transition = function() {
	this.emit('transition');
};

FSM.prototype.start = function() {
	this.emit('start');
};

FSM.prototype.finish = function() {
	this.emit('finish');
};

// pass the event (but not emitter) to the function
FSM.prototype.listen = function(emitter, ev) {
	var fsm = this;
	function f() {
		var args = Array.prototype.slice.call(arguments);
		args.unshift(ev);
		fsm.prev = fsm.state;
		console.log("event " + args[0]);
		console.log("state " + fsm.state);
		fsm.state = fsm.state.apply(fsm, args);
		if (typeof(fsm.state) !== 'function') {// did not return a function so we are done // kill this?
			fsm.es.finish();
			fsm.finish();
		}
		
		if (fsm.transition === true) {
			while (fsm.state !== fsm.prev) {
				fsm.prev = fsm.state;
				console.log("internal event");
				fsm.state = fsm.state.call(fsm, 'transition');
			}
		}
		
		
		if (fsm.state !== fsm.prev) { // state change
			console.log("transition");
			fsm.transition();
		}
		
	}
	this.es.add(emitter, ev, f);
};

// Functions to match against stream
// apply success and fail values
// would be nice if you didnt have to put in offset. Changing values to undefined would be a way, so undefined does not check...
// for now making an internal only helper with the offset...
// should these functions be prototypes of a type of fsm? Yes!

// pull out the actual matching op, so we can do stuff in it.

function match(check) {
	var fsm = this;
	function g(success, fail) {
		function f() {
			console.log("check is " + check);
			console.log("fail is " + fail);
			console.log("success is " + success);
			var ret = check.call(fsm, fsm.vb);
			if (typeof ret == 'undefined') {
				return g;
			}
			return (ret === true) ? success : fail;
		}
		return f;
	}
	return g;
}

// an accept function - matches a list of bytes, as our original match was
function accept(items) {
	fsm = this;
	if (! isArray(items)) {
		items = [items];
	}
	function f() {
		vb = fsm.vb;
		if (vb.ended && vb.length < items.length) { // cannot match as not enough data
			return false;
		}
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
	return match.call(this, f);
}

// general get n bytes, but no checks until end when call check. accept could use, but in some cases good to fail sooner. passes as bytes not vb
function get(len, check) {
	function f() {
		vb = this.vb;
		if (vb.ended && vb.length < len) { // cannot match as not enough data
			return false;
		}
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
	return match.call(this, f);
}

// sequence match-type functions
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
}

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

crc32.start();

function to32(bytes) {
	var c = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes [3];
	c = (c < 0) ? 0xffffffff + c + 1: c;
	return c;
}

/* png specific from here */

// merge chunk len and chunk type? or even all 4! That would be more efficient
function chunk_len(bytes) {
	
	console.log("chunking");
	
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
	this.crc = Object.create(crc32);
	this.crc.start();
	this.crc.add(bytes);
	return true;
}


// duplicating code here again, need to refactor? chunk_len tied in too much!
function chunk_data() {
	len = this.chunk_len;
	vb = this.vb;
	if (vb.ended && vb.length < len) { // cannot match as not enough data
		return false;
	}
	if (vb.length < len) {
		return undefined;
	}
	if (len === 0) {
		console.log("zero len block");
	}
	this.crc.add(vb.bytes(len));
	this.crc.finalize();
	this.chunk_data = vb.ref(len);
	vb.eat(len);
	return true;
}


function chunk_crc(bytes) {
	console.log("crc " + (to32(bytes)) + " vs " + this.crc.crc);
	return (to32(bytes) === this.crc.crc);
}

function succeed() {
	return true;
}

var match_chunk_crc = get(4, chunk_crc);




var pfsm = new FSM();

pfsm.success = function() {
	console.log(this.filename + " is a png file");
};

pfsm.fail = function() {
	console.log(this.filename + " is not a png file");
};

//pfsm.chunk = function() {return seq.call(this, match_chunk_len, match_chunk_type, match_chunk_data, match_chunk_crc).call(this, this.eof, this.fail);};

pfsm.match_signature = function() {return accept.call(this, [137, 80, 78, 71, 13, 10, 26, 10])(this.match_chunk_len, this.fail);};

pfsm.match_chunk_len = function() {return get.call(this, 4, chunk_len)(this.match_chunk_type, this.fail);};
pfsm.match_chunk_type = function() {return get.call(this, 4, chunk_type)(this.match_chunk_data, this.fail);};
pfsm.match_chunk_data = function() {return match.call(this, chunk_data)(this.match_chunk_crc, this.fail);};
pfsm.match_chunk_crc = function() {return get.call(this, 4, chunk_crc)(this.match_eof, this.fail);};

pfsm.match_eof = function() { // use match again!
	console.log("check end " + this.vb.ended + " avail " + this.vb.length);
	if (this.vb.length === 0) {
		return this.match_eof;
	}
	return (this.vb.ended) ? this.success : this.match_chunk_len;
};


pfsm.state = pfsm.match_signature;
pfsm.transition = true;


(function(exports) {
	exports.FSM = FSM;
	exports.VBuf = VBuf;
	exports.StreamBuffer = StreamBuffer;
	exports.accept = accept;
	exports.match = match;
	exports.seq = seq;
	exports.pfsm = pfsm;
})(

  typeof exports === 'object' ? exports : this
);


