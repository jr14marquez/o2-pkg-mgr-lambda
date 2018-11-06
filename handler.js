'use strict';

const Fs = require('fs')  
const Path = require('path')  
const Axios = require('axios');
const Convert = require('xml-js');
var rpm = require('./buildRpm');
var AWS = require('aws-sdk');
var s3 = new AWS.S3();
const params = { Bucket: 'o2-pkg-manager' }
const { execSync } = require('child_process');

//const nexusUrl = process.env.NEXUS_REPO
const nexusUrl = 'https://nexus.ossim.io/nexus/content/repositories/omar-local-snapshot'

// Set xml parser options
const parseOpts = { compact: true, trim: true, textKey: 'text' }
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

			//create streams
			var prodYml = Fs.createWriteStream(`/tmp/${app.alias}-prod.yml`);
			var devYml = Fs.createWriteStream(`/tmp/${app.alias}-dev.yml`);
			var httpd = Fs.createWriteStream(`/tmp/omar.conf`);
			var env = Fs.createWriteStream(`/tmp/.env`);
			var script = Fs.createWriteStream(`/tmp/omar-systemd.sh`);
			var unit = Fs.createWriteStream(`/tmp/${app.alias}.service`);

			s3.getObject({Bucket: 'o2-pkg-manager', Key: `configs/${app.alias}-prod.yml` })
			.createReadStream()
			.on('error', (e) => onError(e))
			.pipe(prodYml)
			.on('data', (data) => { console.log('receiving data',data) })
			.on('end', () => { console.log('receiving ended') })
			.on('error', (e) => onError(e))

			s3.getObject({Bucket: 'o2-pkg-manager', Key: `configs/${app.alias}-dev.yml` })
			.createReadStream()
			.on('error', (e) => onError(e))
			.pipe(devYml)
			.on('end', () => { console.log('receiving ended') })
			.on('error', (e) => onError(e))

			s3.getObject({Bucket: 'o2-pkg-manager', Key: 'configs/omar.conf'})
			.createReadStream()
			.on('error', (e) => onError(e))
			.pipe(httpd)
			.on('end', () => { console.log('receiving ended') })
			.on('error', (e) => onError(e))

			s3.getObject({Bucket: 'o2-pkg-manager', Key: 'configs/.env'})
			.createReadStream()
			.on('error', (e) => onError(e))
			.pipe(env)
			.on('end', () => { console.log('receiving ended') })
			.on('error', (e) => onError(e))

			s3.getObject({Bucket: 'o2-pkg-manager', Key: 'scripts/omar-systemd.sh'})
			.createReadStream()
			.on('error', (e) => onError(e))
			.pipe(script)
			.on('end', () => { console.log('receiving ended') })
			.on('error', (e) => onError(e))

			// if omar-cmdln or omar-disk-cleanup then add timers
			s3.getObject({Bucket: 'o2-pkg-manager', Key: `systemd/${app.alias}.service`})
			.createReadStream()
			.on('error', (e) => onError(e))
			.pipe(unit)
			.on('end', () => { console.log('receiving ended') })
			.on('error', (e) => onError(e))

			
			var jarFile, version, timestamp, buildNumber
			var appBaseUrl = `${nexusUrl}/${app.groupId}/${app.artifactId}/maven-metadata.xml`
		  /* Request to get versions of app and grab the latest. If more than one version exists it'll be in
		  ** an array. If single version it'll just be an object with text as the key.
		  */
		  console.log('bout to get with axios: ',appBaseUrl)
			Axios.get(appBaseUrl)
		  .then(appBaseXml => {
		  	console.log('Finished making first axios getUrl')
		 
		  	var versions = Convert.xml2js(appBaseXml.data,parseOpts).metadata.versioning.versions.version
		  	var ltsVersion = versions.length != undefined ? versions.pop().text : versions.text
		    var ltsVersionUrl = `${nexusUrl}/${app.groupId}/${app.artifactId}/${ltsVersion}/maven-metadata.xml`
		    console.log('about to get ltsVersion url',ltsVersionUrl)
		    // Request the latest version 
		    return Axios.get(ltsVersionUrl)
		  })
		  .then(ltsVersionXml => {
		  	console.log('Finished making second axios getUrl for ltsVersionUrl')
		    // Determine the latest jar file
		    var metadata = Convert.xml2js(ltsVersionXml.data,parseOpts).metadata
		    var snapshot = metadata.version.text
		    version = snapshot.split('-')[0]
		    timestamp = metadata.versioning.snapshot.timestamp.text
		    buildNumber = metadata.versioning.snapshot.buildNumber.text
		    jarFile = `${app.artifactId}-${version}-${timestamp}-${buildNumber}.jar`
		    var snapshotUrl = `${nexusUrl}/${app.groupId}/${app.artifactId}/${snapshot}/${jarFile}`

		    console.log('bout to get snapshot url with last axios: ',snapshotUrl)

		    // Begin downloading the latest(most up to date) jar file via stream
		     //return Axios({ method: 'GET', url: snapshotUrl)
		    
		    return Axios({ method: 'GET', url: snapshotUrl, responseType: 'stream'})
		  })
		  .then(response => {
		  	console.log('finished getting snapshot url and need to send back to user')
		    const path = Path.resolve('/','tmp',jarFile)
		    // pipe the result stream into a file
		    response.data.pipe(Fs.createWriteStream(path))
		    response.data.on('end', () => {

		      var rpmApp = { name: app.alias, version: version, release: `${timestamp}-${buildNumber}`, jar: jarFile}
		      rpm.build(rpmApp)
		      .then(result => {
		      	console.log('rpm result: ', result)
		      	var res = {
					statusCode: 200,
					body: fs.readFile(result, function(err, data) { console.log('data reading') });
				}
				callback(null, res)
		      })
		      
		    })

		    response.data.on('error', () => {
		      console.log('error downloading: ',app.artifactId)
		    })			  

		  })
		  .catch(onError)


		} else{
			// throw error app doesnt exist
			var res = {
				statusCode: 200,
				body: JSON.stringify({ message: `You're going to need to give me more than that. I can't read your mind.` })
			}
			callback(null, res)

		}
	}


	// Example return
	/*if(event.queryStringParameters && event.queryStringParameters.name) {
		return {
	    statusCode: 200,
	    body: JSON.stringify({
	      message: `Hello ${event.queryStringParameters.name} nice to meet you!`,
	    }),
	  }
	}*/
  

};

function onError(error) {
	console.error(error)
	callback(error)
}
