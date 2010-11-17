// pngback. A PNG library for Javascript

var events = require('events');

signature = [137, 80, 78, 71, 13, 10, 26, 10];

// data object for node buffers, a vector of buffers

// should I use prototype not anon fns? work out what we need to override for non node env
// we need to be able to override VBuf to basically add state, unless we use a helper
// helper could be better, as we need to replace the whole thing if not using node

function VBuf(obj) {
	var vb = this;
	
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
	
	this.data = function(buf) {
		console.log("data " + buf.length);
		if (! vb.ended) {
			vb.buffers.push(buf);
			vb.length += buf.length;
			vb.total += buf.length;
			return [buf.length];
		}
	};
	
	this.end = function() {
		console.log("end");
		vb.ended = true;
		return [0];
	};
	
	this.listen = function(fsm, stream) {
		fsm.listen(stream, 'data', vb.data);
		fsm.listen(stream, 'end', vb.end);
	};
	
	this.eat = function(len) {
		if (len === 0) {return;}
		if (len > vb.length) {throw "Trying to eat too much!";}
		vb.offset += len;
		vb.length -= len;
		while (vb.offset >= vb.buffers[0].length) {
			vb.offset -= vb.buffers[0].length;
			vb.buffers.shift();
		}
	};
	this.truncate = function(len) {
		// truncate this vbuf
		if (len > vb.length) {len = vb.length;}
		vb.ended = true;
		var drop = vb.length - len;
		vb.length = len;
		while (vb.buffers[vb.buffers.length - 1].length >= drop) {
			drop -= vb.buffers[vb.buffers.length - 1].length;
			vb.buffers.pop();
		}
	};
	this.ref = function(len) {
		// return a truncated vbuf object, can be used to store a reference to the front of stream
		var trunc = new VBuf(vb);
		trunc.truncate(len);
		return trunc;
	};
	this.byte = function(offset) {
		offset += vb.offset;
		for (var i = 0; i < vb.buffers.length; i++) {
			if (vb.buffers[i].length > offset) {
				return vb.buffers[i][offset];
			} else {
				offset -= vb.buffers[i].length;
			}
		}
	};
}

// oops we want to keep a set of transition events that get passed along.
// we dont actually need to emit an event for the state, unless it wants to (have an entry hook).
// have a nice set of hooks, entry, exit, input, transition (?)
// pass to listen the emitter and event and a function that is called with the event data, the return values are sent to state

function FSM(start) {
	var fsm = this;
	this.state = start;
	this.listeners = [];
	this.listen = function(emitter, ev, ef) {
		var f = function(arg) {
			if (typeof(fsm.state) == 'function') {
				if (typeof ef == 'function') {
					fsm.state = fsm.state.apply(this, ef.apply(null, Array.prototype.slice.call(arguments)));
				} else {
					fsm.state = fsm.state();
				}
			} else {
				while (fsm.listeners.length) {
					var e = fsm.listeners.pop();
					e.emitter.removeListener(e.ev, e.f);
				}	
			}
		};
		fsm.listeners.push({'emitter': emitter, 'ev':ev, 'f':f});
		emitter.on(ev, f);
	};

	this.unlisten = function(emitter, ev) {
		for (var i = 0; i < fsm.listeners.length; i++) {
			var e = fsm.listeners[i];
			if (e.emitter === emitter && e.ev === ev) {
				e.emitter.removeListener(e.ev, e.f);
				delete fsm.listeners[i];
				return;
			}
		}	
	};
}


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




