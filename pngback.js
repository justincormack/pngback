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
// or an event name to emit (could add list of events later)
// or a standard event if it has failed eg noMatch or error.

function Match(fn) {
	events.EventEmitter.call(this);
	this.super_ = events.EventEmitter;
	this.listen = function(emitter, ev) {
		emitter.once(ev, function() {
			var ret = fn.apply(arguments);
			if (typeof ret == 'function') {
				var nm = new Match(ret);
				nm.listen(emitter, ev);
			} else if (typeof ret == 'string') {
				this.emit(ret);
			}
		});
	};
}

//Match.super_ = events.EventEmitter;





function start() {
	
	return ;
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
})(

  typeof exports === 'object' ? exports : this
);




