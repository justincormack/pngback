var events = require('events');
var png = require('./pngback');

document.addEventListener("DOMContentLoaded", function() {

	var holder = document.getElementById('holder');
    var state = document.getElementById('status');

	if (typeof window.FileReader === 'undefined') {
	  state.className = 'fail';
	} else {
  		state.className = 'success';
  		state.innerHTML = 'File API & FileReader available';
	}
 
holder.ondragover = function () { this.className = 'hover'; return false; };
holder.ondragend = function () { this.className = ''; return false; };

holder.ondrop = function (e) {
  this.className = '';
  e.preventDefault();

  var file = e.dataTransfer.files[0]; // should test for multiple files
  var reader = new FileReader();
  var stream = new events.EventEmitter();
  var m = Object.create(png.metadata);

  reader.onload = function (event) {
    //holder.style.background = 'url(' + event.target.result + ') no-repeat center';
  };

	reader.onprogress = function(event) {
		//console.log("progress"); // does not seem to be any meaningful progress
	};

	reader.onload = function(event) {
		stream.emit('data', event.target.result);
		stream.emit('end');
	};

	m.listen(stream, function(msg) {console.log(msg);});


  //reader.readAsDataURL(file); // could use this if de-base64 it, would work in Chrome.
	//reader.readAsArrayBuffer(file); // not working yet in any browser!
	reader.readAsBinaryString(file);

  return false;
};

}, false);

