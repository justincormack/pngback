// test case for issues with apply
// oddly this issue is with unshift!

var events = require('events');

function d() {
	console.log("in d");
	console.log(arguments);
}

var e = new events.EventEmitter();

function l1(emitter, ev, fn) {
	var l = this;
	function f() {
		var args = Array.prototype.slice.call(arguments);
		console.log(args);
		fn.apply(l, args);
	}
	emitter.on(ev, f);
};

function l2(emitter, ev, fn) {
	var l = this;
	function f() {
		var args = Array.prototype.slice.call(arguments);
		console.log(args);
		args.unshift(ev);
		console.log(args);
		fn.call(l, args);
		
	}
	emitter.on(ev, f);
};

function l3(emitter, ev, fn) {
	var l = this;
	function f() {
		var args = Array.prototype.slice.call(arguments);
		console.log(args);
		args.push(ev);
		console.log(args);
		fn.apply(l, args);
	}
	emitter.on(ev, f);
};

l1(e, 'e1', d);
l2(e, 'e2', d);
l3(e, 'e3', d);

e.emit('e1', 1);
e.emit('e2', 2);
e.emit('e3', 3);
