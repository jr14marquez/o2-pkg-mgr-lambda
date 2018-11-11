const chalk = require('chalk')
const log = console.log
const red = chalk.inverse.red
const blue = chalk.bold.blue
const orange = chalk.keyword('orange')
const green = chalk.bold.green

var info = (msg) => {
	log(blue(msg))
}

var warning = (msg) => {
	log(orange(msg))
}

var error = (msg) => {
	log(red(msg))
}

var success = (msg) => {
	log(green(msg))
}

module.exports = {
	info: info,
	warning: warning,
	error: error,
	success: success
}
