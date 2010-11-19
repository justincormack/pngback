// pngback. A PNG library for Javascript

var events = require('events');

var isArray = Array.isArray;

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
	while (this.offset >= this.buffers[0].length) {
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

// little object to store events so we can unlisten easily
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
StreamBuffer.prototype.eevent = 'buffer';

StreamBuffer.prototype.vbfn = function(ev) {
	var sb = this;
	return function() {
		sb.vb[ev].apply(sb.vb, Array.prototype.slice.call(arguments));
		sb.emit(sb.eevent);
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
// should an fsm be a function, so can use it as a component of another fsm? or just evented composition?
// also should listen events be constructors?
function FSM(start) {
	events.EventEmitter.call(this);
	this.state = start;
	this.prev = null;
	this.es = new Evstore();
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
		fsm.state = fsm.state.apply(fsm, args);
		if (typeof(fsm.state) !== 'function') {// did not return a function so we are done
			fsm.es.finish();
			fsm.finish();
		}
		if (fsm.state !== fsm.prev) { // state change
			fsm.transition();
		}
		
	}
	this.es.add(emitter, ev, f);
};

// Functions to match against stream
// apply success and fail values
// would be nice if you didnt have to put in offset. Changing values to undefined would be a way, so undefined does not check...
// for now making an internal only helper with the offset...
// should these functions be prototypes of a type of fsm?

// pull out the actual matching op, so we can do stuff in it.

function match(check) {
	function g(success, fail) {
		function f() {
			var ret = check.call(this, this.vb);
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
	if (! isArray(items)) {
		items = [items];
	}
	function f(vb) {
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
	return match(f);
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

/* png specific from here */

// png file signature
signature = [137, 80, 78, 71, 13, 10, 26, 10];


function to32(bytes) {
	return (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes [3];
}

function chunk_len(vb) {
	if (vb.ended && vb.length < 4) { // cannot match as not enough data
		return false;
	}
	if (vb.length < 4) {
		return undefined;
	}
	var bytes = vb.bytes(4);

	if (bytes[0] & 0x80) { // high bit must not be set
		return false;
	}
	var len = to32(bytes);
	this.chunk_len = len;
	
	// probably a good idea to add a smaller length check here...
	
	vb.eat(4);
	
	return true;
}

var match_chunk_len = match(chunk_len);

var match_signature = accept(signature);

(function(exports) {
	exports.FSM = FSM;
	exports.VBuf = VBuf;
	exports.StreamBuffer = StreamBuffer;
	exports.signature = signature;
	exports.accept = accept;
	exports.match = match;
	exports.seq = seq;
	exports.match_chunk_len = match_chunk_len;
	exports.match_signature = match_signature;
})(

  typeof exports === 'object' ? exports : this
);


