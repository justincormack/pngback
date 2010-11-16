// pngback. A PNG library for Javascript

var events = require('events');

signature = [137, 80, 78, 71, 13, 10, 26, 10];

// data object for node buffers, a vector of buffers

// should I use prototype not anon fns? performance.

function VBuf(obj) {
	if (typeof obj == 'object') {
		this.offset = obj.offset;
		this.length = obj.length;
		this.buffers = slice(obj.buffers);
		this.end = obj.end;
	} else {
		this.offset = 0;
		this.length = 0;
		this.buffers = [];
		this.end = false;
	}
	
	this.append = function(buf) {
		if (! this.end) {
			this.buffers.push(buf);
			this.length += buf.length;
		}
	};
	this.eat = function(len) {
		if (len === 0) {return;}
		if (len > this.length) {throw "Trying to eat too much!";}
		this.offset += len;
		this.length -= len;
		while (this.offset >= this.buffers[0].length) {
			this.offset -= this.buffers[0].length;
			this.buffers.shift();
		}
	};
	this.end = function() {
		this.end = true;
	};
	this.truncate = function(len) {
		// truncate this vbuf
		if (len > this.length) {len = this.length;}
		this.end();
		var drop = this.length - len;
		this.length = len;
		while (this.buffers[this.buffers.length - 1].length >= drop) {
			drop -= this.buffers[this.buffers.length - 1].length;
			this.buffers.pop();
		}
	};
	this.ref = function(len) {
		// return a truncated vbuf object, can be used to store a reference to the front of stream
		var vb = new VBuf(this);
		vb.truncate(len);
		return vb;
	};
	this.byte = function(offset) {
		offset += this.offset;
		for (var i = 0; i < this.buffers.length; i++) {
			if (this.buffers[i].length > offset) {
				return this.buffers[i][offset];
			} else {
				offset -= this.buffers[i].length;
			}
		}
	};
}


// state machine. set as listener for (data) events and emits new ones if some conditions match
// the passed function is called on any input events and should return:
// a new function if it could still succeed
// or an array, the first item of which is the event name, this stops listening as state no longer active.
// or a standard event if it has failed eg noMatch or error.

// now obsolete. See FSM below that does not do state transition events.
function State() {
	events.EventEmitter.call(this);
	this.super_ = events.EventEmitter;
	this.listeners = [];
	this.listen = function(emitter, ev, fn) {
		var e = {'emitter': emitter, 'ev':ev, 'fn':fn};
		emitter.once(ev, function() {
			var ret = fn.apply(arguments);
			if (typeof ret == 'function') {
				var nm = new Match(ret);
				nm.listen(emitter, ev);
			} else {
				while (this.listeners.length) {
					var e = this.listeners.pop();
					e.emitter.removeListener(e.ev, e.fn);
				}
				this.emit.apply(ret);
			}
		});
		this.listeners.push(e);
	};
}

// oops we want to keep a set of transition events that get passed along.
// we dont actually need to emit an event for the state, unless it wants to (have an entry hook).
// have a nice set of hooks, entry, exit, input, transition (?)

function FSM(start) {
	var fsm = this;
	var state;
	this.state = start;
	this.listeners = [];
	this.listen = function(emitter, ev) {
		var f = function() {
			if (typeof(fsm.state) == 'function') {
				fsm.state = fsm.state.apply(Array.prototype.slice.apply(arguments).unshift(emitter, ev));
			} else {
				while (fsm.listeners.length) {
					e = fsm.listeners.pop();
					e.emitter.removeListener(e.ev, e.f);
				}	
			}
		};
		var e = {'emitter': emitter, 'ev':ev, 'f':f};
		this.listeners.push(e);
		e.emitter.on(e.ev, f);
	};

	this.unlisten = function(emitter, ev) {
		for (var i = 0; i < this.listeners.length; i++) {
			var e = this.listeners[i];
			if (e.emitter === emitter && e.ev === ev) {
				e.emitter.removeListener(e.ev, e.f);
				delete this.listeners[i];
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
};

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






function info(st) {
	// some info from our stream
	//state={};
	vb = new VBuf();
	
	st.addListener('data', vb.append).
	   addListener('end', vb.end).
	   addListener('err', function err(exception) {throw exception;});
	
}



(function( exports ) {
	// All library code
	exports.info = info;
	exports.test = test;
})(

  typeof exports === 'object' ? exports : this
);




