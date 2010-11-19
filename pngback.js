// pngback. A PNG library for Javascript

var events = require('events');

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
	this.length = len;
	this.ended = true;
	while (this.buffers[this.buffers.length - 1].length >= drop) {
		drop -= this.buffers[this.buffers.length - 1].length;
		this.buffers.pop();
	}
};

VBuf.prototype.ref = function(len) {
	// return a truncated vbuf object, can be used to store a reference to the front of stream
	var trunc = new VBuf();
	trunc.offset = this.offset;
	trunc.length = this.length;
	trunc.buffers = slice(this.buffers);
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
	this.test= 3;
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
function match(items) {
	if (typeof items == 'number') {
		items = [items];
	}
	function g(success, fail) {
		function f(ev) {
			vb = this.vb;
			if (vb.ended && vb.length < items.length) { // cannot match as not enough data
				return fail;
			}
			if (vb.length === 0) { // nothing to check, wait for more data
				return f;
			}
			var canmatch = (items.length > vb.length) ? vb.length: items.length;
			canmatch = 1;
			var bytes = vb.bytes(canmatch);
			for (var i = 0; i < canmatch; i++) {
				if (typeof items[i] == 'number' && items[i] !== bytes[i]) {
					return fail;
				}
				// note we could delete items[i] at this point, so no comparison if repeated
			}
			if (canmatch === items.length) {
				vb.eat(canmatch); // eat it, just eat it.
				return success;
			}
			return match(items)(success, fail);
		}
		return f;
	}
	return g;
}

// sequence match-type functions
function seq() {
	var args = Array.prototype.slice.call(arguments);
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

signature = [137, 80, 78, 71, 13, 10, 26, 10];


(function(exports) {
	exports.FSM = FSM;
	exports.VBuf = VBuf;
	exports.StreamBuffer = StreamBuffer;
	exports.signature = signature;
	exports.match = match;
	exports.seq = seq;
})(

  typeof exports === 'object' ? exports : this
);


