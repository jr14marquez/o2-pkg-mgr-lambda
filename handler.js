'use strict';

const fsx = require('fs-extra')  
const Path = require('path')  
const Axios = require('axios');
const util = require('./lib/util')
var rpm = require('./lib/buildRpm');
var AWS = require('aws-sdk');
var s3 = new AWS.S3();
var { execSync } = require('child_process')

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

	console.log(`Beginning listing: ${execSync('ls -lart /tmp').toString()}`)
	
	// if app name is passed look it up
	if(event.queryStringParameters && event.queryStringParameters.app) {
		if(apps[event.queryStringParameters.app] != undefined) {
			var app = apps[event.queryStringParameters.app]
			var appData = { version: '', timestamp: '', buildNumber: '', rpm: '' , key: '' }
			var home = event.queryStringParameters.home
			var user = event.queryStringParameters.user
			var group = event.queryStringParameters.group

			util.getSnapshotData(app)
			.then(data => {
				console.log('after getting snapshot url with data: ',data)
				appData.version = data.version
				appData.timestamp = data.timestamp
				appData.buildNumber = data.buildNumber
				// check s3 if there is already an rpm matching same params and latest snapshot
				var key = `rpms/${user}:${group}${home}/${app.alias}-${data.version}-${data.timestamp}.${data.buildNumber}.noarch.rpm`
				appData.key = key
				return util.headObject(s3, key, data)
			})
			.then(data => {
				if(data.found == true) {
					console.log('previous rpm found so we send it back')
					console.log('data: ',data)

					var res = {
						statusCode: 200,
						body: JSON.stringify({ url: data.url, name: app.alias, version: appData.version, timestamp: appData.timestamp, buildNumber: appData.buildNumber }),
						headers: {
							'Access-Control-Allow-Origin': '*',
							"Access-Control-Allow-Credentials" : false
						}
					}
					callback(null, res)
				}
				else {
					util.getConfs(s3,app)
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
				appData.rpm = rpmdata
				var params = {Bucket: process.env.BUCKET, Key: `rpms/${user}:${group}${home}/${rpmdata.split('/')[2]}`, Body: fsx.createReadStream(rpmdata)};
				return s3.upload(params).promise()
			})
			.then(uploadData => {
				//console.log(`Last listing: ${execSync('ls -lart /tmp/rpmbuild').toString()}`)
				

				if(!uploadData) return;
				//remove rpm file from file system
				fsx.remove(appData.rpm)
				.then(() => { 
					console.log('successfully remove rpm file from container!') 
					console.log(`Last listing2 of temp: ${execSync('ls -lart /tmp').toString()}`)
				})
				.catch(err => { console.error(err)})

				console.log('uploadData: ',uploadData)
				var url = `https://s3.amazonaws.com/${process.env.BUCKET}/${appData.key}`
				var body = { url: url, name: app.alias, version: appData.version, timestamp: appData.timestamp, buildNumber: appData.buildNumber }
				var res = {
						statusCode: 200,
						body: JSON.stringify(body),
						headers: {
							'Access-Control-Allow-Origin': '*',
							"Access-Control-Allow-Credentials" : false
						}
					}
					//'
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
