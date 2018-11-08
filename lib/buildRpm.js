var buildRpm = require('rpm-builder');

var build = (app) => {
console.log('in rpm build')
	return new Promise((resolve,reject) => {
		var options = {
		  name: app.name,
		  version: app.version, //swapping for rpm naming convention. Package names it backwards
		  release: app.release.replace('-','.'),
		  buildArch: 'noarch',
		  tempDir: '/tmp',
		  rpmDest: '/tmp',
		  requires: ['/usr/sbin/useradd', '/usr/bin/getent','httpd','java-1.8.0'],
		  files: [
		  	{cwd: '/tmp', src: app.jar, dest: `${app.home}/${app.name}`},
		    {cwd: '/tmp', src: `${app.name}-dev.yml`, dest: `${app.home}/${app.name}`, directive: 'config(noreplace)'},
		    {cwd: '/tmp', src: `${app.name}-prod.yml`, dest: `${app.home}/${app.name}`, directive: 'config(noreplace)'},
		    {cwd: '/tmp', src: `${app.name}.service`, dest: '/etc/systemd/system/', directive: 'config(noreplace)'},
		    {cwd: '/tmp', src: 'omar.conf', dest: '/etc/httpd/conf.d', directive: 'config(noreplace)'},
		    {cwd: '/tmp', src: '.env', dest: `${app.home}`, directive: 'config(noreplace)'},	    
		    {cwd: '/tmp', src: 'omar-systemd.sh', dest: `${app.home}`, directive: 'config(noreplace)'}
		  ],
		  preInstallScript: [
		    `/usr/bin/getent group ${app.group} > /dev/null || /usr/sbin/groupadd -r ${app.group}`,
		    `/usr/bin/getent passwd ${app.user} > /dev/null || /usr/sbin/useradd ${app.user} -r -d ${app.home} -s /bin/bash -g ${app.group}`
		  ],
		  preUninstallScript: [`if [ "$1" = "0" ]; then systemctl stop ${app.name}; fi; exit 0`],
		  postInstallScript : [
	    	`systemctl enable ${app.name}`,
	    	`mkdir -p /var/log/omar`,
	    	`chown -R ${app.user}:${app.group} ${app.home} /var/log/omar`,
	    	`chmod -R 774 ${app.home}`,
	  	],
		  keepTemp: false // true for debugging
		}

		if(app.name == 'omar-cmdln' || app.name == 'omar-disk-cleanup'){
			options.files.push({cwd: '/tmp', src: `${app.name}.timer`, dest: `/etc/systemd/system`, directive: 'config(noreplace)'})
			options.postInstallScript.push(`systemctl enable ${app.name}.timer`)
		}

		buildRpm(options, function(err, rpm) {
		  if (err) {
		    throw err;
		    reject(err)
		  }
		  
		  console.log(rpm);
		  resolve(rpm)
		  // /path/to/my-project-0.0.0-1.noarch.rpm
		});
	})

}
 
module.exports = {
	build: build
}