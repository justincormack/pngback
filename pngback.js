// pngback. A PNG library for Javascript

var events = require('events');

signature = [137, 80, 78, 71, 13, 10, 26, 10];

// data object for node buffers, a vector of buffers

function VBuf() {
	this.offset = 0;
	this.length = 0;
	this.buffers = [];
	this.total = 0;
	this.ended = false;
}

VBuf.prototype.data = function(buf) {
	console.log("data " + buf.length);

	this.buffers.push(buf);
	this.length += buf.length;
	this.total += buf.length;
};
	
VBuf.prototype.end = function() {
	console.log("end");
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

// StreamBuffer handles the events and streams, creates VBuf to store data

// less clear where we should handle error events etc. also if we should get a stream creation fn and manage the stream ourselves
// also end event could be handled here
function StreamBuffer(stream) {
	var vb = new VBuf();
	var sb = this;
	
	events.EventEmitter.call(this);
	
	this.stream = stream;
	
	stream.on('data', function() {
		vb.data.apply(vb, Array.prototype.slice.call(arguments));
		sb.emit('buffer', vb);
		});
	stream.on('end', function() {
		vb.end.apply(vb, Array.prototype.slice.call(arguments));
		sb.emit('buffer', vb);
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
// oops we want to keep a set of transition events that get passed along.
// aha, we want an emitter for each fsm, which the functions get to use

function FSM(start) {
	events.EventEmitter.call(this);
	this.state = start;
	this.listeners = [];
}

FSM.super_ = events.EventEmitter;

FSM.prototype = Object.create(events.EventEmitter.prototype, {
    constructor: {
        value: FSM,
        enumerable: false
    }
});

// maybe restore the passed function. now if listen to multiple events cannot distinguish
// see if adding ev ok for now? seems to cause issues on apply. hmm annoying
// is this the best way of ending? Maybe somewhere else should be removing fsm on event?
// .unshift(ev)
FSM.prototype.listen = function(emitter, ev) {
	var fsm = this;
	function f() {
		var args = Array.prototype.slice.call(arguments);
		args.unshift(ev);
		fsm.state = fsm.state.apply(fsm, args);
 		if (typeof(fsm.state) !== 'function') {// did not return a function so we are done
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


// Functions to match against stream
// pass success and fail values, normally functions for state change but could be values for composition
function Match(success, fail, items) {
	var f;
	f = function(vb) {
		if (vb.ended && vb.length < items.length) { // cannot match as not enough data
			return fail;
		}
		if (vb.length === 0) { // nothing to check, try again later
			return f;
		}
		var canmatch = (items.length > vb.length) ? vb.length : items.length;
		for (var i = 0; i < canmatch; i++) {
			
		}
		
		
	}
	return f;
}



(function(exports) {
	exports.FSM = FSM;
	exports.VBuf = VBuf;
	exports.StreamBuffer = StreamBuffer;
})(

  typeof exports === 'object' ? exports : this
);


