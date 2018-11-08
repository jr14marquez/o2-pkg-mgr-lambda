'use strict';

const Fs = require('fs')  
const Path = require('path')  
const Axios = require('axios');
const util = require('./lib/util')
var rpm = require('./lib/buildRpm');
var AWS = require('aws-sdk');
var s3 = new AWS.S3();

const nexusUrl = process.env.NEXUS_REPO


const apps = {
	'omar-ui': { artifactId: 'omar-ui-app', alias: 'omar-ui', groupId: 'io/ossim/omar/apps' },
	'omar-services': { artifactId: 'omar-services-app', alias: 'omar-services', groupId: 'io/ossim/omar/apps' },
	'omar-disk-cleanup': { artifactId: 'omar-disk-cleanup-app', alias: 'omar-disk-cleanup', groupId: 'io/ossim/omar/apps' },
	'tlv': { artifactId: 'tlv-app', alias: 'tlv', groupId: 'io/ossim/omar/apps' },
	'omar-cmdln': { artifactId: 'omar-cmdln-app', alias: 'omar-cmdln', groupId: 'omar/cmdln/app' }
}

module.exports.hello = (event, context, callback) => {
	console.log('params passed are: ', event.queryStringParameters)
	console.log('context: ',context.callbackWaitsForEmptyEventLoop)
	context.callbackWaitsForEmptyEventLoop = false;
	console.log('context: ',context)
	
	// if app name is passed look it up
	if(event.queryStringParameters && event.queryStringParameters.app) {
		if(apps[event.queryStringParameters.app] != undefined) {
			var app = apps[event.queryStringParameters.app]
			var home = event.queryStringParameters.home
			var user = event.queryStringParameters.user
			var group = event.queryStringParameters.group

			util.getConfs(s3,app)
			util.getSnapshotData(app)
			.then(data => {
				console.log('after getting snapshot url with data: ',data)
				// check s3 if there is already an rpm matching same params and latest snapshot
				var key = `rpms/${user}:${group}${home}/${app.alias}-${data.version}-${data.timestamp}.${data.buildNumber}.noarch.rpm`
				return util.headObject(s3, key, data)
			})
			.then(data => {
				if(data.found == true) {
					callback(null, { statusCode: 200, body: JSON.stringify({ url: data.url }) })
				}
				else {
					return util.getSnapshot(data.snapdata)
				}
			})
			.then(snapdata => {
				if(!snapdata) return;
				var rpmApp = { name: app.alias, user: user, home: home, group: group, version: snapdata.version, release: `${snapdata.timestamp}-${snapdata.buildNumber}`, jar: snapdata.jarFile}
				return rpm.build(rpmApp)
			})
			.then(rpmdata => {
				if(!rpmdata) return;
				var params = {Bucket: process.env.BUCKET, Key: `rpms/${user}:${group}${home}/${rpmdata.split('/')[2]}`, Body: Fs.createReadStream(rpmdata)};
				return s3.upload(params).promise()
			})
			.then(uploadData => {
				if(!uploadData) return;
				var res = { statusCode: 200, body: JSON.stringify({ message: uploadData }) }
				callback(null, res)	
			})
			.catch(err => onError(err))


		} else{
			// throw error app doesnt exist
		
			callback(null, { statusCode: 200, body: JSON.stringify({ message: `You're going to need to give me more than that. I can't read your mind.` }) })

		}
	}

};


function onError(error) {
	console.log('error occured: ',error)
	return { statusCode: 200, body: JSON.stringify({ message: `Error returned: ${error}` }) }
}
