'use strict';

const Fs = require('fs')  
const Path = require('path')  
const Axios = require('axios');
const Convert = require('xml-js');
var rpm = require('./buildRpm');
var AWS = require('aws-sdk');
var s3 = new AWS.S3();
const params = { Bucket: 'o2-pkg-manager' }

console.log('ENV REPO: ',process.env.NEXUS_REPO)
const nexusUrl = process.env.NEXUS_REPO

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

			// if omar-disk-cleanup then no yaml files
			s3bucket.getObject({Bucket: 'o2-pkg-manager', Prefix: 'configs', Key: `${app.alias}-prod.yml` }).createReadStream().pipe(prodYml);
			s3bucket.getObject({Bucket: 'o2-pkg-manager', Prefix: 'configs', Key: `${app.alias}-dev.yml` }).createReadStream().pipe(devYml);
			s3bucket.getObject({Bucket: 'o2-pkg-manager', Prefix: 'configs', Key: 'omar.conf'}).createReadStream().pipe(httpd);
			s3bucket.getObject({Bucket: 'o2-pkg-manager', Prefix: 'configs', Key: '.env'}).createReadStream().pipe(env);
			s3bucket.getObject({Bucket: 'o2-pkg-manager', Prefix: 'scripts', Key: 'omar-systemd.sh'}).createReadStream().pipe(script);
			// if omar-cmdln or omar-disk-cleanup then add timers
			s3bucket.getObject({Bucket: 'o2-pkg-manager', Prefix: 'systemd', Key: `${app.alias}.service`}).createReadStream().pipe(unit);


		    
		  /*s3.listObjects({ Bucket: 'o2-pkg-manager', }).promise()
			.then(data => {
					console.log('data from s3: ',data)
			})*/

			
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

		    // Begin downloading the latest(most up to date) jar file via stream
		    // return Axios({ method: 'GET', url: snapshotUrl, responseType: 'stream'})
		    console.log('bout to get snapshot url with last axios: ',snapshotUrl)
		    return Axios({ method: 'GET', url: snapshotUrl, responseType: 'stream'})
		  })
		  .then(response => {
		  	console.log('finished getting snapshot url and need to send back to user')
		    const path = Path.resolve('/temp',jarFile)
		    // pipe the result stream into a file
		    response.data.pipe(Fs.createWriteStream(path))
		    response.data.on('end', () => {

		      var rpmApp = { name: app.alias, version: version, release: `${timestamp}-${buildNumber}`, jar: jarFile}
		      rpm.build(rpmApp)
		      var res = {
				  	statusCode: 200,
				  	body: JSON.stringify({ message: `Hello JR M. nice to meet you!` })
				  }
			  	callback(null, res)
		    })

		    response.data.on('error', () => {
		      console.log('error downloading: ',app.artifactId)
		    })

		    /*var res = {
			    statusCode: 200,
			    "isBase64Encoded": true,
				  body: response
			  }
			  callback(null, res)*/
			
			  
			  

		  })
		  .catch(onError)


		} else{
			// throw error app doesnt exist

		}
	}



	
	s3.listObjects(params).promise()
		.then(data => {
			console.log('data from s3: ',data)
		})



 



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
