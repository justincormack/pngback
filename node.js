// Node.js test file for pngback

// read a PNG file from command line and do some processing

var png = require('./pngback');

process.argv.forEach(function (val, index, array) {
  console.log(index + ': ' + val);
});

