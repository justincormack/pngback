
var png = require('./pngback');
var events = require('events');
var fs = require('fs');

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

function test1() {
	var fsm = new png.FSM(start);
	var ticker = new Ticker();
	fsm.listen(ticker, 'tick');
	ticker.run('tick', 10);
}

var vs;

function vs(ev, vb) {
	//console.log(arguments);
	console.log("vs received event " + ev);
	
	if (vb.ended) {
		this.emit('end', vb.total);
		return;
	}
	return vs;
}

function endlisten(size) {
	console.log("end event recieved, total bytes " + size);
}

function test2(stream) {
	// some info from our stream
	// uses vbuf directly without helper
	
	var sb = new png.StreamBuffer(stream);
	var fsm = new png.FSM(vs);
	fsm.on('end', endlisten);
	fsm.listen(sb, 'buffer');
	
	
}

function success() {
	console.log(this.filename + " is a png file");
}

function fail() {
	console.log(this.filename + " is not a png file");
}

matchsig = png.match(png.signature)(success, fail);

function test3(filename, stream) {
	var sb = new png.StreamBuffer(stream);
	var fsm = new png.FSM(matchsig);
	fsm.filename = filename;
	fsm.vb = sb.vb;  // should be in helper
	fsm.listen(sb, 'buffer');
	fsm.listen(fsm, 'transition'); // need to listen to entry events in case have not consumed all data
}

//test1();

//console.log();

process.argv.forEach(function(val, index, array) {
	if (index > 1) {
		//test2(fs.ReadStream(val));
		test3(val, fs.ReadStream(val));
	}
});





