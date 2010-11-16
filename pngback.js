// pngback. A PNG library for Javascript

signature = [137, 80, 78, 71, 13, 10, 26, 10];

// data object for node buffers, a vector of buffers

function vbuf() {
	this.offset = 0;
	this.available = 0;
	this.buffers = [];
	this.append = function(buf) {
		this.buffers.push(buf);
		this.available += buf.length;
	};
	this.eat = function(len) {
		if (len === 0) {return;}
		if (len > this.available) {throw "Trying to eat too much!";}
		this.offset += len;
		while (this.offset > this.buffers[0].length) {
			this.offset -= this.buffers[0].length;
			this.buffers.shift();
		}
	};
}




function start() {
	
	return ;
}

function data(vbuf, buf) {
	vbuf.append(buf);
	
	//console.log(buf.toString('utf8'));
}

function err(exception) {
	throw exception;
}

function eos(state) {
	state.end = true;
}

function info(st) {
	// some info from our stream
	state={};
	vb = new vbuf();
	
	st.addListener('data', function(buf) {return data(vbuf, buf);}).
	   addListener('err', err).
	   addListener('end', function() {return eos(state);});
	
}



(function( exports ) {
  // All library code
  exports.info = info;
})(

  typeof exports === 'object' ? exports : this
);




