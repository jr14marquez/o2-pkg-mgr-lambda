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
	
	// if app name is passed look it up
	if(event.queryStringParameters && event.queryStringParameters.app) {
		if(apps[event.queryStringParameters.app] != undefined) {
			var app = apps[event.queryStringParameters.app]
			var home = event.queryStringParameters.home
			var user = event.queryStringParameters.user
			var group = event.queryStringParameters.group

			util.getConfs(s3,app)
			util.getSnapshotUrl(app)
			.then(data => {
				console.log('after getting snapshot url with data: ',data)
				// check s3 if there is already an rpm matching same params and latest snapshot
				var key = `rpms/${user}:${group}${home}/${app.alias}-${data.version}-${data.timestamp}.${data.buildNumber}.noarch.rpm`
				console.log('key: ',key)
				s3.headObject({Bucket: process.env.BUCKET, Key: key })
				.on('success', (data) => {
					console.log('succes: rpm file exists')
					// send back url 
					var res = {
						statusCode: 200,
						body: JSON.stringify({ file: `${data.request.params.Key.split('/').pop()}`, url: `https://s3.amazonaws.com/${process.env.BUCKET}/${data.request.params.Key}` })
					}
					callback(null, res)	
				})
				.on('error', (err) => {
					if(err.code == 'NotFound'){
						// rpm doesn't exists so we go through build process and create one
						Axios({ method: 'GET', url: data.url, responseType: 'stream'})
					  .then(response => {
					    const path = Path.resolve('/','tmp',data.jarFile)
					    // pipe the result stream into a file
					    response.data.pipe(Fs.createWriteStream(path))
					    response.data.on('error', (err) => console.log('error downloading: ',app.artifactId)) 
					    response.data.on('end', () => {

					      var rpmApp = { name: app.alias, user: user, home: home, group: group, version: data.version, release: `${data.timestamp}-${data.buildNumber}`, jar: data.jarFile}
					      rpm.build(rpmApp)
					      .then(result => {
					      	console.log('rpm result: ', result)

					      	var params = {Bucket: process.env.BUCKET, Key: `rpms/${user}:${group}${home}/${result.split('/')[2]}`, Body: Fs.createReadStream(result)};
									s3.upload(params)
										send(function(err,data) { 
											var res = {
												statusCode: 200,
												body: JSON.stringify({ message: data })
											}
											callback(null, res)	
										})
									  				
					      })
					      
					    })
					  })
					  .catch(err => callback(null,onError(err)))
					}  
				}).send()
			})	

		} else{
			// throw error app doesnt exist
		
			callback(null, { statusCode: 200, body: JSON.stringify({ message: `You're going to need to give me more than that. I can't read your mind.` }) })

		}
	}

};

function onError(error) {
	return { statusCode: 200, body: JSON.stringify({ message: `Error returned: ${error}` }) }
}
