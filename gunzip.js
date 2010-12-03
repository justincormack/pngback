// zlib.js
// A compression/decompression library for Javascript
// (c) 2010 Justin Cormack

var events = require('events');
var adler32 = require('./checksum').adler32;

var emitter = new events.EventEmitter();

var inflate = Object.create(emitter);

inflate.read = function(stream) {
	var inflate = this;
	
	function unlisten() {
		stream.removeListener('data', data);
		stream.removeListener('end', end);	
	}
	
	function data(buf) {
		while (typeof state == 'function' && buf.length) {
			var ret = state('data', buf);
			
			if (typeof ret == 'string') {
				png.emit('bad', ret);
				state = null;
			}
			
			buf = ret;
		}
		
		if (typeof state !== 'function') {
			unlisten();
		}
	}
	
	function end() {
		var ret = state('end');
			
		if (typeof ret == 'string') {
			png.emit('bad', ret);
			state = null;
		}
		
		unlisten();
		png.emit('end');
	}
	
	function get(len, match, ev, buf, acc) {
		
		function again(ev, buf) {
			return get(len, match, ev, buf, acc);
		}
		
		if (ev != 'data') {
			return "unexpected end of stream";
		}

		if (typeof acc == 'undefined') {
			acc = [];
		}

		var max = len - acc.length;
		max = (max > buf.length) ? buf.length : max;

		acc = acc.concat(Array.prototype.slice.call(buf, 0, max));
		
		buf = buf.slice(max);
						
		if (acc.length < len) {
			state = again;
			return buf;
		}
		
		var ret = match(acc);
		
		if (typeof ret == 'string') {
			return ret;
		}
		
		state = ret;
		return buf;
	}
	
	function header(ev, buf) {return get(10, function(bytes) {
		
	}, ev, buf);}
	
	state = header;
	
	stream.on('data', data);
	stream.on('end', end);
	
	this.pause = stream.pause;
	this.resume = stream.resume;
	
	return this;	
	
	
};
