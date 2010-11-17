// pngback. A PNG library for Javascript

var events = require('events');

signature = [137, 80, 78, 71, 13, 10, 26, 10];

// data object for node buffers, a vector of buffers

// should I use prototype not anon fns? work out what we need to override for non node env
// we need to be able to override VBuf to basically add state, unless we use a helper
// helper could be better, as we need to replace the whole thing if not using node

function VBuf(obj) {
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

VBuf.prototype.data = function(buf) {
	console.log("data " + buf.length);

	this.buffers.push(buf);
	this.length += buf.length;
	this.total += buf.length;
	return [buf.length];
};
	
VBuf.prototype.end = function() {
	console.log("end");
	this.ended = true;
	return [0];
};
	
VBuf.prototype.listen = function(fsm, stream) {
	fsm.listen(stream, 'data', this.data, this);
	fsm.listen(stream, 'end', this.end, this);
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

// not sure we should allow reading not from front?
VBuf.prototype.byte = function(offset) {
	offset += this.offset;
	for (var i = 0; i < this.buffers.length; i++) {
		if (this.buffers[i].length > offset) {
			return this.buffers[i][offset];
		} else {
			offset -= this.buffers[i].length;
		}
	}
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
	var f = function(arg) {
		if (typeof(fsm.state) == 'function') {
			if (typeof ef == 'function') {
				fsm.state = fsm.state.apply(this, ef.apply(scope, Array.prototype.slice.call(arguments)));
			} else {
				fsm.state = fsm.state();
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



// quick example. Initial state is start, events called 'tick', goes to t1, t2, t3, stop
var start, t1, t2, t3, t4, stop;

function start() {
	console.log('start');
	return t1;
}

function t1() {
	console.log('1');
	return t2;
}

function t2() {
	console.log('2');
	return t3;
}
function t3() {
	console.log('3');
	return t4;
}
function t4() {
	console.log('4');
	return stop;
}
function stop() {
	console.log('stop');
	return;
}

function Ticker(ev, n) {
	events.EventEmitter.call(this);
}

Ticker.super_ = events.EventEmitter;

Ticker.prototype = Object.create(events.EventEmitter.prototype, {
    constructor: {
        value: Ticker,
        enumerable: false
    }
});

Ticker.prototype.run = function(ev, n) {
	for (var i = 0; i < n; i++) {
		this.emit(ev);
	}		
};

function test() {
	var fsm = new FSM(start);
	var ticker = new Ticker();
	fsm.listen(ticker, 'tick');
	ticker.run('tick', 10);
}

var vs;

function vs(bytes) {
	console.log('received ' + bytes);
	
	if (bytes === 0) {
		return;
	}
	return vs;
}

function vtest(stream) {
	// some info from our stream
	// uses vbuf directly without helper

	var fsm = new FSM(vs);
	var vb = new VBuf();
	vb.listen(fsm, stream);
	
}



(function( exports ) {
	// All library code
	exports.vtest = vtest;
	exports.test = test;
})(

  typeof exports === 'object' ? exports : this
);




