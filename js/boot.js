var Q = require('q');
var os = require('os');

// implementations of bootup procedures
var boot = {
  /**
   * Runs through a series of Promise-based checks against npm and general
   * software dependencies. 
   * 
   * @return {Object} A promise object (wrapper for all individual promises).
   */
  checkPrerequisites: function (dialog) {
    var self = this;
    var chain = Q.fcall(function(){});

    this.logDialog('Checking prerequisites.');

    // npm dependencies
    chain.then(function () {
      var deferred = Q.defer();

      require('check-dependencies')().then(function (result) {
        if (!result.depsWereOk) {
          deferred.reject('Unmet npm dependencies. Please run "npm install" in the project directory.');
          return;
        }

        deferred.resolve(null);
      });

      return deferred.promise;
    });

    // general software dependencies
    var software = [{
      // virtualbox
      name: 'VirtualBox',
      command: 'vboxmanage --version',
      regex: /(\d+\.\d+\.\d+)/i,
      version: '5.0.10'
    }, {
      // vagrant
      name: 'Vagrant',
      command: 'vagrant --version',
      regex: /Vagrant (\d+\.\d+\.\d+)/i,
      version: '1.7.4',
      help: {
        darwin: [
          'Vagrant can be installed via a binary: http://www.vagrantup.com/downloads, or',
          'using Homebrew: http://sourabhbajaj.com/mac-setup/Vagrant/README.html'
        ],
        linux: [
          'Vagrant can be installed via a binary: http://www.vagrantup.com/downloads, or',
          'via command line: http://www.olindata.com/blog/2014/07/installing-vagrant-and-virtual-box-ubuntu-1404-lts'
        ],
        win32: 'Vagrant can be installed via a binary: http://www.vagrantup.com/downloads'
      }
    }, {
      // vagrant vbguest plugin
      name: 'Vagrant VBGuest Plugin',
      command: 'vagrant plugin list',
      regex: /vagrant-vbguest \((\d+\.\d+\.\d+)\)/i,
      version: '0.11.0',
      help: "Vagrant VBGuest Plugin can be installed by running 'vagrant plugin install vagrant-vbguest'."
    }, {
      // vagrant hostsupdater  plugin
      name: 'Vagrant HostsUpdater Plugin',
      command: 'vagrant plugin list',
      regex: /vagrant-hostsupdater \((\d+\.\d+\.\d+)\)/i,
      version: '1.0.1',
      help: "Vagrant HostsUpdater Plugin can be installed by running 'vagrant plugin install vagrant-hostsupdater'."
    }];

    /*
     {
      // ansible
      name: 'Ansible',
      command: 'ansible --version',
      regex: /ansible (\d+\.\d+\.\d+)/i,
      version: '1.9.4',
      help: {
        darwin: [
          'Ansible installation instructions: https://valdhaus.co/writings/ansible-mac-osx,',
          'http://docs.ansible.com/ansible/intro_installation.html',
          '',
          'If you encounter the "Error: cannot find role" issue, ensure that /etc/ansible/roles is owned by your user.'
        ],
        linux: [
          'Ansible installation instructions: http://docs.ansible.com/ansible/intro_installation.html',
          '',
          'If you encounter the "Error: cannot find role" issue, ensure that /etc/ansible/roles is owned by your user.'
        ],
        win32: 'Ansible installation instructions: http://docs.ansible.com/ansible/intro_windows.html'
      }
    }
    */

    var exec = require('child_process').exec;

    // create the plugin object if it doesn't exist yet
    if (!window.lunchbox_homestead_plugin) {
      window.lunchbox_homestead_plugin = { dependencies: [] };
    } else {
      window.lunchbox_homestead_plugin.dependencies = [];
    }

    software.forEach(function (item) {
      chain.then(function () {
        var deferred = Q.defer();
        
        exec(item.command, [], function (error, stdout, stderr) {
          if (error !== null) {
            var error_text = [
              'Could not find ' + item.name + '; ensure it is installed and available in PATH.',
              '\tTried to execute: ' + item.command,
              '\tGot error: ' + stderr
            ];

            if (item.help) {
              // generic help for all platforms
              if (typeof item.help == 'string') {
                error_text.push(item.help);
              }
              // platform-specific help
              else if (typeof item.help == 'object') {
                if (item.help[process.platform]) {
                  // array-ize the string
                  if (typeof item.help[process.platform] !== 'object') {
                    item.help[process.platform] = [item.help[process.platform]];
                  }

                  for (var i in item.help[process.platform]) {
                    error_text.push(item.help[process.platform][i]);
                  }
                }
              }
            }

            deferred.reject(error_text.join(os.EOL));

            return;
          }

          if (item.regex) {

              // Some commands output multiple lines, go line by line.
              // This way, just the line with the version can be displayed
              var lines = stdout.trim().split('\n');
              var found = false;
              var cv = require('compare-version');
              for (var line in lines) {
                var currentLine = lines[line];
                var matches = currentLine.match(item.regex);
                if (matches) {

                  // >= 0 is all good
                  if (cv(matches[1], item.version) < 0) {
                    deferred.reject(item.name + ' was found, but a newer version is required. Please upgrade ' + item.name + ' to version ' + item.version + ' or higher.');
                    found = true;
                    break;
                  }

                  item.found_version = matches[1];
                  found = true;
                }
              }

              if (!found) {
                deferred.reject(item.name + ' was found, but the version could not be determined.');
              }
          }

          self.logDialog(item.name + ' found.');
          deferred.resolve(item);
        });

        deferred.promise.then(function(data) {
          // add the dependency object to the array
          window.lunchbox_homestead_plugin.dependencies.push(item);
        },

        function(err) {
          // add the error to the dependency object and
          // add the dependency object to the array
          item.error = err;
          window.lunchbox_homestead_plugin.dependencies.push(item);
        });

        return deferred.promise;
      });
    });

/*
    // // test process w/ required user input
    // chain.then(function () {
    //   var deferred = Q.defer();

    //   // commands that require sudo should be ran with a -S flag; ex: "sudo -S ls"
    //   var child = require('child_process').exec('drush cc', []);

    //   dialog.setChildProcess(child);
    //   dialog.logProcess(child);

    //   child.on('close', function () {
    //     deferred.resolve(null);
    //   });

    //   return deferred.promise;
    // });

    // check for ansible, and if it is present, ensure ansible-galaxy install has
    // been run
    chain.then(function () {
      var deferred = Q.defer();

      exec('ansible --version', [], function (error) {
        // no ansible on host, no problem
        if (error !== null) {
          deferred.resolve(null);
          return;
        }

        // no error, so we have ansible and need to ensure all roles are in place
        self.logDialog('Ansible found. Checking role requirements.');

        var https = require('https');
        var source = 'https://raw.githubusercontent.com/geerlingguy/drupal-vm/master/provisioning/requirements.yml';

        https.get(source, function(res) {
          if (res.statusCode != 200) {
            deferred.reject('Could not get list of ansible roles. Expected list to be available at:' + os.EOL + '\t' + source);
            return;
          }

          var response = '';
          res.on('data', function(d) {
            response += d.toString('utf8');
          });

          res.on('end', function(d) {
            // build list of required roles
            var required = [];
            response.split("\n").forEach(function (line) {
              var parts = line.split(' ');
              if (parts.length == 3) {
                required.push(parts.pop());
              }
            });

            var present = [];
            // build list of present roles
            exec('ansible-galaxy list', [], function (error, stdout, stderr) {
              if (error !== null) {
                deferred.reject('Could not execute "ansible-galaxy list".');
              }

              stdout.split("\n").forEach(function (line) {
                var parts = line.split(' ');
                if (parts.length == 3) {
                  present.push(parts[1].replace(',', ''));
                }
              });

              var delta = required.filter(function (item) {
                return (present.indexOf(item) == -1);
              });

              if (delta.length) {
                var error_text = [
                  'The following required ansible-galaxy roles are missing:'
                ];

                delta.forEach(function (item) {
                  error_text.push("\t" + item);
                });

                error_text.push('This can be fixed by running "ansible-galaxy install" as specified in the DrupalVM quickstart:');
                error_text.push("\t" + ' https://github.com/geerlingguy/drupal-vm');
                error_text.push('If you encounter the "Error: cannot find role" issue, ensure that /etc/ansible/roles is owned by your user.');

                deferred.reject(error_text.join(os.EOL));
                return;
              }

              deferred.resolve(null);
            });

          });

        }).on('error', function(error) {
          deferred.reject('Could not parse list of ansible roles. Received error:' + os.EOL + '\t' + error);
        });
      });

      return deferred.promise;
    });
*/

    return chain;
  },

  /**
   * Detects homestead VM.
   * 
   * @param  {[type]} dialog [description]
   * @return {[type]}        [description]
   */
  detectVM: function (dialog) {
    this.logDialog('Looking for VM.');

    return this.detect();
  },

  /**
   * Loads VM config file.
   * 
   * @param  {[type]} dialog [description]
   * @return {[type]}        [description]
   */
  loadVMConfig: function (dialog) {
    this.logDialog('Loading VM config.')

    return this.loadConfig();
  }
};

module.exports = boot;
