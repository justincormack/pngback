// pngback. A PNG library for Javascript

var events = require('events');

signature = [137, 80, 78, 71, 13, 10, 26, 10];

// data object for node buffers, a vector of buffers

// acts as a reciever of stream events and emits 'buffer' events with itself as an argument

function VBuf(obj) {
	events.EventEmitter.call(this);
	
	if (typeof obj == 'object') {
		this.offset = obj.offset;
		this.length = obj.length;
		this.buffers = slice(obj.buffers);
		this.ended = obj.ended;
		this.total = obj.total;
	} else {
		this.offset = 0;
		this.length = 0;
		this.buffers = [];
		this.ended = false;
		this.total = 0;
	}
}

VBuf.super_ = events.EventEmitter;

VBuf.prototype = Object.create(events.EventEmitter.prototype, {
    constructor: {
        value: VBuf,
        enumerable: false
    }
});

VBuf.prototype.emitEvent = function(n) {
	this.emit('buffer', n, this);
};

VBuf.prototype.data = function(buf) {
	console.log("data " + buf.length);

	this.buffers.push(buf);
	this.length += buf.length;
	this.total += buf.length;
	this.emitEvent(buf.length);
};
	
VBuf.prototype.end = function() {
	console.log("end");
	this.ended = true;
	this.emitEvent(0);
};


VBuf.prototype.open = function(stream) {
	var vb = this;

	stream.on('data', function() {vb.data.apply(vb, Array.prototype.slice.call(arguments));});
	stream.on('end', function() {vb.end.apply(vb, Array.prototype.slice.call(arguments));});
};
	
VBuf.prototype.eat = function(len) {
	if (len === 0) {return;}
	if (len > this.length) {throw "Trying to eat too much!";}
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
	this.ended = true;
	var drop = this.length - len;
	this.length = len;
	while (this.buffers[this.buffers.length - 1].length >= drop) {
		drop -= this.buffers[this.buffers.length - 1].length;
		this.buffers.pop();
	}
};

VBuf.prototype.ref = function(len) {
	// return a truncated vbuf object, can be used to store a reference to the front of stream
	var trunc = new VBuf(this);
	trunc.truncate(len);
	return trunc;
};

// not sure we should allow reading not from front? prob return array of given len from front using push
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
		bytes.push(this.buffers[buf][offset]);
	}
	return bytes;
};

// oops we want to keep a set of transition events that get passed along.
// we dont actually need to emit an event for the state, unless it wants to (have an entry hook).
// have a nice set of hooks, entry, exit, input, transition (?)
// pass to listen the emitter and event and a function that is called with the event data, the return values are sent to state

function FSM(start) {
	this.state = start;
	this.listeners = [];
}

FSM.prototype.listen = function(emitter, ev, ef, scope) {
	var fsm = this;
	var f = function() {
		if (typeof(fsm.state) == 'function') {
			if (typeof ef == 'function') {
				fsm.state = fsm.state.apply(fsm, ef.apply(scope, Array.prototype.slice.call(arguments)));
			} else {
				fsm.state = fsm.state.apply(fsm, Array.prototype.slice.call(arguments));
			}
		} else { // did not return a function so we are done
			while (fsm.listeners.length) {
				var e = fsm.listeners.pop();
				if (typeof e == 'object') {
					e.emitter.removeListener(e.ev, e.f);
				}
			}	
		}
	};
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


// add state handler to pass some state around eg event emitter


// convenience function for stream setup
function StreamFSM(stream, start) {
	var fsm = new FSM(start);
	var vb = new VBuf();
	fsm.listen(vb, 'buffer');
	vb.open(stream);
}


(function(exports) {
	exports.FSM = FSM;
	exports.VBuf = VBuf;
	exports.StreamFSM = StreamFSM;
})(

  typeof exports === 'object' ? exports : this
);


