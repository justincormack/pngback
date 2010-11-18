// pngback. A PNG library for Javascript

var events = require('events');

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

// StreamBuffer handles the events and streams, creates VBuf to store data

// less clear where we should handle error events etc. also if we should get a stream creation fn and manage the stream ourselves
// also end event could be handled here
function StreamBuffer(stream) {
	var vb = new VBuf();
	var sb = this;
	this.vb = vb;
	
	events.EventEmitter.call(this);
	
	this.stream = stream;
	
	stream.on('data', function() {
		vb.data.apply(vb, Array.prototype.slice.call(arguments));
		sb.emit('buffer');
		});
	stream.on('end', function() {
		vb.end.apply(vb, Array.prototype.slice.call(arguments));
		sb.emit('buffer');
		});
}

StreamBuffer.super_ = events.EventEmitter;

StreamBuffer.prototype = Object.create(events.EventEmitter.prototype, {
    constructor: {
        value: StreamBuffer,
        enumerable: false
    }
});

// FSM. receives events and has an emitter for the state functions to use.
// aha, we want an emitter for each fsm, which the functions get to use

function FSM(start) {
	events.EventEmitter.call(this);
	this.state = start;
	this.prev = null;
	this.listeners = [];
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
			fsm.finish();
			while (this.listeners.length) {
				var e = this.listeners.pop();
				if (typeof e == 'object') {
					e.emitter.removeListener(e.ev, e.f);
				}
			}
		}
		if (fsm.state !== fsm.prev) { // state change
			fsm.transition();
		}
		
	}
	this.listeners.push({'emitter': emitter, 'ev':ev, 'f':f});
	emitter.on(ev, f);
};

FSM.prototype.unlisten = function(emitter, ev) {
	for (var i = 0; i < this.listeners.length; i++) {
		var e = this.listeners[i];
		if (e.emitter === emitter && e.ev === ev) {
			e.emitter.removeListener(e.ev, e.f);
			delete this.listeners[i];
			return;
		}
	}	
};

// Functions to match against stream
// apply success and fail values
function match(items, offset) {
	function g(success, fail) {
		function f(ev) {
			vb = this.vb;
			offset = typeof offset == 'undefined' ? 0 : offset;
			if (vb.ended && vb.length - offset < items.length) { // cannot match as not enough data
				return fail;
			}
			if (vb.length - offset === 0) { // nothing to check, wait for more data
				return f;
			}
			var canmatch = (items.length > vb.length - offset) ? vb.length - offset: items.length;
			//canmatch = 1;
			var bytes = vb.bytes(canmatch + offset); // should be a function to get offset bytes.
			for (var i = 0; i < canmatch; i++) {
				if (items[i] !== bytes[i + offset]) {
					return fail;
				}
			}
			if (canmatch === items.length) {
				vb.eat(canmatch + offset); // eat it, just eat it.
				return success;
			}
			return match(items.slice(canmatch), canmatch + offset)(success, fail);
		}
		return f;
	}
	return g;
}

// sequence match-type functions
// seeming to run out of stack space. try iterative version? we dont need the recursion! can just create the fns
function seq() {
	function g(success, fail) {
		var args = Array.prototype.slice.call(arguments);
		var head = args.shift();
		if (args.length === 0) {
			return head(success, fail);
		}
		return head(seq(args)(success, fail), fail);
	}
	return g;
}

function seq2() {
	function g(success, fail) {
		var args = Array.prototype.slice.call(arguments);
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
	exports.seq2 = seq2;
})(

  typeof exports === 'object' ? exports : this
);


